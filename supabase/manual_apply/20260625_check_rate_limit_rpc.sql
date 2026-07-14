-- Rate-limit infrastructure used by src/integrations/security/rate-limit.ts
--
-- The app calls public.check_rate_limit(_key, _max_hits, _window_seconds) from
-- server functions to enforce sliding-window limits on auth, blog views,
-- mcq/quiz/mock submissions, bulk uploads, and admin writes. Without this
-- RPC every call logs "[rate-limit] check_rate_limit RPC error — failing
-- open" and limits are effectively disabled.
--
-- Apply once against the external Supabase project (xtlfubgkizqzrewqpagv)
-- via the SQL editor or `psql`.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id          bigserial PRIMARY KEY,
  key         text        NOT NULL,
  hit_at      timestamptz NOT NULL DEFAULT now(),
  caller_uid  uuid        NULL
);

CREATE INDEX IF NOT EXISTS rate_limit_hits_key_time_idx
  ON public.rate_limit_hits (key, hit_at DESC);

-- The table is only read via the SECURITY DEFINER function below.
-- Grant nothing to anon/authenticated; service_role retains full access for
-- maintenance / inspection.
GRANT ALL ON public.rate_limit_hits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_limit_hits_id_seq TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No policies: defense-in-depth in case a future GRANT is added by mistake.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key            text,
  _max_hits       integer,
  _window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits  integer;
  v_since timestamptz;
BEGIN
  IF _key IS NULL OR length(_key) = 0 THEN
    RAISE EXCEPTION 'check_rate_limit: _key is required';
  END IF;
  IF _max_hits IS NULL OR _max_hits <= 0 THEN
    RAISE EXCEPTION 'check_rate_limit: _max_hits must be > 0';
  END IF;
  IF _window_seconds IS NULL OR _window_seconds <= 0 THEN
    RAISE EXCEPTION 'check_rate_limit: _window_seconds must be > 0';
  END IF;

  v_since := now() - make_interval(secs => _window_seconds);

  -- Best-effort GC so the table stays small without a separate cron job.
  DELETE FROM public.rate_limit_hits
   WHERE key = _key AND hit_at < v_since;

  SELECT count(*) INTO v_hits
    FROM public.rate_limit_hits
   WHERE key = _key AND hit_at >= v_since;

  IF v_hits >= _max_hits THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (key, caller_uid)
  VALUES (_key, auth.uid());

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)
  TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.check_rate_limit(text, integer, integer) IS
  'Sliding-window rate limiter. Returns true and records a hit when under the '
  'limit, false when the limit for _key in the last _window_seconds is reached.';