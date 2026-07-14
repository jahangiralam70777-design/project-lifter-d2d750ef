-- =====================================================================
-- Security hardening — audit fixes A-1, A-4, A-5
-- =====================================================================

-- A-1: Lock down get_auth_access_controls EXECUTE.
-- The RPC is invoked from a public server fn using the anon client, so anon
-- still needs EXECUTE, but PUBLIC must be revoked to prevent unintended grants.
REVOKE ALL ON FUNCTION public.get_auth_access_controls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_access_controls() TO anon, authenticated, service_role;

-- A-4: Stop anonymous clients from writing arbitrary rows into
-- system_error_logs. Authenticated inserts (scoped to auth.uid()) and the
-- SECURITY DEFINER admin_log_system_error() helper remain available.
REVOKE INSERT ON public.system_error_logs FROM anon;
DROP POLICY IF EXISTS "Anon insert anonymous errors" ON public.system_error_logs;

-- A-5: Prevent blog_views inflation by a single viewer. Bucket views per hour
-- per (post, viewer hash) so a refresh loop cannot pump the counter. The
-- viewer_hash column is populated from the server-side insert path
-- (hash(IP + user-agent)); existing rows are left alone with NULL hash and
-- excluded from the uniqueness check via partial index.
ALTER TABLE public.blog_views
  ADD COLUMN IF NOT EXISTS viewer_hash text,
  ADD COLUMN IF NOT EXISTS time_bucket timestamptz
    GENERATED ALWAYS AS (date_trunc('hour', created_at)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_views_post_viewer_bucket
  ON public.blog_views (post_id, viewer_hash, time_bucket)
  WHERE viewer_hash IS NOT NULL;

-- Tighten the permissive WITH CHECK so anon inserts must carry a viewer_hash
-- and may not impersonate another user. Authenticated inserts may set their
-- own viewer_id (or leave it null).
DROP POLICY IF EXISTS blog_views_anyone_insert ON public.blog_views;
CREATE POLICY blog_views_anon_insert ON public.blog_views
  FOR INSERT TO anon
  WITH CHECK (viewer_id IS NULL AND viewer_hash IS NOT NULL);
CREATE POLICY blog_views_auth_insert ON public.blog_views
  FOR INSERT TO authenticated
  WITH CHECK ((viewer_id IS NULL OR viewer_id = auth.uid()) AND viewer_hash IS NOT NULL);
