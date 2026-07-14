
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

DROP POLICY IF EXISTS "Admins read role_permissions" ON public.role_permissions;
CREATE POLICY "Admins read role_permissions" ON public.role_permissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Admins write role_permissions" ON public.role_permissions;
CREATE POLICY "Admins write role_permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role)
           OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (ur.role = 'super_admin'::public.app_role
        OR EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE rp.role = ur.role AND rp.permission = _permission
        ))
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.role_permissions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_super boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'super_admin permissions are managed automatically and cannot be modified';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'super_admin permissions are immutable';
  END IF;

  IF TG_OP = 'DELETE' AND OLD.role = 'admin'::public.app_role
     AND OLD.permission IN ('manage_permissions','manage_users') THEN
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role)
      INTO has_super;
    IF NOT has_super THEN
      RAISE EXCEPTION 'Cannot remove % from admin role: no super_admin exists as fallback safeguard', OLD.permission;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS trg_role_permissions_guard ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.role_permissions_guard();

INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','manage_users'),
  ('admin','manage_permissions'),
  ('admin','moderate_content'),
  ('admin','view_analytics'),
  ('admin','edit_academic_structure'),
  ('admin','manage_content'),
  ('admin','take_exams'),
  ('admin','bookmark_review'),
  ('moderator','moderate_content'),
  ('moderator','view_analytics'),
  ('moderator','manage_content'),
  ('moderator','take_exams'),
  ('moderator','bookmark_review'),
  ('student','take_exams'),
  ('student','bookmark_review'),
  ('user','take_exams')
ON CONFLICT (role, permission) DO NOTHING;

ALTER TABLE public.role_permissions REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'role_permissions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions';
  END IF;
END $$;
