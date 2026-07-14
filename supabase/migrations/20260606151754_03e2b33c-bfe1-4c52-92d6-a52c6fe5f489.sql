CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_sessions_user_id_idx ON public.study_sessions(user_id);
CREATE INDEX IF NOT EXISTS study_sessions_started_at_idx ON public.study_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS study_sessions_user_module_open_idx ON public.study_sessions(user_id, module, last_heartbeat_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_sessions_own_select"
  ON public.study_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "study_sessions_own_insert"
  ON public.study_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "study_sessions_own_update"
  ON public.study_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Also ensure quiz_sessions has any columns referenced by app code (idempotent)
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NOT NULL DEFAULT 0;