
CREATE TABLE public.site_pages (
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

CREATE UNIQUE INDEX site_pages_one_home_idx ON public.site_pages ((is_home)) WHERE is_home = true;

GRANT SELECT ON public.site_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;
GRANT ALL ON public.site_pages TO service_role;

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_pages public read published"
  ON public.site_pages FOR SELECT
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "site_pages admin all"
  ON public.site_pages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER site_pages_updated_at
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_pages (slug, title, is_home, status, sort_order)
VALUES
  ('home', 'Home', true, 'published', 0),
  ('about', 'About Us', false, 'draft', 1),
  ('courses', 'Courses', false, 'draft', 2),
  ('features', 'Features', false, 'draft', 3),
  ('blogs', 'Blogs', false, 'draft', 4),
  ('contact', 'Contact Us', false, 'draft', 5),
  ('faq', 'FAQ', false, 'draft', 6);

CREATE TABLE public.site_page_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
  kind text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX site_page_sections_page_id_idx ON public.site_page_sections(page_id, sort_order);

GRANT SELECT ON public.site_page_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_page_sections TO authenticated;
GRANT ALL ON public.site_page_sections TO service_role;

ALTER TABLE public.site_page_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_page_sections public read"
  ON public.site_page_sections FOR SELECT
  USING (true);

CREATE POLICY "site_page_sections admin all"
  ON public.site_page_sections FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER site_page_sections_updated_at
  BEFORE UPDATE ON public.site_page_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
