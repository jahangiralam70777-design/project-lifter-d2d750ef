-- Exam Batch — atomic student enrollment + missing owner RLS policies.
--
-- Root cause of "No enrolled subjects" after admin approval:
--   The student's enroll flow inserted subject links via the user's
--   Supabase client, but exam_batch_enrollment_subjects had no owner
--   INSERT policy. Depending on environment (RLS enabled vs. not) this
--   either silently dropped rows or hard-failed leaving orphan pending
--   rows. The exam listing then correctly returned [] because the
--   enrollment had zero subject links.
--
-- This migration:
--   1) Adds the missing owner INSERT / DELETE policies so the client
--      path can never silently drop rows.
--   2) Introduces an atomic SECURITY DEFINER RPC
--      exam_batch_enroll_session(_session_id, _subject_ids) that creates
--      the enrollment and its subject links in a single transaction.
--      Any error rolls back both sides — no partial state.
--   3) Backfills approved enrollments that somehow ended up with zero
--      subject links by attaching every published subject at the
--      session's level (best-effort recovery so approved students see
--      exams immediately). Safe idempotent upsert.

BEGIN;

-- 1) Owner RLS policies for exam_batch_enrollment_subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='exam_batch_enrollment_subjects'
       AND policyname='exam_batch_enrollment_subjects_own_insert'
  ) THEN
    CREATE POLICY exam_batch_enrollment_subjects_own_insert
      ON public.exam_batch_enrollment_subjects
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.exam_batch_enrollments e
         WHERE e.id = enrollment_id
           AND e.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='exam_batch_enrollment_subjects'
       AND policyname='exam_batch_enrollment_subjects_own_delete'
  ) THEN
    CREATE POLICY exam_batch_enrollment_subjects_own_delete
      ON public.exam_batch_enrollment_subjects
      FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.exam_batch_enrollments e
         WHERE e.id = enrollment_id
           AND e.user_id = auth.uid()
           AND e.status = 'pending'
      ));
  END IF;

  -- Compensating-delete path in the enroll flow needs this.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='exam_batch_enrollments'
       AND policyname='exam_batch_enrollments_own_delete_pending'
  ) THEN
    CREATE POLICY exam_batch_enrollments_own_delete_pending
      ON public.exam_batch_enrollments
      FOR DELETE TO authenticated
      USING (user_id = auth.uid() AND status = 'pending');
  END IF;
END$$;

-- 2) Atomic enroll RPC — creates enrollment + subject links transactionally.
CREATE OR REPLACE FUNCTION public.exam_batch_enroll_session(
  _session_id  uuid,
  _subject_ids uuid[]
)
RETURNS TABLE (
  id           uuid,
  session_id   uuid,
  user_id      uuid,
  status       text,
  student_id   int,
  created_at   timestamptz,
  updated_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_session       record;
  v_valid_subjs   int;
  v_new_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF _subject_ids IS NULL OR array_length(_subject_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_subjects_selected' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.level, s.status, s.registration_open, s.is_archived,
         s.is_hidden, s.registration_deadline
    INTO v_session
    FROM public.exam_batch_sessions s
   WHERE s.id = _session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.is_hidden OR v_session.is_archived
     OR v_session.status <> 'active'
     OR NOT v_session.registration_open
     OR (v_session.registration_deadline IS NOT NULL
         AND v_session.registration_deadline < now()) THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exam_batch_enrollments e
     WHERE e.session_id = _session_id AND e.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'already_enrolled' USING ERRCODE = '23505';
  END IF;

  -- Every submitted subject must exist AND belong to the session's level.
  SELECT COUNT(*) INTO v_valid_subjs
    FROM public.exam_batch_subjects s
   WHERE s.id = ANY(_subject_ids)
     AND s.level = v_session.level;

  IF v_valid_subjs <> array_length(_subject_ids, 1) THEN
    RAISE EXCEPTION 'invalid_subjects' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.exam_batch_enrollments (session_id, user_id, status, student_id)
       VALUES (_session_id, v_uid, 'pending', NULL)
    RETURNING public.exam_batch_enrollments.id INTO v_new_id;

  INSERT INTO public.exam_batch_enrollment_subjects (enrollment_id, subject_id, added_by)
  SELECT v_new_id, s, v_uid
    FROM unnest(_subject_ids) AS s;

  RETURN QUERY
  SELECT e.id, e.session_id, e.user_id, e.status, e.student_id,
         e.created_at, e.updated_at
    FROM public.exam_batch_enrollments e
   WHERE e.id = v_new_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_enroll_session(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_enroll_session(uuid, uuid[]) TO authenticated, service_role;

-- 3) Best-effort backfill for approved enrollments with zero subject links.
--    These users cannot see exams even though the admin approved them.
--    We attach every published subject at the session's level so approval
--    behaves as intended (the admin can trim later via Subject Manager).
INSERT INTO public.exam_batch_enrollment_subjects (enrollment_id, subject_id, added_by)
SELECT e.id, s.id, e.user_id
  FROM public.exam_batch_enrollments e
  JOIN public.exam_batch_sessions ses ON ses.id = e.session_id
  JOIN public.exam_batch_subjects s
    ON s.level = ses.level AND s.status = 'published'
 WHERE e.status = 'approved'
   AND NOT EXISTS (
     SELECT 1 FROM public.exam_batch_enrollment_subjects es
      WHERE es.enrollment_id = e.id
   )
ON CONFLICT (enrollment_id, subject_id) DO NOTHING;

COMMIT;
