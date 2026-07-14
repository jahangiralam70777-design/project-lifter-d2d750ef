-- =====================================================================
-- RBAC MATRIX REDESIGN — 2026-06-17
-- Apply this in the Supabase SQL editor (or via your migration tool).
-- Safe to re-run. Idempotent.
-- =====================================================================

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
GRANT ALL    ON public.app_pages TO service_role;
ALTER TABLE public.app_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_pages read for authenticated" ON public.app_pages;
CREATE POLICY "app_pages read for authenticated" ON public.app_pages
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "app_pages write requires manage_permissions" ON public.app_pages;
CREATE POLICY "app_pages write requires manage_permissions" ON public.app_pages
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_permissions'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_permissions'));

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
GRANT ALL    ON public.permission_audit_log TO service_role;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit log read requires manage_permissions" ON public.permission_audit_log;
CREATE POLICY "audit log read requires manage_permissions" ON public.permission_audit_log
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_permissions'));
DROP POLICY IF EXISTS "audit log no direct write" ON public.permission_audit_log;
CREATE POLICY "audit log no direct write" ON public.permission_audit_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

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
END;
$$;
DROP TRIGGER IF EXISTS role_permissions_super_admin_lock ON public.role_permissions;
CREATE TRIGGER role_permissions_super_admin_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_super_admin_changes();
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
GRANT  EXECUTE ON FUNCTION public.has_page_access(uuid, text) TO authenticated, service_role;

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
GRANT  EXECUTE ON FUNCTION public.list_my_pages() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_my_permissions()
RETURNS TABLE(permission text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT role::text AS role FROM public.user_roles WHERE user_id = auth.uid())
  SELECT rp.permission FROM public.role_permissions rp JOIN me ON me.role = rp.role::text
  UNION
  SELECT DISTINCT rp.permission FROM public.role_permissions rp
  WHERE EXISTS (SELECT 1 FROM me WHERE role IN ('super_admin','admin'))
$$;
REVOKE EXECUTE ON FUNCTION public.list_my_permissions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_my_permissions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_permission_audit(
  _action text,
  _target_role public.app_role DEFAULT NULL,
  _target_page text DEFAULT NULL,
  _target_permission text DEFAULT NULL,
  _target_user_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.permission_audit_log
    (actor_id, actor_email, action, target_role, target_page, target_permission, target_user_id, metadata)
  VALUES
    (auth.uid(), v_email, _action, _target_role, _target_page, _target_permission, _target_user_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_permission_audit(text, public.app_role, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_permission_audit(text, public.app_role, text, text, uuid, jsonb) TO authenticated, service_role;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.role_permissions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.page_access; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.app_pages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.permission_audit_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.role_permissions     REPLICA IDENTITY FULL;
ALTER TABLE public.page_access          REPLICA IDENTITY FULL;
ALTER TABLE public.app_pages            REPLICA IDENTITY FULL;
ALTER TABLE public.permission_audit_log REPLICA IDENTITY FULL;
