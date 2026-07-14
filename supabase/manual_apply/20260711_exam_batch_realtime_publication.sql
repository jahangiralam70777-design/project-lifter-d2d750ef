-- Exam Batch — realtime publication + REPLICA IDENTITY
--
-- Makes Admin ⇄ Student sync work in real-time. Without this, students
-- would only see new/updated sessions and enrollment state on next page
-- refresh. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER TABLE public.exam_batch_sessions             REPLICA IDENTITY FULL;
ALTER TABLE public.exam_batch_enrollments          REPLICA IDENTITY FULL;
ALTER TABLE public.exam_batch_enrollment_subjects  REPLICA IDENTITY FULL;
ALTER TABLE public.exam_batch_session_subjects     REPLICA IDENTITY FULL;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'exam_batch_sessions',
    'exam_batch_enrollments',
    'exam_batch_enrollment_subjects',
    'exam_batch_session_subjects'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename  = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;
