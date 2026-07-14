-- 20260714 — Enable Supabase Realtime replication for Exam Batch tables.
--
-- Idempotent: each ALTER PUBLICATION is guarded by a check against
-- pg_publication_tables so re-runs are safe. Only exam_batch_* tables are
-- touched — the rest of the app is unaffected.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'exam_batch_settings',
    'exam_batch_sessions',
    'exam_batch_subjects',
    'exam_batch_chapters',
    'exam_batch_levels',
    'exam_batch_mcqs',
    'exam_batch_exams',
    'exam_batch_exam_questions',
    'exam_batch_enrollments',
    'exam_batch_enrollment_subjects',
    'exam_batch_session_subjects',
    'exam_batch_attempts',
    'exam_batch_attempt_question_order',
    'exam_batch_attempt_answers',
    'exam_batch_attempt_results',
    'exam_batch_leaderboards',
    'exam_batch_leaderboard_entries',
    'exam_batch_progress_summaries',
    'exam_batch_analytics_snapshots',
    'exam_batch_attendance_state',
    'exam_batch_attendance_events',
    'exam_batch_comment_rules',
    'exam_batch_download_history',
    'exam_batch_notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- skip tables that do not exist yet (notifications is optional)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- add to supabase_realtime publication if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    -- REPLICA IDENTITY FULL so DELETE / filtered events carry the full row
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
