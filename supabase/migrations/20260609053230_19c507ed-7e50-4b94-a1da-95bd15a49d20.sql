
CREATE TABLE public.system_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('frontend','backend','db','network','unknown')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent TEXT,
  payload JSONB,
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sys_err_created ON public.system_error_logs (created_at DESC);
CREATE INDEX idx_sys_err_fingerprint ON public.system_error_logs (fingerprint);
CREATE INDEX idx_sys_err_severity ON public.system_error_logs (severity, created_at DESC);
CREATE INDEX idx_sys_err_source ON public.system_error_logs (source, created_at DESC);
CREATE INDEX idx_sys_err_route ON public.system_error_logs (route);
CREATE INDEX idx_sys_err_unresolved ON public.system_error_logs (resolved, created_at DESC) WHERE resolved = FALSE;

GRANT SELECT, INSERT, UPDATE ON public.system_error_logs TO authenticated;
GRANT INSERT ON public.system_error_logs TO anon;
GRANT ALL ON public.system_error_logs TO service_role;

ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read everything; non-admins cannot read this table at all.
CREATE POLICY "Admins read all system errors"
  ON public.system_error_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Authenticated users can insert errors only scoped to themselves OR with a NULL user_id
-- (for very early bootstrap errors before session is hydrated).
CREATE POLICY "Authenticated insert own errors"
  ON public.system_error_logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Anon visitors can insert with NULL user_id only.
CREATE POLICY "Anon insert anonymous errors"
  ON public.system_error_logs FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Admins can update (mark resolved, etc).
CREATE POLICY "Admins update system errors"
  ON public.system_error_logs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Controlled entry point that dedupes by fingerprint (last hour) and validates input.
CREATE OR REPLACE FUNCTION public.admin_log_system_error(
  _source TEXT,
  _severity TEXT,
  _message TEXT,
  _stack TEXT DEFAULT NULL,
  _route TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL,
  _payload JSONB DEFAULT NULL,
  _fingerprint TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_fp TEXT;
BEGIN
  IF _source IS NULL OR _source NOT IN ('frontend','backend','db','network','unknown') THEN
    _source := 'unknown';
  END IF;
  IF _severity IS NULL OR _severity NOT IN ('critical','high','medium','low') THEN
    _severity := 'medium';
  END IF;
  IF _message IS NULL OR length(btrim(_message)) = 0 THEN
    RAISE EXCEPTION 'message required';
  END IF;
  -- truncate hostile sizes
  _message := left(_message, 2000);
  _stack := left(COALESCE(_stack, ''), 8000);
  _route := left(COALESCE(_route, ''), 500);
  _user_agent := left(COALESCE(_user_agent, ''), 500);
  v_fp := COALESCE(NULLIF(_fingerprint, ''), md5(_source || '|' || _message || '|' || COALESCE(_route, '')));

  -- Dedupe within the last hour: bump count rather than spam new rows.
  UPDATE public.system_error_logs
     SET occurrence_count = occurrence_count + 1,
         last_seen_at = now(),
         payload = COALESCE(_payload, payload)
   WHERE fingerprint = v_fp
     AND created_at > now() - interval '1 hour'
     AND resolved = false
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.system_error_logs
      (source, severity, message, stack, route, user_id, user_agent, payload, fingerprint)
    VALUES
      (_source, _severity, _message, NULLIF(_stack,''), NULLIF(_route,''),
       auth.uid(), NULLIF(_user_agent,''), _payload, v_fp)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_log_system_error(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_system_error(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) TO anon, authenticated;
