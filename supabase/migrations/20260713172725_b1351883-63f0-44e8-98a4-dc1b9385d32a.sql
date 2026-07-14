-- Study Routine module visibility settings (singleton table, realtime-published)
CREATE TABLE IF NOT EXISTS public.study_routine_settings (
  id boolean PRIMARY KEY DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT study_routine_settings_singleton CHECK (id = true)
);

GRANT SELECT ON public.study_routine_settings TO anon, authenticated;
GRANT ALL ON public.study_routine_settings TO service_role;

ALTER TABLE public.study_routine_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_routine_settings_public_read ON public.study_routine_settings;
CREATE POLICY study_routine_settings_public_read
  ON public.study_routine_settings FOR SELECT
  USING (true);

-- Writes only via service role / server function (no direct auth-role writes).
DROP POLICY IF EXISTS study_routine_settings_no_direct_write ON public.study_routine_settings;
CREATE POLICY study_routine_settings_no_direct_write
  ON public.study_routine_settings FOR ALL
  USING (false) WITH CHECK (false);

INSERT INTO public.study_routine_settings (id, enabled)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

-- Realtime publication (idempotent add)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
ALTER TABLE public.study_routine_settings REPLICA IDENTITY FULL;

-- Also make sure the study_routine tables are realtime-published so admin monitoring updates live.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routines;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_tasks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
ALTER TABLE public.study_routines REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_tasks REPLICA IDENTITY FULL;