-- ============================================================
-- Study Routine — consolidated fix migration
--
-- Root cause of the "no unique or exclusion constraint matching the ON
-- CONFLICT specification" error:
--   The previous scheduling migration created a PARTIAL unique index on
--   (user_id, routine_id, task_date, title) with a WHERE routine_id IS NOT
--   NULL predicate. Postgres CANNOT infer a partial unique index as the
--   arbiter for an ON CONFLICT clause unless the INSERT statement also
--   specifies the same predicate — and supabase-js/PostgREST upserts have
--   no way to express such a predicate. The upsert therefore always fails
--   even though the columns match the index.
--
-- This migration:
--   1. drops the offending partial index
--   2. deduplicates any pre-existing rows that would violate the new key
--   3. creates a full (non-partial) UNIQUE INDEX so ON CONFLICT inference
--      succeeds every time
--   4. re-asserts every RLS policy, grant, FK, trigger, and realtime
--      publication for the module so the whole surface is coherent
--
-- Fully idempotent. Safe to re-run.
-- ============================================================

BEGIN;

-- ---- 1. Ensure enum types exist (older DBs might miss them) --------------
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

-- ---- 2. Ensure both tables exist -----------------------------------------
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

-- ---- 3. Ensure scheduling / task-default columns exist -------------------
ALTER TABLE public.study_routines
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS task_title         text,
  ADD COLUMN IF NOT EXISTS task_type          text,
  ADD COLUMN IF NOT EXISTS study_target       text,
  ADD COLUMN IF NOT EXISTS estimated_minutes  int,
  ADD COLUMN IF NOT EXISTS priority           text,
  ADD COLUMN IF NOT EXISTS reminder_minutes   int,
  ADD COLUMN IF NOT EXISTS default_status     text,
  ADD COLUMN IF NOT EXISTS due_date           date,
  ADD COLUMN IF NOT EXISTS schedule_mode      text,
  ADD COLUMN IF NOT EXISTS interval_weeks     int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS interval_months    int  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS weekdays           smallint[],
  ADD COLUMN IF NOT EXISTS start_date         date,
  ADD COLUMN IF NOT EXISTS end_date           date,
  ADD COLUMN IF NOT EXISTS anchor_date        date,
  ADD COLUMN IF NOT EXISTS start_time         time,
  ADD COLUMN IF NOT EXISTS end_time           time;

-- ---- 4. Drop the broken partial unique index (root cause) ----------------
DROP INDEX IF EXISTS public.study_routine_tasks_occurrence_uniq;

-- ---- 5. Deduplicate any rows that would violate the new key --------------
--   Keeps the earliest row per (user_id, routine_id, task_date, title).
--   IS NOT DISTINCT FROM matches NULL = NULL so ad-hoc tasks with NULL
--   routine_id are also collapsed when they collide exactly.
DELETE FROM public.study_routine_tasks a
USING public.study_routine_tasks b
WHERE a.ctid > b.ctid
  AND a.user_id   = b.user_id
  AND a.task_date = b.task_date
  AND a.title     = b.title
  AND a.routine_id IS NOT DISTINCT FROM b.routine_id;

-- ---- 6. Create a FULL unique index — ON CONFLICT inference now works -----
CREATE UNIQUE INDEX IF NOT EXISTS study_routine_tasks_occurrence_uniq
  ON public.study_routine_tasks (user_id, routine_id, task_date, title);

-- Supporting indexes (idempotent)
CREATE INDEX IF NOT EXISTS study_routines_user_idx
  ON public.study_routines(user_id);
CREATE INDEX IF NOT EXISTS study_routines_user_active_idx
  ON public.study_routines(user_id, is_archived, is_active);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_idx
  ON public.study_routine_tasks(user_id);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_date_idx
  ON public.study_routine_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS study_routine_tasks_routine_idx
  ON public.study_routine_tasks(routine_id);
CREATE INDEX IF NOT EXISTS study_routine_tasks_routine_date_idx
  ON public.study_routine_tasks(routine_id, task_date);

-- ---- 7. updated_at trigger -----------------------------------------------
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

-- ---- 8. Grants -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routines      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routine_tasks TO authenticated;
GRANT ALL ON public.study_routines      TO service_role;
GRANT ALL ON public.study_routine_tasks TO service_role;

-- ---- 9. RLS --------------------------------------------------------------
ALTER TABLE public.study_routines      ENABLE ROW LEVEL SECURITY;
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

-- ---- 10. Realtime publication (idempotent) -------------------------------
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
ALTER TABLE public.study_routines      REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_tasks REPLICA IDENTITY FULL;

COMMIT;
