CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA internal TO authenticated, service_role;
REVOKE ALL ON FUNCTION internal.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS "user_roles_self_or_admin_read" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;

CREATE POLICY "user_roles_self_or_admin_read"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR internal.has_role(auth.uid(), 'admin'::public.app_role)
  OR internal.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "user_roles_admin_manage"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  internal.has_role(auth.uid(), 'admin'::public.app_role)
  OR internal.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  internal.has_role(auth.uid(), 'admin'::public.app_role)
  OR internal.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS "ssettings_admin_insert" ON public.site_settings;
DROP POLICY IF EXISTS "ssettings_admin_update" ON public.site_settings;

CREATE POLICY "ssettings_admin_insert"
ON public.site_settings
FOR INSERT
TO authenticated
WITH CHECK (
  internal.has_role(auth.uid(), 'admin'::public.app_role)
  OR internal.has_role(auth.uid(), 'super_admin'::public.app_role)
);

CREATE POLICY "ssettings_admin_update"
ON public.site_settings
FOR UPDATE
TO authenticated
USING (
  internal.has_role(auth.uid(), 'admin'::public.app_role)
  OR internal.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  internal.has_role(auth.uid(), 'admin'::public.app_role)
  OR internal.has_role(auth.uid(), 'super_admin'::public.app_role)
);

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;