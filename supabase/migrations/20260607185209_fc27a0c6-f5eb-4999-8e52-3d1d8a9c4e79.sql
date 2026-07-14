
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin','moderator','student');
CREATE TYPE public.content_status AS ENUM ('draft','published','archived');
CREATE TYPE public.difficulty AS ENUM ('easy','medium','hard');
CREATE TYPE public.mcq_option AS ENUM ('A','B','C','D');
CREATE TYPE public.question_type AS ENUM ('mcq','true_false');
CREATE TYPE public.quiz_kind AS ENUM ('quiz','mock');
CREATE TYPE public.profile_status AS ENUM ('active','suspended','pending');
CREATE TYPE public.notification_type AS ENUM ('announcement','push','email','in_app');
CREATE TYPE public.notification_priority AS ENUM ('low','medium','high','critical');
CREATE TYPE public.notification_status AS ENUM ('draft','scheduled','sent','failed','paused');
CREATE TYPE public.notification_audience AS ENUM ('all','level','subject','role','users');
CREATE TYPE public.card_type AS ENUM ('concept','formula','diagram','timeline','definition','other');
CREATE TYPE public.note_kind AS ENUM ('text','pdf','doc');
CREATE TYPE public.qb_resource_type AS ENUM ('important','pyq','model','notes','text');
CREATE TYPE public.video_kind AS ENUM ('youtube','playlist','upload');
CREATE TYPE public.attempt_status AS ENUM ('in_progress','completed','abandoned');
CREATE TYPE public.attempt_kind AS ENUM ('practice','quiz','mock');

-- ============================================================
-- updated_at helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  bio text,
  level text NOT NULL DEFAULT 'professional',
  status public.profile_status NOT NULL DEFAULT 'active',
  referral_source text,
  phone text,
  last_login_at timestamptz,
  total_login_count integer NOT NULL DEFAULT 0,
  total_usage_seconds bigint NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_level ON public.profiles(level);
CREATE INDEX idx_profiles_created_at ON public.profiles(created_at DESC);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USER ROLES + has_role (no recursion)
-- ============================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;

-- Profiles policies (uses has_role; safe — function reads user_roles only)
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_admin_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- User roles policies
CREATE POLICY "user_roles_self_read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto-create profile + assign student role on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, level)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'level','professional')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id,'student')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ACADEMIC: LEVELS, SUBJECTS, CHAPTERS
-- ============================================================
CREATE TABLE public.levels (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.content_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_levels_updated BEFORE UPDATE ON public.levels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.levels TO anon, authenticated;
GRANT ALL ON public.levels TO authenticated;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "levels_public_read" ON public.levels FOR SELECT USING (true);
CREATE POLICY "levels_admin_write" ON public.levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  level text NOT NULL DEFAULT 'professional' REFERENCES public.levels(code) ON UPDATE CASCADE,
  description text,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.content_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subjects_level ON public.subjects(level);
CREATE INDEX idx_subjects_status ON public.subjects(status);
CREATE TRIGGER trg_subjects_updated BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT ALL ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subjects_public_read" ON public.subjects FOR SELECT USING (true);
CREATE POLICY "subjects_admin_write" ON public.subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.content_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, slug)
);
CREATE INDEX idx_chapters_subject ON public.chapters(subject_id);
CREATE INDEX idx_chapters_status ON public.chapters(status);
CREATE TRIGGER trg_chapters_updated BEFORE UPDATE ON public.chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.chapters TO anon, authenticated;
GRANT ALL ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chapters_public_read" ON public.chapters FOR SELECT USING (true);
CREATE POLICY "chapters_admin_write" ON public.chapters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- MCQs
-- ============================================================
CREATE TABLE public.mcqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  question text NOT NULL,
  question_type public.question_type NOT NULL DEFAULT 'mcq',
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text,
  option_d text,
  correct_option public.mcq_option NOT NULL,
  explanation text,
  difficulty public.difficulty NOT NULL DEFAULT 'medium',
  status public.content_status NOT NULL DEFAULT 'published',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mcqs_chapter ON public.mcqs(chapter_id);
