-- ============================================================================
-- Exam Batch Module — Complete Standalone SQL
-- Idempotent: safe to run multiple times on a live production database.
-- Creates ONLY exam_batch_* objects. Reuses existing auth.users, profiles,
-- levels, subjects, chapters, user_roles without modifying them.
-- Student ID sequence starts at 1001.
-- ============================================================================

-- =====================================================================
-- Exam Batch Module — complete isolated database layer
-- =====================================================================
-- Every object in this migration is namespaced with `exam_batch_`.
-- Nothing outside the Exam Batch module is touched. All statements are
-- idempotent (IF NOT EXISTS / DO $$ … $$ / CREATE OR REPLACE) so this
-- migration is safe to run against the production database that already
-- contains live data.
--
-- Depends on the following existing objects (read-only, never modified):
--   auth.users(id)
--   public.exam_batch_levels(code)
--   public.exam_batch_subjects(id)
--   public.exam_batch_chapters(id)
--   public.exam_batch_mcqs(id, option_a/b/c/d text, correct_option mcq_option)
--     Note: this module previously referenced a hypothetical
--     public.questions(id, options jsonb, ...) table. That table does
--     not exist in this database — the canonical question bank is
--     public.exam_batch_mcqs. All foreign keys now point at public.exam_batch_mcqs(id) and
--     RPC scoring reads through the read-only compatibility view
--     public.exam_batch_questions_v defined below, which normalises
--     mcqs into the (id, options jsonb, correct_option text-index)
--     shape the original scoring logic expects. No existing table is
--     altered and no existing data is modified.
--   public.profiles(id)
--   public.has_permission(uuid, text)      -- shared admin gate
-- =====================================================================


-- ---------------------------------------------------------------------
-- Bootstrap fallbacks — create prerequisite objects only if the host
-- database does not already provide them. On a production upgrade the
-- real `public.profiles` table and `public.has_permission(uuid,text)`
-- already exist and these blocks are no-ops. On a fresh empty database
-- these stubs let the rest of this file execute without external deps.
-- ---------------------------------------------------------------------
DO $bootstrap$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text,
      full_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
    GRANT ALL ON public.profiles TO service_role;
  END IF;
END
$bootstrap$;

-- has_permission fallback: created ONLY if the host database does not
-- already define it. Production ships the real permission gate; this
-- stub simply denies all non-service-role callers on a fresh database.
DO $has_perm$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'has_permission'
      AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _permission text'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.has_permission(_user_id uuid, _permission text)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT COALESCE(
          (SELECT current_setting('request.jwt.claim.role', true) = 'service_role'),
          false
        )
      $body$
    $fn$;
  END IF;
END
$has_perm$;



-- ---------------------------------------------------------------------
-- Sequence — global Student ID counter (start 1001, monotonic, no reuse)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.exam_batch_student_id_seq
  START WITH 1001 INCREMENT BY 1 MINVALUE 1001 NO CYCLE;

GRANT USAGE ON SEQUENCE public.exam_batch_student_id_seq TO authenticated;
GRANT ALL   ON SEQUENCE public.exam_batch_student_id_seq TO service_role;


-- ---------------------------------------------------------------------
-- Independent Academic + MCQ layer (created EARLY so downstream FKs
-- resolve on a fresh database). Full definitions are re-asserted later
-- by the merged 20260713 migration; CREATE IF NOT EXISTS makes both
-- runs no-ops on already-provisioned databases.
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

-- Default seed levels so foreign keys from exam_batch_sessions/exam_batch_subjects
-- resolve on a fresh database. Idempotent — existing rows are preserved.
INSERT INTO public.exam_batch_levels (code, name, description, sort_order, status) VALUES
  ('foundation',   'Foundation',   'CA Foundation level',   10, 'published'),
  ('intermediate', 'Intermediate', 'CA Intermediate level', 20, 'published'),
  ('final',        'Final',        'CA Final level',        30, 'published'),
  ('professional', 'Professional', 'Professional level',    40, 'published')
ON CONFLICT (code) DO NOTHING;

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
GRANT SELECT                         ON public.exam_batch_subjects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_subjects TO authenticated;
GRANT ALL                            ON public.exam_batch_subjects TO service_role;

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
GRANT SELECT                         ON public.exam_batch_chapters TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_chapters TO authenticated;
GRANT ALL                            ON public.exam_batch_chapters TO service_role;

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
GRANT SELECT                         ON public.exam_batch_mcqs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_mcqs TO authenticated;
GRANT ALL                            ON public.exam_batch_mcqs TO service_role;


-- =====================================================================
-- 1. SESSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  subtitle              text,
  level                 text NOT NULL REFERENCES public.exam_batch_levels(code) ON UPDATE CASCADE,
  starts_at             timestamptz NOT NULL,
  registration_deadline timestamptz,
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','inactive')),
  registration_open     boolean NOT NULL DEFAULT true,
  is_archived           boolean NOT NULL DEFAULT false,
  is_hidden             boolean NOT NULL DEFAULT false,
  subjects_count        integer NOT NULL DEFAULT 0 CHECK (subjects_count >= 0),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_batch_sessions_level_idx        ON public.exam_batch_sessions(level);
CREATE INDEX IF NOT EXISTS exam_batch_sessions_status_idx       ON public.exam_batch_sessions(status);
CREATE INDEX IF NOT EXISTS exam_batch_sessions_starts_at_idx    ON public.exam_batch_sessions(starts_at DESC);
CREATE INDEX IF NOT EXISTS exam_batch_sessions_visible_idx
  ON public.exam_batch_sessions(status, starts_at DESC)
  WHERE is_hidden = false AND is_archived = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_sessions TO authenticated;
GRANT ALL ON public.exam_batch_sessions TO service_role;

ALTER TABLE public.exam_batch_sessions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 2. SESSION SUBJECTS (admin-configured subject list per session)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_session_subjects (
  session_id  uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  subject_id  uuid NOT NULL REFERENCES public.exam_batch_subjects(id)            ON DELETE RESTRICT,
  sort_order  integer NOT NULL DEFAULT 0,
  added_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, subject_id)
);

