-- =====================================================================
-- COMPLETE PRODUCTION RECOVERY: Student Login / Signup Controls
-- =====================================================================
-- Purpose:
--   Run this whole file in the Supabase SQL Editor for project:
--   xgnlydivsecwodwhdvky
--
-- Guarantees:
--   * Idempotent: safe to run multiple times.
--   * Creates missing dependencies before dependent objects.
--   * Avoids enum rollback failures by never casting newly-added enum
--     values in the same transaction.
--   * Reloads the PostgREST schema cache at the end.
--
-- Important:
--   SQL can create hook functions and grants. The Auth Hook attachment
--   still must be enabled in Authentication > Hooks unless it is already
--   configured in the project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Required extension for UUID defaults
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1. app_role enum dependency
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. user_roles dependency + safe role helpers
-- ---------------------------------------------------------------------
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT SELECT ON public.user_roles TO supabase_auth_admin';
  END IF;
END $$;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.auth_controls_can_manage(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('admin', 'super_admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.auth_controls_can_bypass_student_gate(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role::text IN ('admin', 'super_admin', 'moderator')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_controls_can_manage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_controls_can_bypass_student_gate(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.auth_controls_can_bypass_student_gate(uuid) TO supabase_auth_admin';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'user_roles_self_or_admin_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "user_roles_self_or_admin_read"
        ON public.user_roles
        FOR SELECT
        TO authenticated
        USING (user_id = auth.uid() OR public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'user_roles_admin_manage'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "user_roles_admin_manage"
        ON public.user_roles
        FOR ALL
        TO authenticated
        USING (public.auth_controls_can_manage(auth.uid()))
        WITH CHECK (public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'user_roles'
         AND policyname = 'auth_admin_can_read_user_roles'
     ) THEN
    EXECUTE $policy$
      CREATE POLICY "auth_admin_can_read_user_roles"
        ON public.user_roles
        FOR SELECT
        TO supabase_auth_admin
        USING (true)
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. profiles dependency: create only if absent, add expected columns
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  bio text,
  level text NOT NULL DEFAULT 'professional',
  status text NOT NULL DEFAULT 'active',
  referral_source text,
  phone text,
  last_login_at timestamptz,
  total_login_count integer NOT NULL DEFAULT 0,
  total_usage_seconds bigint NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  ban_until timestamptz,
  ban_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level text DEFAULT 'professional';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_usage_seconds bigint NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_self_or_admin_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_self_or_admin_read"
        ON public.profiles
        FOR SELECT
        TO authenticated
        USING (id = auth.uid() OR public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_self_or_admin_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_self_or_admin_update"
        ON public.profiles
        FOR UPDATE
        TO authenticated
        USING (id = auth.uid() OR public.auth_controls_can_manage(auth.uid()))
        WITH CHECK (id = auth.uid() OR public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_self_or_admin_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_self_or_admin_insert"
        ON public.profiles
        FOR INSERT
        TO authenticated
        WITH CHECK (id = auth.uid() OR public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. role_permissions / has_permission dependency used by admin modules
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role::text = 'super_admin'
        OR EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role = ur.role
            AND rp.permission = _permission
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'role_permissions'
      AND policyname = 'role_permissions_admin_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "role_permissions_admin_read"
        ON public.role_permissions
        FOR SELECT
        TO authenticated
        USING (public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'role_permissions'
      AND policyname = 'role_permissions_admin_write'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "role_permissions_admin_write"
        ON public.role_permissions
        FOR ALL
        TO authenticated
        USING (public.auth_controls_can_manage(auth.uid()))
        WITH CHECK (public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.role_permissions (role, permission)
    VALUES
      ('admin', 'manage_users'),
      ('admin', 'manage_permissions'),
      ('admin', 'moderate_content'),
      ('admin', 'view_analytics'),
      ('admin', 'edit_academic_structure'),
      ('admin', 'manage_content'),
      ('admin', 'take_exams'),
      ('admin', 'bookmark_review'),
      ('admin', 'manage_system'),
      ('moderator', 'moderate_content'),
      ('moderator', 'view_analytics'),
      ('moderator', 'manage_content'),
      ('moderator', 'take_exams'),
      ('moderator', 'bookmark_review')
    ON CONFLICT (role, permission) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Skipped role_permissions seed because enum labels may have been created in this same transaction: %', SQLERRM;
  END;
END $$;

-- ---------------------------------------------------------------------
-- 5. audit logging support dependency
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission text NOT NULL DEFAULT 'auth_controls.update',
  action text,
  allowed boolean NOT NULL DEFAULT true,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS permission text;
ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS allowed boolean;
ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.admin_action_log ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.admin_action_log SET permission = 'legacy' WHERE permission IS NULL;
UPDATE public.admin_action_log SET allowed = true WHERE allowed IS NULL;
ALTER TABLE public.admin_action_log ALTER COLUMN permission SET DEFAULT 'auth_controls.update';
ALTER TABLE public.admin_action_log ALTER COLUMN permission SET NOT NULL;
ALTER TABLE public.admin_action_log ALTER COLUMN allowed SET DEFAULT true;
ALTER TABLE public.admin_action_log ALTER COLUMN allowed SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at ON public.admin_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_user ON public.admin_action_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_permission ON public.admin_action_log(permission, created_at DESC);

GRANT SELECT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_action_log'
      AND policyname = 'admin_action_log_admin_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admin_action_log_admin_read"
        ON public.admin_action_log
        FOR SELECT
        TO authenticated
        USING (public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_admin_action(
  _permission text,
  _action text,
  _allowed boolean,
  _metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_admin_action requires an authenticated caller';
  END IF;

  INSERT INTO public.admin_action_log (user_id, permission, action, allowed, metadata)
  VALUES (auth.uid(), _permission, _action, _allowed, _metadata);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. auth_access_controls table + singleton row
-- ---------------------------------------------------------------------
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

ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS login_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS signup_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS login_message_title text NOT NULL DEFAULT 'System Maintenance';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS login_message_subtitle text NOT NULL DEFAULT 'Login Temporarily Disabled';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS login_message_description text NOT NULL DEFAULT 'Login is temporarily unavailable due to maintenance. Please try again later.';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS login_message_footer text NOT NULL DEFAULT 'Please check back later.';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS signup_message_title text NOT NULL DEFAULT 'System Maintenance';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS signup_message_subtitle text NOT NULL DEFAULT 'Signup Temporarily Disabled';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS signup_message_description text NOT NULL DEFAULT 'New registrations are temporarily unavailable. Please try again later.';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS signup_message_footer text NOT NULL DEFAULT 'Please check back later.';
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS login_auto_enable_at timestamptz;
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS signup_auto_enable_at timestamptz;
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.auth_access_controls ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_access_controls_singleton'
      AND conrelid = 'public.auth_access_controls'::regclass
  ) THEN
    ALTER TABLE public.auth_access_controls
      ADD CONSTRAINT auth_access_controls_singleton CHECK (id = 1);
  END IF;
END $$;

INSERT INTO public.auth_access_controls (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.auth_access_controls TO anon, authenticated;
GRANT UPDATE ON public.auth_access_controls TO authenticated;
GRANT ALL ON public.auth_access_controls TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT SELECT ON public.auth_access_controls TO supabase_auth_admin';
  END IF;
END $$;

ALTER TABLE public.auth_access_controls ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'auth_access_controls'
      AND policyname = 'auth_controls_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "auth_controls_public_read"
        ON public.auth_access_controls
        FOR SELECT
        TO anon, authenticated
        USING (true)
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'auth_access_controls'
      AND policyname = 'auth_controls_admin_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "auth_controls_admin_update"
        ON public.auth_access_controls
        FOR UPDATE
        TO authenticated
        USING (public.auth_controls_can_manage(auth.uid()))
        WITH CHECK (public.auth_controls_can_manage(auth.uid()))
    $policy$;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'auth_access_controls'
         AND policyname = 'auth_admin_can_read_controls'
     ) THEN
    EXECUTE $policy$
      CREATE POLICY "auth_admin_can_read_controls"
        ON public.auth_access_controls
        FOR SELECT
        TO supabase_auth_admin
        USING (true)
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7. RPC functions used by the app
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auth_access_controls()
RETURNS public.auth_access_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data public.auth_access_controls;
BEGIN
  SELECT * INTO row_data
  FROM public.auth_access_controls
  WHERE id = 1;

  IF row_data IS NULL THEN
    INSERT INTO public.auth_access_controls (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO row_data
    FROM public.auth_access_controls
    WHERE id = 1;
  END IF;

  IF row_data.login_auto_enable_at IS NOT NULL
     AND row_data.login_auto_enable_at <= now()
     AND row_data.login_enabled = false THEN
    UPDATE public.auth_access_controls
       SET login_enabled = true,
           login_auto_enable_at = NULL,
           updated_at = now()
     WHERE id = 1
     RETURNING * INTO row_data;
  END IF;

  IF row_data.signup_auto_enable_at IS NOT NULL
     AND row_data.signup_auto_enable_at <= now()
     AND row_data.signup_enabled = false THEN
    UPDATE public.auth_access_controls
       SET signup_enabled = true,
           signup_auto_enable_at = NULL,
           updated_at = now()
     WHERE id = 1
     RETURNING * INTO row_data;
  END IF;

  RETURN row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_auth_access_controls(_payload jsonb)
RETURNS public.auth_access_controls
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_row public.auth_access_controls;
  new_row public.auth_access_controls;
  caller uuid := auth.uid();
  action_name text := 'update_messages';
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT public.auth_controls_can_manage(caller) THEN
    RAISE EXCEPTION 'forbidden: admin or super_admin role required';
  END IF;

  INSERT INTO public.auth_access_controls (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO prev_row
  FROM public.auth_access_controls
  WHERE id = 1
  FOR UPDATE;

  UPDATE public.auth_access_controls
     SET login_enabled = CASE
           WHEN _payload ? 'login_enabled' THEN (_payload->>'login_enabled')::boolean
           ELSE login_enabled
         END,
         signup_enabled = CASE
           WHEN _payload ? 'signup_enabled' THEN (_payload->>'signup_enabled')::boolean
           ELSE signup_enabled
         END,
         login_message_title = COALESCE(NULLIF(_payload->>'login_message_title', ''), login_message_title),
         login_message_subtitle = COALESCE(NULLIF(_payload->>'login_message_subtitle', ''), login_message_subtitle),
         login_message_description = COALESCE(NULLIF(_payload->>'login_message_description', ''), login_message_description),
         login_message_footer = COALESCE(NULLIF(_payload->>'login_message_footer', ''), login_message_footer),
         signup_message_title = COALESCE(NULLIF(_payload->>'signup_message_title', ''), signup_message_title),
         signup_message_subtitle = COALESCE(NULLIF(_payload->>'signup_message_subtitle', ''), signup_message_subtitle),
         signup_message_description = COALESCE(NULLIF(_payload->>'signup_message_description', ''), signup_message_description),
         signup_message_footer = COALESCE(NULLIF(_payload->>'signup_message_footer', ''), signup_message_footer),
         login_auto_enable_at = CASE
           WHEN _payload ? 'login_auto_enable_at' THEN NULLIF(_payload->>'login_auto_enable_at', '')::timestamptz
           ELSE login_auto_enable_at
         END,
         signup_auto_enable_at = CASE
           WHEN _payload ? 'signup_auto_enable_at' THEN NULLIF(_payload->>'signup_auto_enable_at', '')::timestamptz
           ELSE signup_auto_enable_at
         END,
         updated_by = caller,
         updated_at = now()
   WHERE id = 1
   RETURNING * INTO new_row;

  IF prev_row.login_enabled IS DISTINCT FROM new_row.login_enabled THEN
    action_name := CASE WHEN new_row.login_enabled THEN 'enable_login' ELSE 'disable_login' END;
  ELSIF prev_row.signup_enabled IS DISTINCT FROM new_row.signup_enabled THEN
    action_name := CASE WHEN new_row.signup_enabled THEN 'enable_signup' ELSE 'disable_signup' END;
  END IF;

  INSERT INTO public.admin_action_log (user_id, permission, action, allowed, metadata)
  VALUES (
    caller,
    'auth_controls.update',
    action_name,
    true,
    jsonb_build_object(
      'previous', to_jsonb(prev_row),
      'next', to_jsonb(new_row),
      'changed_keys', COALESCE(_payload, '{}'::jsonb)
    )
  );

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_access_controls() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_auth_access_controls(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_access_controls() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_auth_access_controls(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Auth Hook functions used by GoTrue
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  is_valid boolean;
  login_on boolean;
  block_msg text;
BEGIN
  uid := NULLIF(event->>'user_id', '')::uuid;
  is_valid := COALESCE((event->>'valid')::boolean, false);

  IF NOT is_valid OR uid IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF public.auth_controls_can_bypass_student_gate(uid) THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT login_enabled, login_message_description
    INTO login_on, block_msg
    FROM public.auth_access_controls
   WHERE id = 1;

  IF login_on IS NULL OR login_on = true THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', COALESCE(block_msg, 'Student login is temporarily unavailable. Please try again later.')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hook_before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signup_on boolean;
  block_msg text;
  created_by_admin boolean;
BEGIN
  created_by_admin := COALESCE(
    ((event->'user'->'app_metadata')->>'created_by_admin')::boolean,
    ((event->'user_record'->'app_metadata')->>'created_by_admin')::boolean,
    false
  );

  IF created_by_admin THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT signup_enabled, signup_message_description
    INTO signup_on, block_msg
    FROM public.auth_access_controls
   WHERE id = 1;

  IF signup_on IS NULL OR signup_on = true THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', COALESCE(block_msg, 'Student signup is temporarily unavailable. Please try again later.')
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb) TO supabase_auth_admin';
  END IF;
END $$;

COMMENT ON FUNCTION public.hook_password_verification_attempt(jsonb) IS
  'Auth Hook: blocks non-privileged/student sign-in when auth_access_controls.login_enabled=false.';
COMMENT ON FUNCTION public.hook_before_user_created(jsonb) IS
  'Auth Hook: blocks public signup when auth_access_controls.signup_enabled=false; service-role admin-created users may pass.';

-- ---------------------------------------------------------------------
-- 9. Realtime publication
-- ---------------------------------------------------------------------
ALTER TABLE public.auth_access_controls REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'auth_access_controls'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_access_controls;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 10. Reload API/schema cache
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ---------------------------------------------------------------------
-- 11. Required verification query: every reg* value must be non-NULL
-- ---------------------------------------------------------------------
SELECT
  to_regclass('public.auth_access_controls') AS auth_access_controls_table,
  to_regprocedure('public.get_auth_access_controls()') AS get_auth_access_controls_rpc,
  to_regprocedure('public.update_auth_access_controls(jsonb)') AS update_auth_access_controls_rpc,
  to_regprocedure('public.hook_password_verification_attempt(jsonb)') AS hook_password_verification_attempt_fn,
  to_regprocedure('public.hook_before_user_created(jsonb)') AS hook_before_user_created_fn;

-- ---------------------------------------------------------------------
-- 12. Detailed readiness evidence query
-- ---------------------------------------------------------------------
SELECT
  to_regtype('public.app_role') IS NOT NULL AS app_role_enum_exists,
  to_regprocedure('public.has_role(uuid, public.app_role)') IS NOT NULL AS has_role_exists,
  to_regclass('public.user_roles') IS NOT NULL AS user_roles_exists,
  to_regclass('public.profiles') IS NOT NULL AS profiles_exists,
  to_regclass('public.admin_action_log') IS NOT NULL AS admin_action_log_exists,
  EXISTS (SELECT 1 FROM public.auth_access_controls WHERE id = 1) AS singleton_row_exists,
  EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'auth_access_controls'
  ) AS realtime_publication_configured,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'auth_access_controls'
      AND policyname = 'auth_controls_public_read'
  ) AS auth_controls_read_policy_exists,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'auth_access_controls'
      AND policyname = 'auth_controls_admin_update'
  ) AS auth_controls_update_policy_exists;