CREATE INDEX idx_mcqs_status ON public.mcqs(status);
CREATE INDEX idx_mcqs_difficulty ON public.mcqs(difficulty);
CREATE INDEX idx_mcqs_created_at ON public.mcqs(created_at DESC);
CREATE TRIGGER trg_mcqs_updated BEFORE UPDATE ON public.mcqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.mcqs TO anon, authenticated;
GRANT ALL ON public.mcqs TO authenticated;
GRANT ALL ON public.mcqs TO service_role;
ALTER TABLE public.mcqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcqs_published_read" ON public.mcqs FOR SELECT USING (status = 'published' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "mcqs_admin_write" ON public.mcqs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.mcq_delete_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mcq_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_by_name text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.mcq_delete_audit TO authenticated;
GRANT ALL ON public.mcq_delete_audit TO service_role;
ALTER TABLE public.mcq_delete_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_only" ON public.mcq_delete_audit FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- QUIZZES + QUIZ QUESTIONS (also used for "mock" via kind='mock')
-- ============================================================
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  level text NOT NULL DEFAULT 'professional',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  kind public.quiz_kind NOT NULL DEFAULT 'quiz',
  status public.content_status NOT NULL DEFAULT 'draft',
  difficulty public.difficulty NOT NULL DEFAULT 'medium',
  total_questions integer NOT NULL DEFAULT 10,
  duration_seconds integer NOT NULL DEFAULT 900,
  starts_at timestamptz,
  ends_at timestamptz,
  is_public boolean NOT NULL DEFAULT true,
  randomize_options boolean NOT NULL DEFAULT false,
  randomize_questions boolean NOT NULL DEFAULT true,
  passing_marks integer NOT NULL DEFAULT 0,
  negative_marking numeric NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_quizzes_kind_status ON public.quizzes(kind, status);
CREATE INDEX idx_quizzes_subject ON public.quizzes(subject_id);
CREATE INDEX idx_quizzes_chapter ON public.quizzes(chapter_id);
CREATE INDEX idx_quizzes_starts_at ON public.quizzes(starts_at);
CREATE INDEX idx_quizzes_created_at ON public.quizzes(created_at DESC);
CREATE TRIGGER trg_quizzes_updated BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.quizzes TO anon, authenticated;
GRANT ALL ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quizzes_published_read" ON public.quizzes FOR SELECT
  USING (status = 'published' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "quizzes_admin_write" ON public.quizzes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  mcq_id uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quiz_id, mcq_id)
);
CREATE INDEX idx_qq_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX idx_qq_mcq ON public.quiz_questions(mcq_id);
GRANT SELECT ON public.quiz_questions TO anon, authenticated;
GRANT ALL ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qq_public_read" ON public.quiz_questions FOR SELECT USING (true);
CREATE POLICY "qq_admin_write" ON public.quiz_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- ATTEMPTS
-- ============================================================
CREATE TABLE public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL,
  kind public.attempt_kind NOT NULL DEFAULT 'practice',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  level text,
  title text,
  attempt_number integer NOT NULL DEFAULT 1,
  status public.attempt_status NOT NULL DEFAULT 'completed',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_user ON public.exam_attempts(user_id);
CREATE INDEX idx_attempts_quiz ON public.exam_attempts(quiz_id);
CREATE INDEX idx_attempts_kind ON public.exam_attempts(kind);
CREATE INDEX idx_attempts_created_at ON public.exam_attempts(created_at DESC);
CREATE INDEX idx_attempts_status ON public.exam_attempts(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attempts_self_read" ON public.exam_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "attempts_self_insert" ON public.exam_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "attempts_self_update" ON public.exam_attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "attempts_self_delete" ON public.exam_attempts FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  mcq_id uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE CASCADE,
  chosen_option public.mcq_option,
  is_correct boolean NOT NULL DEFAULT false,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_aa_attempt ON public.attempt_answers(attempt_id);
CREATE INDEX idx_aa_mcq ON public.attempt_answers(mcq_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempt_answers TO authenticated;
GRANT ALL ON public.attempt_answers TO service_role;
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aa_own_read" ON public.attempt_answers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exam_attempts e WHERE e.id = attempt_id AND (e.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))));
CREATE POLICY "aa_own_write" ON public.attempt_answers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.exam_attempts e WHERE e.id = attempt_id AND e.user_id = auth.uid()));

