-- ============================================================
-- DB-H1: Reconcile realtime publication with client subscriptions
--
-- Client code subscribes to postgres_changes on:
--   user_sessions       (AccountStatusGuard, SingleSession)
--   user_login_events   (admin live-tracking, user analytics)
--   activity_events     (admin live-tracking, structure editor)
--
-- These were dropped in 20260611152022 / 20260610120000. Re-add them
-- to the publication. RLS still gates row visibility per subscriber:
--   - user_sessions    : per-user policies (auth.uid())
--   - user_login_events: user reads own; admins read all
--   - activity_events  : user reads own; admins read all
--
-- role_permissions is intentionally NOT re-added (global table; any
-- authenticated user could observe role changes via realtime). The
-- corresponding client subscriptions are replaced with polling.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_sessions'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_login_events'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_login_events';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_events'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events';
    END IF;
  END IF;
END $$;

-- ============================================================
-- DB-M1: Revoke stale anon SELECT on public.profiles.
--
-- RLS on profiles already blocks anonymous reads, but the table-level
-- GRANT to anon remained from older migrations and violates
-- defense-in-depth. Authenticated access is unaffected (its grant is
-- separate). Service role retains full access.
-- ============================================================
REVOKE SELECT ON public.profiles FROM anon;
