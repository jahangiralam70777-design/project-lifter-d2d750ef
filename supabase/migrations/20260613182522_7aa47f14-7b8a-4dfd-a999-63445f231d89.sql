CREATE OR REPLACE FUNCTION internal.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND (
        u.raw_app_meta_data ->> 'role' IN ('admin', 'super_admin')
        OR u.raw_app_meta_data -> 'roles' ? 'admin'
        OR u.raw_app_meta_data -> 'roles' ? 'super_admin'
      )
  )
$$;

REVOKE ALL ON FUNCTION internal.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.is_admin(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "user_roles_self_or_admin_read" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_manage" ON public.user_roles;

CREATE POLICY "user_roles_self_or_admin_read"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR internal.is_admin(auth.uid())
);

CREATE POLICY "user_roles_admin_manage"
ON public.user_roles
FOR ALL
TO authenticated
USING (internal.is_admin(auth.uid()))
WITH CHECK (internal.is_admin(auth.uid()));

DROP POLICY IF EXISTS "ssettings_admin_insert" ON public.site_settings;
DROP POLICY IF EXISTS "ssettings_admin_update" ON public.site_settings;

CREATE POLICY "ssettings_admin_insert"
ON public.site_settings
FOR INSERT
TO authenticated
WITH CHECK (internal.is_admin(auth.uid()));

CREATE POLICY "ssettings_admin_update"
ON public.site_settings
FOR UPDATE
TO authenticated
USING (internal.is_admin(auth.uid()))
WITH CHECK (internal.is_admin(auth.uid()));