CREATE TABLE public.mcq_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mcq_id uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mcq_id)
);
CREATE INDEX idx_bookmarks_user ON public.mcq_bookmarks(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_bookmarks TO authenticated;
GRANT ALL ON public.mcq_bookmarks TO service_role;
ALTER TABLE public.mcq_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bm_self" ON public.mcq_bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.mcq_wrong_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mcq_id uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  level text,
  last_chosen_option public.mcq_option,
  correct_option public.mcq_option,
  retry_count integer NOT NULL DEFAULT 0,
  mastered boolean NOT NULL DEFAULT false,
  last_wrong_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, mcq_id)
);
CREATE INDEX idx_wrong_user ON public.mcq_wrong_questions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcq_wrong_questions TO authenticated;
GRANT ALL ON public.mcq_wrong_questions TO service_role;
ALTER TABLE public.mcq_wrong_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wq_self" ON public.mcq_wrong_questions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- FLASH CARDS / SHORT NOTES / QUESTION BANK / VIDEO CLASSES
-- ============================================================
CREATE TABLE public.flash_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'professional',
  front text NOT NULL,
  back text NOT NULL,
  formula text,
  image_url text,
  card_type public.card_type NOT NULL DEFAULT 'concept',
  tags text[] NOT NULL DEFAULT '{}',
  status public.content_status NOT NULL DEFAULT 'draft',
  is_hidden boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fc_chapter ON public.flash_cards(chapter_id);
