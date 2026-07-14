-- =============================================================
-- User Management Hardening — Phase 3 (additive, idempotent)
-- =============================================================
-- HOW TO APPLY:
--   Open the Supabase SQL Editor for project wvpsarfmioszuqxlcwle and
--   run this file once. Safe to re-run.
--
-- Purpose:
--   * Strengthen admin_hard_delete_user so it is safe whether the API
--     deleteUser() call has already happened or not (idempotent), and
--     so it refuses to nuke an admin or the caller themselves.
--   * Re-affirm admin_soft_delete_user with the same self-protection.
--   * Re-affirm grants/revokes for both RPCs.
-- Nothing existing is dropped destructively; CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _id = _caller THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;
  IF public.has_role(_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Cannot permanently delete an admin. Demote first.';
  END IF;

  -- Belt-and-suspenders cleanup. Tables with ON DELETE CASCADE on
  -- auth.users(id) get cleaned when the auth row is deleted via the
  -- Admin API; the explicit deletes below cover the case where this
  -- RPC is called WITHOUT the Admin API and are harmless if rows
  -- are already gone.
  DELETE FROM public.user_login_events WHERE user_id = _id;
  DELETE FROM public.user_roles        WHERE user_id = _id;
  DELETE FROM public.user_bans         WHERE user_id = _id;
  IF to_regclass('public.admin_notes')   IS NOT NULL THEN DELETE FROM public.admin_notes   WHERE user_id    = _id; END IF;
  IF to_regclass('public.user_tags')     IS NOT NULL THEN DELETE FROM public.user_tags     WHERE user_id    = _id; END IF;
  IF to_regclass('public.user_messages') IS NOT NULL THEN DELETE FROM public.user_messages WHERE to_user_id = _id; END IF;

  DELETE FROM public.profiles WHERE id = _id;

  -- Auth row: idempotent. If the server function already called
  -- supabaseAdmin.auth.admin.deleteUser() this is a no-op.
  BEGIN
    DELETE FROM auth.users WHERE id = _id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'admin_hard_delete_user: auth.users delete skipped (%).', SQLERRM;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _id = _caller THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;
  IF public.has_role(_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Cannot remove an admin. Demote first.';
  END IF;
  UPDATE public.profiles
     SET deleted_at = now(),
         status     = 'suspended'
   WHERE id = _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) TO authenticated, service_role;
