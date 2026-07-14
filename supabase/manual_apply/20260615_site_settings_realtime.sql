-- Apply manually in Supabase SQL editor. Ensures site_settings broadcasts
-- realtime changes so student sessions react to admin Notice Banner /
-- WhatsApp / LiveChat / other site-setting edits instantly without refresh.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'site_settings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings';
  END IF;
  EXECUTE 'ALTER TABLE public.site_settings REPLICA IDENTITY FULL';
END $$;
