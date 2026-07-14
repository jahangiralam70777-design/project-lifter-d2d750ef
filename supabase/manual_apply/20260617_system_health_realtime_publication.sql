-- Apply manually in the database SQL editor if System Health shows
-- "Polling" instead of "Live". This enables live change events for the
-- real system_error_logs table used by /admin/system-health.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND to_regclass('public.system_error_logs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'system_error_logs'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.system_error_logs';
  END IF;
END $$;

ALTER TABLE public.system_error_logs REPLICA IDENTITY FULL;