DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('student', 'admin', 'super_admin', 'moderator', 'user');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typname = 'app_role'
      AND e.enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

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

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'super_admin'::public.app_role)
$$;

REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA internal TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION internal.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.is_admin(uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_roles_admin_manage ON public.user_roles;
DROP POLICY IF EXISTS user_roles_self_or_admin_read ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY user_roles_self_or_admin_read
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR internal.is_admin(auth.uid()));

CREATE POLICY user_roles_admin_manage
ON public.user_roles
FOR ALL
TO authenticated
USING (internal.is_admin(auth.uid()))
WITH CHECK (internal.is_admin(auth.uid()));

DROP POLICY IF EXISTS ssettings_admin_insert ON public.site_settings;
DROP POLICY IF EXISTS ssettings_admin_update ON public.site_settings;
DROP POLICY IF EXISTS ssettings_public_read ON public.site_settings;
DROP POLICY IF EXISTS "Admins can insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can update site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Authenticated users can read site settings" ON public.site_settings;

CREATE POLICY ssettings_read
ON public.site_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY ssettings_public_published_read
ON public.site_settings
FOR SELECT
TO anon
USING (published_at IS NOT NULL);

CREATE POLICY ssettings_admin_insert
ON public.site_settings
FOR INSERT
TO authenticated
WITH CHECK (internal.is_admin(auth.uid()));

CREATE POLICY ssettings_admin_update
ON public.site_settings
FOR UPDATE
TO authenticated
USING (internal.is_admin(auth.uid()))
WITH CHECK (internal.is_admin(auth.uid()));