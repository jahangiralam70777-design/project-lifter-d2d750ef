-- =============================================================================
-- Study Routine module — FINAL CONSOLIDATED MIGRATION.
--
-- This is the single source of truth for the entire Study Routine module.
-- It supersedes every prior Study Routine migration:
--   * supabase/migrations/20260713171522_...sql   (initial routines + tasks)
--   * supabase/migrations/20260713172725_...sql   (settings singleton)
--   * supabase/manual_apply/20260714_study_routine_scheduling.sql
--   * supabase/manual_apply/20260714_study_routine_onconflict_fix.sql
--   * supabase/manual_apply/20260723_study_routine_admin_pagination.sql
--   * supabase/manual_apply/20260715_user_goals_study_minutes.sql
--
-- Guarantees:
--   * Safe on a FRESH empty database   → creates everything from scratch.
--   * Safe on a LIVE upgrade           → NO DROP TABLE / NO TRUNCATE.
--   * Fully IDEMPOTENT                 → running multiple times must not fail.
--   * ON CONFLICT (user_id, routine_id, task_date, title) works reliably.
--
-- External deps (bootstrapped with fallbacks if the host DB lacks them):
--   auth.users(id)            — Supabase provided
--   auth.uid()                — Supabase provided
--   public.profiles           — stub created if missing
--   public.app_role           — stub enum created if missing
--   public.has_role()         — stub (returns false) created if missing
-- =============================================================================


-- ---------------------------------------------------------------------
-- 0. Bootstrap fallbacks (created only when the host DB lacks them)
-- ---------------------------------------------------------------------
DO $bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('user','admin','super_admin');
  END IF;

  IF to_regclass('public.profiles') IS NULL THEN
    CREATE TABLE public.profiles (
      id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email         text,
      full_name     text,
      display_name  text,
      created_at    timestamptz NOT NULL DEFAULT now()
    );
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
    GRANT ALL ON public.profiles TO service_role;
  END IF;
END
$bootstrap$;

DO $has_role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_role'
      AND pg_get_function_identity_arguments(p.oid)
          IN ('_user_id uuid, _role app_role',
              '_user_id uuid, _role public.app_role')
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $body$ SELECT false $body$
    $fn$;
  END IF;
END
$has_role$;


-- ---------------------------------------------------------------------
-- 1. Enums (created only if missing; never dropped)
-- ---------------------------------------------------------------------
DO $enums$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_routine_type') THEN
    CREATE TYPE public.study_routine_type  AS ENUM ('daily','weekly','monthly','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_task_type') THEN
    CREATE TYPE public.study_task_type     AS ENUM ('study','mcq','quiz','mock','revision','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_task_priority') THEN
    CREATE TYPE public.study_task_priority AS ENUM ('low','medium','high');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'study_task_status') THEN
    CREATE TYPE public.study_task_status   AS ENUM ('pending','in_progress','completed');
  END IF;
END
$enums$;


-- ---------------------------------------------------------------------
-- 2. Tables (data-preserving; existing rows are kept)
-- ---------------------------------------------------------------------
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
  routine_id    uuid REFERENCES public.study_routines(id) ON DELETE CASCADE,
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
  status        public.study_task_status   NOT NULL DEFAULT 'pending',
  completion    integer NOT NULL DEFAULT 0 CHECK (completion BETWEEN 0 AND 100),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The CHECK (end_time > start_time) constraint from earlier drafts is
-- intentionally NOT enforced here: legacy rows may have equal times, and
-- the app already validates on the client. Adding it on an existing DB
-- would break the migration on those rows.

CREATE TABLE IF NOT EXISTS public.study_routine_settings (
  id         boolean PRIMARY KEY DEFAULT true,
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT study_routine_settings_singleton CHECK (id = true)
);

