-- =====================================================================
-- Exam Batch — fully independent Academic + MCQ layer.
--
-- Creates:
--   * public.exam_batch_levels
--   * public.exam_batch_subjects
--   * public.exam_batch_chapters
--   * public.exam_batch_mcqs
--
-- Seeds the four new tables by SNAPSHOTTING the current public.levels /
-- subjects / chapters / mcqs rows preserving their primary keys so every
-- existing FK value inside the exam_batch_* tables continues to point at a
-- valid row after the swap.
--
-- Then re-points every FK on the existing exam_batch_* tables away from the
-- public.* academic tables and onto the new exam_batch_* academic tables.
-- No exam_batch row is edited, deleted or truncated.
--
-- Nothing outside the exam_batch namespace is touched. The original
-- public.levels/subjects/chapters/mcqs tables are left completely untouched
-- — the site's Academic Manager, MCQ Manager, Quiz, and Mock Test continue
-- to operate against them as before.
--
-- All statements are idempotent (IF NOT EXISTS / DO blocks / ON CONFLICT
-- DO NOTHING / CREATE OR REPLACE) — safe to re-run.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Isolated Academic tables
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_levels (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  color       text,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft','published','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT                         ON public.exam_batch_levels TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_levels TO authenticated;
GRANT ALL                            ON public.exam_batch_levels TO service_role;
ALTER TABLE public.exam_batch_levels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.exam_batch_subjects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL,
  level       text NOT NULL DEFAULT 'professional'
                REFERENCES public.exam_batch_levels(code) ON UPDATE CASCADE,
  description text,
  color       text,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft','published','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_batch_subjects_slug_uk UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS exam_batch_subjects_level_idx  ON public.exam_batch_subjects(level);
CREATE INDEX IF NOT EXISTS exam_batch_subjects_status_idx ON public.exam_batch_subjects(status);
GRANT SELECT                         ON public.exam_batch_subjects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_subjects TO authenticated;
GRANT ALL                            ON public.exam_batch_subjects TO service_role;
ALTER TABLE public.exam_batch_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.exam_batch_chapters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  uuid NOT NULL REFERENCES public.exam_batch_subjects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'published'
                CHECK (status IN ('draft','published','archived')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_batch_chapters_subject_slug_uk UNIQUE (subject_id, slug)
);
CREATE INDEX IF NOT EXISTS exam_batch_chapters_subject_idx ON public.exam_batch_chapters(subject_id);
CREATE INDEX IF NOT EXISTS exam_batch_chapters_status_idx  ON public.exam_batch_chapters(status);
GRANT SELECT                         ON public.exam_batch_chapters TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_chapters TO authenticated;
GRANT ALL                            ON public.exam_batch_chapters TO service_role;
ALTER TABLE public.exam_batch_chapters ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. Isolated MCQ bank
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_mcqs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id     uuid REFERENCES public.exam_batch_chapters(id) ON DELETE SET NULL,
  subject_id     uuid REFERENCES public.exam_batch_subjects(id) ON DELETE SET NULL,
  level          text REFERENCES public.exam_batch_levels(code) ON UPDATE CASCADE,
  question       text NOT NULL,
  question_type  text NOT NULL DEFAULT 'mcq'
                   CHECK (question_type IN ('mcq','true_false')),
  option_a       text NOT NULL,
  option_b       text NOT NULL,
  option_c       text,
  option_d       text,
  -- Stored uppercase A/B/C/D; the compatibility view lower-cases it.
  correct_option text NOT NULL
                   CHECK (upper(correct_option) IN ('A','B','C','D')),
  explanation    text,
  difficulty     text NOT NULL DEFAULT 'medium'
                   CHECK (difficulty IN ('easy','medium','hard')),
  status         text NOT NULL DEFAULT 'published'
                   CHECK (status IN ('draft','published','archived')),
  tags           text[] NOT NULL DEFAULT '{}',
  sort_order     integer,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_batch_mcqs_chapter_idx    ON public.exam_batch_mcqs(chapter_id);
CREATE INDEX IF NOT EXISTS exam_batch_mcqs_subject_idx    ON public.exam_batch_mcqs(subject_id);
CREATE INDEX IF NOT EXISTS exam_batch_mcqs_level_idx      ON public.exam_batch_mcqs(level);
CREATE INDEX IF NOT EXISTS exam_batch_mcqs_status_idx     ON public.exam_batch_mcqs(status);
CREATE INDEX IF NOT EXISTS exam_batch_mcqs_created_at_idx ON public.exam_batch_mcqs(created_at DESC);
GRANT SELECT                         ON public.exam_batch_mcqs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_mcqs TO authenticated;
GRANT ALL                            ON public.exam_batch_mcqs TO service_role;
ALTER TABLE public.exam_batch_mcqs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. updated_at triggers (reuse existing set_updated_at helper)
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace) THEN
    DROP TRIGGER IF EXISTS trg_exam_batch_levels_updated   ON public.exam_batch_levels;
    CREATE TRIGGER trg_exam_batch_levels_updated
      BEFORE UPDATE ON public.exam_batch_levels
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_exam_batch_subjects_updated ON public.exam_batch_subjects;
    CREATE TRIGGER trg_exam_batch_subjects_updated
      BEFORE UPDATE ON public.exam_batch_subjects
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_exam_batch_chapters_updated ON public.exam_batch_chapters;
    CREATE TRIGGER trg_exam_batch_chapters_updated
      BEFORE UPDATE ON public.exam_batch_chapters
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_exam_batch_mcqs_updated     ON public.exam_batch_mcqs;
    CREATE TRIGGER trg_exam_batch_mcqs_updated
      BEFORE UPDATE ON public.exam_batch_mcqs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. RLS policies