CREATE INDEX IF NOT EXISTS exam_batch_session_subjects_subject_idx
  ON public.exam_batch_session_subjects(subject_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_session_subjects TO authenticated;
GRANT ALL ON public.exam_batch_session_subjects TO service_role;
ALTER TABLE public.exam_batch_session_subjects ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 3. ENROLLMENTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  student_id   integer,
  reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  notes        text,
  removed      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_batch_enrollments_session_user_uk UNIQUE (session_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_batch_enrollments_student_id_uk
  ON public.exam_batch_enrollments(student_id) WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS exam_batch_enrollments_user_idx      ON public.exam_batch_enrollments(user_id);
CREATE INDEX IF NOT EXISTS exam_batch_enrollments_session_idx   ON public.exam_batch_enrollments(session_id);
CREATE INDEX IF NOT EXISTS exam_batch_enrollments_status_idx    ON public.exam_batch_enrollments(status);
CREATE INDEX IF NOT EXISTS exam_batch_enrollments_pending_idx
  ON public.exam_batch_enrollments(session_id, created_at) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_enrollments TO authenticated;
GRANT ALL ON public.exam_batch_enrollments TO service_role;
ALTER TABLE public.exam_batch_enrollments ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 4. ENROLLMENT SUBJECTS (per-student subject selection inside a session)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_enrollment_subjects (
  enrollment_id  uuid NOT NULL REFERENCES public.exam_batch_enrollments(id) ON DELETE CASCADE,
  subject_id     uuid NOT NULL REFERENCES public.exam_batch_subjects(id) ON DELETE RESTRICT,
  added_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (enrollment_id, subject_id)
);

CREATE INDEX IF NOT EXISTS exam_batch_enrollment_subjects_subject_idx
  ON public.exam_batch_enrollment_subjects(subject_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_enrollment_subjects TO authenticated;
GRANT ALL ON public.exam_batch_enrollment_subjects TO service_role;
ALTER TABLE public.exam_batch_enrollment_subjects ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 5. EXAMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_exams (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  title                     text NOT NULL,
  subtitle                  text,
  level                     text NOT NULL REFERENCES public.exam_batch_levels(code) ON UPDATE CASCADE,
  subject_id                uuid NOT NULL REFERENCES public.exam_batch_subjects(id) ON DELETE RESTRICT,
  chapter_id                uuid REFERENCES public.exam_batch_chapters(id) ON DELETE SET NULL,
  duration_minutes          integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  total_questions           integer NOT NULL CHECK (total_questions >= 0),
  window_start              timestamptz NOT NULL,
  window_end                timestamptz NOT NULL,
  available_before_minutes  integer NOT NULL DEFAULT 15  CHECK (available_before_minutes >= 0),
  upcoming_before_minutes   integer NOT NULL DEFAULT 1440 CHECK (upcoming_before_minutes >= 0),
  randomize_questions       boolean NOT NULL DEFAULT true,
  randomize_options         boolean NOT NULL DEFAULT true,
  mark_per_correct          numeric(6,2) NOT NULL DEFAULT 1  CHECK (mark_per_correct >= 0),
  mark_per_wrong            numeric(6,2) NOT NULL DEFAULT 0  CHECK (mark_per_wrong  >= 0),
  status                    text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  is_published              boolean NOT NULL DEFAULT false,
  is_archived               boolean NOT NULL DEFAULT false,
  is_hidden                 boolean NOT NULL DEFAULT false,
  force_closed_at           timestamptz,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_batch_exams_window_ck CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS exam_batch_exams_session_idx   ON public.exam_batch_exams(session_id);
CREATE INDEX IF NOT EXISTS exam_batch_exams_subject_idx   ON public.exam_batch_exams(subject_id);
CREATE INDEX IF NOT EXISTS exam_batch_exams_chapter_idx   ON public.exam_batch_exams(chapter_id);
CREATE INDEX IF NOT EXISTS exam_batch_exams_window_idx    ON public.exam_batch_exams(window_start, window_end);
-- Hot path for attendance-sweep cron: find published exams whose window has just ended.
CREATE INDEX IF NOT EXISTS exam_batch_exams_window_end_idx
  ON public.exam_batch_exams(window_end)
  WHERE is_published = true AND is_hidden = false AND is_archived = false AND status = 'active';
CREATE INDEX IF NOT EXISTS exam_batch_exams_published_idx
  ON public.exam_batch_exams(session_id, window_start)
  WHERE is_published = true AND is_hidden = false AND is_archived = false AND status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_exams TO authenticated;
GRANT ALL ON public.exam_batch_exams TO service_role;
ALTER TABLE public.exam_batch_exams ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 6. EXAM QUESTIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_exam_questions (
  exam_id      uuid NOT NULL REFERENCES public.exam_batch_exams(id) ON DELETE CASCADE,
  question_id  uuid NOT NULL REFERENCES public.exam_batch_mcqs(id)        ON DELETE RESTRICT,
  position     integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (exam_id, question_id)
);

CREATE INDEX IF NOT EXISTS exam_batch_exam_questions_exam_pos_idx
  ON public.exam_batch_exam_questions(exam_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_exam_questions TO authenticated;
GRANT ALL ON public.exam_batch_exam_questions TO service_role;
ALTER TABLE public.exam_batch_exam_questions ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 6b. QUESTION COMPATIBILITY VIEW
--
-- The scoring / attempt RPCs in this module were originally written
-- against a `public.questions(id, options jsonb, correct_option text)`
-- shape. This database instead ships `public.exam_batch_mcqs` (option_a..option_d
-- columns + a `correct_option` enum of 'a'|'b'|'c'|'d'). This view
-- adapts mcqs to the expected shape WITHOUT modifying the underlying
-- table or its data:
--
--   * options         -> jsonb array [option_a, option_b, option_c, option_d]
--   * correct_option  -> text of the 0-based index ('0'|'1'|'2'|'3')
--                        so it matches (option_order[i])::text used by
--                        the scoring comparison.
--
-- The view is read-only (SECURITY INVOKER, default), so mcqs RLS
-- continues to apply. Nothing else in the database is touched.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.exam_batch_questions_v AS
SELECT
  m.id,
  jsonb_build_array(m.option_a, m.option_b, m.option_c, m.option_d) AS options,
  CASE lower(m.correct_option::text)
    WHEN 'a' THEN '0'
    WHEN 'b' THEN '1'
    WHEN 'c' THEN '2'
    WHEN 'd' THEN '3'
    ELSE NULL
  END AS correct_option
FROM public.exam_batch_mcqs m;

GRANT SELECT ON public.exam_batch_questions_v TO authenticated, service_role;


-- =====================================================================
-- 7. ATTEMPTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_attempts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id              uuid NOT NULL REFERENCES public.exam_batch_exams(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status               text NOT NULL DEFAULT 'in_progress'
                         CHECK (status IN ('in_progress','submitted','auto_submitted','timed_out','admin_closed')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  expected_finish_at   timestamptz NOT NULL,
  submitted_at         timestamptz,
  submit_reason        text CHECK (submit_reason IS NULL OR submit_reason IN ('manual','auto','timeout','admin')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS exam_batch_attempts_active_uk
  ON public.exam_batch_attempts(exam_id, user_id) WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS exam_batch_attempts_user_idx     ON public.exam_batch_attempts(user_id);
CREATE INDEX IF NOT EXISTS exam_batch_attempts_exam_idx     ON public.exam_batch_attempts(exam_id);
CREATE INDEX IF NOT EXISTS exam_batch_attempts_status_idx   ON public.exam_batch_attempts(status);
CREATE INDEX IF NOT EXISTS exam_batch_attempts_exam_user_idx ON public.exam_batch_attempts(exam_id, user_id);
-- Hot path for the timeout / auto-submit cron sweep.
CREATE INDEX IF NOT EXISTS exam_batch_attempts_timeout_idx
  ON public.exam_batch_attempts(expected_finish_at)
  WHERE status = 'in_progress';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_attempts TO authenticated;
GRANT ALL ON public.exam_batch_attempts TO service_role;
ALTER TABLE public.exam_batch_attempts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 8. ATTEMPT QUESTION ORDER
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_attempt_question_order (
  attempt_id    uuid NOT NULL REFERENCES public.exam_batch_attempts(id) ON DELETE CASCADE,
  position      integer NOT NULL CHECK (position >= 0),
  question_id   uuid NOT NULL REFERENCES public.exam_batch_mcqs(id) ON DELETE RESTRICT,
  option_order  integer[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (attempt_id, position),
  CONSTRAINT exam_batch_attempt_question_order_uk UNIQUE (attempt_id, question_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_attempt_question_order TO authenticated;
GRANT ALL ON public.exam_batch_attempt_question_order TO service_role;
ALTER TABLE public.exam_batch_attempt_question_order ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- 9. ATTEMPT ANSWERS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_batch_attempt_answers (
  attempt_id             uuid NOT NULL REFERENCES public.exam_batch_attempts(id) ON DELETE CASCADE,
  question_id            uuid NOT NULL REFERENCES public.exam_batch_mcqs(id) ON DELETE RESTRICT,
  selected_display_index integer,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_attempt_answers TO authenticated;
GRANT ALL ON public.exam_batch_attempt_answers TO service_role;
ALTER TABLE public.exam_batch_attempt_answers ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 10. RESULTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_attempt_results (
  attempt_id         uuid PRIMARY KEY REFERENCES public.exam_batch_attempts(id) ON DELETE CASCADE,
  exam_id            uuid NOT NULL REFERENCES public.exam_batch_exams(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id         integer,
  correct            integer NOT NULL DEFAULT 0 CHECK (correct  >= 0),
  wrong              integer NOT NULL DEFAULT 0 CHECK (wrong    >= 0),
  skipped            integer NOT NULL DEFAULT 0 CHECK (skipped  >= 0),
  total_questions    integer NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  marks              numeric(10,2) NOT NULL DEFAULT 0,
  max_marks          numeric(10,2) NOT NULL DEFAULT 0 CHECK (max_marks >= 0),
  percentage         numeric(6,2)  NOT NULL DEFAULT 0 CHECK (percentage BETWEEN 0 AND 100),
  time_used_seconds  integer NOT NULL DEFAULT 0 CHECK (time_used_seconds >= 0),
  duration_seconds   integer NOT NULL DEFAULT 0 CHECK (duration_seconds  >= 0),
  submitted_at       timestamptz,
  scored_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_batch_attempt_results_exam_idx  ON public.exam_batch_attempt_results(exam_id);
CREATE INDEX IF NOT EXISTS exam_batch_attempt_results_user_idx  ON public.exam_batch_attempt_results(user_id);
CREATE INDEX IF NOT EXISTS exam_batch_attempt_results_rank_idx
  ON public.exam_batch_attempt_results(exam_id, marks DESC, time_used_seconds ASC, submitted_at ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_attempt_results TO authenticated;
GRANT ALL ON public.exam_batch_attempt_results TO service_role;
ALTER TABLE public.exam_batch_attempt_results ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 11. LEADERBOARDS (frozen)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_leaderboards (
  exam_id      uuid PRIMARY KEY REFERENCES public.exam_batch_exams(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','frozen')),
  generated_at timestamptz,
  frozen_at    timestamptz,
  entry_count  integer NOT NULL DEFAULT 0 CHECK (entry_count >= 0),
  version      integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS exam_batch_leaderboards_session_idx ON public.exam_batch_leaderboards(session_id);
CREATE INDEX IF NOT EXISTS exam_batch_leaderboards_status_idx  ON public.exam_batch_leaderboards(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_leaderboards TO authenticated;
GRANT ALL ON public.exam_batch_leaderboards TO service_role;
ALTER TABLE public.exam_batch_leaderboards ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.exam_batch_leaderboard_entries (
  exam_id            uuid NOT NULL REFERENCES public.exam_batch_leaderboards(exam_id) ON DELETE CASCADE,
  attempt_id         uuid NOT NULL REFERENCES public.exam_batch_attempts(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id         integer,
  rank               integer NOT NULL CHECK (rank > 0),
  marks              numeric(10,2) NOT NULL DEFAULT 0,
  max_marks          numeric(10,2) NOT NULL DEFAULT 0,
  percentage         numeric(6,2)  NOT NULL DEFAULT 0,
  correct            integer NOT NULL DEFAULT 0,
  wrong              integer NOT NULL DEFAULT 0,
  skipped            integer NOT NULL DEFAULT 0,
  time_used_seconds  integer NOT NULL DEFAULT 0,
  submitted_at       timestamptz,
  PRIMARY KEY (exam_id, attempt_id),
  CONSTRAINT exam_batch_leaderboard_entries_rank_uk UNIQUE (exam_id, rank)
);

CREATE INDEX IF NOT EXISTS exam_batch_leaderboard_entries_user_idx ON public.exam_batch_leaderboard_entries(user_id);
CREATE INDEX IF NOT EXISTS exam_batch_leaderboard_entries_exam_rank_idx
  ON public.exam_batch_leaderboard_entries(exam_id, rank);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_leaderboard_entries TO authenticated;
GRANT ALL ON public.exam_batch_leaderboard_entries TO service_role;
ALTER TABLE public.exam_batch_leaderboard_entries ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 12. PROGRESS SUMMARIES + ANALYTICS SNAPSHOTS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_progress_summaries (
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  time_window         text NOT NULL CHECK (time_window IN ('daily','weekly','30d')),
  exams_scheduled     integer NOT NULL DEFAULT 0,
  exams_attended      integer NOT NULL DEFAULT 0,
  exams_submitted     integer NOT NULL DEFAULT 0,
  avg_marks           numeric(10,2) NOT NULL DEFAULT 0,
  avg_percentage      numeric(6,2)  NOT NULL DEFAULT 0,
  highest_percentage  numeric(6,2)  NOT NULL DEFAULT 0,
  lowest_percentage   numeric(6,2)  NOT NULL DEFAULT 0,
  total_correct       integer NOT NULL DEFAULT 0,
  total_wrong         integer NOT NULL DEFAULT 0,
  total_skipped       integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, time_window)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_progress_summaries TO authenticated;
GRANT ALL ON public.exam_batch_progress_summaries TO service_role;
ALTER TABLE public.exam_batch_progress_summaries ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.exam_batch_analytics_snapshots (
  scope_key    text PRIMARY KEY,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_analytics_snapshots TO authenticated;
GRANT ALL ON public.exam_batch_analytics_snapshots TO service_role;
ALTER TABLE public.exam_batch_analytics_snapshots ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 13. COUNTDOWN
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_countdown (
  id                text PRIMARY KEY DEFAULT 'singleton'
                     CHECK (id = 'singleton'),
  enabled           boolean NOT NULL DEFAULT false,
  label             text,
  target_iso        timestamptz,
  show_on_dashboard boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE ON public.exam_batch_countdown TO authenticated;
GRANT ALL ON public.exam_batch_countdown TO service_role;
ALTER TABLE public.exam_batch_countdown ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 14. SETTINGS (singleton JSONB)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_settings (
  id         text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.exam_batch_settings (id, value)
VALUES ('singleton', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON public.exam_batch_settings TO authenticated;
GRANT ALL ON public.exam_batch_settings TO service_role;
ALTER TABLE public.exam_batch_settings ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 15. ATTENDANCE — state, processed ledger, events
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_attendance_state (
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id               uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  subject_id               uuid NOT NULL REFERENCES public.exam_batch_subjects(id) ON DELETE RESTRICT,
  consecutive_missed_count integer NOT NULL DEFAULT 0 CHECK (consecutive_missed_count >= 0),
  last_missed_exam_id      uuid REFERENCES public.exam_batch_exams(id) ON DELETE SET NULL,
  last_missed_at           timestamptz,
  last_attended_exam_id    uuid REFERENCES public.exam_batch_exams(id) ON DELETE SET NULL,
  last_attended_at         timestamptz,
  banned                   boolean NOT NULL DEFAULT false,
  banned_at                timestamptz,
  banned_reason            text,
  banned_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_banned              boolean NOT NULL DEFAULT false,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id, subject_id)
);

CREATE INDEX IF NOT EXISTS exam_batch_attendance_state_user_idx
  ON public.exam_batch_attendance_state(user_id);
CREATE INDEX IF NOT EXISTS exam_batch_attendance_state_session_subject_idx
  ON public.exam_batch_attendance_state(session_id, subject_id);
CREATE INDEX IF NOT EXISTS exam_batch_attendance_state_banned_idx
  ON public.exam_batch_attendance_state(banned) WHERE banned = true;
CREATE INDEX IF NOT EXISTS exam_batch_attendance_state_count_idx
  ON public.exam_batch_attendance_state(consecutive_missed_count);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_attendance_state TO authenticated;
GRANT ALL ON public.exam_batch_attendance_state TO service_role;
ALTER TABLE public.exam_batch_attendance_state ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.exam_batch_attendance_processed (
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  subject_id   uuid NOT NULL REFERENCES public.exam_batch_subjects(id) ON DELETE RESTRICT,
  exam_id      uuid NOT NULL REFERENCES public.exam_batch_exams(id) ON DELETE CASCADE,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id, subject_id, exam_id)
);

CREATE INDEX IF NOT EXISTS exam_batch_attendance_processed_exam_idx
  ON public.exam_batch_attendance_processed(exam_id);

GRANT SELECT, INSERT, DELETE ON public.exam_batch_attendance_processed TO authenticated;
GRANT ALL ON public.exam_batch_attendance_processed TO service_role;
ALTER TABLE public.exam_batch_attendance_processed ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.exam_batch_attendance_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id     uuid REFERENCES public.exam_batch_sessions(id) ON DELETE SET NULL,
  subject_id     uuid REFERENCES public.exam_batch_subjects(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN (
                    'missed','attended',
                    'counter.increment','counter.decrement','counter.set','counter.reset',
                    'auto_ban','manual_ban','manual_unban')),
  exam_id        uuid REFERENCES public.exam_batch_exams(id) ON DELETE SET NULL,
  previous_count integer,
  new_count      integer,
  reason         text,
  actor_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_batch_attendance_events_user_idx
  ON public.exam_batch_attendance_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_batch_attendance_events_scope_idx
  ON public.exam_batch_attendance_events(session_id, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_batch_attendance_events_kind_idx
  ON public.exam_batch_attendance_events(kind, created_at DESC);

GRANT SELECT, INSERT ON public.exam_batch_attendance_events TO authenticated;
GRANT ALL ON public.exam_batch_attendance_events TO service_role;
ALTER TABLE public.exam_batch_attendance_events ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 16. BAN HISTORY (denormalised ledger for quick admin reporting)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_ban_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES public.exam_batch_sessions(id) ON DELETE CASCADE,
  subject_id   uuid NOT NULL REFERENCES public.exam_batch_subjects(id) ON DELETE RESTRICT,
  ban_type     text NOT NULL CHECK (ban_type IN ('auto','manual')),
  action       text NOT NULL CHECK (action   IN ('ban','unban')),
  reason       text,
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_batch_ban_history_user_idx
  ON public.exam_batch_ban_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_batch_ban_history_scope_idx
  ON public.exam_batch_ban_history(session_id, subject_id, created_at DESC);

GRANT SELECT, INSERT ON public.exam_batch_ban_history TO authenticated;
GRANT ALL ON public.exam_batch_ban_history TO service_role;
ALTER TABLE public.exam_batch_ban_history ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 17. AUDIT LOG
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_batch_audit_log_created_idx ON public.exam_batch_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS exam_batch_audit_log_actor_idx   ON public.exam_batch_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS exam_batch_audit_log_entity_idx  ON public.exam_batch_audit_log(entity, entity_id);

GRANT SELECT, INSERT ON public.exam_batch_audit_log TO authenticated;
GRANT ALL ON public.exam_batch_audit_log TO service_role;
ALTER TABLE public.exam_batch_audit_log ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- 18. COMMENT RULES + DOWNLOAD/EXPORT HISTORY
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_comment_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_percent numeric(5,2) NOT NULL CHECK (min_percent BETWEEN 0 AND 100),
  max_percent numeric(5,2) NOT NULL CHECK (max_percent BETWEEN 0 AND 100),
  label       text NOT NULL,
  message     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_batch_comment_rules_range_ck CHECK (max_percent >= min_percent)
);

CREATE INDEX IF NOT EXISTS exam_batch_comment_rules_sort_idx
  ON public.exam_batch_comment_rules(sort_order, min_percent);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_batch_comment_rules TO authenticated;
GRANT ALL ON public.exam_batch_comment_rules TO service_role;
ALTER TABLE public.exam_batch_comment_rules ENABLE ROW LEVEL SECURITY;


CREATE TABLE IF NOT EXISTS public.exam_batch_download_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  export_type  text NOT NULL,
  format       text NOT NULL,
  exam_id      uuid REFERENCES public.exam_batch_exams(id)    ON DELETE SET NULL,
  session_id   uuid REFERENCES public.exam_batch_sessions(id) ON DELETE SET NULL,
  subject_id   uuid REFERENCES public.exam_batch_subjects(id)            ON DELETE SET NULL,
  filters      jsonb,
  row_count    integer,
  byte_length  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_batch_download_history_actor_idx
  ON public.exam_batch_download_history(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_batch_download_history_created_idx
  ON public.exam_batch_download_history(created_at DESC);

GRANT SELECT, INSERT ON public.exam_batch_download_history TO authenticated;
GRANT ALL ON public.exam_batch_download_history TO service_role;
ALTER TABLE public.exam_batch_download_history ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- SHARED updated_at TRIGGER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.exam_batch_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'exam_batch_sessions',
      'exam_batch_enrollments',
      'exam_batch_exams',
      'exam_batch_attempts',
      'exam_batch_attempt_answers',
      'exam_batch_attendance_state',
      'exam_batch_settings',
      'exam_batch_countdown',
      'exam_batch_comment_rules'
    ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = t || '_touch_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.exam_batch_touch_updated_at()',
        t || '_touch_updated_at', t
      );
    END IF;
  END LOOP;
END
$$;


-- =====================================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================================
DO $$
BEGIN
  -- exam_batch_sessions -------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_sessions' AND policyname='exam_batch_sessions_public_read') THEN
    CREATE POLICY exam_batch_sessions_public_read ON public.exam_batch_sessions
      FOR SELECT TO authenticated
      USING (is_hidden = false AND is_archived = false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_sessions' AND policyname='exam_batch_sessions_admin_all') THEN
    CREATE POLICY exam_batch_sessions_admin_all ON public.exam_batch_sessions
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_session_subjects ----------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_session_subjects' AND policyname='exam_batch_session_subjects_read') THEN
    CREATE POLICY exam_batch_session_subjects_read ON public.exam_batch_session_subjects
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_session_subjects' AND policyname='exam_batch_session_subjects_admin_all') THEN
    CREATE POLICY exam_batch_session_subjects_admin_all ON public.exam_batch_session_subjects
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_enrollments ---------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_enrollments' AND policyname='exam_batch_enrollments_own_read') THEN
    CREATE POLICY exam_batch_enrollments_own_read ON public.exam_batch_enrollments
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_enrollments' AND policyname='exam_batch_enrollments_own_insert') THEN
    CREATE POLICY exam_batch_enrollments_own_insert ON public.exam_batch_enrollments
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid() AND status = 'pending' AND student_id IS NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_enrollments' AND policyname='exam_batch_enrollments_admin_all') THEN
    CREATE POLICY exam_batch_enrollments_admin_all ON public.exam_batch_enrollments
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_enrollment_subjects -------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_enrollment_subjects' AND policyname='exam_batch_enrollment_subjects_own_read') THEN
    CREATE POLICY exam_batch_enrollment_subjects_own_read ON public.exam_batch_enrollment_subjects
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.exam_batch_enrollments e
         WHERE e.id = enrollment_id AND e.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_enrollment_subjects' AND policyname='exam_batch_enrollment_subjects_admin_all') THEN
    CREATE POLICY exam_batch_enrollment_subjects_admin_all ON public.exam_batch_enrollment_subjects
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_exams ---------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_exams' AND policyname='exam_batch_exams_public_read') THEN
    CREATE POLICY exam_batch_exams_public_read ON public.exam_batch_exams
      FOR SELECT TO authenticated
      USING (is_published = true AND is_hidden = false AND is_archived = false AND status = 'active');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_exams' AND policyname='exam_batch_exams_admin_all') THEN
    CREATE POLICY exam_batch_exams_admin_all ON public.exam_batch_exams
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_exam_questions ------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_exam_questions' AND policyname='exam_batch_exam_questions_admin_all') THEN
    CREATE POLICY exam_batch_exam_questions_admin_all ON public.exam_batch_exam_questions
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attempts ------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempts' AND policyname='exam_batch_attempts_own_read') THEN
    CREATE POLICY exam_batch_attempts_own_read ON public.exam_batch_attempts
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempts' AND policyname='exam_batch_attempts_own_insert') THEN
    CREATE POLICY exam_batch_attempts_own_insert ON public.exam_batch_attempts
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempts' AND policyname='exam_batch_attempts_own_update') THEN
    CREATE POLICY exam_batch_attempts_own_update ON public.exam_batch_attempts
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid() AND status = 'in_progress')
      WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempts' AND policyname='exam_batch_attempts_admin_all') THEN
    CREATE POLICY exam_batch_attempts_admin_all ON public.exam_batch_attempts
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attempt_question_order ----------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempt_question_order' AND policyname='exam_batch_attempt_question_order_own_read') THEN
    CREATE POLICY exam_batch_attempt_question_order_own_read ON public.exam_batch_attempt_question_order
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.exam_batch_attempts a
         WHERE a.id = attempt_id AND a.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempt_question_order' AND policyname='exam_batch_attempt_question_order_admin_all') THEN
    CREATE POLICY exam_batch_attempt_question_order_admin_all ON public.exam_batch_attempt_question_order
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attempt_answers -----------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempt_answers' AND policyname='exam_batch_attempt_answers_own_rw') THEN
    CREATE POLICY exam_batch_attempt_answers_own_rw ON public.exam_batch_attempt_answers
      FOR ALL TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.exam_batch_attempts a
         WHERE a.id = attempt_id AND a.user_id = auth.uid()))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.exam_batch_attempts a
         WHERE a.id = attempt_id AND a.user_id = auth.uid() AND a.status = 'in_progress'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempt_answers' AND policyname='exam_batch_attempt_answers_admin_all') THEN
    CREATE POLICY exam_batch_attempt_answers_admin_all ON public.exam_batch_attempt_answers
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attempt_results -----------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempt_results' AND policyname='exam_batch_attempt_results_own_read') THEN
    CREATE POLICY exam_batch_attempt_results_own_read ON public.exam_batch_attempt_results
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attempt_results' AND policyname='exam_batch_attempt_results_admin_all') THEN
    CREATE POLICY exam_batch_attempt_results_admin_all ON public.exam_batch_attempt_results
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_leaderboards --------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_leaderboards' AND policyname='exam_batch_leaderboards_read') THEN
    CREATE POLICY exam_batch_leaderboards_read ON public.exam_batch_leaderboards
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_leaderboards' AND policyname='exam_batch_leaderboards_admin_all') THEN
    CREATE POLICY exam_batch_leaderboards_admin_all ON public.exam_batch_leaderboards
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_leaderboard_entries -------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_leaderboard_entries' AND policyname='exam_batch_leaderboard_entries_read') THEN
    CREATE POLICY exam_batch_leaderboard_entries_read ON public.exam_batch_leaderboard_entries
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_leaderboard_entries' AND policyname='exam_batch_leaderboard_entries_admin_all') THEN
    CREATE POLICY exam_batch_leaderboard_entries_admin_all ON public.exam_batch_leaderboard_entries
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_progress_summaries --------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_progress_summaries' AND policyname='exam_batch_progress_summaries_own_read') THEN
    CREATE POLICY exam_batch_progress_summaries_own_read ON public.exam_batch_progress_summaries
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_progress_summaries' AND policyname='exam_batch_progress_summaries_admin_all') THEN
    CREATE POLICY exam_batch_progress_summaries_admin_all ON public.exam_batch_progress_summaries
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_analytics_snapshots -------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_analytics_snapshots' AND policyname='exam_batch_analytics_snapshots_admin_all') THEN
    CREATE POLICY exam_batch_analytics_snapshots_admin_all ON public.exam_batch_analytics_snapshots
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_countdown -----------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_countdown' AND policyname='exam_batch_countdown_read') THEN
    CREATE POLICY exam_batch_countdown_read ON public.exam_batch_countdown
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_countdown' AND policyname='exam_batch_countdown_admin_write') THEN
    CREATE POLICY exam_batch_countdown_admin_write ON public.exam_batch_countdown
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_settings ------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_settings' AND policyname='exam_batch_settings_read') THEN
    CREATE POLICY exam_batch_settings_read ON public.exam_batch_settings
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_settings' AND policyname='exam_batch_settings_admin_write') THEN
    CREATE POLICY exam_batch_settings_admin_write ON public.exam_batch_settings
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attendance_state ----------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attendance_state' AND policyname='exam_batch_attendance_state_own_read') THEN
    CREATE POLICY exam_batch_attendance_state_own_read ON public.exam_batch_attendance_state
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attendance_state' AND policyname='exam_batch_attendance_state_admin_all') THEN
    CREATE POLICY exam_batch_attendance_state_admin_all ON public.exam_batch_attendance_state
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attendance_processed ------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attendance_processed' AND policyname='exam_batch_attendance_processed_admin_all') THEN
    CREATE POLICY exam_batch_attendance_processed_admin_all ON public.exam_batch_attendance_processed
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_attendance_events ---------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attendance_events' AND policyname='exam_batch_attendance_events_own_read') THEN
    CREATE POLICY exam_batch_attendance_events_own_read ON public.exam_batch_attendance_events
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_attendance_events' AND policyname='exam_batch_attendance_events_admin_all') THEN
    CREATE POLICY exam_batch_attendance_events_admin_all ON public.exam_batch_attendance_events
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_ban_history ---------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_ban_history' AND policyname='exam_batch_ban_history_own_read') THEN
    CREATE POLICY exam_batch_ban_history_own_read ON public.exam_batch_ban_history
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_ban_history' AND policyname='exam_batch_ban_history_admin_all') THEN
    CREATE POLICY exam_batch_ban_history_admin_all ON public.exam_batch_ban_history
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_audit_log -----------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_audit_log' AND policyname='exam_batch_audit_log_admin_read') THEN
    CREATE POLICY exam_batch_audit_log_admin_read ON public.exam_batch_audit_log
      FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), 'manage_content'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_audit_log' AND policyname='exam_batch_audit_log_admin_insert') THEN
    CREATE POLICY exam_batch_audit_log_admin_insert ON public.exam_batch_audit_log
      FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_comment_rules -------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_comment_rules' AND policyname='exam_batch_comment_rules_read') THEN
    CREATE POLICY exam_batch_comment_rules_read ON public.exam_batch_comment_rules
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_comment_rules' AND policyname='exam_batch_comment_rules_admin_write') THEN
    CREATE POLICY exam_batch_comment_rules_admin_write ON public.exam_batch_comment_rules
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;

  -- exam_batch_download_history ----------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_batch_download_history' AND policyname='exam_batch_download_history_admin_all') THEN
    CREATE POLICY exam_batch_download_history_admin_all ON public.exam_batch_download_history
      FOR ALL TO authenticated
      USING (public.has_permission(auth.uid(), 'manage_content'))
      WITH CHECK (public.has_permission(auth.uid(), 'manage_content'));
  END IF;
END
$$;


-- =====================================================================
-- RPCs
-- =====================================================================

-- 1. Bulk approve enrollments (atomic student-id assignment) -----------
CREATE OR REPLACE FUNCTION public.exam_batch_approve_enrollments(
  _enrollment_ids uuid[],
  _reviewer       uuid
) RETURNS TABLE (id uuid, student_id int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Prevent spoofing: if invoked by an authenticated user, force reviewer to auth.uid().
  IF auth.uid() IS NOT NULL THEN
    _reviewer := auth.uid();
  END IF;
  IF _reviewer IS NULL OR NOT public.has_permission(_reviewer, 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;


  RETURN QUERY
  UPDATE public.exam_batch_enrollments e
     SET status      = 'approved',
         student_id  = COALESCE(e.student_id, nextval('public.exam_batch_student_id_seq')::int),
         reviewed_by = _reviewer,
         reviewed_at = now(),
         updated_at  = now()
   WHERE e.id = ANY(_enrollment_ids)
     AND e.status = 'pending'
  RETURNING e.id, e.student_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_approve_enrollments(uuid[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_approve_enrollments(uuid[], uuid) TO authenticated, service_role;


-- 10. Attendance — reset on participation (declared early: called by RPC #2)
CREATE OR REPLACE FUNCTION public.exam_batch_attendance_reset_on_participation(
  _user_id uuid,
  _exam_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session uuid;
  v_subject uuid;
  v_prev    int;
BEGIN
  SELECT session_id, subject_id INTO v_session, v_subject
    FROM public.exam_batch_exams WHERE id = _exam_id;
  IF v_session IS NULL THEN RETURN; END IF;

  SELECT consecutive_missed_count INTO v_prev
    FROM public.exam_batch_attendance_state
   WHERE user_id = _user_id AND session_id = v_session AND subject_id = v_subject;

  INSERT INTO public.exam_batch_attendance_state (
    user_id, session_id, subject_id,
    consecutive_missed_count, last_attended_exam_id, last_attended_at, updated_at)
  VALUES (_user_id, v_session, v_subject, 0, _exam_id, now(), now())
  ON CONFLICT (user_id, session_id, subject_id) DO UPDATE SET
    consecutive_missed_count = 0,
    last_attended_exam_id    = EXCLUDED.last_attended_exam_id,
    last_attended_at         = EXCLUDED.last_attended_at,
    updated_at               = now();

  INSERT INTO public.exam_batch_attendance_events (
    user_id, session_id, subject_id, kind, exam_id, previous_count, new_count, actor_id)
  VALUES (_user_id, v_session, v_subject, 'attended', _exam_id, v_prev, 0, auth.uid());

  IF COALESCE(v_prev, 0) > 0 THEN
    INSERT INTO public.exam_batch_attendance_events (
      user_id, session_id, subject_id, kind, exam_id, previous_count, new_count, actor_id)
    VALUES (_user_id, v_session, v_subject, 'counter.reset', _exam_id, v_prev, 0, auth.uid());
  END IF;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_attendance_reset_on_participation(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_attendance_reset_on_participation(uuid, uuid) TO authenticated, service_role;


-- 2. Start / resume an attempt -----------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_start_or_resume_attempt(
  _exam_id             uuid,
  _user_id             uuid,
  _duration_minutes    int,
  _randomize_questions boolean,
  _randomize_options   boolean
) RETURNS TABLE (attempt_id uuid, resumed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_attempt  uuid;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('exam_batch:start:' || _exam_id::text || ':' || _user_id::text));

  SELECT a.id INTO v_existing
    FROM public.exam_batch_attempts a
   WHERE a.exam_id = _exam_id AND a.user_id = _user_id AND a.status = 'in_progress'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, true;
    RETURN;
  END IF;

  INSERT INTO public.exam_batch_attempts(exam_id, user_id, status, started_at, expected_finish_at)
  VALUES (_exam_id, _user_id, 'in_progress', now(),
          now() + make_interval(mins => _duration_minutes))
  RETURNING id INTO v_attempt;

  INSERT INTO public.exam_batch_attempt_question_order(attempt_id, position, question_id, option_order)
  SELECT
    v_attempt,
    row_number() OVER (
      ORDER BY CASE WHEN _randomize_questions THEN random() ELSE eq.position END
    ) - 1,
    eq.question_id,
    (
      SELECT CASE WHEN _randomize_options
        THEN (SELECT array_agg(i ORDER BY random())
                FROM generate_series(0, COALESCE(jsonb_array_length(q.options),0) - 1) i)
        ELSE (SELECT array_agg(i ORDER BY i)
                FROM generate_series(0, COALESCE(jsonb_array_length(q.options),0) - 1) i)
      END
      FROM public.exam_batch_questions_v q WHERE q.id = eq.question_id
    )
  FROM public.exam_batch_exam_questions eq
  WHERE eq.exam_id = _exam_id;

  PERFORM public.exam_batch_attendance_reset_on_participation(_user_id, _exam_id);

  RETURN QUERY SELECT v_attempt, false;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) TO authenticated, service_role;


-- 3. Submit attempt (first-write-wins) ---------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_submit_attempt(
  _attempt_id uuid,
  _user_id    uuid,
  _reason     text
) RETURNS TABLE (id uuid, status text, submitted_at timestamptz, submit_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  CASE _reason
    WHEN 'manual'  THEN v_status := 'submitted';
    WHEN 'auto'    THEN v_status := 'auto_submitted';
    WHEN 'timeout' THEN v_status := 'timed_out';
    WHEN 'admin'   THEN v_status := 'admin_closed';
    ELSE RAISE EXCEPTION 'invalid submit reason %', _reason USING ERRCODE = '22023';
  END CASE;

  RETURN QUERY
  UPDATE public.exam_batch_attempts a
     SET status        = v_status,
         submitted_at  = COALESCE(a.submitted_at, now()),
         submit_reason = COALESCE(a.submit_reason, _reason),
         updated_at    = now()
   WHERE a.id = _attempt_id
     AND a.user_id = _user_id
     AND a.status  = 'in_progress'
  RETURNING a.id, a.status, a.submitted_at, a.submit_reason;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_submit_attempt(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_submit_attempt(uuid, uuid, text) TO authenticated, service_role;


-- 4. Admin force-close all in-progress attempts of an exam -------------
CREATE OR REPLACE FUNCTION public.exam_batch_close_exam_attempts(
  _exam_id uuid,
  _reason  text DEFAULT 'admin'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exam_batch_attempts a
     SET status        = 'admin_closed',
         submitted_at  = COALESCE(a.submitted_at, now()),
         submit_reason = COALESCE(a.submit_reason, _reason),
         updated_at    = now()
   WHERE a.exam_id = _exam_id AND a.status = 'in_progress';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.exam_batch_exams
     SET force_closed_at = COALESCE(force_closed_at, now()),
         updated_at      = now()
   WHERE id = _exam_id;

  RETURN v_count;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_close_exam_attempts(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_close_exam_attempts(uuid, text) TO authenticated, service_role;


-- 5. Score attempt (idempotent) ----------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_score_attempt(_attempt_id uuid)
RETURNS public.exam_batch_attempt_results
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_att      public.exam_batch_attempts%ROWTYPE;
  v_exam     public.exam_batch_exams%ROWTYPE;
  v_correct  int := 0;
  v_wrong    int := 0;
  v_skipped  int := 0;
  v_total    int := 0;
  v_marks    numeric(10,2);
  v_max      numeric(10,2);
  v_pct      numeric(6,2);
  v_time_s   int;
  v_dur_s    int;
  v_student  int;
  v_result   public.exam_batch_attempt_results;
BEGIN
  SELECT * INTO v_att FROM public.exam_batch_attempts WHERE id = _attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt % not found', _attempt_id; END IF;
  IF v_att.status = 'in_progress' THEN
    RAISE EXCEPTION 'cannot score in-progress attempt' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_exam FROM public.exam_batch_exams WHERE id = v_att.exam_id;

  BEGIN
    SELECT
      COUNT(*) FILTER (
        WHERE ans.selected_display_index IS NOT NULL
          AND (qo.option_order[ans.selected_display_index + 1])::text = COALESCE(
            (to_jsonb(q)->>'correct_option'),
            (to_jsonb(q)->>'answer'),
            (to_jsonb(q)->>'correct_answer'))
      ),
      COUNT(*) FILTER (
        WHERE ans.selected_display_index IS NOT NULL
          AND (qo.option_order[ans.selected_display_index + 1])::text <> COALESCE(
            (to_jsonb(q)->>'correct_option'),
            (to_jsonb(q)->>'answer'),
            (to_jsonb(q)->>'correct_answer'))
      ),
      COUNT(*) FILTER (WHERE ans.selected_display_index IS NULL OR ans.attempt_id IS NULL),
      COUNT(*)
    INTO v_correct, v_wrong, v_skipped, v_total
    FROM public.exam_batch_attempt_question_order qo
    LEFT JOIN public.exam_batch_attempt_answers ans
           ON ans.attempt_id = qo.attempt_id AND ans.question_id = qo.question_id
    LEFT JOIN public.exam_batch_questions_v q ON q.id = qo.question_id
    WHERE qo.attempt_id = _attempt_id;
  EXCEPTION WHEN OTHERS THEN
    -- Defensive fallback: total counted, everything skipped.
    SELECT COUNT(*) INTO v_total FROM public.exam_batch_attempt_question_order WHERE attempt_id = _attempt_id;
    v_correct := 0; v_wrong := 0; v_skipped := v_total;
  END;

  v_marks := v_correct * v_exam.mark_per_correct - v_wrong * v_exam.mark_per_wrong;
  v_max   := v_total   * v_exam.mark_per_correct;
  v_pct   := CASE WHEN v_max > 0 THEN ROUND((v_marks / v_max) * 100, 2) ELSE 0 END;
  v_pct   := GREATEST(0, LEAST(100, v_pct));
  v_dur_s := v_exam.duration_minutes * 60;
  v_time_s := GREATEST(0, EXTRACT(EPOCH FROM
              (LEAST(COALESCE(v_att.submitted_at, now()), v_att.expected_finish_at) - v_att.started_at))::int);

  SELECT e.student_id INTO v_student
    FROM public.exam_batch_enrollments e
   WHERE e.user_id = v_att.user_id AND e.session_id = v_exam.session_id
   LIMIT 1;

  INSERT INTO public.exam_batch_attempt_results (
    attempt_id, exam_id, user_id, student_id,
    correct, wrong, skipped, total_questions,
    marks, max_marks, percentage,
    time_used_seconds, duration_seconds, submitted_at, scored_at
  ) VALUES (
    _attempt_id, v_att.exam_id, v_att.user_id, v_student,
    v_correct, v_wrong, v_skipped, v_total,
    v_marks, v_max, v_pct,
    v_time_s, v_dur_s, v_att.submitted_at, now()
  )
  ON CONFLICT (attempt_id) DO UPDATE SET
    exam_id           = EXCLUDED.exam_id,
    user_id           = EXCLUDED.user_id,
    student_id        = EXCLUDED.student_id,
    correct           = EXCLUDED.correct,
    wrong             = EXCLUDED.wrong,
    skipped           = EXCLUDED.skipped,
    total_questions   = EXCLUDED.total_questions,
    marks             = EXCLUDED.marks,
    max_marks         = EXCLUDED.max_marks,
    percentage        = EXCLUDED.percentage,
    time_used_seconds = EXCLUDED.time_used_seconds,
    duration_seconds  = EXCLUDED.duration_seconds,
    submitted_at      = EXCLUDED.submitted_at
    -- scored_at intentionally NOT updated (immutable)
  RETURNING * INTO v_result;

  RETURN v_result;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_score_attempt(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_score_attempt(uuid) TO authenticated, service_role;


-- 6. Generate frozen leaderboard --------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_generate_leaderboard(
  _exam_id uuid,
  _force   boolean DEFAULT false
) RETURNS public.exam_batch_leaderboards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_exam public.exam_batch_exams%ROWTYPE;
  v_lb   public.exam_batch_leaderboards;
  v_now  timestamptz := now();
BEGIN
  SELECT * INTO v_exam FROM public.exam_batch_exams WHERE id = _exam_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'exam % not found', _exam_id; END IF;

  IF NOT _force AND v_now < v_exam.window_end THEN
    INSERT INTO public.exam_batch_leaderboards (exam_id, session_id, status)
    VALUES (_exam_id, v_exam.session_id, 'pending')
    ON CONFLICT (exam_id) DO NOTHING;
    SELECT * INTO v_lb FROM public.exam_batch_leaderboards WHERE exam_id = _exam_id;
    RETURN v_lb;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('exam_batch:leaderboard:' || _exam_id::text));

  PERFORM public.exam_batch_score_attempt(a.id)
    FROM public.exam_batch_attempts a
    LEFT JOIN public.exam_batch_attempt_results r ON r.attempt_id = a.id
   WHERE a.exam_id = _exam_id
     AND a.status IN ('submitted','auto_submitted','timed_out','admin_closed')
     AND r.attempt_id IS NULL;

  DELETE FROM public.exam_batch_leaderboard_entries WHERE exam_id = _exam_id;

  INSERT INTO public.exam_batch_leaderboards (exam_id, session_id, status, generated_at, frozen_at, entry_count, version)
  VALUES (_exam_id, v_exam.session_id, 'frozen', v_now, v_now, 0, 1)
  ON CONFLICT (exam_id) DO UPDATE SET
    status       = 'frozen',
    generated_at = v_now,
    frozen_at    = COALESCE(public.exam_batch_leaderboards.frozen_at, v_now),
    version      = public.exam_batch_leaderboards.version + 1;

  INSERT INTO public.exam_batch_leaderboard_entries (
    exam_id, attempt_id, user_id, student_id, rank,
    marks, max_marks, percentage, correct, wrong, skipped,
    time_used_seconds, submitted_at
  )
  SELECT
    r.exam_id, r.attempt_id, r.user_id, r.student_id,
    row_number() OVER (
      ORDER BY r.marks DESC,
               r.time_used_seconds ASC,
               r.submitted_at ASC,
               COALESCE(r.student_id, 2147483647) ASC),
    r.marks, r.max_marks, r.percentage,
    r.correct, r.wrong, r.skipped, r.time_used_seconds, r.submitted_at
  FROM public.exam_batch_attempt_results r
  WHERE r.exam_id = _exam_id;

  UPDATE public.exam_batch_leaderboards
     SET entry_count = (SELECT COUNT(*) FROM public.exam_batch_leaderboard_entries WHERE exam_id = _exam_id)
   WHERE exam_id = _exam_id
  RETURNING * INTO v_lb;

  RETURN v_lb;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_generate_leaderboard(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_generate_leaderboard(uuid, boolean) TO authenticated, service_role;


-- 7. Recompute progress summaries -------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_recompute_progress(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w      record;
  v_from timestamptz;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR w IN
    SELECT * FROM (VALUES ('daily',1),('weekly',7),('30d',30)) AS t(label,days)
  LOOP
    v_from := now() - make_interval(days => w.days);

    INSERT INTO public.exam_batch_progress_summaries AS p (
      user_id, time_window,
      exams_scheduled, exams_attended, exams_submitted,
      avg_marks, avg_percentage, highest_percentage, lowest_percentage,
      total_correct, total_wrong, total_skipped, updated_at)
    SELECT
      _user_id, w.label,
      COALESCE((SELECT COUNT(*) FROM public.exam_batch_exams e
                  JOIN public.exam_batch_enrollments en
                    ON en.session_id = e.session_id AND en.user_id = _user_id AND en.status='approved'
                 WHERE e.window_start >= v_from AND e.is_published AND NOT e.is_hidden AND NOT e.is_archived), 0),
      COUNT(*),
      COUNT(*) FILTER (WHERE r.submitted_at IS NOT NULL),
      COALESCE(AVG(r.marks), 0),
      COALESCE(AVG(r.percentage), 0),
      COALESCE(MAX(r.percentage), 0),
      COALESCE(MIN(r.percentage), 0),
      COALESCE(SUM(r.correct), 0),
      COALESCE(SUM(r.wrong), 0),
      COALESCE(SUM(r.skipped), 0),
      now()
    FROM public.exam_batch_attempt_results r
    WHERE r.user_id = _user_id AND r.scored_at >= v_from
    ON CONFLICT (user_id, time_window) DO UPDATE SET
      exams_scheduled    = EXCLUDED.exams_scheduled,
      exams_attended     = EXCLUDED.exams_attended,
      exams_submitted    = EXCLUDED.exams_submitted,
      avg_marks          = EXCLUDED.avg_marks,
      avg_percentage     = EXCLUDED.avg_percentage,
      highest_percentage = EXCLUDED.highest_percentage,
      lowest_percentage  = EXCLUDED.lowest_percentage,
      total_correct      = EXCLUDED.total_correct,
      total_wrong        = EXCLUDED.total_wrong,
      total_skipped      = EXCLUDED.total_skipped,
      updated_at         = now();
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_recompute_progress(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_recompute_progress(uuid) TO authenticated, service_role;


-- 8. Generate analytics snapshot --------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_generate_analytics(_scope_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
  v_kind    text;
  v_id      uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _scope_key = 'global' THEN
    v_kind := 'global';
  ELSIF _scope_key LIKE 'session:%' THEN
    v_kind := 'session';
    v_id   := substr(_scope_key, 9)::uuid;
  ELSIF _scope_key LIKE 'exam:%' THEN
    v_kind := 'exam';
    v_id   := substr(_scope_key, 6)::uuid;
  ELSE
    RAISE EXCEPTION 'invalid scope_key %', _scope_key USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'scope', v_kind,
    'id', v_id,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'attempts',    COUNT(*),
      'avg_marks',   COALESCE(AVG(r.marks), 0),
      'avg_percent', COALESCE(AVG(r.percentage), 0),
      'max_percent', COALESCE(MAX(r.percentage), 0),
      'min_percent', COALESCE(MIN(r.percentage), 0)))
  INTO v_payload
  FROM public.exam_batch_attempt_results r
  LEFT JOIN public.exam_batch_exams e ON e.id = r.exam_id
  WHERE (v_kind = 'global')
     OR (v_kind = 'session' AND e.session_id = v_id)
     OR (v_kind = 'exam'    AND r.exam_id   = v_id);

  INSERT INTO public.exam_batch_analytics_snapshots (scope_key, payload, generated_at)
  VALUES (_scope_key, COALESCE(v_payload, '{}'::jsonb), now())
  ON CONFLICT (scope_key) DO UPDATE SET
    payload      = EXCLUDED.payload,
    generated_at = EXCLUDED.generated_at;

  RETURN COALESCE(v_payload, '{}'::jsonb);
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_generate_analytics(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_generate_analytics(text) TO authenticated, service_role;


-- 9. Replace comment rules (atomic) -----------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_replace_comment_rules(_rules jsonb)
RETURNS SETOF public.exam_batch_comment_rules
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.exam_batch_comment_rules;

  RETURN QUERY
  INSERT INTO public.exam_batch_comment_rules (min_percent, max_percent, label, message, sort_order)
  SELECT
    (r->>'min_percent')::numeric,
    (r->>'max_percent')::numeric,
    r->>'label',
    r->>'message',
    COALESCE((r->>'sort_order')::int, 0)
  FROM jsonb_array_elements(COALESCE(_rules, '[]'::jsonb)) r
  RETURNING *;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_replace_comment_rules(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_replace_comment_rules(jsonb) TO authenticated, service_role;


-- 11. Attendance — sweep one exam (auto-ban engine) --------------------
CREATE OR REPLACE FUNCTION public.exam_batch_attendance_process_exam(_exam_id uuid)
RETURNS TABLE (processed int, auto_banned int, reset int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_exam       public.exam_batch_exams%ROWTYPE;
  v_settings   jsonb;
  v_limit      int;
  v_auto       boolean;
  v_processed  int := 0;
  v_banned     int := 0;
  v_reset      int := 0;
  v_row        record;
  v_prev       int;
  v_new        int;
  v_should_ban boolean;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Serialise concurrent sweeps of the same exam so counters can't double-increment.
  PERFORM pg_advisory_xact_lock(hashtext('exam_batch:attendance:' || _exam_id::text));

  SELECT * INTO v_exam FROM public.exam_batch_exams WHERE id = _exam_id;
  IF NOT FOUND
     OR NOT v_exam.is_published
     OR v_exam.is_hidden
     OR v_exam.is_archived
     OR v_exam.status <> 'active'
     OR now() <= v_exam.window_end THEN
    RETURN QUERY SELECT 0,0,0;
    RETURN;
  END IF;

  SELECT COALESCE(value->'attendance', '{}'::jsonb) INTO v_settings
    FROM public.exam_batch_settings WHERE id = 'singleton';
  v_limit := COALESCE((v_settings->>'consecutiveMissLimit')::int, 0);
  v_auto  := COALESCE((v_settings->>'autoBanEnabled')::boolean, false);

  FOR v_row IN
    INSERT INTO public.exam_batch_attendance_processed (user_id, session_id, subject_id, exam_id)
    SELECT e.user_id, v_exam.session_id, v_exam.subject_id, _exam_id
      FROM public.exam_batch_enrollments e
     WHERE e.session_id = v_exam.session_id
       AND e.status     = 'approved'
       AND e.removed    = false
       AND EXISTS (
             SELECT 1 FROM public.exam_batch_enrollment_subjects es
              WHERE es.enrollment_id = e.id AND es.subject_id = v_exam.subject_id)
       AND NOT EXISTS (
             SELECT 1 FROM public.exam_batch_attempts a
              WHERE a.exam_id = _exam_id AND a.user_id = e.user_id)
    ON CONFLICT (user_id, session_id, subject_id, exam_id) DO NOTHING
    RETURNING user_id
  LOOP
    v_processed := v_processed + 1;

    SELECT consecutive_missed_count INTO v_prev
      FROM public.exam_batch_attendance_state
     WHERE user_id = v_row.user_id AND session_id = v_exam.session_id AND subject_id = v_exam.subject_id;
    v_new := COALESCE(v_prev, 0) + 1;

    v_should_ban := v_auto AND v_limit > 0 AND v_new >= v_limit;

    INSERT INTO public.exam_batch_attendance_state (
      user_id, session_id, subject_id,
      consecutive_missed_count, last_missed_exam_id, last_missed_at,
      banned, banned_at, banned_reason, auto_banned, updated_at)
    VALUES (
      v_row.user_id, v_exam.session_id, v_exam.subject_id,
      v_new, _exam_id, now(),
      v_should_ban, CASE WHEN v_should_ban THEN now() END,
      CASE WHEN v_should_ban THEN 'Auto-ban: consecutive missed exams' END,
      v_should_ban, now())
    ON CONFLICT (user_id, session_id, subject_id) DO UPDATE SET
      consecutive_missed_count = v_new,
      last_missed_exam_id      = _exam_id,
      last_missed_at           = now(),
      banned                   = public.exam_batch_attendance_state.banned OR v_should_ban,
      banned_at                = COALESCE(public.exam_batch_attendance_state.banned_at,
                                          CASE WHEN v_should_ban THEN now() END),
      banned_reason            = COALESCE(public.exam_batch_attendance_state.banned_reason,
                                          CASE WHEN v_should_ban THEN 'Auto-ban: consecutive missed exams' END),
      auto_banned              = public.exam_batch_attendance_state.auto_banned OR v_should_ban,
      updated_at               = now();

    INSERT INTO public.exam_batch_attendance_events (
      user_id, session_id, subject_id, kind, exam_id, previous_count, new_count)
    VALUES (v_row.user_id, v_exam.session_id, v_exam.subject_id, 'missed', _exam_id, v_prev, v_new);

    IF v_should_ban AND (v_prev IS NULL OR v_prev < v_limit) THEN
      v_banned := v_banned + 1;
      INSERT INTO public.exam_batch_attendance_events (
        user_id, session_id, subject_id, kind, exam_id, previous_count, new_count, reason)
      VALUES (v_row.user_id, v_exam.session_id, v_exam.subject_id, 'auto_ban', _exam_id, v_prev, v_new,
              'Auto-ban: consecutive missed exams');
      INSERT INTO public.exam_batch_ban_history (
        user_id, session_id, subject_id, ban_type, action, reason)
      VALUES (v_row.user_id, v_exam.session_id, v_exam.subject_id, 'auto', 'ban',
              'Auto-ban: consecutive missed exams');
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_banned, v_reset;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_attendance_process_exam(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_attendance_process_exam(uuid) TO authenticated, service_role;


-- 12. Attendance — manual ban ------------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_attendance_manual_ban(
  _user_id    uuid,
  _session_id uuid,
  _subject_id uuid,
  _reason     text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.exam_batch_attendance_state (
    user_id, session_id, subject_id, banned, banned_at, banned_reason, banned_by, auto_banned, updated_at)
  VALUES (_user_id, _session_id, _subject_id, true, now(), _reason, auth.uid(), false, now())
  ON CONFLICT (user_id, session_id, subject_id) DO UPDATE SET
    banned        = true,
    banned_at     = COALESCE(public.exam_batch_attendance_state.banned_at, now()),
    banned_reason = _reason,
    banned_by     = auth.uid(),
    auto_banned   = false,
    updated_at    = now();

  INSERT INTO public.exam_batch_attendance_events (
    user_id, session_id, subject_id, kind, reason, actor_id)
  VALUES (_user_id, _session_id, _subject_id, 'manual_ban', _reason, auth.uid());

  INSERT INTO public.exam_batch_ban_history (
    user_id, session_id, subject_id, ban_type, action, reason, actor_id)
  VALUES (_user_id, _session_id, _subject_id, 'manual', 'ban', _reason, auth.uid());
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_attendance_manual_ban(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_attendance_manual_ban(uuid, uuid, uuid, text) TO authenticated, service_role;


-- 13. Attendance — manual unban ---------------------------------------
CREATE OR REPLACE FUNCTION public.exam_batch_attendance_manual_unban(
  _user_id       uuid,
  _session_id    uuid,
  _subject_id    uuid,
  _reason        text,
  _reset_counter boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.exam_batch_attendance_state
     SET banned                   = false,
         banned_at                = NULL,
         banned_reason            = NULL,
         banned_by                = NULL,
         auto_banned              = false,
         consecutive_missed_count = CASE WHEN _reset_counter THEN 0
                                          ELSE consecutive_missed_count END,
         updated_at               = now()
   WHERE user_id = _user_id AND session_id = _session_id AND subject_id = _subject_id;

  INSERT INTO public.exam_batch_attendance_events (
    user_id, session_id, subject_id, kind, reason, actor_id)
  VALUES (_user_id, _session_id, _subject_id, 'manual_unban', _reason, auth.uid());

  IF _reset_counter THEN
    INSERT INTO public.exam_batch_attendance_events (
      user_id, session_id, subject_id, kind, new_count, actor_id, reason)
    VALUES (_user_id, _session_id, _subject_id, 'counter.reset', 0, auth.uid(), _reason);
  END IF;

  INSERT INTO public.exam_batch_ban_history (
    user_id, session_id, subject_id, ban_type, action, reason, actor_id)
  VALUES (_user_id, _session_id, _subject_id, 'manual', 'unban', _reason, auth.uid());
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_attendance_manual_unban(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_attendance_manual_unban(uuid, uuid, uuid, text, boolean) TO authenticated, service_role;


-- =====================================================================
-- END exam_batch module migration
-- =====================================================================

-- ============================================================================
-- Realtime publication
-- ============================================================================
-- Exam Batch — full realtime publication + REPLICA IDENTITY.
--
-- Makes Admin ⇄ Student sync work in real time for session/batch and exam
-- CREATE / UPDATE / DELETE / publish / unpublish / archive operations.
-- Idempotent and safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'exam_batches',
    'exam_batch_settings',
    'exam_batch_sessions',
    'exam_batch_session_subjects',
    'exam_batch_subjects',
    'exam_batch_chapters',
    'exam_batch_levels',
    'exam_batch_mcqs',
    'exam_batch_exams',
    'exam_batch_exam_questions',
    'exam_batch_enrollments',
    'exam_batch_enrollment_subjects',
    'exam_batch_attempts',
    'exam_batch_attempt_question_order',
    'exam_batch_attempt_answers',
    'exam_batch_attempt_results',
    'exam_batch_leaderboards',
    'exam_batch_leaderboard_entries',
    'exam_batch_progress_summaries',
    'exam_batch_analytics_snapshots',
    'exam_batch_attendance_state',
    'exam_batch_attendance_processed',
    'exam_batch_attendance_events',
    'exam_batch_ban_history',
    'exam_batch_comment_rules',
    'exam_batch_download_history',
    'exam_batch_notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;


-- ============================================================================
-- ============================================================================
-- LATEST FEATURE MERGES (audited against supabase/manual_apply/*exam_batch*)
-- Appended by production audit — idempotent, safe to re-run on live DB.
-- Each block preserves original migration name for traceability.
-- Order matches chronological migration timestamps.
-- ============================================================================
-- ============================================================================

-- ============================================================================
-- Merged migration: 20260712_exam_batch_enrollment_status_ext
-- ============================================================================
-- Extends exam_batch_enrollments status set with 'banned' and adds an
-- atomic admin RPC to move an enrollment between any of the four states
-- (pending / approved / rejected / banned). Approving a not-yet-numbered
-- enrollment still assigns a permanent student_id via the same sequence.

BEGIN;

-- 1) Relax the CHECK to allow 'banned'.
ALTER TABLE public.exam_batch_enrollments
  DROP CONSTRAINT IF EXISTS exam_batch_enrollments_status_check;

ALTER TABLE public.exam_batch_enrollments
  ADD CONSTRAINT exam_batch_enrollments_status_check
  CHECK (status IN ('pending','approved','rejected','banned'));

-- 2) Universal status transition RPC.
CREATE OR REPLACE FUNCTION public.exam_batch_set_enrollment_status(
  _enrollment_id uuid,
  _status        text,
  _reviewer      uuid,
  _notes         text DEFAULT NULL
) RETURNS TABLE (id uuid, student_id int, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    _reviewer := auth.uid();
  END IF;
  IF _reviewer IS NULL OR NOT public.has_permission(_reviewer, 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('pending','approved','rejected','banned') THEN
    RAISE EXCEPTION 'invalid_status:%', _status USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.exam_batch_enrollments e
     SET status      = _status,
         student_id  = CASE
                         WHEN _status = 'approved'
                           THEN COALESCE(e.student_id,
                                         nextval('public.exam_batch_student_id_seq')::int)
                         ELSE e.student_id
                       END,
         reviewed_by = _reviewer,
         reviewed_at = now(),
         notes       = COALESCE(_notes, e.notes),
         updated_at  = now()
   WHERE e.id = _enrollment_id
  RETURNING e.id, e.student_id, e.status;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_set_enrollment_status(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_set_enrollment_status(uuid, text, uuid, text) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- Merged migration: 20260713_exam_batch_independent_academic_and_mcqs
-- ============================================================================
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
-- Historical seed — only runs when the legacy Global Academic tables
-- still exist (production upgrade path). On a fresh database these
-- tables are absent and the block is skipped cleanly.
DO $seed$
BEGIN
  IF to_regclass('public.levels') IS NOT NULL THEN
    INSERT INTO public.exam_batch_levels
      (code, name, description, color, icon, sort_order, status)
    SELECT code, name, description, color, icon, sort_order, status::text
    FROM public.levels
    ON CONFLICT (code) DO NOTHING;
  END IF;

  IF to_regclass('public.subjects') IS NOT NULL THEN
    INSERT INTO public.exam_batch_subjects
      (id, name, slug, level, description, color, icon, sort_order, status)
    SELECT id, name, slug, level, description, color, icon, sort_order, status::text
    FROM public.subjects
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('public.chapters') IS NOT NULL THEN
    INSERT INTO public.exam_batch_chapters
      (id, subject_id, name, slug, description, sort_order, status)
    SELECT id, subject_id, name, slug, description, sort_order, status::text
    FROM public.chapters
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF to_regclass('public.mcqs') IS NOT NULL
     AND to_regclass('public.chapters') IS NOT NULL
     AND to_regclass('public.subjects') IS NOT NULL THEN
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
  END IF;
END $seed$;


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

-- ============================================================================
-- Merged migration: 20260714_exam_batch_realtime_publication
-- ============================================================================
-- 20260714 — Enable Supabase Realtime replication for Exam Batch tables.
--
-- Idempotent: each ALTER PUBLICATION is guarded by a check against
-- pg_publication_tables so re-runs are safe. Only exam_batch_* tables are
-- touched — the rest of the app is unaffected.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'exam_batch_settings',
    'exam_batch_sessions',
    'exam_batch_subjects',
    'exam_batch_chapters',
    'exam_batch_levels',
    'exam_batch_mcqs',
    'exam_batch_exams',
    'exam_batch_exam_questions',
    'exam_batch_enrollments',
    'exam_batch_enrollment_subjects',
    'exam_batch_session_subjects',
    'exam_batch_attempts',
    'exam_batch_attempt_question_order',
    'exam_batch_attempt_answers',
    'exam_batch_attempt_results',
    'exam_batch_leaderboards',
    'exam_batch_leaderboard_entries',
    'exam_batch_progress_summaries',
    'exam_batch_analytics_snapshots',
    'exam_batch_attendance_state',
    'exam_batch_attendance_events',
    'exam_batch_comment_rules',
    'exam_batch_download_history',
    'exam_batch_notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- skip tables that do not exist yet (notifications is optional)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- add to supabase_realtime publication if not already present
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;

    -- REPLICA IDENTITY FULL so DELETE / filtered events carry the full row
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

-- ============================================================================
-- Merged migration: 20260715_exam_batch_admin_user_contacts
-- ============================================================================
-- Exam Batch: safe admin-only lookup for student contact info.
--
-- `public.profiles` intentionally does NOT store `email` (email lives on
-- `auth.users`). Prior versions of `adminListExamBatchEnrollments` selected
-- `profiles.email`, which fails with PostgreSQL 42703 (undefined_column) and
-- causes the Student Management / Enrollment queue pages to render nothing.
--
-- This RPC joins `profiles` with `auth.users` behind a SECURITY DEFINER
-- boundary and is gated by the `manage_content` permission, so it exposes
-- the display_name + email that admins already see elsewhere without
-- loosening RLS on either base table.

CREATE OR REPLACE FUNCTION public.exam_batch_admin_user_contacts(_ids uuid[])
RETURNS TABLE (id uuid, display_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF((u.raw_user_meta_data->>'display_name'), ''),
      NULLIF((u.raw_user_meta_data->>'full_name'), ''),
      NULLIF((u.raw_user_meta_data->>'name'), ''),
      u.email
    )::text                                    AS display_name,
    u.email::text                              AS email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = ANY(_ids);
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_admin_user_contacts(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_admin_user_contacts(uuid[]) TO authenticated, service_role;
-- ============================================================================
-- Merged migration: 20260716_exam_batch_attendance_ban_duration
-- ============================================================================
-- Exam Batch: attendance ban duration + WhatsApp contact indexing.
--
-- Adds `banned_until` to the (user, session, subject) attendance state so a
-- manual OR automatic ban can be either permanent (NULL) or scheduled to
-- expire at a specific timestamp. The application layer treats any row
-- where `banned_until <= now()` as no longer banned, and the sweep RPC
-- below flips the flag durably.
--
-- Fully idempotent. Safe to re-run.

BEGIN;

ALTER TABLE public.exam_batch_attendance_state
  ADD COLUMN IF NOT EXISTS banned_until timestamptz;

CREATE INDEX IF NOT EXISTS exam_batch_attendance_state_ban_expiry_idx
  ON public.exam_batch_attendance_state(banned_until)
  WHERE banned = true AND banned_until IS NOT NULL;

-- Auto-expire any (session, subject) ban whose window has ended. Called
-- lazily by the server before reading state so a banned student who has
-- served their duration regains access without an admin action.
CREATE OR REPLACE FUNCTION public.exam_batch_attendance_expire_bans(_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.exam_batch_attendance_state s
     SET banned         = false,
         banned_at      = NULL,
         banned_reason  = NULL,
         banned_by      = NULL,
         banned_until   = NULL,
         auto_banned    = false,
         consecutive_missed_count = 0,
         updated_at     = now()
   WHERE s.banned = true
     AND s.banned_until IS NOT NULL
     AND s.banned_until <= now()
     AND (_user_id IS NULL OR s.user_id = _user_id);

  GET DIAGNOSTICS _updated = ROW_COUNT;

  IF _updated > 0 THEN
    INSERT INTO public.exam_batch_attendance_events
      (user_id, session_id, subject_id, kind, previous_count, new_count, reason, actor_id)
    SELECT s.user_id, s.session_id, s.subject_id, 'manual_unban', 0, 0,
           'auto: ban expired', NULL
      FROM public.exam_batch_attendance_state s
     WHERE s.banned = false
       AND s.updated_at >= now() - interval '5 seconds'
       AND (_user_id IS NULL OR s.user_id = _user_id);
  END IF;

  RETURN _updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exam_batch_attendance_expire_bans(uuid) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- Merged migration: 20260716_exam_batch_student_id_reuse
-- ============================================================================
-- Smart Student ID reuse.
--
-- Previously we assigned student_id via nextval() on a monotonic sequence,
-- so removing an approved student left a permanent gap. This migration
-- introduces exam_batch_next_student_id(): a race-safe allocator that
-- always returns the LOWEST unused integer >= 1001. If no gaps exist it
-- falls back to advancing the sequence.
--
-- Concurrency:
--   • A transaction-scoped advisory lock serializes concurrent approvals,
--     so bulk approvals cannot hand out duplicate IDs.
--   • The UNIQUE index on exam_batch_enrollments.student_id (assumed;
--     enforced by application logic + this migration adds it explicitly
--     if missing) is the final safety net.

BEGIN;

-- Enforce uniqueness at the DB level so any race outside the allocator
-- fails loudly instead of silently duplicating IDs.
CREATE UNIQUE INDEX IF NOT EXISTS exam_batch_enrollments_student_id_uidx
  ON public.exam_batch_enrollments (student_id)
  WHERE student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.exam_batch_next_student_id()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  next_id int;
  max_id  int;
BEGIN
  -- Serialize concurrent allocations for the duration of this txn.
  PERFORM pg_advisory_xact_lock(hashtext('exam_batch_student_id_alloc'));

  SELECT COALESCE(MAX(student_id), 1000) INTO max_id
    FROM public.exam_batch_enrollments
   WHERE student_id IS NOT NULL;

  -- Smallest gap in [1001 .. max_id + 1]. If no gap exists this yields
  -- max_id + 1, which is the next fresh ID.
  SELECT g.n INTO next_id
    FROM generate_series(1001, max_id + 1) AS g(n)
   WHERE NOT EXISTS (
           SELECT 1
             FROM public.exam_batch_enrollments e
            WHERE e.student_id = g.n
         )
   ORDER BY g.n
   LIMIT 1;

  -- Keep the legacy sequence in sync so anything still calling nextval()
  -- (or a future migration reverting to it) never regresses backwards.
  PERFORM setval('public.exam_batch_student_id_seq', GREATEST(next_id, 1001), true);

  RETURN next_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_next_student_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_next_student_id() TO authenticated, service_role;


-- Rewire the two allocator sites to use the gap-filling function.

CREATE OR REPLACE FUNCTION public.exam_batch_approve_enrollments(
  _enrollment_ids uuid[],
  _reviewer       uuid
) RETURNS TABLE (id uuid, student_id int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec   record;
  new_id int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    _reviewer := auth.uid();
  END IF;
  IF _reviewer IS NULL OR NOT public.has_permission(_reviewer, 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Iterate so each new student_id is allocated fresh (lowest gap first).
  -- The advisory lock inside exam_batch_next_student_id() serializes the
  -- allocation, and FOR UPDATE prevents a concurrent txn from approving
  -- the same row twice.
  FOR rec IN
    SELECT e.id, e.student_id
      FROM public.exam_batch_enrollments e
     WHERE e.id = ANY(_enrollment_ids)
       AND e.status = 'pending'
     ORDER BY e.created_at
     FOR UPDATE
  LOOP
    IF rec.student_id IS NULL THEN
      new_id := public.exam_batch_next_student_id();
    ELSE
      new_id := rec.student_id;
    END IF;

    UPDATE public.exam_batch_enrollments e
       SET status      = 'approved',
           student_id  = new_id,
           reviewed_by = _reviewer,
           reviewed_at = now(),
           updated_at  = now()
     WHERE e.id = rec.id;

    id := rec.id;
    student_id := new_id;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_approve_enrollments(uuid[], uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_approve_enrollments(uuid[], uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.exam_batch_set_enrollment_status(
  _enrollment_id uuid,
  _status        text,
  _reviewer      uuid,
  _notes         text DEFAULT NULL
) RETURNS TABLE (id uuid, student_id int, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur_student_id int;
  new_id         int;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    _reviewer := auth.uid();
  END IF;
  IF _reviewer IS NULL OR NOT public.has_permission(_reviewer, 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('pending','approved','rejected','banned') THEN
    RAISE EXCEPTION 'invalid_status:%', _status USING ERRCODE = '22023';
  END IF;

  SELECT e.student_id INTO cur_student_id
    FROM public.exam_batch_enrollments e
   WHERE e.id = _enrollment_id
   FOR UPDATE;

  IF _status = 'approved' AND cur_student_id IS NULL THEN
    new_id := public.exam_batch_next_student_id();
  ELSE
    new_id := cur_student_id;
  END IF;

  RETURN QUERY
  UPDATE public.exam_batch_enrollments e
     SET status      = _status,
         student_id  = new_id,
         reviewed_by = _reviewer,
         reviewed_at = now(),
         notes       = COALESCE(_notes, e.notes),
         updated_at  = now()
   WHERE e.id = _enrollment_id
  RETURNING e.id, e.student_id, e.status;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_set_enrollment_status(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_set_enrollment_status(uuid, text, uuid, text) TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- Merged migration: 20260717_exam_batch_realtime_full_sync
-- ============================================================================
-- 20260717 — Exam Batch full realtime sync hardening.
--
-- Student pages refetch from normal RLS-protected server functions after a
-- realtime invalidation. This script makes sure every Exam Batch table can
-- emit INSERT / UPDATE / DELETE changes in production and that DELETE/filtered
-- UPDATE payloads carry the previous row via REPLICA IDENTITY FULL.
--
-- Idempotent and safe to re-run. It also includes `exam_batches` for legacy
-- deployments that used that singular table name before the module was split
-- into exam_batch_sessions + exam_batch_exams.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'exam_batches',
    'exam_batch_settings',
    'exam_batch_sessions',
    'exam_batch_session_subjects',
    'exam_batch_subjects',
    'exam_batch_chapters',
    'exam_batch_levels',
    'exam_batch_mcqs',
    'exam_batch_exams',
    'exam_batch_exam_questions',
    'exam_batch_enrollments',
    'exam_batch_enrollment_subjects',
    'exam_batch_attempts',
    'exam_batch_attempt_question_order',
    'exam_batch_attempt_answers',
    'exam_batch_attempt_results',
    'exam_batch_leaderboards',
    'exam_batch_leaderboard_entries',
    'exam_batch_progress_summaries',
    'exam_batch_analytics_snapshots',
    'exam_batch_attendance_state',
    'exam_batch_attendance_processed',
    'exam_batch_attendance_events',
    'exam_batch_ban_history',
    'exam_batch_comment_rules',
    'exam_batch_download_history',
    'exam_batch_notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
-- ============================================================================
-- Merged migration: 20260718_exam_batch_student_enrollment_atomicity
-- ============================================================================
-- Exam Batch — atomic student enrollment + missing owner RLS policies.
--
-- Root cause of "No enrolled subjects" after admin approval:
--   The student's enroll flow inserted subject links via the user's
--   Supabase client, but exam_batch_enrollment_subjects had no owner
--   INSERT policy. Depending on environment (RLS enabled vs. not) this
--   either silently dropped rows or hard-failed leaving orphan pending
--   rows. The exam listing then correctly returned [] because the
--   enrollment had zero subject links.
--
-- This migration:
--   1) Adds the missing owner INSERT / DELETE policies so the client
--      path can never silently drop rows.
--   2) Introduces an atomic SECURITY DEFINER RPC
--      exam_batch_enroll_session(_session_id, _subject_ids) that creates
--      the enrollment and its subject links in a single transaction.
--      Any error rolls back both sides — no partial state.
--   3) Backfills approved enrollments that somehow ended up with zero
--      subject links by attaching every published subject at the
--      session's level (best-effort recovery so approved students see
--      exams immediately). Safe idempotent upsert.

BEGIN;

-- 1) Owner RLS policies for exam_batch_enrollment_subjects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='exam_batch_enrollment_subjects'
       AND policyname='exam_batch_enrollment_subjects_own_insert'
  ) THEN
    CREATE POLICY exam_batch_enrollment_subjects_own_insert
      ON public.exam_batch_enrollment_subjects
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.exam_batch_enrollments e
         WHERE e.id = enrollment_id
           AND e.user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='exam_batch_enrollment_subjects'
       AND policyname='exam_batch_enrollment_subjects_own_delete'
  ) THEN
    CREATE POLICY exam_batch_enrollment_subjects_own_delete
      ON public.exam_batch_enrollment_subjects
      FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.exam_batch_enrollments e
         WHERE e.id = enrollment_id
           AND e.user_id = auth.uid()
           AND e.status = 'pending'
      ));
  END IF;

  -- Compensating-delete path in the enroll flow needs this.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='exam_batch_enrollments'
       AND policyname='exam_batch_enrollments_own_delete_pending'
  ) THEN
    CREATE POLICY exam_batch_enrollments_own_delete_pending
      ON public.exam_batch_enrollments
      FOR DELETE TO authenticated
      USING (user_id = auth.uid() AND status = 'pending');
  END IF;
END$$;

-- 2) Atomic enroll RPC — creates enrollment + subject links transactionally.
CREATE OR REPLACE FUNCTION public.exam_batch_enroll_session(
  _session_id  uuid,
  _subject_ids uuid[]
)
RETURNS TABLE (
  id           uuid,
  session_id   uuid,
  user_id      uuid,
  status       text,
  student_id   int,
  created_at   timestamptz,
  updated_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_session       record;
  v_valid_subjs   int;
  v_new_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF _subject_ids IS NULL OR array_length(_subject_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_subjects_selected' USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.level, s.status, s.registration_open, s.is_archived,
         s.is_hidden, s.registration_deadline
    INTO v_session
    FROM public.exam_batch_sessions s
   WHERE s.id = _session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_session.is_hidden OR v_session.is_archived
     OR v_session.status <> 'active'
     OR NOT v_session.registration_open
     OR (v_session.registration_deadline IS NOT NULL
         AND v_session.registration_deadline < now()) THEN
    RAISE EXCEPTION 'registration_closed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exam_batch_enrollments e
     WHERE e.session_id = _session_id AND e.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'already_enrolled' USING ERRCODE = '23505';
  END IF;

  -- Every submitted subject must exist AND belong to the session's level.
  SELECT COUNT(*) INTO v_valid_subjs
    FROM public.exam_batch_subjects s
   WHERE s.id = ANY(_subject_ids)
     AND s.level = v_session.level;

  IF v_valid_subjs <> array_length(_subject_ids, 1) THEN
    RAISE EXCEPTION 'invalid_subjects' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.exam_batch_enrollments (session_id, user_id, status, student_id)
       VALUES (_session_id, v_uid, 'pending', NULL)
    RETURNING public.exam_batch_enrollments.id INTO v_new_id;

  INSERT INTO public.exam_batch_enrollment_subjects (enrollment_id, subject_id, added_by)
  SELECT v_new_id, s, v_uid
    FROM unnest(_subject_ids) AS s;

  RETURN QUERY
  SELECT e.id, e.session_id, e.user_id, e.status, e.student_id,
         e.created_at, e.updated_at
    FROM public.exam_batch_enrollments e
   WHERE e.id = v_new_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_enroll_session(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_enroll_session(uuid, uuid[]) TO authenticated, service_role;

-- 3) Best-effort backfill for approved enrollments with zero subject links.
--    These users cannot see exams even though the admin approved them.
--    We attach every published subject at the session's level so approval
--    behaves as intended (the admin can trim later via Subject Manager).
INSERT INTO public.exam_batch_enrollment_subjects (enrollment_id, subject_id, added_by)
SELECT e.id, s.id, e.user_id
  FROM public.exam_batch_enrollments e
  JOIN public.exam_batch_sessions ses ON ses.id = e.session_id
  JOIN public.exam_batch_subjects s
    ON s.level = ses.level AND s.status = 'published'
 WHERE e.status = 'approved'
   AND NOT EXISTS (
     SELECT 1 FROM public.exam_batch_enrollment_subjects es
      WHERE es.enrollment_id = e.id
   )
ON CONFLICT (enrollment_id, subject_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- Merged migration: 20260720_exam_batch_progress_auto_recompute
-- ============================================================================
-- Auto-recompute the student progress summary whenever a scored attempt
-- result is inserted or updated. Keeps Progress Center statistics live
-- (in addition to the client-side realtime invalidation) and consistent
-- with the Result Page + Leaderboard, which read the same rows.
--
-- Idempotent: safe to re-apply.

CREATE OR REPLACE FUNCTION public.exam_batch_progress_after_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.exam_batch_recompute_progress(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the scoring write because a summary refresh had trouble.
    RAISE NOTICE 'exam_batch_progress_after_result: recompute failed for user %: %', NEW.user_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_batch_progress_after_result_ins
  ON public.exam_batch_attempt_results;
CREATE TRIGGER exam_batch_progress_after_result_ins
  AFTER INSERT OR UPDATE ON public.exam_batch_attempt_results
  FOR EACH ROW EXECUTE FUNCTION public.exam_batch_progress_after_result();

-- ============================================================================
-- Merged migration: 20260721_exam_batch_attempt_question_cap
-- ============================================================================
-- Ensure a student attempt receives exactly the admin-configured question count.
-- Cap the INSERT to `exam.total_questions` so an over-attached exam question
-- pool never inflates the student's Question Palette. Also enforces a stable
-- LIMIT ordering after randomisation.

CREATE OR REPLACE FUNCTION public.exam_batch_start_or_resume_attempt(
  _exam_id             uuid,
  _user_id             uuid,
  _duration_minutes    int,
  _randomize_questions boolean,
  _randomize_options   boolean
) RETURNS TABLE (attempt_id uuid, resumed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_attempt  uuid;
  v_total    int;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('exam_batch:start:' || _exam_id::text || ':' || _user_id::text));

  SELECT a.id INTO v_existing
    FROM public.exam_batch_attempts a
   WHERE a.exam_id = _exam_id AND a.user_id = _user_id AND a.status = 'in_progress'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, true;
    RETURN;
  END IF;

  SELECT total_questions INTO v_total FROM public.exam_batch_exams WHERE id = _exam_id;
  IF v_total IS NULL OR v_total <= 0 THEN v_total := 500; END IF;

  INSERT INTO public.exam_batch_attempts(exam_id, user_id, status, started_at, expected_finish_at)
  VALUES (_exam_id, _user_id, 'in_progress', now(),
          now() + make_interval(mins => _duration_minutes))
  RETURNING id INTO v_attempt;

  INSERT INTO public.exam_batch_attempt_question_order(attempt_id, position, question_id, option_order)
  SELECT
    v_attempt,
    (row_number() OVER ()) - 1,
    question_id,
    option_order
  FROM (
    SELECT
      eq.question_id,
      (
        SELECT CASE WHEN _randomize_options
          THEN (SELECT array_agg(i ORDER BY random())
                  FROM generate_series(0, COALESCE(jsonb_array_length(q.options),0) - 1) i)
          ELSE (SELECT array_agg(i ORDER BY i)
                  FROM generate_series(0, COALESCE(jsonb_array_length(q.options),0) - 1) i)
        END
        FROM public.exam_batch_questions_v q WHERE q.id = eq.question_id
      ) AS option_order
    FROM public.exam_batch_exam_questions eq
    WHERE eq.exam_id = _exam_id
    ORDER BY CASE WHEN _randomize_questions THEN random() ELSE eq.position::float END
    LIMIT v_total
  ) picked;

  PERFORM public.exam_batch_attendance_reset_on_participation(_user_id, _exam_id);

  RETURN QUERY SELECT v_attempt, false;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) TO authenticated, service_role;

-- ============================================================================
-- Merged migration: 20260722_exam_batch_auto_publish_leaderboard
-- ============================================================================
-- =============================================================================
-- Exam Batch — automatic leaderboard publishing
-- =============================================================================
-- Root cause fix: `exam_batch_generate_leaderboard` was only ever called by
-- (a) a student loading the leaderboard page after `window_end`, and
-- (b) admin's manual "Recalculate" button. As a result:
--   • A scheduled `window_end` with no student visit left the leaderboard in
--     the `pending` state forever.
--   • `adminForceCloseExamBatchExam` closed attempts but never froze the
--     board (fixed on the server-fn side in this same change).
--
-- This migration establishes a single source of truth for automatic freezing
-- inside the database itself, so no client refresh is ever required:
--
--   1) AFTER-UPDATE trigger on `exam_batch_attempts` — when an attempt lands
--      in a terminal status AND the exam window has already ended (or the
--      exam was force-closed), publish the leaderboard right there in the
--      same transaction. Handles the "last student submits at 23:59:59" edge
--      case and the "admin force-closes mid-exam" flow.
--
--   2) AFTER-UPDATE trigger on `exam_batch_exams` — when `force_closed_at`
--      transitions from NULL → NOT NULL, publish immediately.
--
--   3) `exam_batch_freeze_ended_leaderboards()` — an idempotent sweep function
--      + pg_cron schedule (every minute) that freezes any exam whose window
--      has ended without a frozen leaderboard yet. Covers the "0 students
--      participated" and "no one opens the app after window_end" scenarios.
--
-- Every path funnels into the existing `exam_batch_generate_leaderboard` RPC,
-- which already holds a transactional advisory lock, so duplicate freezes are
-- impossible even under simultaneous submissions.
-- =============================================================================

set search_path = public;

-- 1) Trigger on exam_batch_attempts ------------------------------------------
create or replace function public.exam_batch_attempt_after_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_end     timestamptz;
  v_force_closed   timestamptz;
  v_status         text;
begin
  -- Only fire when the row transitions INTO a terminal state.
  if new.status not in ('submitted','auto_submitted','timed_out','admin_closed') then
    return new;
  end if;
  if old.status = new.status then
    return new;
  end if;

  select e.window_end, e.force_closed_at
    into v_window_end, v_force_closed
  from public.exam_batch_exams e
  where e.id = new.exam_id;

  if v_window_end is null then
    return new;
  end if;

  -- Freeze only when the exam is actually over. Mid-exam submissions must
  -- not freeze the board — other students may still be in progress.
  if now() < v_window_end and v_force_closed is null then
    return new;
  end if;

  -- Skip work if already frozen.
  select lb.status into v_status
  from public.exam_batch_leaderboards lb
  where lb.exam_id = new.exam_id;
  if v_status = 'frozen' then
    return new;
  end if;

  perform public.exam_batch_generate_leaderboard(new.exam_id, true);
  return new;
exception when others then
  -- Never break attempt writes because of a leaderboard hiccup — the sweep
  -- (below) will pick it up within a minute.
  raise warning 'exam_batch_attempt_after_terminal failed for exam %: %',
    new.exam_id, sqlerrm;
  return new;
end
$$;

drop trigger if exists trg_exam_batch_attempt_after_terminal
  on public.exam_batch_attempts;
create trigger trg_exam_batch_attempt_after_terminal
after update of status on public.exam_batch_attempts
for each row
execute function public.exam_batch_attempt_after_terminal();

-- 2) Trigger on exam_batch_exams (force-close) --------------------------------
create or replace function public.exam_batch_exam_after_force_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if new.force_closed_at is null then
    return new;
  end if;
  if old.force_closed_at is not null then
    return new;
  end if;

  select lb.status into v_status
  from public.exam_batch_leaderboards lb
  where lb.exam_id = new.id;
  if v_status = 'frozen' then
    return new;
  end if;

  perform public.exam_batch_generate_leaderboard(new.id, true);
  return new;
exception when others then
  raise warning 'exam_batch_exam_after_force_close failed for exam %: %',
    new.id, sqlerrm;
  return new;
end
$$;

drop trigger if exists trg_exam_batch_exam_after_force_close
  on public.exam_batch_exams;
create trigger trg_exam_batch_exam_after_force_close
after update of force_closed_at on public.exam_batch_exams
for each row
execute function public.exam_batch_exam_after_force_close();

-- 3) Sweep function -----------------------------------------------------------
-- Freezes every exam whose window ended (or was force-closed) without a
-- frozen leaderboard yet. Safe to run repeatedly — the generate RPC is
-- guarded by an advisory lock and short-circuits when nothing changed.
create or replace function public.exam_batch_freeze_ended_leaderboards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_done int := 0;
begin
  for r in
    select e.id
    from public.exam_batch_exams e
    left join public.exam_batch_leaderboards lb on lb.exam_id = e.id
    where (e.window_end <= now() or e.force_closed_at is not null)
      and coalesce(lb.status, 'pending') <> 'frozen'
    order by e.window_end asc
    limit 500
  loop
    begin
      perform public.exam_batch_generate_leaderboard(r.id, true);
      v_done := v_done + 1;
    exception when others then
      raise warning 'freeze sweep skipped exam %: %', r.id, sqlerrm;
    end;
  end loop;
  return v_done;
end
$$;

revoke execute on function public.exam_batch_freeze_ended_leaderboards() from public, anon, authenticated;
grant  execute on function public.exam_batch_freeze_ended_leaderboards() to service_role;

-- 4) pg_cron schedule (optional; guarded) -------------------------------------
-- If pg_cron is installed, run the sweep every minute. This is the safety
-- net for "0 students participated" and "no one visits after window_end".
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove any previous schedule with the same name so this migration is
    -- idempotent on re-run.
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'exam_batch_freeze_ended_leaderboards';

    perform cron.schedule(
      'exam_batch_freeze_ended_leaderboards',
      '* * * * *',
      $cron$select public.exam_batch_freeze_ended_leaderboards();$cron$
    );
  end if;
end
$$;
