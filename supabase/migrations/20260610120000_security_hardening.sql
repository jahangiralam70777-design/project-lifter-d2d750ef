-- ===================================================================
-- SECURITY-AUDIT HARDENING MIGRATION
-- ===================================================================
-- This project uses an externally-managed Supabase project (not Lovable
-- Cloud), so this SQL is NOT auto-applied. Run it manually in the
-- Supabase SQL editor for project `rspkzydnpxyrucdvgbte`.
--
-- Findings consolidated from parallel auth / RLS / data-leak audits.
-- Each block is idempotent and safe to re-run.
-- ===================================================================

-- C-1 / H-4: Revoke privileged role-lookup RPCs from anon.
-- has_role / has_permission are SECURITY DEFINER, so granting EXECUTE to
-- anon made them enumeration oracles for unauthenticated callers.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- C-2 / H-2: admin_action_log audit-log integrity.
-- Direct INSERT by authenticated allowed any user to forge "allowed: true"
-- entries. Route all writes through a SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION public.record_admin_action(
  _permission text,
  _action     text,
  _allowed    boolean,
  _metadata   jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_admin_action requires an authenticated caller';
  END IF;
  INSERT INTO public.admin_action_log (user_id, permission, action, allowed, metadata)
  VALUES (auth.uid(), _permission, _action, _allowed, _metadata);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_action_log'
      AND policyname = 'Users insert own admin_action_log'
  ) THEN
    EXECUTE 'DROP POLICY "Users insert own admin_action_log" ON public.admin_action_log';
  END IF;
END $$;

REVOKE INSERT ON public.admin_action_log FROM authenticated, anon;
GRANT  INSERT ON public.admin_action_log TO service_role;

-- H-3: activity_events — NULL user_id bypass.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_events'
      AND policyname = 'activity_events_insert_own'
  ) THEN
    EXECUTE 'DROP POLICY activity_events_insert_own ON public.activity_events';
  END IF;
END $$;

CREATE POLICY activity_events_insert_authenticated
  ON public.activity_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- M-5: role_permissions must NOT be in the realtime publication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'role_permissions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.role_permissions';
  END IF;
END $$;

-- L-1: module_visibility — admins had UPDATE but no INSERT/DELETE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'module_visibility'
      AND policyname = 'admins insert module visibility'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "admins insert module visibility"
        ON public.module_visibility
        FOR INSERT TO authenticated
        WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))
    $p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'module_visibility'
      AND policyname = 'admins delete module visibility'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "admins delete module visibility"
        ON public.module_visibility
        FOR DELETE TO authenticated
        USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    $p$;
  END IF;
END $$;
