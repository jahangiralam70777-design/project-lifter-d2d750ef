-- 20260717 — Exam Batch full realtime sync hardening.
--
-- Student pages refetch from normal RLS-protected server functions after a
-- realtime invalidation. This script makes sure every Exam Batch table can
-- emit INSERT / UPDATE / DELETE changes in production and that DELETE/filtered
-- UPDATE payloads carry the previous row via REPLICA IDENTITY FULL.
--
-- Idempotent and safe to re-run. It also includes `exam_batches` for legacy
-- deployments that used that singular table name before the module was split
-- into exam_batch_sessions + exam_batch_exams.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'exam_batches',
    'exam_batch_settings',
    'exam_batch_sessions',
    'exam_batch_session_subjects',
    'exam_batch_subjects',
    'exam_batch_chapters',
    'exam_batch_levels',
    'exam_batch_mcqs',
    'exam_batch_exams',
    'exam_batch_exam_questions',
    'exam_batch_enrollments',
    'exam_batch_enrollment_subjects',
    'exam_batch_attempts',
    'exam_batch_attempt_question_order',
    'exam_batch_attempt_answers',
    'exam_batch_attempt_results',
    'exam_batch_leaderboards',
    'exam_batch_leaderboard_entries',
    'exam_batch_progress_summaries',
    'exam_batch_analytics_snapshots',
    'exam_batch_attendance_state',
    'exam_batch_attendance_processed',
    'exam_batch_attendance_events',
    'exam_batch_ban_history',
    'exam_batch_comment_rules',
    'exam_batch_download_history',
    'exam_batch_notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;