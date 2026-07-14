-- =====================================================================
-- PRODUCTION BACKEND SYNC RECOVERY
-- =====================================================================
-- Run this in Lovable Cloud SQL Editor for the SAME project this app uses:
--   rrawsvthkczlyapllbkh
--
-- Why this exists:
--   The codebase expects a set of tables, RPCs, RLS policies, and realtime
--   publication entries that may be missing in production when migrations were
--   applied out of order or only partially. This script is idempotent and
--   re-asserts the minimum backend contract required by the current app.
--
-- Notes:
--   * The app uses profiles + user_roles, not separate users/students/admins
--     tables in public.
--   * "quiz_sets" in the UI corresponds to public.quizzes.
--   * This file avoids recursive RLS by using SECURITY DEFINER helpers.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1) Core helpers and role model
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.app_role') IS NULL THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'student', 'user', 'super_admin');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public.app_role') IS NOT NULL THEN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'moderator';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
      AND policyname = 'user_roles_self_or_admin_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "user_roles_self_or_admin_read"
        ON public.user_roles
        FOR SELECT
        TO authenticated
        USING (
          user_id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2) Permissions + audit helpers used by admin server functions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = 'super_admin'::public.app_role
        OR EXISTS (
          SELECT 1
          FROM public.role_permissions rp
          WHERE rp.role = ur.role
            AND rp.permission = _permission
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'role_permissions'
      AND policyname = 'Admins read role_permissions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins read role_permissions"
        ON public.role_permissions
        FOR SELECT TO authenticated
        USING (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'role_permissions'
      AND policyname = 'Admins write role_permissions'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins write role_permissions"
        ON public.role_permissions
        FOR ALL TO authenticated
        USING (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
        WITH CHECK (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;
END $$;

INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','manage_users'),
  ('admin','manage_permissions'),
  ('admin','moderate_content'),
  ('admin','view_analytics'),
  ('admin','edit_academic_structure'),
  ('admin','manage_content'),
  ('admin','take_exams'),
  ('admin','bookmark_review'),
  ('admin','manage_system'),
  ('moderator','moderate_content'),
  ('moderator','view_analytics'),
  ('moderator','manage_content'),
  ('moderator','take_exams'),
  ('moderator','bookmark_review'),
  ('student','take_exams'),
  ('student','bookmark_review'),
  ('user','take_exams')
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission text NOT NULL,
  action text,
  allowed boolean NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_action_log TO authenticated;
GRANT INSERT ON public.admin_action_log TO service_role;
GRANT ALL ON public.admin_action_log TO service_role;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_action_log'
      AND policyname = 'Admins read admin_action_log'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins read admin_action_log"
        ON public.admin_action_log
        FOR SELECT TO authenticated
        USING (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_admin_action(
  _permission text,
  _action text,
  _allowed boolean,
  _metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_admin_action requires an authenticated caller';
  END IF;
  INSERT INTO public.admin_action_log (user_id, permission, action, allowed, metadata)
  VALUES (auth.uid(), _permission, _action, _allowed, _metadata);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Core app tables that admin dashboards depend on
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  bio text,
  level text NOT NULL DEFAULT 'professional',
  status text NOT NULL DEFAULT 'active',
  referral_source text,
  phone text,
  last_login_at timestamptz,
  total_login_count integer NOT NULL DEFAULT 0,
  total_usage_seconds bigint NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  ban_until timestamptz,
  ban_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level text DEFAULT 'professional';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_usage_seconds bigint NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_profiles'
  ) THEN
    EXECUTE 'CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_self_or_admin_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_self_or_admin_read"
        ON public.profiles
        FOR SELECT TO authenticated
        USING (
          id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_self_or_admin_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_self_or_admin_insert"
        ON public.profiles
        FOR INSERT TO authenticated
        WITH CHECK (
          id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'profiles_self_or_admin_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_self_or_admin_update"
        ON public.profiles
        FOR UPDATE TO authenticated
        USING (
          id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
        WITH CHECK (
          id = auth.uid()
          OR public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
        )
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'super_admin'::public.app_role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND (
        (p.ban_until IS NOT NULL AND p.ban_until > now())
        OR p.status = 'suspended'
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated, service_role;

-- site_settings used by admin settings / widget config
CREATE TABLE IF NOT EXISTS public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  draft_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_site_settings_updated_at'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_settings'
      AND policyname = 'ssettings_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY ssettings_public_read
        ON public.site_settings
        FOR SELECT TO anon, authenticated
        USING (true)
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_settings'
      AND policyname = 'admins manage site settings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admins manage site settings"
        ON public.site_settings
        FOR ALL TO authenticated
        USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
        WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
    $policy$;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4) Learning/content tables required by dashboards
-- ---------------------------------------------------------------------
DO $$ BEGIN
  IF to_regtype('public.content_status') IS NULL THEN
    CREATE TYPE public.content_status AS ENUM ('draft','published','archived');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF to_regtype('public.difficulty_level') IS NULL THEN
    CREATE TYPE public.difficulty_level AS ENUM ('easy','medium','hard');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF to_regtype('public.mcq_option') IS NULL THEN
    CREATE TYPE public.mcq_option AS ENUM ('A','B','C','D');
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.levels (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.content_status NOT NULL DEFAULT 'published',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.levels TO anon, authenticated;
GRANT ALL ON public.levels TO service_role;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  level text NOT NULL REFERENCES public.levels(code) ON DELETE RESTRICT,
  description text,
  color text,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.content_status NOT NULL DEFAULT 'published',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status public.content_status NOT NULL DEFAULT 'published',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, slug)
);
GRANT SELECT ON public.chapters TO anon, authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.mcqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  question text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text,
  option_d text,
  correct_option public.mcq_option NOT NULL,
  explanation text,
  difficulty public.difficulty_level NOT NULL DEFAULT 'medium',
  status public.content_status NOT NULL DEFAULT 'published',
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mcqs TO authenticated;
GRANT ALL ON public.mcqs TO service_role;
ALTER TABLE public.mcqs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mcqs_chapter_id_idx ON public.mcqs (chapter_id);
CREATE INDEX IF NOT EXISTS mcqs_status_idx ON public.mcqs (status);

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  level text,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'quiz' CHECK (kind IN ('quiz','mock')),
  status public.content_status NOT NULL DEFAULT 'draft',
  difficulty public.difficulty_level NOT NULL DEFAULT 'medium',
  total_questions integer NOT NULL DEFAULT 10,
  duration_seconds integer NOT NULL DEFAULT 900,
  starts_at timestamptz,
  ends_at timestamptz,
  is_public boolean NOT NULL DEFAULT true,
  randomize_options boolean NOT NULL DEFAULT false,
  randomize_questions boolean NOT NULL DEFAULT true,
  passing_marks integer NOT NULL DEFAULT 0,
  negative_marking numeric(4,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid REFERENCES public.quizzes(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  level text,
  kind text NOT NULL CHECK (kind IN ('mcq_practice','quiz','mock','custom_exam')),
  title text,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress','completed','abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.exam_attempts TO authenticated;
GRANT ALL ON public.exam_attempts TO service_role;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS exam_attempts_user_id_idx ON public.exam_attempts (user_id);
CREATE INDEX IF NOT EXISTS exam_attempts_created_at_idx ON public.exam_attempts (created_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='levels' AND policyname='levels_select') THEN
    EXECUTE 'CREATE POLICY levels_select ON public.levels FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='levels' AND policyname='levels_write_admin') THEN
    EXECUTE 'CREATE POLICY levels_write_admin ON public.levels FOR ALL USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subjects' AND policyname='subjects_select') THEN
    EXECUTE 'CREATE POLICY subjects_select ON public.subjects FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subjects' AND policyname='subjects_write_admin') THEN
    EXECUTE 'CREATE POLICY subjects_write_admin ON public.subjects FOR ALL USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chapters' AND policyname='chapters_select') THEN
    EXECUTE 'CREATE POLICY chapters_select ON public.chapters FOR SELECT USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chapters' AND policyname='chapters_write_admin') THEN
    EXECUTE 'CREATE POLICY chapters_write_admin ON public.chapters FOR ALL USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mcqs' AND policyname='mcqs_select_published') THEN
    EXECUTE 'CREATE POLICY mcqs_select_published ON public.mcqs FOR SELECT USING (status = ''published'' OR public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mcqs' AND policyname='mcqs_write_admin') THEN
    EXECUTE 'CREATE POLICY mcqs_write_admin ON public.mcqs FOR ALL USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quizzes' AND policyname='quizzes_select') THEN
    EXECUTE 'CREATE POLICY quizzes_select ON public.quizzes FOR SELECT USING (is_public = true OR public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quizzes' AND policyname='quizzes_write_admin') THEN
    EXECUTE 'CREATE POLICY quizzes_write_admin ON public.quizzes FOR ALL USING (public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_attempts' AND policyname='exam_attempts_own_select') THEN
    EXECUTE 'CREATE POLICY exam_attempts_own_select ON public.exam_attempts FOR SELECT USING (user_id = auth.uid() OR public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exam_attempts' AND policyname='exam_attempts_own_insert') THEN
    EXECUTE 'CREATE POLICY exam_attempts_own_insert ON public.exam_attempts FOR INSERT WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5) Analytics + activity tracking
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  duration_seconds integer,
  user_agent text,
  device text,
  browser text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_login_events TO authenticated;
