-- part 50: redefine bootstrap with duplicate-object tolerance
CREATE OR REPLACE FUNCTION public._bootstrap_exec(_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions AS $$ BEGIN BEGIN EXECUTE _sql; EXCEPTION WHEN duplicate_table OR duplicate_object OR duplicate_column OR duplicate_function OR duplicate_schema THEN NULL; END; END $$;

-- part 51: normalize ownership of public objects to postgres
DO $$ DECLARE r RECORD; BEGIN FOR r IN SELECT 'ALTER TABLE public.'||quote_ident(tablename)||' OWNER TO postgres;' AS s FROM pg_tables WHERE schemaname='public' LOOP EXECUTE r.s; END LOOP; FOR r IN SELECT 'ALTER FUNCTION public.'||quote_ident(p.proname)||'('||pg_get_function_identity_arguments(p.oid)||') OWNER TO postgres;' AS s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname<>'_bootstrap_exec' LOOP EXECUTE r.s; END LOOP; FOR r IN SELECT 'ALTER TYPE public.'||quote_ident(t.typname)||' OWNER TO postgres;' AS s FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('e','c','d') AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.relname=t.typname AND c.relnamespace=n.oid) LOOP EXECUTE r.s; END LOOP; END $$;

-- part 52: admin_run_select_query
CREATE OR REPLACE FUNCTION public.admin_run_select_query(_sql text, _max_rows integer DEFAULT 200)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  trimmed text; lowered text; forbidden text; result jsonb; wrapped text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _sql IS NULL OR length(btrim(_sql)) = 0 THEN RAISE EXCEPTION 'Empty query'; END IF;
  trimmed := btrim(_sql);
  WHILE right(trimmed, 1) = ';' LOOP trimmed := btrim(left(trimmed, length(trimmed)-1)); END LOOP;
  IF position(';' in trimmed) > 0 THEN RAISE EXCEPTION 'Only a single statement is allowed'; END IF;
  lowered := lower(trimmed);
  IF NOT (lowered LIKE 'select%' OR lowered LIKE 'with%') THEN RAISE EXCEPTION 'Only SELECT / WITH queries are allowed'; END IF;
  FOREACH forbidden IN ARRAY ARRAY['insert ','update ','delete ','drop ','alter ','create ','grant ','revoke ','truncate ','vacuum ','copy ','do ','call ','comment ','reindex ','listen ','notify ','prepare ','execute ','reset ','set ','lock ','refresh ','cluster ','security definer','pg_sleep','pg_read_server_files','pg_read_binary_file','pg_ls_dir','pg_stat_file','lo_import','lo_export','dblink','pg_catalog.','information_schema.','pg_authid','pg_shadow','pg_user','pg_largeobject','pg_roles'] LOOP
    IF position(forbidden in lowered) > 0 THEN RAISE EXCEPTION 'Forbidden token in query: %', trim(forbidden); END IF;
  END LOOP;
  _max_rows := GREATEST(1, LEAST(COALESCE(_max_rows, 200), 500));
  PERFORM set_config('statement_timeout', '5000', true);
  wrapped := format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT %s) t', trimmed, _max_rows);
  EXECUTE wrapped INTO result;
  RETURN jsonb_build_object('rows', result, 'limit', _max_rows);
END; $function$;

-- part 54: system_error_logs
CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('frontend','backend','db','network','unknown')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  message TEXT NOT NULL, stack TEXT, route TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent TEXT, payload JSONB, fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sys_err_created ON public.system_error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_err_fingerprint ON public.system_error_logs (fingerprint);
CREATE INDEX IF NOT EXISTS idx_sys_err_severity ON public.system_error_logs (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_err_source ON public.system_error_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sys_err_route ON public.system_error_logs (route);
CREATE INDEX IF NOT EXISTS idx_sys_err_unresolved ON public.system_error_logs (resolved, created_at DESC) WHERE resolved = FALSE;
GRANT SELECT, INSERT, UPDATE ON public.system_error_logs TO authenticated;
GRANT INSERT ON public.system_error_logs TO anon;
GRANT ALL ON public.system_error_logs TO service_role;
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;
DO $idem$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Admins read all system errors' AND tablename='system_error_logs') THEN
    CREATE POLICY "Admins read all system errors" ON public.system_error_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $idem$;
DO $idem$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Authenticated insert own errors' AND tablename='system_error_logs') THEN
    CREATE POLICY "Authenticated insert own errors" ON public.system_error_logs FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());
  END IF;
END $idem$;
DO $idem$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Anon insert anonymous errors' AND tablename='system_error_logs') THEN
    CREATE POLICY "Anon insert anonymous errors" ON public.system_error_logs FOR INSERT TO anon WITH CHECK (user_id IS NULL);
  END IF;
END $idem$;
DO $idem$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='Admins update system errors' AND tablename='system_error_logs') THEN
    CREATE POLICY "Admins update system errors" ON public.system_error_logs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
  END IF;
END $idem$;
CREATE OR REPLACE FUNCTION public.admin_log_system_error(
  _source TEXT, _severity TEXT, _message TEXT,
  _stack TEXT DEFAULT NULL, _route TEXT DEFAULT NULL, _user_agent TEXT DEFAULT NULL,
  _payload JSONB DEFAULT NULL, _fingerprint TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_fp TEXT;
BEGIN
  IF _source IS NULL OR _source NOT IN ('frontend','backend','db','network','unknown') THEN _source := 'unknown'; END IF;
  IF _severity IS NULL OR _severity NOT IN ('critical','high','medium','low') THEN _severity := 'medium'; END IF;
  IF _message IS NULL OR length(btrim(_message)) = 0 THEN RAISE EXCEPTION 'message required'; END IF;
  _message := left(_message, 2000);
  _stack := left(COALESCE(_stack, ''), 8000);
  _route := left(COALESCE(_route, ''), 500);
  _user_agent := left(COALESCE(_user_agent, ''), 500);
  v_fp := COALESCE(NULLIF(_fingerprint, ''), md5(_source || '|' || _message || '|' || COALESCE(_route, '')));
  UPDATE public.system_error_logs SET occurrence_count = occurrence_count + 1, last_seen_at = now(), payload = COALESCE(_payload, payload)
   WHERE fingerprint = v_fp AND created_at > now() - interval '1 hour' AND resolved = false RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.system_error_logs (source, severity, message, stack, route, user_id, user_agent, payload, fingerprint)
    VALUES (_source, _severity, _message, NULLIF(_stack,''), NULLIF(_route,''), auth.uid(), NULLIF(_user_agent,''), _payload, v_fp)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_log_system_error(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_log_system_error(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) TO anon, authenticated;

-- part 55: sandbox grants
GRANT USAGE, CREATE ON SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL TABLES IN SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO sandbox_exec;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO sandbox_exec;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TYPES TO sandbox_exec;

-- part 57: _tmp_exec_sql (service-role only)
CREATE OR REPLACE FUNCTION public._tmp_exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN EXECUTE sql; END $$;
REVOKE ALL ON FUNCTION public._tmp_exec_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tmp_exec_sql(text) TO service_role;

-- part 58: explicit grants
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
GRANT SELECT ON public.homepage_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT ALL ON public.homepage_sections TO service_role;
GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
GRANT SELECT ON public.media_assets TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
GRANT SELECT ON public.site_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_versions TO authenticated;
GRANT ALL ON public.content_versions TO service_role;