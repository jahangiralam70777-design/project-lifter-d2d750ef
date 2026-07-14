-- =====================================================================
-- APPLY MANUALLY in Supabase Dashboard -> SQL Editor.
-- After applying, in Supabase Dashboard -> Authentication -> Hooks:
--   * Enable "Password Verification Attempt Hook"
--       -> public.hook_password_verification_attempt
--   * Enable "Before User Created Hook"
--       -> public.hook_before_user_created
--
-- These SQL hooks run INSIDE GoTrue. They block direct REST calls to
-- /auth/v1/token and /auth/v1/signup the same way they block the
-- frontend, with zero ability for any client (curl, devtools, mobile,
-- alternate Supabase clients) to bypass them.
-- =====================================================================

-- 1. Password Verification Attempt Hook -- Student LOGIN gate ----------
CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  is_valid boolean;
  is_privileged boolean;
  login_on boolean;
  block_msg text;
BEGIN
  uid := NULLIF(event->>'user_id','')::uuid;
  is_valid := COALESCE((event->>'valid')::boolean, false);

  -- Bad-password attempts: let GoTrue's normal failure flow handle it.
  IF NOT is_valid OR uid IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Admin / super_admin / moderator are NEVER blocked.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = uid
       AND role IN ('admin'::public.app_role,
                    'super_admin'::public.app_role,
                    'moderator'::public.app_role)
  ) INTO is_privileged;

  IF is_privileged THEN
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
      'message', COALESCE(block_msg,
        'Student login is temporarily unavailable. Please try again later.')
    )
  );
END;
$$;

-- 2. Before User Created Hook -- Student SIGNUP gate -------------------
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
  -- Service-role admin creations set this in app_metadata. Public
  -- clients CANNOT set app_metadata, so this cannot be forged via
  -- /auth/v1/signup.
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
      'message', COALESCE(block_msg,
        'Student signup is temporarily unavailable. Please try again later.')
    )
  );
END;
$$;

-- 3. Grants for the GoTrue service role --------------------------------
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb)
  TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created(jsonb)
  TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb)
  FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.hook_before_user_created(jsonb)
  FROM authenticated, anon, public;

GRANT SELECT ON public.auth_access_controls TO supabase_auth_admin;
GRANT SELECT ON public.user_roles            TO supabase_auth_admin;

-- Belt-and-braces RLS policies for the auth admin role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='auth_access_controls'
       AND policyname='auth_admin_can_read_controls'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_admin_can_read_controls" '
         || 'ON public.auth_access_controls FOR SELECT '
         || 'TO supabase_auth_admin USING (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='user_roles'
       AND policyname='auth_admin_can_read_user_roles'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_admin_can_read_user_roles" '
         || 'ON public.user_roles FOR SELECT '
         || 'TO supabase_auth_admin USING (true)';
  END IF;
END $$;

COMMENT ON FUNCTION public.hook_password_verification_attempt(jsonb) IS
  'Auth Hook: rejects student/user sign-in when login_enabled=false. '
  'Admin/super_admin/moderator always pass.';
COMMENT ON FUNCTION public.hook_before_user_created(jsonb) IS
  'Auth Hook: rejects signups when signup_enabled=false, except for '
  'service-role admin creations (app_metadata.created_by_admin=true).';
