-- Phase 3a Q-H3: server-side maximum attempt enforcement for quizzes/mocks.
--
-- Adds a nullable `max_attempts` column to `quizzes`. NULL = unlimited
-- (preserves current behavior for every existing row, full backward
-- compatibility). A positive integer caps `submitAttempt` server-side.
--
-- Enforcement lives in `submitAttempt` (src/lib/learning.functions.ts) and
-- counts only finalized attempts (status IN ('completed','submitted')) for
-- the same (user_id, quiz_id). Client-supplied counts are ignored.
--
-- Idempotent.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS max_attempts integer NULL;

COMMENT ON COLUMN public.quizzes.max_attempts IS
  'Maximum finalized attempts per user. NULL = unlimited.';

-- Optional sanity check (non-fatal if column already populated):
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.quizzes
    WHERE max_attempts IS NOT NULL AND max_attempts <= 0
  ) THEN
    RAISE NOTICE 'quizzes.max_attempts has non-positive values; treating <=0 as unlimited at enforcement layer';
  END IF;
END $$;
