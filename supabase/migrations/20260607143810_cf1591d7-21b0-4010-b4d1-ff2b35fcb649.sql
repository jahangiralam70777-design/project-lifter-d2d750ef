
ALTER TABLE public.mcqs ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE public.mcqs ALTER COLUMN option_d DROP NOT NULL;
ALTER TABLE public.mcqs
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq','true_false'));

ALTER TABLE public.subjects ALTER COLUMN level DROP NOT NULL;
ALTER TABLE public.quizzes ALTER COLUMN level DROP NOT NULL;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reject_reason text;
CREATE INDEX IF NOT EXISTS quiz_sessions_status_created_idx ON public.quiz_sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_sessions_user_status_idx ON public.quiz_sessions (user_id, status);

CREATE TABLE IF NOT EXISTS public.study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL DEFAULT 'dashboard',
  subject_id uuid,
  chapter_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_sessions_user_started_idx ON public.study_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS study_sessions_user_open_idx ON public.study_sessions(user_id) WHERE ended_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY study_sessions_select_own ON public.study_sessions FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY study_sessions_insert_own ON public.study_sessions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY study_sessions_update_own ON public.study_sessions FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER study_sessions_set_updated_at
    BEFORE UPDATE ON public.study_sessions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  is_home boolean NOT NULL DEFAULT false,
  seo_title text,
  seo_description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_pages_one_home_idx ON public.site_pages ((is_home)) WHERE is_home = true;

GRANT SELECT ON public.site_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "site_pages public read published"
    ON public.site_pages FOR SELECT
    USING (status = 'published' OR public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_pages admin all"
    ON public.site_pages FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER site_pages_updated_at
    BEFORE UPDATE ON public.site_pages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.site_pages (slug, title, is_home, status, sort_order)
VALUES
  ('home', 'Home', true, 'published', 0),
  ('about', 'About Us', false, 'draft', 1),
  ('courses', 'Courses', false, 'draft', 2),
  ('features', 'Features', false, 'draft', 3),
  ('blogs', 'Blogs', false, 'draft', 4),
  ('contact', 'Contact Us', false, 'draft', 5),
  ('faq', 'FAQ', false, 'draft', 6)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.site_page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  kind text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_page_sections_page_id_idx ON public.site_page_sections(page_id, sort_order);

GRANT SELECT ON public.site_page_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_page_sections TO authenticated;
GRANT ALL ON public.site_page_sections TO service_role;

ALTER TABLE public.site_page_sections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "site_page_sections public read"
    ON public.site_page_sections FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "site_page_sections admin all"
    ON public.site_page_sections FOR ALL
    USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER site_page_sections_updated_at
    BEFORE UPDATE ON public.site_page_sections
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
