
-- ============================================================
-- Study Routine module — independent schema.
-- Uses existing Academic Manager tables (levels/subjects/chapters)
-- by reference only (text/uuid, no FK) so the module stays isolated.
-- ============================================================

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_routine_type') THEN
    CREATE TYPE public.study_routine_type AS ENUM ('daily','weekly','monthly','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_task_type') THEN
    CREATE TYPE public.study_task_type AS ENUM ('study','mcq','quiz','mock','revision','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_task_priority') THEN
    CREATE TYPE public.study_task_priority AS ENUM ('low','medium','high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_task_status') THEN
    CREATE TYPE public.study_task_status AS ENUM ('pending','in_progress','completed');
  END IF;
END $$;

-- Routines
CREATE TABLE IF NOT EXISTS public.study_routines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'My Routine',
  type         public.study_routine_type NOT NULL DEFAULT 'daily',
  level_code   text,
  subject_id   uuid,
  chapter_id   uuid,
  is_active    boolean NOT NULL DEFAULT true,
  is_archived  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_routines_user_idx ON public.study_routines(user_id);
CREATE INDEX IF NOT EXISTS study_routines_user_active_idx ON public.study_routines(user_id, is_archived, is_active);

-- Tasks
CREATE TABLE IF NOT EXISTS public.study_routine_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_id    uuid REFERENCES public.study_routines(id) ON DELETE SET NULL,
  level_code    text,
  subject_id    uuid,
  chapter_id    uuid,
  title         text NOT NULL,
  description   text,
  task_type     public.study_task_type NOT NULL DEFAULT 'study',
  task_date     date NOT NULL DEFAULT CURRENT_DATE,
  start_time    time NOT NULL DEFAULT '09:00',
  end_time      time NOT NULL DEFAULT '10:00',
  priority      public.study_task_priority NOT NULL DEFAULT 'medium',
  status        public.study_task_status NOT NULL DEFAULT 'pending',
  completion    integer NOT NULL DEFAULT 0 CHECK (completion BETWEEN 0 AND 100),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_idx ON public.study_routine_tasks(user_id);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_date_idx ON public.study_routine_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS study_routine_tasks_routine_idx ON public.study_routine_tasks(routine_id);

-- updated_at trigger (shared function; create if missing)
CREATE OR REPLACE FUNCTION public.study_routine_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_study_routines_updated_at ON public.study_routines;
CREATE TRIGGER trg_study_routines_updated_at
BEFORE UPDATE ON public.study_routines
FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();

DROP TRIGGER IF EXISTS trg_study_routine_tasks_updated_at ON public.study_routine_tasks;
CREATE TRIGGER trg_study_routine_tasks_updated_at
BEFORE UPDATE ON public.study_routine_tasks
FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routine_tasks TO authenticated;
GRANT ALL ON public.study_routines TO service_role;
GRANT ALL ON public.study_routine_tasks TO service_role;

-- RLS
ALTER TABLE public.study_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_routine_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_routines_owner_all ON public.study_routines;
CREATE POLICY study_routines_owner_all ON public.study_routines
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS study_routine_tasks_owner_all ON public.study_routine_tasks;
CREATE POLICY study_routine_tasks_owner_all ON public.study_routine_tasks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routines;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_tasks;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.study_routines REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_tasks REPLICA IDENTITY FULL;
