-- Apply manually in Supabase SQL editor. Ensures all feature-visibility
-- tables broadcast realtime changes so student sessions react to admin
-- hide/unhide actions instantly, without a page refresh.
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'module_visibility',
    'flash_card_visibility',
    'short_notes_visibility',
    'question_bank_visibility',
    'video_class_visibility'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