GRANT ALL ON public.user_login_events TO service_role;
ALTER TABLE public.user_login_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_login_events' AND policyname='user_login_events_own_insert') THEN
    EXECUTE 'CREATE POLICY user_login_events_own_insert ON public.user_login_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_login_events' AND policyname='user_login_events_own_update') THEN
    EXECUTE 'CREATE POLICY user_login_events_own_update ON public.user_login_events FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_login_events' AND policyname='user_login_events_select') THEN
    EXECUTE 'CREATE POLICY user_login_events_select ON public.user_login_events FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), ''admin''::public.app_role) OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  event_type text NOT NULL,
  page_url text NULL,
  page_path text NULL,
  referrer text NULL,
  element_id text NULL,
  element_label text NULL,
  element_role text NULL,
  module text NULL,
  target_kind text NULL,
  target_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  user_agent text NULL,
  device text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='activity_events' AND policyname='activity_events_insert_own'
  ) THEN
    EXECUTE 'DROP POLICY activity_events_insert_own ON public.activity_events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='activity_events' AND policyname='activity_events_insert_authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY activity_events_insert_authenticated ON public.activity_events FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='activity_events' AND policyname='activity_events_select_admin'
  ) THEN
    EXECUTE '' ||
      'CREATE POLICY activity_events_select_admin ON public.activity_events ' ||
      'FOR SELECT TO authenticated USING (' ||
      'public.has_role(auth.uid(), ''admin''::public.app_role) ' ||
      'OR public.has_role(auth.uid(), ''super_admin''::public.app_role))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS activity_events_created_at_idx ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_user_created_idx ON public.activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_created_idx ON public.activity_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_path_created_idx ON public.activity_events (page_path, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_element_created_idx ON public.activity_events (element_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_module_created_idx ON public.activity_events (module, created_at DESC);
