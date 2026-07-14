-- Canonical per-student MCQ Practice progress.
-- This table intentionally stores one row per (student, MCQ) so Practice progress
-- is not delayed until a batch attempt is finished and is never mixed with Quiz,
-- Mock Exam, or Custom Exam answer rows.

CREATE TABLE IF NOT EXISTS public.mcq_practice_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mcq_id uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  level text,
  chosen_option public.mcq_option NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  time_spent_ms integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mcq_id)
);

GRANT SELECT, INSERT, UPDATE ON public.mcq_practice_progress TO authenticated;
GRANT ALL ON public.mcq_practice_progress TO service_role;

ALTER TABLE public.mcq_practice_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mcq_practice_progress'
      AND policyname = 'mcq_practice_progress_own_select'
  ) THEN
    CREATE POLICY "mcq_practice_progress_own_select"
      ON public.mcq_practice_progress
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mcq_practice_progress'
      AND policyname = 'mcq_practice_progress_own_insert'
  ) THEN
    CREATE POLICY "mcq_practice_progress_own_insert"
      ON public.mcq_practice_progress
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'mcq_practice_progress'
      AND policyname = 'mcq_practice_progress_own_update'
  ) THEN
    CREATE POLICY "mcq_practice_progress_own_update"
      ON public.mcq_practice_progress
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS mcq_practice_progress_user_subject_idx
  ON public.mcq_practice_progress (user_id, subject_id);

CREATE INDEX IF NOT EXISTS mcq_practice_progress_user_chapter_idx
  ON public.mcq_practice_progress (user_id, chapter_id);

CREATE INDEX IF NOT EXISTS mcq_practice_progress_updated_at_idx
  ON public.mcq_practice_progress (updated_at DESC);

-- Backfill existing completed MCQ Practice answers exactly once per user+MCQ,
-- keeping the latest completed practice answer where duplicates exist.
INSERT INTO public.mcq_practice_progress (
  user_id,
  mcq_id,
  chapter_id,
  subject_id,
  level,
  chosen_option,
  is_correct,
  time_spent_ms,
  answered_at,
  updated_at
)
SELECT DISTINCT ON (ea.user_id, aa.mcq_id)
  ea.user_id,
  aa.mcq_id,
  m.chapter_id,
  c.subject_id,
  s.level,
  aa.chosen_option,
  aa.is_correct,
  aa.time_spent_ms,
  COALESCE(ea.completed_at, ea.created_at, now()),
  COALESCE(ea.completed_at, ea.created_at, now())
FROM public.attempt_answers aa
JOIN public.exam_attempts ea ON ea.id = aa.attempt_id
JOIN public.mcqs m ON m.id = aa.mcq_id
JOIN public.chapters c ON c.id = m.chapter_id
JOIN public.subjects s ON s.id = c.subject_id
WHERE ea.kind = 'mcq_practice'
  AND ea.status = 'completed'
  AND aa.chosen_option IS NOT NULL
  AND m.status = 'published'
  AND c.status = 'published'
  AND s.status = 'published'
ORDER BY ea.user_id, aa.mcq_id, COALESCE(ea.completed_at, ea.created_at, now()) DESC
ON CONFLICT (user_id, mcq_id) DO UPDATE SET
  chapter_id = EXCLUDED.chapter_id,
  subject_id = EXCLUDED.subject_id,
  level = EXCLUDED.level,
  chosen_option = EXCLUDED.chosen_option,
  is_correct = EXCLUDED.is_correct,
  time_spent_ms = EXCLUDED.time_spent_ms,
  answered_at = EXCLUDED.answered_at,
  updated_at = EXCLUDED.updated_at;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mcq_practice_progress;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;