-- user_goals — Study Routine reuses this table to store weekly/monthly
-- study-time targets. Merged from 20260715_user_goals_study_minutes.sql.
CREATE TABLE IF NOT EXISTS public.user_goals (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_mcqs   int,
  weekly_mcqs  int,
  monthly_mcqs int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- 3. Column upgrades (scheduling fields + user_goals extras)
--    ADD COLUMN IF NOT EXISTS is fully data-preserving.
-- ---------------------------------------------------------------------
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

ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS weekly_study_minutes  int,
  ADD COLUMN IF NOT EXISTS monthly_study_minutes int;

-- Defensive backfills for legacy rows.
UPDATE public.study_routines
   SET schedule_mode = COALESCE(schedule_mode, type::text)
 WHERE schedule_mode IS NULL;

UPDATE public.study_routines
   SET anchor_date = COALESCE(anchor_date, CURRENT_DATE),
       start_date  = COALESCE(start_date,  CURRENT_DATE)
 WHERE anchor_date IS NULL OR start_date IS NULL;


-- ---------------------------------------------------------------------
-- 4. ON CONFLICT root-cause fix
--
-- Prior migrations shipped a PARTIAL unique index
-- `WHERE routine_id IS NOT NULL`. Postgres cannot infer a partial unique
-- index as the arbiter of an `ON CONFLICT (cols)` clause unless the INSERT
-- also carries the same predicate — and supabase-js / PostgREST upserts
-- have no way to express one. The upsert therefore always failed with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification".
--
-- Fix: drop the partial index, deduplicate any pre-existing rows that
-- would violate the new key, and create a FULL (non-partial) unique index
-- so `ON CONFLICT (user_id, routine_id, task_date, title)` inference
-- succeeds on every insert path.
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.study_routine_tasks_occurrence_uniq;

-- Keep the earliest ctid per (user_id, routine_id, task_date, title).
-- IS NOT DISTINCT FROM makes NULL routine_id rows collapse too.
DELETE FROM public.study_routine_tasks a
USING public.study_routine_tasks b
WHERE a.ctid > b.ctid
  AND a.user_id   = b.user_id
  AND a.task_date = b.task_date
  AND a.title     = b.title
  AND a.routine_id IS NOT DISTINCT FROM b.routine_id;

CREATE UNIQUE INDEX IF NOT EXISTS study_routine_tasks_occurrence_uniq
  ON public.study_routine_tasks (user_id, routine_id, task_date, title);


-- ---------------------------------------------------------------------
-- 5. Supporting indexes (all idempotent)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS study_routines_user_idx
  ON public.study_routines(user_id);
CREATE INDEX IF NOT EXISTS study_routines_user_active_idx
  ON public.study_routines(user_id, is_archived, is_active);
CREATE INDEX IF NOT EXISTS study_routines_updated_at_idx
  ON public.study_routines(updated_at DESC);
CREATE INDEX IF NOT EXISTS study_routines_user_type_idx
  ON public.study_routines(user_id, type);
CREATE INDEX IF NOT EXISTS study_routines_filters_idx
  ON public.study_routines(level_code, subject_id, chapter_id)
  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS study_routines_user_created_idx
  ON public.study_routines(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS study_routine_tasks_user_idx
  ON public.study_routine_tasks(user_id);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_date_idx
  ON public.study_routine_tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS study_routine_tasks_routine_idx
  ON public.study_routine_tasks(routine_id);
CREATE INDEX IF NOT EXISTS study_routine_tasks_routine_date_idx
  ON public.study_routine_tasks(routine_id, task_date);
CREATE INDEX IF NOT EXISTS study_routine_tasks_status_idx
  ON public.study_routine_tasks(status);
CREATE INDEX IF NOT EXISTS study_routine_tasks_updated_at_idx
  ON public.study_routine_tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_status_idx
  ON public.study_routine_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_updated_idx
  ON public.study_routine_tasks(user_id, updated_at DESC);


-- ---------------------------------------------------------------------
-- 6. Trigger function + updated_at triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.study_routine_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_study_routines_updated_at         ON public.study_routines;
CREATE TRIGGER trg_study_routines_updated_at
  BEFORE UPDATE ON public.study_routines
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();

DROP TRIGGER IF EXISTS trg_study_routine_tasks_updated_at    ON public.study_routine_tasks;
CREATE TRIGGER trg_study_routine_tasks_updated_at
  BEFORE UPDATE ON public.study_routine_tasks
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();

DROP TRIGGER IF EXISTS trg_study_routine_settings_updated_at ON public.study_routine_settings;
CREATE TRIGGER trg_study_routine_settings_updated_at
  BEFORE UPDATE ON public.study_routine_settings
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();

DROP TRIGGER IF EXISTS trg_user_goals_updated_at             ON public.user_goals;
CREATE TRIGGER trg_user_goals_updated_at
  BEFORE UPDATE ON public.user_goals
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();


-- ---------------------------------------------------------------------
-- 7. Grants (required for PostgREST / Data API access)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routines         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routine_tasks    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goals             TO authenticated;
GRANT SELECT                          ON public.study_routine_settings TO anon, authenticated;
GRANT ALL ON public.study_routines         TO service_role;
GRANT ALL ON public.study_routine_tasks    TO service_role;
GRANT ALL ON public.study_routine_settings TO service_role;
GRANT ALL ON public.user_goals             TO service_role;


-- ---------------------------------------------------------------------
-- 8. RLS + policies (idempotent via DROP IF EXISTS + CREATE)
-- ---------------------------------------------------------------------
ALTER TABLE public.study_routines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_routine_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_routine_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_routines_owner_all       ON public.study_routines;
CREATE POLICY study_routines_owner_all
  ON public.study_routines FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS study_routine_tasks_owner_all  ON public.study_routine_tasks;
CREATE POLICY study_routine_tasks_owner_all
  ON public.study_routine_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS study_routines_admin_read      ON public.study_routines;
CREATE POLICY study_routines_admin_read
  ON public.study_routines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS study_routine_tasks_admin_read ON public.study_routine_tasks;
CREATE POLICY study_routine_tasks_admin_read
  ON public.study_routine_tasks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS study_routine_settings_public_read     ON public.study_routine_settings;
CREATE POLICY study_routine_settings_public_read
  ON public.study_routine_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS study_routine_settings_no_direct_write ON public.study_routine_settings;
CREATE POLICY study_routine_settings_no_direct_write
  ON public.study_routine_settings FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS user_goals_owner_all ON public.user_goals;
CREATE POLICY user_goals_owner_all
  ON public.user_goals FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 9. Admin monitoring RPC — server-side pagination + aggregates
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_routine_students(
  p_search        text DEFAULT '',
  p_level_code    text DEFAULT '',
  p_subject_id    uuid DEFAULT NULL,
  p_chapter_id    uuid DEFAULT NULL,
  p_routine_type  public.study_routine_type DEFAULT NULL,
  p_status        text DEFAULT 'all',
  p_sort_by       text DEFAULT 'last_active',
  p_sort_dir      text DEFAULT 'desc',
  p_page          int  DEFAULT 1,
  p_page_size     int  DEFAULT 20
) RETURNS TABLE (
  user_id        uuid,
  routine_count  bigint,
  total_tasks    bigint,
  completed      bigint,
  pending        bigint,
  study_minutes  bigint,
  last_active    timestamptz,
  created_at     timestamptz,
  level_code     text,
  subject_id     uuid,
  chapter_id     uuid,
  routine_type   public.study_routine_type,
  completion     int,
  email          text,
  name           text,
  total_count    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false)
      OR COALESCE(public.has_role(auth.uid(), 'super_admin'::app_role), false)
    INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered_routines AS (
    SELECT r.user_id, r.level_code, r.subject_id, r.chapter_id,
           r.type, r.created_at
      FROM public.study_routines r
     WHERE r.is_archived = false
       AND (COALESCE(p_level_code, '') = '' OR r.level_code = p_level_code)
       AND (p_subject_id   IS NULL OR r.subject_id   = p_subject_id)
       AND (p_chapter_id   IS NULL OR r.chapter_id   = p_chapter_id)
       AND (p_routine_type IS NULL OR r.type         = p_routine_type)
  ),
  primary_routine AS (
    SELECT DISTINCT ON (fr.user_id)
           fr.user_id, fr.level_code, fr.subject_id, fr.chapter_id,
           fr.type AS routine_type
      FROM filtered_routines fr
     ORDER BY fr.user_id, fr.created_at DESC
  ),
  routine_agg AS (
    SELECT fr.user_id,
           COUNT(*)::bigint                AS routine_count,
           MIN(fr.created_at)::timestamptz AS created_at
      FROM filtered_routines fr
     GROUP BY fr.user_id
  ),
  task_agg AS (
    SELECT t.user_id,
           COUNT(*)::bigint                                                       AS total_tasks,
           COUNT(*) FILTER (WHERE t.status = 'completed')::bigint                 AS completed,
           COUNT(*) FILTER (WHERE t.status <> 'completed')::bigint                AS pending,
           COALESCE(SUM(
             CASE WHEN t.status = 'completed'
                  THEN GREATEST(0, (EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60)::int)
                  ELSE 0 END
           ), 0)::bigint                                                          AS study_minutes,
           MAX(COALESCE(t.updated_at, t.created_at))::timestamptz                 AS last_active
      FROM public.study_routine_tasks t
     WHERE t.user_id IN (SELECT user_id FROM routine_agg)
     GROUP BY t.user_id
  ),
  merged AS (
    SELECT ra.user_id,
           ra.routine_count,
           COALESCE(ta.total_tasks,   0) AS total_tasks,
           COALESCE(ta.completed,     0) AS completed,
           COALESCE(ta.pending,       0) AS pending,
           COALESCE(ta.study_minutes, 0) AS study_minutes,
           ta.last_active,
           ra.created_at,
           pr.level_code,
           pr.subject_id,
           pr.chapter_id,
           pr.routine_type,
           CASE WHEN COALESCE(ta.total_tasks, 0) > 0
                THEN ROUND(ta.completed::numeric * 100 / ta.total_tasks)::int
                ELSE 0 END AS completion,
           NULLIF(p.email, '')::text AS email,
           NULLIF(COALESCE(p.display_name, p.full_name), '')::text AS name
      FROM routine_agg ra
      LEFT JOIN task_agg        ta ON ta.user_id = ra.user_id
      LEFT JOIN primary_routine pr ON pr.user_id = ra.user_id
      LEFT JOIN public.profiles p  ON p.id       = ra.user_id
  ),
  searched AS (
    SELECT m.*
      FROM merged m
     WHERE (
             COALESCE(p_search, '') = '' OR
             COALESCE(m.name,  '') ILIKE '%' || p_search || '%' OR
             COALESCE(m.email, '') ILIKE '%' || p_search || '%'
           )
       AND (
             p_status = 'all' OR
             (p_status = 'active'   AND m.completed >  0) OR
             (p_status = 'inactive' AND m.completed =  0)
           )
  ),
  counted AS (
    SELECT s.*, (COUNT(*) OVER ())::bigint AS total_count FROM searched s
  )
  SELECT c.user_id, c.routine_count, c.total_tasks, c.completed, c.pending,
         c.study_minutes, c.last_active, c.created_at,
         c.level_code, c.subject_id, c.chapter_id, c.routine_type,
         c.completion, c.email, c.name, c.total_count
    FROM counted c
   ORDER BY
     CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'desc' THEN c.last_active END DESC NULLS LAST,
     CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'asc'  THEN c.last_active END ASC  NULLS LAST,
     CASE WHEN p_sort_by = 'completion'  AND p_sort_dir = 'desc' THEN c.completion  END DESC,
     CASE WHEN p_sort_by = 'completion'  AND p_sort_dir = 'asc'  THEN c.completion  END ASC,
     CASE WHEN p_sort_by = 'tasks'       AND p_sort_dir = 'desc' THEN c.total_tasks END DESC,
     CASE WHEN p_sort_by = 'tasks'       AND p_sort_dir = 'asc'  THEN c.total_tasks END ASC,
     CASE WHEN p_sort_by = 'created'     AND p_sort_dir = 'desc' THEN c.created_at  END DESC,
     CASE WHEN p_sort_by = 'created'     AND p_sort_dir = 'asc'  THEN c.created_at  END ASC,
     c.user_id ASC
   LIMIT GREATEST(1, LEAST(p_page_size, 200))
   OFFSET GREATEST(0, (p_page - 1) * p_page_size);
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_routine_students(
  text, text, uuid, uuid, public.study_routine_type, text, text, text, int, int
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_routine_students(
  text, text, uuid, uuid, public.study_routine_type, text, text, text, int, int
) TO authenticated;


-- ---------------------------------------------------------------------
-- 10. Realtime publication + replica identity
-- ---------------------------------------------------------------------
DO $rt$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routines;         EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_tasks;    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_goals;             EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END
$rt$;

ALTER TABLE public.study_routines         REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_tasks    REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_settings REPLICA IDENTITY FULL;
ALTER TABLE public.user_goals             REPLICA IDENTITY FULL;

-- Ask PostgREST to reload its schema cache so new tables/columns become
-- visible immediately (no-op when no listener is attached).
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- END — Study Routine module final consolidated migration.
-- =============================================================================