ALTER TABLE public.activity_events REPLICA IDENTITY FULL;

-- Admin analytics RPCs
CREATE OR REPLACE FUNCTION public.admin_user_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
    'deleted_users', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
    'active_24h', (SELECT count(DISTINCT user_id) FROM public.user_login_events WHERE login_at >= now() - interval '24 hours'),
    'active_7d', (SELECT count(DISTINCT user_id) FROM public.user_login_events WHERE login_at >= now() - interval '7 days'),
    'active_30d', (SELECT count(DISTINCT user_id) FROM public.user_login_events WHERE login_at >= now() - interval '30 days'),
    'lifetime_active', (SELECT count(DISTINCT user_id) FROM public.user_login_events),
    'total_logins', (SELECT count(*) FROM public.user_login_events),
    'avg_session_seconds', COALESCE((SELECT avg(duration_seconds)::bigint FROM public.user_login_events WHERE duration_seconds IS NOT NULL AND duration_seconds > 0), 0),
    'usage_24h', COALESCE((SELECT sum(duration_seconds)::bigint FROM public.user_login_events WHERE login_at >= now() - interval '24 hours'), 0),
    'usage_7d', COALESCE((SELECT sum(duration_seconds)::bigint FROM public.user_login_events WHERE login_at >= now() - interval '7 days'), 0),
    'usage_30d', COALESCE((SELECT sum(duration_seconds)::bigint FROM public.user_login_events WHERE login_at >= now() - interval '30 days'), 0)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_activity_overview(_range_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE since_ts timestamptz := now() - make_interval(hours => _range_hours);
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT jsonb_build_object(
    'active_now', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '5 minutes' AND user_id IS NOT NULL),
    'unique_users_24h', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '24 hours' AND user_id IS NOT NULL),
    'unique_users_7d', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '7 days' AND user_id IS NOT NULL),
    'unique_users_30d', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '30 days' AND user_id IS NOT NULL),
    'total_events', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts),
    'total_clicks', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'click'),
    'total_page_views', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'page_view'),
    'total_logins', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'login'),
    'total_submits', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'submit'),
    'total_crud', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'crud'),
    'total_admin_actions', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'admin_action'),
    'api_errors', (SELECT count(*) FROM public.activity_events WHERE created_at >= since_ts AND event_type = 'api_call' AND COALESCE((metadata->>'ok')::boolean, false) IS FALSE),
    'range_hours', _range_hours
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_top_buttons(_range_hours integer DEFAULT 24, _limit integer DEFAULT 10)
RETURNS TABLE(element_id text, element_label text, page_path text, click_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT COALESCE(e.element_id, e.element_label, '(unknown)'),
         COALESCE(e.element_label, e.element_id, '(unknown)'),
         COALESCE(e.page_path, '/'),
         count(*)::bigint
  FROM public.activity_events e
  WHERE e.event_type = 'click'
    AND e.created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY 1,2,3
  ORDER BY 4 DESC
  LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_top_pages(_range_hours integer DEFAULT 24, _limit integer DEFAULT 10)
RETURNS TABLE(page_path text, view_count bigint, unique_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT COALESCE(e.page_path, '/'), count(*)::bigint, count(DISTINCT e.user_id)::bigint
  FROM public.activity_events e
  WHERE e.event_type = 'page_view'
    AND e.created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_top_modules(_range_hours integer DEFAULT 24, _limit integer DEFAULT 10)
RETURNS TABLE(module text, event_count bigint, unique_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT COALESCE(e.module, '(none)'), count(*)::bigint, count(DISTINCT e.user_id)::bigint
  FROM public.activity_events e
  WHERE e.created_at >= now() - make_interval(hours => _range_hours)
    AND e.module IS NOT NULL
  GROUP BY 1
  ORDER BY 2 DESC
  LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_activity_timeseries(_range_hours integer DEFAULT 24, _bucket_minutes integer DEFAULT 60)
RETURNS TABLE(bucket timestamptz, event_type text, event_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
  SELECT date_bin(make_interval(mins => _bucket_minutes), e.created_at, timestamptz 'epoch') AS bucket,
         e.event_type,
         count(*)::bigint
  FROM public.activity_events e
  WHERE e.created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY 1,2
  ORDER BY 1 ASC, 2 ASC;
END $$;

REVOKE ALL ON FUNCTION public.admin_user_analytics() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_activity_overview(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_top_buttons(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_top_pages(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_top_modules(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_activity_timeseries(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_analytics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity_overview(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_buttons(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_pages(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_modules(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity_timeseries(integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) Admin DB manager RPCs
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_table_sizes()
RETURNS TABLE(table_name text, size_bytes bigint, row_estimate bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN QUERY
  SELECT c.relname::text,
         pg_total_relation_size(c.oid)::bigint,
         c.reltuples::bigint
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_db_size()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE s bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  SELECT pg_database_size(current_database()) INTO s;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_public_tables()
RETURNS TABLE(table_name text, size_bytes bigint, row_estimate bigint, rls_enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN QUERY
    SELECT c.relname::text,
           pg_total_relation_size(c.oid)::bigint,
           c.reltuples::bigint,
           c.relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname ASC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_global_search(_term text, _limit int DEFAULT 50)
RETURNS TABLE(table_name text, id text, snippet text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  rec record;
  pattern text;
  sql text;
  per int := GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _term IS NULL OR length(btrim(_term)) < 2 THEN
    RETURN;
  END IF;
  pattern := '%' || btrim(_term) || '%';
  FOR rec IN
    SELECT c.table_name,
           string_agg(quote_ident(c.column_name), ',' ORDER BY c.ordinal_position) AS cols,
           string_agg(format('%I::text ILIKE %L', c.column_name, pattern), ' OR ' ORDER BY c.ordinal_position) AS where_clause,
           (
             SELECT a.attname
             FROM pg_index i
             JOIN pg_class cls ON cls.oid = i.indrelid
             JOIN pg_namespace ns ON ns.oid = cls.relnamespace
             JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attnum = ANY (i.indkey)
             WHERE i.indisprimary AND ns.nspname='public' AND cls.relname = c.table_name
             LIMIT 1
           ) AS pk_col
    FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.column_name IN ('name','title','email','label','key','slug','display_name','description','question','body','content')
      AND c.data_type IN ('text','character varying','character','uuid')
    GROUP BY c.table_name
  LOOP
    BEGIN
      sql := format(
        'SELECT %L::text, COALESCE(%s::text, ''(no pk)''), left(concat_ws('' | '', %s)::text, 200) FROM public.%I WHERE %s LIMIT %s',
        rec.table_name,
        COALESCE(quote_ident(rec.pk_col), '''(no pk)'''),
        rec.cols,
        rec.table_name,
        rec.where_clause,
        per
      );
      RETURN QUERY EXECUTE sql;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_run_select_query(_sql text, _max_rows integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trimmed text;
  lowered text;
  forbidden text;
  result jsonb;
  wrapped text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _sql IS NULL OR length(btrim(_sql)) = 0 THEN
    RAISE EXCEPTION 'Empty query';
  END IF;
  trimmed := btrim(_sql);
  WHILE right(trimmed, 1) = ';' LOOP
    trimmed := btrim(left(trimmed, length(trimmed)-1));
  END LOOP;
  IF position(';' in trimmed) > 0 THEN
    RAISE EXCEPTION 'Only a single statement is allowed';
  END IF;
  lowered := lower(trimmed);
  IF NOT (lowered LIKE 'select%' OR lowered LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT / WITH queries are allowed';
  END IF;
  FOREACH forbidden IN ARRAY ARRAY[
    'insert ','update ','delete ','drop ','alter ','create ','grant ','revoke ',
    'truncate ','vacuum ','copy ','do ','call ','comment ','reindex ','listen ',
    'notify ','prepare ','execute ','reset ','set ','lock ','refresh ','cluster ',
    'security definer','pg_sleep','pg_read_server_files','pg_read_binary_file',
    'pg_ls_dir','pg_stat_file','lo_import','lo_export','dblink',
    'pg_catalog.','information_schema.','pg_authid','pg_shadow','pg_user',
    'pg_largeobject','pg_roles'
  ] LOOP
    IF position(forbidden in lowered) > 0 THEN
      RAISE EXCEPTION 'Forbidden token in query: %', trim(forbidden);
    END IF;
  END LOOP;
  _max_rows := GREATEST(1, LEAST(COALESCE(_max_rows, 200), 500));
  PERFORM set_config('statement_timeout', '5000', true);
  wrapped := format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT %s) t', trimmed, _max_rows);
  EXECUTE wrapped INTO result;
  RETURN jsonb_build_object('rows', result, 'limit', _max_rows);
END $$;

REVOKE ALL ON FUNCTION public.admin_get_table_sizes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_db_size() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_public_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_global_search(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_run_select_query(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_table_sizes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_db_size() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_public_tables() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_global_search(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_run_select_query(text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) Auth access controls + realtime
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auth_access_controls (
  id integer PRIMARY KEY DEFAULT 1,
  login_enabled boolean NOT NULL DEFAULT true,
  signup_enabled boolean NOT NULL DEFAULT true,
  login_message_title text NOT NULL DEFAULT 'System Maintenance',
  login_message_subtitle text NOT NULL DEFAULT 'Login Temporarily Disabled',
  login_message_description text NOT NULL DEFAULT 'Login is temporarily unavailable due to maintenance. Please try again later.',
  login_message_footer text NOT NULL DEFAULT 'Please check back later.',
  signup_message_title text NOT NULL DEFAULT 'System Maintenance',
  signup_message_subtitle text NOT NULL DEFAULT 'Signup Temporarily Disabled',
  signup_message_description text NOT NULL DEFAULT 'New registrations are temporarily unavailable. Please try again later.',
  signup_message_footer text NOT NULL DEFAULT 'Please check back later.',
  login_auto_enable_at timestamptz,
  signup_auto_enable_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_access_controls_singleton CHECK (id = 1)
);

INSERT INTO public.auth_access_controls (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

GRANT SELECT ON public.auth_access_controls TO anon, authenticated;
GRANT ALL ON public.auth_access_controls TO service_role;
ALTER TABLE public.auth_access_controls ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='auth_access_controls' AND policyname='Auth controls are world readable'
  ) THEN
    EXECUTE 'CREATE POLICY "Auth controls are world readable" ON public.auth_access_controls FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_auth_access_controls()
RETURNS public.auth_access_controls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE row_data public.auth_access_controls;
BEGIN
  SELECT * INTO row_data FROM public.auth_access_controls WHERE id = 1;
  IF row_data IS NULL THEN
    row_data.id := 1;
    row_data.login_enabled := true;
    row_data.signup_enabled := true;
    RETURN row_data;
  END IF;

  IF row_data.login_auto_enable_at IS NOT NULL
     AND row_data.login_auto_enable_at <= now()
     AND row_data.login_enabled = false THEN
    UPDATE public.auth_access_controls
      SET login_enabled = true,
          login_auto_enable_at = NULL,
          updated_at = now()
    WHERE id = 1
    RETURNING * INTO row_data;
  END IF;

  IF row_data.signup_auto_enable_at IS NOT NULL
     AND row_data.signup_auto_enable_at <= now()
     AND row_data.signup_enabled = false THEN
    UPDATE public.auth_access_controls
      SET signup_enabled = true,
          signup_auto_enable_at = NULL,
          updated_at = now()
    WHERE id = 1
    RETURNING * INTO row_data;
  END IF;

  RETURN row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_auth_access_controls(_payload jsonb)
RETURNS public.auth_access_controls
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_row public.auth_access_controls;
  new_row public.auth_access_controls;
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT public.is_admin(caller) THEN
    RAISE EXCEPTION 'forbidden: admin role required';
  END IF;

  SELECT * INTO prev_row FROM public.auth_access_controls WHERE id = 1;

  UPDATE public.auth_access_controls SET
    login_enabled = COALESCE((_payload->>'login_enabled')::boolean, login_enabled),
    signup_enabled = COALESCE((_payload->>'signup_enabled')::boolean, signup_enabled),
    login_message_title = COALESCE(_payload->>'login_message_title', login_message_title),
    login_message_subtitle = COALESCE(_payload->>'login_message_subtitle', login_message_subtitle),
    login_message_description = COALESCE(_payload->>'login_message_description', login_message_description),
    login_message_footer = COALESCE(_payload->>'login_message_footer', login_message_footer),
    signup_message_title = COALESCE(_payload->>'signup_message_title', signup_message_title),
    signup_message_subtitle = COALESCE(_payload->>'signup_message_subtitle', signup_message_subtitle),
    signup_message_description = COALESCE(_payload->>'signup_message_description', signup_message_description),
    signup_message_footer = COALESCE(_payload->>'signup_message_footer', signup_message_footer),
    login_auto_enable_at = CASE WHEN _payload ? 'login_auto_enable_at' THEN NULLIF(_payload->>'login_auto_enable_at','')::timestamptz ELSE login_auto_enable_at END,
    signup_auto_enable_at = CASE WHEN _payload ? 'signup_auto_enable_at' THEN NULLIF(_payload->>'signup_auto_enable_at','')::timestamptz ELSE signup_auto_enable_at END,
    updated_by = caller,
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO new_row;

  PERFORM public.record_admin_action(
    'auth_controls.update',
    CASE
      WHEN prev_row.login_enabled IS DISTINCT FROM new_row.login_enabled THEN (CASE WHEN new_row.login_enabled THEN 'enable_login' ELSE 'disable_login' END)
      WHEN prev_row.signup_enabled IS DISTINCT FROM new_row.signup_enabled THEN (CASE WHEN new_row.signup_enabled THEN 'enable_signup' ELSE 'disable_signup' END)
      ELSE 'update_messages'
    END,
    true,
    jsonb_build_object('previous', to_jsonb(prev_row), 'next', to_jsonb(new_row))
  );

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auth_access_controls() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_auth_access_controls(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_access_controls() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_auth_access_controls(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8) Realtime publication recovery
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'activity_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'auth_access_controls'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_access_controls';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.activity_events REPLICA IDENTITY FULL;
ALTER TABLE public.auth_access_controls REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------
-- 9) Post-run verification snapshot
-- ---------------------------------------------------------------------
SELECT
  current_database() AS database_name,
  current_setting('request.jwt.claim.sub', true) AS jwt_sub,
  to_regclass('public.profiles') AS profiles_table,
  to_regclass('public.user_roles') AS user_roles_table,
  to_regclass('public.mcqs') AS mcqs_table,
  to_regclass('public.quizzes') AS quizzes_table,
  to_regclass('public.exam_attempts') AS exam_attempts_table,
  to_regclass('public.activity_events') AS activity_events_table,
  to_regclass('public.site_settings') AS site_settings_table,
  to_regclass('public.auth_access_controls') AS auth_access_controls_table,
  to_regprocedure('public.has_role(uuid, public.app_role)') AS has_role_rpc,
  to_regprocedure('public.has_permission(uuid, text)') AS has_permission_rpc,
  to_regprocedure('public.admin_user_analytics()') AS admin_user_analytics_rpc,
  to_regprocedure('public.admin_activity_overview(integer)') AS admin_activity_overview_rpc,
  to_regprocedure('public.admin_list_public_tables()') AS admin_list_public_tables_rpc,
  to_regprocedure('public.admin_get_db_size()') AS admin_get_db_size_rpc,
  to_regprocedure('public.admin_get_table_sizes()') AS admin_get_table_sizes_rpc,
  to_regprocedure('public.admin_run_select_query(text, integer)') AS admin_run_select_query_rpc,
  to_regprocedure('public.get_auth_access_controls()') AS get_auth_access_controls_rpc,
  to_regprocedure('public.update_auth_access_controls(jsonb)') AS update_auth_access_controls_rpc;