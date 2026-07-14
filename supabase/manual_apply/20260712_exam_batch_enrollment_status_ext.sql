-- Extends exam_batch_enrollments status set with 'banned' and adds an
-- atomic admin RPC to move an enrollment between any of the four states
-- (pending / approved / rejected / banned). Approving a not-yet-numbered
-- enrollment still assigns a permanent student_id via the same sequence.

BEGIN;

-- 1) Relax the CHECK to allow 'banned'.
ALTER TABLE public.exam_batch_enrollments
  DROP CONSTRAINT IF EXISTS exam_batch_enrollments_status_check;

ALTER TABLE public.exam_batch_enrollments
  ADD CONSTRAINT exam_batch_enrollments_status_check
  CHECK (status IN ('pending','approved','rejected','banned'));

-- 2) Universal status transition RPC.
CREATE OR REPLACE FUNCTION public.exam_batch_set_enrollment_status(
  _enrollment_id uuid,
  _status        text,
  _reviewer      uuid,
  _notes         text DEFAULT NULL
) RETURNS TABLE (id uuid, student_id int, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  RETURN QUERY
  UPDATE public.exam_batch_enrollments e
     SET status      = _status,
         student_id  = CASE
                         WHEN _status = 'approved'
                           THEN COALESCE(e.student_id,
                                         nextval('public.exam_batch_student_id_seq')::int)
                         ELSE e.student_id
                       END,
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
