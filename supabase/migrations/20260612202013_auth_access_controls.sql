-- =====================================================================
-- Admin Authentication Controls
-- Singleton table that gates student login & signup, with admin-editable
-- messages, scheduled auto-reactivation, audit logging, and realtime.
-- =====================================================================

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

GRANT SELECT ON public.auth_access_controls TO anon, authenticated;
GRANT ALL ON public.auth_access_controls TO service_role;

ALTER TABLE public.auth_access_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth controls are world readable" ON public.auth_access_controls;
CREATE POLICY "Auth controls are world readable" ON public.auth_access_controls
  FOR SELECT TO anon, authenticated
  USING (true);

INSERT INTO public.auth_access_controls (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_auth_access_controls()
RETURNS public.auth_access_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data public.auth_access_controls;
BEGIN
  SELECT * INTO row_data FROM public.auth_access_controls WHERE id = 1;
  IF row_data IS NULL THEN
    row_data.id := 1;
    row_data.login_enabled := true;
    row_data.signup_enabled := true;
    RETURN row_data;
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

REVOKE ALL ON FUNCTION public.get_auth_access_controls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_access_controls() TO anon, authenticated, service_role;

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
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.has_role(caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT * INTO prev_row FROM public.auth_access_controls WHERE id = 1;

  UPDATE public.auth_access_controls SET
    login_enabled = COALESCE((_payload->>'login_enabled')::boolean, login_enabled),
    signup_enabled = COALESCE((_payload->>'signup_enabled')::boolean, signup_enabled),
    login_message_title = COALESCE(_payload->>'login_message_title', login_message_title),
    login_message_subtitle = COALESCE(_payload->>'login_message_subtitle', login_message_subtitle),
    login_message_description = COALESCE(_payload->>'login_message_description', login_message_description),
    login_message_footer = COALESCE(_payload->>'login_message_footer', login_message_footer),
    signup_message_title = COALESCE(_payload->>'signup_message_title', signup_message_title),
    signup_message_subtitle = COALESCE(_payload->>'signup_message_subtitle', signup_message_subtitle),
    signup_message_description = COALESCE(_payload->>'signup_message_description', signup_message_description),
    signup_message_footer = COALESCE(_payload->>'signup_message_footer', signup_message_footer),
    login_auto_enable_at = CASE
      WHEN _payload ? 'login_auto_enable_at'
        THEN NULLIF(_payload->>'login_auto_enable_at','')::timestamptz
      ELSE login_auto_enable_at END,
    signup_auto_enable_at = CASE
      WHEN _payload ? 'signup_auto_enable_at'
        THEN NULLIF(_payload->>'signup_auto_enable_at','')::timestamptz
      ELSE signup_auto_enable_at END,
    updated_by = caller,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO new_row;

  INSERT INTO public.admin_action_log (user_id, permission, action, allowed, metadata)
  VALUES (
    caller,
    'auth_controls.update',
    CASE
      WHEN prev_row.login_enabled IS DISTINCT FROM new_row.login_enabled
        THEN (CASE WHEN new_row.login_enabled THEN 'enable_login' ELSE 'disable_login' END)
      WHEN prev_row.signup_enabled IS DISTINCT FROM new_row.signup_enabled
        THEN (CASE WHEN new_row.signup_enabled THEN 'enable_signup' ELSE 'disable_signup' END)
      ELSE 'update_messages'
    END,
    true,
    jsonb_build_object(
      'previous', to_jsonb(prev_row),
      'next', to_jsonb(new_row)
    )
  );

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_auth_access_controls(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_auth_access_controls(jsonb) TO authenticated, service_role;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_access_controls';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

ALTER TABLE public.auth_access_controls REPLICA IDENTITY FULL;
