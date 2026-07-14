
-- Helper: updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================
-- role_permissions
-- =========================================================
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

-- has_permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- role_permissions guard (blocks super_admin changes, prevents removing admin manage perms when no super exists)
CREATE OR REPLACE FUNCTION public.role_permissions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_super boolean;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'super_admin permissions are managed automatically and cannot be modified';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.role = 'super_admin'::public.app_role THEN
    RAISE EXCEPTION 'super_admin permissions are immutable';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.role = 'admin'::public.app_role
     AND OLD.permission IN ('manage_permissions','manage_users') THEN
    SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'super_admin'::public.app_role) INTO has_super;
    IF NOT has_super THEN
      RAISE EXCEPTION 'Cannot remove % from admin role: no super_admin exists as fallback safeguard', OLD.permission;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_role_permissions_guard ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.role_permissions_guard();

-- Seed default role_permissions
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

-- =========================================================
-- app_pages
-- =========================================================
CREATE TABLE IF NOT EXISTS public.app_pages (
  key text PRIMARY KEY,
  label text NOT NULL,
  "group" text NOT NULL DEFAULT 'General',
  route text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_pages TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_pages TO authenticated;
GRANT ALL ON public.app_pages TO service_role;
ALTER TABLE public.app_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_pages read for authenticated" ON public.app_pages;
CREATE POLICY "app_pages read for authenticated" ON public.app_pages
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "app_pages write requires manage_permissions" ON public.app_pages;
CREATE POLICY "app_pages write requires manage_permissions" ON public.app_pages
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_permissions'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_permissions'));

-- Seed app_pages from the code registry (FIXES the FK error)
INSERT INTO public.app_pages (key, label, "group", route) VALUES
  ('admin.dashboard',     'Dashboard',           'Overview',   '/admin'),
  ('admin.academic',      'Academic Manager',    'Content',    '/admin/academic-manager'),
  ('admin.mcq',           'MCQ Manager',         'Content',    '/admin/mcq'),
  ('admin.quiz',          'Quiz Manager',        'Content',    '/admin/quiz'),
  ('admin.mock-test',     'Mock Test Manager',   'Content',    '/admin/mock-test'),
  ('admin.flash-cards',   'Flash Cards',         'Content',    '/admin/flash-cards'),
  ('admin.short-notes',   'Short Notes',         'Content',    '/admin/short-notes'),
  ('admin.question-bank', 'Question Bank',       'Content',    '/admin/question-bank'),
  ('admin.classes',       'Video Classes',       'Content',    '/admin/classes'),
  ('admin.users',         'User Management',     'People',     '/admin/users'),
  ('admin.permissions',   'Roles & Permissions', 'People',     '/admin/permissions'),
  ('admin.notifications', 'Notifications',       'Engagement', '/admin/notifications'),
  ('admin.broadcasts',    'Broadcasts',          'Engagement', '/admin/broadcasts'),
  ('admin.live-chat',     'Live Chat',           'Engagement', '/admin/live-chat'),
  ('admin.analytics',     'Analytics',           'Insights',   '/admin/analytics'),
  ('admin.site',          'Site Management',     'System',     '/admin/site'),
  ('admin.site-editor',   'Site Editor',         'System',     '/admin/site-editor'),
  ('admin.blog',          'Blog Manager',        'System',     '/admin/blog'),
  ('admin.database',      'Database Manager',    'System',     '/admin/database'),
  ('admin.system-health', 'System Health',       'System',     '/admin/system-health'),
  ('admin.settings',      'Settings',            'System',     '/admin/settings')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  "group" = EXCLUDED."group",
  route = EXCLUDED.route,
  updated_at = now();

-- =========================================================
-- page_access
-- =========================================================
CREATE TABLE IF NOT EXISTS public.page_access (
  role public.app_role NOT NULL,
  page_key text NOT NULL REFERENCES public.app_pages(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, page_key)
);
CREATE INDEX IF NOT EXISTS page_access_page_key_idx ON public.page_access(page_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_access TO authenticated;
GRANT ALL ON public.page_access TO service_role;
ALTER TABLE public.page_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_access read for authenticated" ON public.page_access;
CREATE POLICY "page_access read for authenticated" ON public.page_access
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "page_access write requires manage_permissions" ON public.page_access;
CREATE POLICY "page_access write requires manage_permissions" ON public.page_access
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_permissions'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_permissions'));

-- =========================================================
-- permission_audit_log
-- =========================================================
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_role public.app_role,
  target_page text,
  target_permission text,
  target_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permission_audit_log_created_at_idx
  ON public.permission_audit_log(created_at DESC);
GRANT SELECT ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit log read requires manage_permissions" ON public.permission_audit_log;
CREATE POLICY "audit log read requires manage_permissions" ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_permissions'));
DROP POLICY IF EXISTS "audit log no direct write" ON public.permission_audit_log;
CREATE POLICY "audit log no direct write" ON public.permission_audit_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- =========================================================
-- super_admin lock triggers + helper functions
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_block_super_admin_changes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP IN ('INSERT','UPDATE')) AND NEW.role = 'super_admin' THEN
    RAISE EXCEPTION 'super_admin permissions are immutable' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.role = 'super_admin' THEN
    RAISE EXCEPTION 'super_admin permissions are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS page_access_super_admin_lock ON public.page_access;
CREATE TRIGGER page_access_super_admin_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.page_access
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_super_admin_changes();

CREATE OR REPLACE FUNCTION public.has_page_access(_user_id uuid, _page_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND (
      ur.role::text IN ('super_admin','admin')
      OR EXISTS (
        SELECT 1 FROM public.page_access pa
        WHERE pa.role = ur.role AND pa.page_key = _page_key
      )
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_page_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_page_access(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_my_pages()
RETURNS TABLE(page_key text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT role::text AS role FROM public.user_roles WHERE user_id = auth.uid())
  SELECT ap.key FROM public.app_pages ap
  WHERE ap.enabled = true AND (
    EXISTS (SELECT 1 FROM me WHERE role IN ('super_admin','admin'))
    OR EXISTS (SELECT 1 FROM public.page_access pa JOIN me ON me.role = pa.role::text WHERE pa.page_key = ap.key)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_pages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_pages() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_my_permissions()
RETURNS TABLE(permission text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT role::text AS role FROM public.user_roles WHERE user_id = auth.uid())
  SELECT rp.permission FROM public.role_permissions rp JOIN me ON me.role = rp.role::text
  UNION
  SELECT DISTINCT rp.permission FROM public.role_permissions rp
  WHERE EXISTS (SELECT 1 FROM me WHERE role IN ('super_admin','admin'))
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_permissions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_permissions() TO authenticated, service_role;
