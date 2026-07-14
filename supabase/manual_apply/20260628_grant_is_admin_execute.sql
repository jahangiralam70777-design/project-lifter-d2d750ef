-- ROOT-CAUSE FIX for "permission denied for function is_admin"
--
-- Apply this manually in the Supabase SQL editor.
--
-- Why this happened:
--   Migration 20260613184154 revoked EXECUTE on internal.is_admin(uuid) from
--   the `authenticated` role. RLS policies on public.site_settings (used by
--   the Help Center widget, WhatsApp popup, Notice Banner, etc.) still call
--   internal.is_admin(auth.uid()) on INSERT/UPDATE. PostgreSQL evaluates the
--   policy expression as the calling role. Even though is_admin is
--   SECURITY DEFINER, the caller must still hold EXECUTE — otherwise the
--   write fails with: permission denied for function is_admin.
--
-- The function is SECURITY DEFINER and only returns a boolean, so granting
-- EXECUTE back to `authenticated` is safe and matches the pre-regression
-- state set in migration 20260613184042.
--
-- Idempotent: GRANT is a no-op when already in place.

GRANT USAGE ON SCHEMA internal TO authenticated;
GRANT EXECUTE ON FUNCTION internal.is_admin(uuid) TO authenticated;
