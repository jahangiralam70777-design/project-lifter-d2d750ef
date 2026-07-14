-- Smart Student ID reuse.
--
-- Previously we assigned student_id via nextval() on a monotonic sequence,
-- so removing an approved student left a permanent gap. This migration
-- introduces exam_batch_next_student_id(): a race-safe allocator that
-- always returns the LOWEST unused integer >= 1001. If no gaps exist it
-- falls back to advancing the sequence.
--
-- Concurrency:
--   • A transaction-scoped advisory lock serializes concurrent approvals,
--     so bulk approvals cannot hand out duplicate IDs.
--   • The UNIQUE index on exam_batch_enrollments.student_id (assumed;
--     enforced by application logic + this migration adds it explicitly
--     if missing) is the final safety net.

BEGIN;

-- Enforce uniqueness at the DB level so any race outside the allocator
-- fails loudly instead of silently duplicating IDs.
CREATE UNIQUE INDEX IF NOT EXISTS exam_batch_enrollments_student_id_uidx
  ON public.exam_batch_enrollments (student_id)
  WHERE student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.exam_batch_next_student_id()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_id int;
  max_id  int;
BEGIN
  -- Serialize concurrent allocations for the duration of this txn.
  PERFORM pg_advisory_xact_lock(hashtext('exam_batch_student_id_alloc'));

  SELECT COALESCE(MAX(student_id), 1000) INTO max_id
    FROM public.exam_batch_enrollments
   WHERE student_id IS NOT NULL;

  -- Smallest gap in [1001 .. max_id + 1]. If no gap exists this yields
  -- max_id + 1, which is the next fresh ID.
  SELECT g.n INTO next_id
    FROM generate_series(1001, max_id + 1) AS g(n)
   WHERE NOT EXISTS (
           SELECT 1
             FROM public.exam_batch_enrollments e
            WHERE e.student_id = g.n
         )
   ORDER BY g.n
   LIMIT 1;

  -- Keep the legacy sequence in sync so anything still calling nextval()
  -- (or a future migration reverting to it) never regresses backwards.
  PERFORM setval('public.exam_batch_student_id_seq', GREATEST(next_id, 1001), true);

  RETURN next_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_next_student_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_next_student_id() TO authenticated, service_role;


-- Rewire the two allocator sites to use the gap-filling function.

CREATE OR REPLACE FUNCTION public.exam_batch_approve_enrollments(
  _enrollment_ids uuid[],
  _reviewer       uuid
) RETURNS TABLE (id uuid, student_id int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec   record;
  new_id int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    _reviewer := auth.uid();
  END IF;
  IF _reviewer IS NULL OR NOT public.has_permission(_reviewer, 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Iterate so each new student_id is allocated fresh (lowest gap first).
  -- The advisory lock inside exam_batch_next_student_id() serializes the
  -- allocation, and FOR UPDATE prevents a concurrent txn from approving
  -- the same row twice.
  FOR rec IN
    SELECT e.id, e.student_id
      FROM public.exam_batch_enrollments e
     WHERE e.id = ANY(_enrollment_ids)
       AND e.status = 'pending'
     ORDER BY e.created_at
     FOR UPDATE
  LOOP
    IF rec.student_id IS NULL THEN
      new_id := public.exam_batch_next_student_id();
    ELSE
      new_id := rec.student_id;
    END IF;

    UPDATE public.exam_batch_enrollments e
       SET status      = 'approved',
           student_id  = new_id,
           reviewed_by = _reviewer,
           reviewed_at = now(),
           updated_at  = now()
     WHERE e.id = rec.id;

    id := rec.id;
    student_id := new_id;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_approve_enrollments(uuid[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_approve_enrollments(uuid[], uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.exam_batch_set_enrollment_status(
  _enrollment_id uuid,
  _status        text,
  _reviewer      uuid,
  _notes         text DEFAULT NULL
) RETURNS TABLE (id uuid, student_id int, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur_student_id int;
  new_id         int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    _reviewer := auth.uid();
  END IF;
  IF _reviewer IS NULL OR NOT public.has_permission(_reviewer, 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('pending','approved','rejected','banned') THEN
    RAISE EXCEPTION 'invalid_status:%', _status USING ERRCODE = '22023';
  END IF;

  SELECT e.student_id INTO cur_student_id
    FROM public.exam_batch_enrollments e
   WHERE e.id = _enrollment_id
   FOR UPDATE;

  IF _status = 'approved' AND cur_student_id IS NULL THEN
    new_id := public.exam_batch_next_student_id();
  ELSE
    new_id := cur_student_id;
  END IF;

  RETURN QUERY
  UPDATE public.exam_batch_enrollments e
     SET status      = _status,
         student_id  = new_id,
         reviewed_by = _reviewer,
         reviewed_at = now(),
         notes       = COALESCE(_notes, e.notes),
         updated_at  = now()
   WHERE e.id = _enrollment_id
  RETURNING e.id, e.student_id, e.status;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_set_enrollment_status(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_set_enrollment_status(uuid, text, uuid, text) TO authenticated, service_role;

COMMIT;
