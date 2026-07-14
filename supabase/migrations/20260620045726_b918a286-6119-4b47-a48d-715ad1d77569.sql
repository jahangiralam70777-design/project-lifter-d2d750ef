CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
BEGIN
  IF to_regtype('public.app_role') IS NULL THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'student', 'user', 'super_admin');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.app_role') IS NOT NULL THEN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    EXECUTE 'GRANT SELECT ON public.user_roles TO supabase_auth_admin';
  END IF;
END $$;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role=_role)
$$;

CREATE OR REPLACE FUNCTION public.auth_controls_can_manage(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role::text IN ('admin','super_admin'))
$$;

CREATE OR REPLACE FUNCTION public.auth_controls_can_bypass_student_gate(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=_user_id AND ur.role::text IN ('admin','super_admin','moderator'))
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_controls_can_manage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_controls_can_bypass_student_gate(uuid) TO authenticated, service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.auth_controls_can_bypass_student_gate(uuid) TO supabase_auth_admin';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='user_roles_self_or_admin_read') THEN
    EXECUTE 'CREATE POLICY "user_roles_self_or_admin_read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.auth_controls_can_manage(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='user_roles_admin_manage') THEN
    EXECUTE 'CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.auth_controls_can_manage(auth.uid())) WITH CHECK (public.auth_controls_can_manage(auth.uid()))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' AND policyname='auth_admin_can_read_user_roles') THEN
    EXECUTE 'CREATE POLICY "auth_admin_can_read_user_roles" ON public.user_roles FOR SELECT TO supabase_auth_admin USING (true)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission text NOT NULL DEFAULT 'auth_controls.update',
  action text,
  allowed boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at ON public.admin_action_log(created_at DESC);
GRANT SELECT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_action_log' AND policyname='admin_action_log_admin_read') THEN
    EXECUTE 'CREATE POLICY "admin_action_log_admin_read" ON public.admin_action_log FOR SELECT TO authenticated USING (public.auth_controls_can_manage(auth.uid()))';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.auth_access_controls (
  id integer PRIMARY KEY DEFAULT 1,
  login_enabled boolean NOT NULL DEFAULT true,
  signup_enabled boolean NOT NULL DEFAULT true,
  login_message_title text NOT NULL DEFAULT 'System Maintenance',
  login_message_subtitle text NOT NULL DEFAULT 'Login Temporarily Disabled',
  login_message_description text NOT NULL DEFAULT 'Login is temporarily unavailable due to maintenance. Please try again later.',
  login_message_footer text NOT NULL DEFAULT 'Please check back later.',
  signup_message_title text NOT NULL DEFAULT 'System Maintenance',
  signup_message_subtitle text NOT NULL DEFAULT 'Signup Temporarily Disabled',
  signup_message_description text NOT NULL DEFAULT 'New registrations are temporarily unavailable. Please try again later.',
  signup_message_footer text NOT NULL DEFAULT 'Please check back later.',
  login_auto_enable_at timestamptz,
  signup_auto_enable_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_access_controls_singleton CHECK (id = 1)
);

INSERT INTO public.auth_access_controls (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.auth_access_controls TO anon, authenticated;
GRANT UPDATE ON public.auth_access_controls TO authenticated;
GRANT ALL ON public.auth_access_controls TO service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    EXECUTE 'GRANT SELECT ON public.auth_access_controls TO supabase_auth_admin';
  END IF;
END $$;
ALTER TABLE public.auth_access_controls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auth_access_controls' AND policyname='auth_controls_public_read') THEN
    EXECUTE 'CREATE POLICY "auth_controls_public_read" ON public.auth_access_controls FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auth_access_controls' AND policyname='auth_controls_admin_update') THEN
    EXECUTE 'CREATE POLICY "auth_controls_admin_update" ON public.auth_access_controls FOR UPDATE TO authenticated USING (public.auth_controls_can_manage(auth.uid())) WITH CHECK (public.auth_controls_can_manage(auth.uid()))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auth_access_controls' AND policyname='auth_admin_can_read_controls') THEN
    EXECUTE 'CREATE POLICY "auth_admin_can_read_controls" ON public.auth_access_controls FOR SELECT TO supabase_auth_admin USING (true)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_auth_access_controls()
