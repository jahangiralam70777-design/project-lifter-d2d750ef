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
--   public.levels(code)
--   public.subjects(id)
--   public.chapters(id)
--   public.mcqs(id, option_a/b/c/d text, correct_option mcq_option)
--     Note: this module previously referenced a hypothetical
--     public.questions(id, options jsonb, ...) table. That table does
--     not exist in this database — the canonical question bank is
--     public.mcqs. All foreign keys now point at public.mcqs(id) and
--     RPC scoring reads through the read-only compatibility view
--     public.exam_batch_questions_v defined below, which normalises
--     mcqs into the (id, options jsonb, correct_option text-index)
--     shape the original scoring logic expects. No existing table is
--     altered and no existing data is modified.
--   public.profiles(id)
--   public.has_permission(uuid, text)      -- shared admin gate
-- =====================================================================


-- ---------------------------------------------------------------------
-- Sequence — global Student ID counter (start 1001, monotonic, no reuse)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.exam_batch_student_id_seq
  START WITH 1001 INCREMENT BY 1 MINVALUE 1001 NO CYCLE;

GRANT USAGE ON SEQUENCE public.exam_batch_student_id_seq TO authenticated;
GRANT ALL   ON SEQUENCE public.exam_batch_student_id_seq TO service_role;


-- =====================================================================
-- 1. SESSIONS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.exam_batch_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  subtitle              text,
  level                 text NOT NULL REFERENCES public.levels(code) ON UPDATE CASCADE,
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
  subject_id  uuid NOT NULL REFERENCES public.subjects(id)            ON DELETE RESTRICT,
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
  subject_id     uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
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
  level                     text NOT NULL REFERENCES public.levels(code) ON UPDATE CASCADE,
  subject_id                uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  chapter_id                uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
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
  question_id  uuid NOT NULL REFERENCES public.mcqs(id)        ON DELETE RESTRICT,
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
-- shape. This database instead ships `public.mcqs` (option_a..option_d
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
FROM public.mcqs m;

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
  question_id   uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE RESTRICT,
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
  question_id            uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE RESTRICT,
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
  subject_id               uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
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
  subject_id   uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
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
  subject_id     uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
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
  subject_id   uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
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
  subject_id   uuid REFERENCES public.subjects(id)            ON DELETE SET NULL,
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
