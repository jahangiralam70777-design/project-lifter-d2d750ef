ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text;
CREATE INDEX IF NOT EXISTS quiz_sessions_status_created_idx ON public.quiz_sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_sessions_user_status_idx ON public.quiz_sessions (user_id, status);