RETURNS public.auth_access_controls
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row_data public.auth_access_controls;
BEGIN
  SELECT * INTO row_data FROM public.auth_access_controls WHERE id=1;
  IF row_data IS NULL THEN
    INSERT INTO public.auth_access_controls (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    SELECT * INTO row_data FROM public.auth_access_controls WHERE id=1;
  END IF;
  IF row_data.login_auto_enable_at IS NOT NULL AND row_data.login_auto_enable_at <= now() AND row_data.login_enabled=false THEN
    UPDATE public.auth_access_controls SET login_enabled=true, login_auto_enable_at=NULL, updated_at=now() WHERE id=1 RETURNING * INTO row_data;
  END IF;
  IF row_data.signup_auto_enable_at IS NOT NULL AND row_data.signup_auto_enable_at <= now() AND row_data.signup_enabled=false THEN
    UPDATE public.auth_access_controls SET signup_enabled=true, signup_auto_enable_at=NULL, updated_at=now() WHERE id=1 RETURNING * INTO row_data;
  END IF;
  RETURN row_data;
END; $$;

CREATE OR REPLACE FUNCTION public.update_auth_access_controls(_payload jsonb)
RETURNS public.auth_access_controls
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  prev_row public.auth_access_controls;
  new_row public.auth_access_controls;
  caller uuid := auth.uid();
  action_name text := 'update_messages';
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.auth_controls_can_manage(caller) THEN RAISE EXCEPTION 'forbidden: admin or super_admin role required'; END IF;
  INSERT INTO public.auth_access_controls (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  SELECT * INTO prev_row FROM public.auth_access_controls WHERE id=1 FOR UPDATE;
  UPDATE public.auth_access_controls SET
    login_enabled = CASE WHEN _payload ? 'login_enabled' THEN (_payload->>'login_enabled')::boolean ELSE login_enabled END,
    signup_enabled = CASE WHEN _payload ? 'signup_enabled' THEN (_payload->>'signup_enabled')::boolean ELSE signup_enabled END,
    login_message_title = COALESCE(NULLIF(_payload->>'login_message_title',''), login_message_title),
    login_message_subtitle = COALESCE(NULLIF(_payload->>'login_message_subtitle',''), login_message_subtitle),
    login_message_description = COALESCE(NULLIF(_payload->>'login_message_description',''), login_message_description),
    login_message_footer = COALESCE(NULLIF(_payload->>'login_message_footer',''), login_message_footer),
    signup_message_title = COALESCE(NULLIF(_payload->>'signup_message_title',''), signup_message_title),
    signup_message_subtitle = COALESCE(NULLIF(_payload->>'signup_message_subtitle',''), signup_message_subtitle),
    signup_message_description = COALESCE(NULLIF(_payload->>'signup_message_description',''), signup_message_description),
    signup_message_footer = COALESCE(NULLIF(_payload->>'signup_message_footer',''), signup_message_footer),
    login_auto_enable_at = CASE WHEN _payload ? 'login_auto_enable_at' THEN NULLIF(_payload->>'login_auto_enable_at','')::timestamptz ELSE login_auto_enable_at END,
    signup_auto_enable_at = CASE WHEN _payload ? 'signup_auto_enable_at' THEN NULLIF(_payload->>'signup_auto_enable_at','')::timestamptz ELSE signup_auto_enable_at END,
    updated_by = caller,
    updated_at = now()
  WHERE id=1 RETURNING * INTO new_row;
  IF prev_row.login_enabled IS DISTINCT FROM new_row.login_enabled THEN
    action_name := CASE WHEN new_row.login_enabled THEN 'enable_login' ELSE 'disable_login' END;
  ELSIF prev_row.signup_enabled IS DISTINCT FROM new_row.signup_enabled THEN
    action_name := CASE WHEN new_row.signup_enabled THEN 'enable_signup' ELSE 'disable_signup' END;
  END IF;
  INSERT INTO public.admin_action_log (user_id, permission, action, allowed, metadata)
  VALUES (caller, 'auth_controls.update', action_name, true,
    jsonb_build_object('previous', to_jsonb(prev_row), 'next', to_jsonb(new_row), 'changed_keys', COALESCE(_payload,'{}'::jsonb)));
  RETURN new_row;
END; $$;

REVOKE ALL ON FUNCTION public.get_auth_access_controls() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_auth_access_controls(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_access_controls() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_auth_access_controls(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid; is_valid boolean; login_on boolean; block_msg text;
BEGIN
  uid := NULLIF(event->>'user_id','')::uuid;
  is_valid := COALESCE((event->>'valid')::boolean, false);
  IF NOT is_valid OR uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF public.auth_controls_can_bypass_student_gate(uid) THEN RETURN '{}'::jsonb; END IF;
  SELECT login_enabled, login_message_description INTO login_on, block_msg FROM public.auth_access_controls WHERE id=1;
  IF login_on IS NULL OR login_on=true THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('error', jsonb_build_object('http_code',403,'message',COALESCE(block_msg,'Student login is temporarily unavailable. Please try again later.')));
END; $$;

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE signup_on boolean; block_msg text; created_by_admin boolean;
BEGIN
  created_by_admin := COALESCE(((event->'user'->'app_metadata')->>'created_by_admin')::boolean,
                               ((event->'user_record'->'app_metadata')->>'created_by_admin')::boolean, false);
  IF created_by_admin THEN RETURN '{}'::jsonb; END IF;
  SELECT signup_enabled, signup_message_description INTO signup_on, block_msg FROM public.auth_access_controls WHERE id=1;
  IF signup_on IS NULL OR signup_on=true THEN RETURN '{}'::jsonb; END IF;
  RETURN jsonb_build_object('error', jsonb_build_object('http_code',403,'message',COALESCE(block_msg,'Student signup is temporarily unavailable. Please try again later.')));
END; $$;

REVOKE EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_auth_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin';
  END IF;
END $$;

ALTER TABLE public.auth_access_controls REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auth_access_controls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_access_controls;
  END IF;
END $$;