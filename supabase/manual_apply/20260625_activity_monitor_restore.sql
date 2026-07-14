-- Restore the Full-Site Activity Monitor on the external Supabase project.
-- Run this once in the Supabase SQL editor.
--
-- 1) Re-enable Supabase Realtime for activity_events (was dropped in
--    migration 20260611152022). Without this, the live feed stays at 0.
-- 2) Re-assert the RLS INSERT policy used by the browser tracker.
-- 3) Re-grant EXECUTE on the analytics RPCs the dashboard calls.
-- 4) Sanity-check the table is reachable.

-- 1) Realtime publication
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
ALTER TABLE public.activity_events REPLICA IDENTITY FULL;

-- 2) RLS: authenticated users insert their own events
DROP POLICY IF EXISTS activity_events_insert_own            ON public.activity_events;
DROP POLICY IF EXISTS activity_events_insert_authenticated  ON public.activity_events;
CREATE POLICY activity_events_insert_authenticated
  ON public.activity_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL            ON public.activity_events TO service_role;

-- 3) RPC grants the dashboard relies on.
--    Some external DBs are missing one or more of these RPCs; grant only
--    those that actually exist so the script never aborts.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_activity_overview',
        'admin_top_buttons',
        'admin_top_pages',
        'admin_top_modules',
        'admin_activity_timeseries',
        'admin_user_activity'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',  fn.sig);
  END LOOP;
END $$;

-- 4) Quick smoke check — should return rows once users start clicking
-- SELECT count(*) FROM public.activity_events WHERE created_at > now() - interval '1 hour';