CREATE INDEX idx_fc_subject ON public.flash_cards(subject_id);
CREATE INDEX idx_fc_status ON public.flash_cards(status);
CREATE TRIGGER trg_fc_updated BEFORE UPDATE ON public.flash_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.flash_cards TO anon, authenticated;
GRANT ALL ON public.flash_cards TO authenticated;
GRANT ALL ON public.flash_cards TO service_role;
ALTER TABLE public.flash_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fc_published_read" ON public.flash_cards FOR SELECT
  USING ((status = 'published' AND NOT is_hidden) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "fc_admin_write" ON public.flash_cards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.short_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  level text NOT NULL DEFAULT 'professional',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  kind public.note_kind NOT NULL DEFAULT 'text',
  body text,
  file_url text,
  file_name text,
  file_size_bytes bigint,
  tags text[] NOT NULL DEFAULT '{}',
  status public.content_status NOT NULL DEFAULT 'draft',
  is_hidden boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sn_subject ON public.short_notes(subject_id);
CREATE INDEX idx_sn_chapter ON public.short_notes(chapter_id);
CREATE INDEX idx_sn_status ON public.short_notes(status);
CREATE TRIGGER trg_sn_updated BEFORE UPDATE ON public.short_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.short_notes TO anon, authenticated;
GRANT ALL ON public.short_notes TO authenticated;
GRANT ALL ON public.short_notes TO service_role;
ALTER TABLE public.short_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sn_published_read" ON public.short_notes FOR SELECT
  USING ((status = 'published' AND NOT is_hidden) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "sn_admin_write" ON public.short_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.question_bank_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  level text NOT NULL DEFAULT 'professional',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  kind public.note_kind NOT NULL DEFAULT 'text',
  resource_type public.qb_resource_type NOT NULL DEFAULT 'important',
  body text,
  file_url text,
  file_name text,
  file_size_bytes bigint,
  question_count integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}',
  status public.content_status NOT NULL DEFAULT 'draft',
  is_hidden boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_qb_subject ON public.question_bank_resources(subject_id);
CREATE INDEX idx_qb_chapter ON public.question_bank_resources(chapter_id);
CREATE INDEX idx_qb_status ON public.question_bank_resources(status);
CREATE TRIGGER trg_qb_updated BEFORE UPDATE ON public.question_bank_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.question_bank_resources TO anon, authenticated;
GRANT ALL ON public.question_bank_resources TO authenticated;
GRANT ALL ON public.question_bank_resources TO service_role;
ALTER TABLE public.question_bank_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qb_published_read" ON public.question_bank_resources FOR SELECT
  USING ((status = 'published' AND NOT is_hidden) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "qb_admin_write" ON public.question_bank_resources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.video_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  level text NOT NULL DEFAULT 'professional',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  instructor text,
  kind public.video_kind NOT NULL DEFAULT 'youtube',
  youtube_url text,
  youtube_video_id text,
  youtube_playlist_id text,
  thumbnail_url text,
  duration_seconds integer NOT NULL DEFAULT 0,
  playlist_key text,
  position integer NOT NULL DEFAULT 0,
  tags text[] NOT NULL DEFAULT '{}',
  status public.content_status NOT NULL DEFAULT 'draft',
  is_hidden boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vc_subject ON public.video_classes(subject_id);
CREATE INDEX idx_vc_chapter ON public.video_classes(chapter_id);
CREATE INDEX idx_vc_status ON public.video_classes(status);
CREATE TRIGGER trg_vc_updated BEFORE UPDATE ON public.video_classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.video_classes TO anon, authenticated;
GRANT ALL ON public.video_classes TO authenticated;
GRANT ALL ON public.video_classes TO service_role;
ALTER TABLE public.video_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc_published_read" ON public.video_classes FOR SELECT
  USING ((status = 'published' AND NOT is_hidden) OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "vc_admin_write" ON public.video_classes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- SECTION VISIBILITY (single-row config tables)
-- ============================================================
CREATE TABLE public.module_visibility (
  key text PRIMARY KEY,
  label text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.module_visibility TO anon, authenticated;
GRANT ALL ON public.module_visibility TO authenticated;
GRANT ALL ON public.module_visibility TO service_role;
ALTER TABLE public.module_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mv_public_read" ON public.module_visibility FOR SELECT USING (true);
CREATE POLICY "mv_admin_write" ON public.module_visibility FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.flash_card_visibility (
  id integer PRIMARY KEY DEFAULT 1,
  section_hidden boolean NOT NULL DEFAULT false,
  hidden_levels text[] NOT NULL DEFAULT '{}',
  hidden_subject_ids uuid[] NOT NULL DEFAULT '{}',
  hidden_chapter_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT ON public.flash_card_visibility TO anon, authenticated;
GRANT ALL ON public.flash_card_visibility TO authenticated;
GRANT ALL ON public.flash_card_visibility TO service_role;
ALTER TABLE public.flash_card_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fcv_public_read" ON public.flash_card_visibility FOR SELECT USING (true);
CREATE POLICY "fcv_admin_write" ON public.flash_card_visibility FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.short_notes_visibility (LIKE public.flash_card_visibility INCLUDING ALL);
GRANT SELECT ON public.short_notes_visibility TO anon, authenticated;
GRANT ALL ON public.short_notes_visibility TO authenticated;
GRANT ALL ON public.short_notes_visibility TO service_role;
ALTER TABLE public.short_notes_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snv_public_read" ON public.short_notes_visibility FOR SELECT USING (true);
CREATE POLICY "snv_admin_write" ON public.short_notes_visibility FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.question_bank_visibility (LIKE public.flash_card_visibility INCLUDING ALL);
GRANT SELECT ON public.question_bank_visibility TO anon, authenticated;
GRANT ALL ON public.question_bank_visibility TO authenticated;
GRANT ALL ON public.question_bank_visibility TO service_role;
ALTER TABLE public.question_bank_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qbv_public_read" ON public.question_bank_visibility FOR SELECT USING (true);
CREATE POLICY "qbv_admin_write" ON public.question_bank_visibility FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.video_class_visibility (LIKE public.flash_card_visibility INCLUDING ALL);
GRANT SELECT ON public.video_class_visibility TO anon, authenticated;
GRANT ALL ON public.video_class_visibility TO authenticated;
GRANT ALL ON public.video_class_visibility TO service_role;
ALTER TABLE public.video_class_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vcv_public_read" ON public.video_class_visibility FOR SELECT USING (true);
CREATE POLICY "vcv_admin_write" ON public.video_class_visibility FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  type public.notification_type NOT NULL DEFAULT 'in_app',
  priority public.notification_priority NOT NULL DEFAULT 'medium',
  status public.notification_status NOT NULL DEFAULT 'draft',
  audience public.notification_audience NOT NULL DEFAULT 'all',
  audience_level text,
  audience_subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  audience_role public.app_role,
  audience_user_ids uuid[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_status ON public.notifications(status);
CREATE INDEX idx_notif_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notif_scheduled_at ON public.notifications(scheduled_at);
CREATE TRIGGER trg_notif_updated BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
GRANT SELECT ON public.notifications TO anon, authenticated;
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_sent_read" ON public.notifications FOR SELECT
  USING (status = 'sent' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "notif_admin_write" ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  clicked_at timestamptz,
  UNIQUE(user_id, notification_id)
);
CREATE INDEX idx_nr_user ON public.notification_reads(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nr_self" ON public.notification_reads FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- ACTIVITY / SESSIONS / LOGINS
-- ============================================================
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  module text,
  page_path text,
  element_label text,
  target_id text,
  device text,
  browser text,
  user_agent text,
  ip text,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ae_user ON public.activity_events(user_id);
CREATE INDEX idx_ae_module ON public.activity_events(module);
CREATE INDEX idx_ae_created_at ON public.activity_events(created_at DESC);
CREATE INDEX idx_ae_event_type ON public.activity_events(event_type);
GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae_self_insert" ON public.activity_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "ae_admin_read" ON public.activity_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR user_id = auth.uid());

CREATE TABLE public.user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  duration_seconds integer,
  user_agent text,
  browser text,
  device text,
  ip text
);
CREATE INDEX idx_ule_user ON public.user_login_events(user_id);
CREATE INDEX idx_ule_login_at ON public.user_login_events(login_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.user_login_events TO authenticated;
GRANT ALL ON public.user_login_events TO service_role;
ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ule_self_rw" ON public.user_login_events FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token text,
  ip text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE INDEX idx_us_user ON public.user_sessions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "us_self" ON public.user_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ss_user ON public.study_sessions(user_id);
CREATE INDEX idx_ss_created_at ON public.study_sessions(created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ss_self" ON public.study_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- SITE MANAGEMENT
-- ============================================================
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_value jsonb,
  label text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ssettings_public_read" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "ssettings_admin_write" ON public.site_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  status public.content_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT ALL ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spages_public_read" ON public.site_pages FOR SELECT USING (true);
CREATE POLICY "spages_admin_write" ON public.site_pages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.site_page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES public.site_pages(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_content jsonb,
  position integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sps_page ON public.site_page_sections(page_id);
GRANT SELECT ON public.site_page_sections TO anon, authenticated;
GRANT ALL ON public.site_page_sections TO authenticated;
GRANT ALL ON public.site_page_sections TO service_role;
ALTER TABLE public.site_page_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sps_public_read" ON public.site_page_sections FOR SELECT USING (true);
CREATE POLICY "sps_admin_write" ON public.site_page_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.homepage_sections (
  key text PRIMARY KEY,
  label text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_content jsonb,
  position integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.homepage_sections TO anon, authenticated;
GRANT ALL ON public.homepage_sections TO authenticated;
GRANT ALL ON public.homepage_sections TO service_role;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_public_read" ON public.homepage_sections FOR SELECT USING (true);
CREATE POLICY "hs_admin_write" ON public.homepage_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  alt_text text,
  tags text[] NOT NULL DEFAULT '{}',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ma_uploaded_by ON public.media_assets(uploaded_by);
GRANT SELECT ON public.media_assets TO anon, authenticated;
GRANT ALL ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ma_public_read" ON public.media_assets FOR SELECT USING (true);
CREATE POLICY "ma_admin_write" ON public.media_assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL,
  target_key text NOT NULL,
  snapshot jsonb NOT NULL,
  label text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cv_target ON public.content_versions(target_kind, target_key, created_at DESC);
GRANT SELECT, INSERT ON public.content_versions TO authenticated;
GRANT ALL ON public.content_versions TO service_role;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cv_admin" ON public.content_versions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.avatars TO anon, authenticated;
GRANT ALL ON public.avatars TO authenticated;
GRANT ALL ON public.avatars TO service_role;
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "av_public_read" ON public.avatars FOR SELECT USING (true);
CREATE POLICY "av_admin_write" ON public.avatars FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_login_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.module_visibility;

-- ============================================================
-- SEED: levels and default visibility/modules
-- ============================================================
INSERT INTO public.levels (code,name,description,color,icon,sort_order) VALUES
  ('foundation','Foundation','Beginner level','#10b981','sprout',1),
  ('intermediate','Intermediate','Practicing level','#3b82f6','book-open',2),
  ('professional','Professional','Advanced level','#8b5cf6','graduation-cap',3),
  ('final','Final','Mastery level','#ef4444','trophy',4)
ON CONFLICT DO NOTHING;

INSERT INTO public.module_visibility(key,label,hidden) VALUES
  ('mcq_practice','MCQ Practice',false),
  ('quiz','Quiz',false),
  ('mock_test','Mock Test',false),
  ('flash_cards','Flash Cards',false),
  ('short_notes','Short Notes',false),
  ('question_bank','Question Bank',false),
  ('video_classes','Video Classes',false),
  ('notifications','Notifications',false)
ON CONFLICT DO NOTHING;

INSERT INTO public.flash_card_visibility(id,section_hidden) VALUES (1,false) ON CONFLICT DO NOTHING;
INSERT INTO public.short_notes_visibility(id,section_hidden) VALUES (1,false) ON CONFLICT DO NOTHING;
INSERT INTO public.question_bank_visibility(id,section_hidden) VALUES (1,false) ON CONFLICT DO NOTHING;
INSERT INTO public.video_class_visibility(id,section_hidden) VALUES (1,false) ON CONFLICT DO NOTHING;
