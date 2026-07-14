ALTER TABLE public.mcqs ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE public.mcqs ALTER COLUMN option_d DROP NOT NULL;
ALTER TABLE public.mcqs
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq','true_false'));

ALTER TABLE public.subjects ALTER COLUMN level DROP NOT NULL;
ALTER TABLE public.quizzes ALTER COLUMN level DROP NOT NULL;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text;
CREATE INDEX IF NOT EXISTS quiz_sessions_status_created_idx ON public.quiz_sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_sessions_user_status_idx ON public.quiz_sessions (user_id, status);

CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL DEFAULT 'dashboard',
  subject_id uuid,
  chapter_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_sessions_user_started_idx ON public.study_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS study_sessions_user_open_idx ON public.study_sessions(user_id) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY study_sessions_select_own ON public.study_sessions FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY study_sessions_insert_own ON public.study_sessions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY study_sessions_update_own ON public.study_sessions FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER study_sessions_set_updated_at
    BEFORE UPDATE ON public.study_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;