-- ---------------------------------------------------------------------
DO $$ BEGIN
  -- levels
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_levels' AND policyname='exam_batch_levels_read') THEN
    CREATE POLICY exam_batch_levels_read ON public.exam_batch_levels
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_levels' AND policyname='exam_batch_levels_admin_all') THEN
    CREATE POLICY exam_batch_levels_admin_all ON public.exam_batch_levels
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- subjects
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_subjects' AND policyname='exam_batch_subjects_read') THEN
    CREATE POLICY exam_batch_subjects_read ON public.exam_batch_subjects
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_subjects' AND policyname='exam_batch_subjects_admin_all') THEN
    CREATE POLICY exam_batch_subjects_admin_all ON public.exam_batch_subjects
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- chapters
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_chapters' AND policyname='exam_batch_chapters_read') THEN
    CREATE POLICY exam_batch_chapters_read ON public.exam_batch_chapters
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_chapters' AND policyname='exam_batch_chapters_admin_all') THEN
    CREATE POLICY exam_batch_chapters_admin_all ON public.exam_batch_chapters
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- mcqs: authenticated read (matches how exam_batch_questions_v is queried), admin write
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_mcqs' AND policyname='exam_batch_mcqs_read') THEN
    CREATE POLICY exam_batch_mcqs_read ON public.exam_batch_mcqs
      FOR SELECT TO authenticated
      USING (status = 'published' OR public.has_permission(auth.uid(), 'manage_content'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_mcqs' AND policyname='exam_batch_mcqs_admin_all') THEN
    CREATE POLICY exam_batch_mcqs_admin_all ON public.exam_batch_mcqs
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. SEED — snapshot public academic + mcq rows, preserving PKs so all
-- existing exam_batch FK values remain valid without any edits.
-- ---------------------------------------------------------------------
INSERT INTO public.exam_batch_levels
  (code, name, description, color, icon, sort_order, status)
SELECT code, name, description, color, icon, sort_order, status::text
FROM public.levels
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.exam_batch_subjects
  (id, name, slug, level, description, color, icon, sort_order, status)
SELECT id, name, slug, level, description, color, icon, sort_order, status::text
FROM public.subjects
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exam_batch_chapters
  (id, subject_id, name, slug, description, sort_order, status)
SELECT id, subject_id, name, slug, description, sort_order, status::text
FROM public.chapters
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.exam_batch_mcqs (
  id, chapter_id, subject_id, level,
  question, question_type,
  option_a, option_b, option_c, option_d,
  correct_option, explanation,
  difficulty, status, tags, sort_order,
  created_by
)
SELECT
  m.id, m.chapter_id, c.subject_id, s.level,
  m.question, m.question_type::text,
  m.option_a, m.option_b, m.option_c, m.option_d,
  upper(m.correct_option::text),
  m.explanation, m.difficulty::text, m.status::text,
  m.tags, m.sort_order,
  m.created_by
FROM public.mcqs m
LEFT JOIN public.chapters c ON c.id = m.chapter_id
LEFT JOIN public.subjects s ON s.id = c.subject_id
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. Re-point every FK on exam_batch_* tables away from
-- public.subjects/chapters/mcqs/levels and onto the new
-- exam_batch_* academic tables. Because the seed above preserved PKs,
-- every current FK value already matches a row in the new tables.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      tc.constraint_name AS conname,
      tc.table_name      AS tname
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name  LIKE 'exam_batch_%'
      AND ccu.table_schema = 'public'
      AND ccu.table_name IN ('subjects','chapters','mcqs','levels')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      r.tname, r.conname
    );
  END LOOP;
END $$;

-- Now add the new FKs to the exam_batch_* academic tables.
-- Every ADD CONSTRAINT is wrapped in a DO block that first checks the
-- constraint does not already exist, so the migration is re-runnable.
DO $$
DECLARE
  spec record;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    -- table                             , column          , ref_table                       , ref_col , on_delete
    ('exam_batch_sessions'               , 'level'         , 'exam_batch_levels'             , 'code'  , 'NO ACTION'),
    ('exam_batch_session_subjects'       , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'RESTRICT'),
    ('exam_batch_enrollment_subjects'    , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'RESTRICT'),
    ('exam_batch_exams'                  , 'level'         , 'exam_batch_levels'             , 'code'  , 'NO ACTION'),
    ('exam_batch_exams'                  , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'RESTRICT'),
    ('exam_batch_exams'                  , 'chapter_id'    , 'exam_batch_chapters'           , 'id'    , 'SET NULL'),
    ('exam_batch_exam_questions'         , 'question_id'   , 'exam_batch_mcqs'               , 'id'    , 'RESTRICT'),
    ('exam_batch_attempt_question_order' , 'question_id'   , 'exam_batch_mcqs'               , 'id'    , 'RESTRICT'),
    ('exam_batch_attempt_answers'        , 'question_id'   , 'exam_batch_mcqs'               , 'id'    , 'RESTRICT'),
    ('exam_batch_attendance_state'       , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'RESTRICT'),
    ('exam_batch_attendance_processed'   , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'RESTRICT'),
    ('exam_batch_attendance_events'      , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'SET NULL'),
    ('exam_batch_ban_history'            , 'subject_id'    , 'exam_batch_subjects'           , 'id'    , 'RESTRICT')
  ) AS t(tname, col, ref_table, ref_col, ondel)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name = spec.tname) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        WHERE tc.table_schema='public'
          AND tc.table_name = spec.tname
          AND tc.constraint_name = spec.tname || '_' || spec.col || '_ebfk'
      ) THEN
        EXECUTE format(
          'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE %s ON UPDATE CASCADE',
          spec.tname,
          spec.tname || '_' || spec.col || '_ebfk',
          spec.col,
          spec.ref_table,
          spec.ref_col,
          spec.ondel
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 7. Compatibility view — now reads from exam_batch_mcqs.
-- The RPCs in the original migration query this view. Swapping its
-- source table is enough to switch the whole scoring stack over without
-- editing any RPC body.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.exam_batch_questions_v AS
SELECT
  m.id,
  jsonb_build_array(m.option_a, m.option_b, m.option_c, m.option_d) AS options,
  CASE lower(m.correct_option)
    WHEN 'a' THEN '0'
    WHEN 'b' THEN '1'
    WHEN 'c' THEN '2'
    WHEN 'd' THEN '3'
    ELSE NULL
  END AS correct_option
FROM public.exam_batch_mcqs m;

GRANT SELECT ON public.exam_batch_questions_v TO authenticated, service_role;

COMMIT;
