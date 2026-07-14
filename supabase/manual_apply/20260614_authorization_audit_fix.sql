-- =====================================================================
-- AUTHORIZATION AUDIT FIX — 2026-06-14
--
-- Root cause of "Forbidden / Admin role required / Super Admin required"
-- errors for users who DO have the correct role:
--
--   Migration 20260613191707 redefined public.has_permission() to be a
--   thin wrapper around internal.is_admin(_user_id). That broke RBAC for
--   every non-admin role (moderator, student, custom roles), because the
--   role_permissions matrix is no longer consulted. It also means any
--   permission that admins were granted *via the matrix* but that some
--   server check expects to find on a non-admin role silently fails.
--
-- This migration restores the canonical has_permission() implementation:
--   * super_admin → always true (immutable, full access).
--   * admin       → always true (inherits everything; matches has_role
--                   based UI gating and avoids "Admin role required"
--                   errors on endpoints that forgot to seed admin rows).
--   * any role    → true iff (role, permission) exists in role_permissions.
--
-- It also re-seeds the baseline role_permissions matrix so freshly
-- restored databases line up with the UI (ALL_PERMISSIONS in
-- src/lib/admin-role-permissions.functions.ts).
--
-- SAFE TO RE-RUN. Idempotent.
-- =====================================================================

-- 1. Canonical has_permission ------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND (
          ur.role::text IN ('super_admin', 'admin')
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
GRANT  EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- 2. Re-seed the baseline matrix --------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin',     'manage_users'),
  ('admin',     'manage_permissions'),
  ('admin',     'manage_system'),
  ('admin',     'moderate_content'),
  ('admin',     'view_analytics'),
  ('admin',     'edit_academic_structure'),
  ('admin',     'manage_content'),
  ('admin',     'take_exams'),
  ('admin',     'bookmark_review'),
  ('moderator', 'moderate_content'),
  ('moderator', 'view_analytics'),
  ('moderator', 'manage_content'),
  ('moderator', 'take_exams'),
  ('moderator', 'bookmark_review'),
  ('student',   'take_exams'),
  ('student',   'bookmark_review'),
  ('user',      'take_exams'),
  ('user',      'bookmark_review')
ON CONFLICT (role, permission) DO NOTHING;

-- 3. Diagnostic helper: surfaces *why* a permission check fails -------------
--    Call from psql / server logs to debug "Forbidden" reports without
--    exposing details to end users.
CREATE OR REPLACE FUNCTION public.debug_permission_check(_user_id uuid, _permission text)
RETURNS TABLE(
  user_id        uuid,
  has_user_row   boolean,
  roles          text[],
  is_admin       boolean,
  permission     text,
  granted        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _user_id,
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id),
    COALESCE(ARRAY(
      SELECT role::text FROM public.user_roles WHERE user_id = _user_id
    ), ARRAY[]::text[]),
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role::text IN ('admin','super_admin')
    ),
    _permission,
    public.has_permission(_user_id, _permission)
$$;

REVOKE EXECUTE ON FUNCTION public.debug_permission_check(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.debug_permission_check(uuid, text) TO authenticated, service_role;
