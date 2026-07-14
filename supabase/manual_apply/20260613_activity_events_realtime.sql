-- Re-enable Supabase Realtime for activity_events.
-- Migration 20260611152022 dropped this table from supabase_realtime which
-- broke the LiveTrackingPanel realtime stream (admin sat at zero updates).
-- Re-adding is safe: activity_events SELECT is admin-only via RLS, and
-- realtime respects RLS, so non-admins still cannot see other users' rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'activity_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events';
  END IF;
END $$;

-- Required for realtime payloads to include full row data on INSERT.
ALTER TABLE public.activity_events REPLICA IDENTITY FULL;
