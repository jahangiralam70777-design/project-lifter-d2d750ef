
-- ============================================================
-- PHASE 3: CRITICAL SECURITY HARDENING
-- ============================================================
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS spages_public_read ON public.site_pages;

DROP POLICY IF EXISTS "public reads site settings" ON public.site_settings;
DROP POLICY IF EXISTS ssettings_public_read ON public.site_settings;
CREATE POLICY ssettings_public_read ON public.site_settings
  FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.site_settings FROM anon;
GRANT SELECT (id, key, published_value, published_at, updated_at, created_at) ON public.site_settings TO anon;
GRANT SELECT ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

DROP POLICY IF EXISTS notif_sent_read ON public.notifications;
REVOKE SELECT ON public.mcqs FROM anon;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.role_permissions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.user_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.user_login_events; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.activity_events; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ============================================================
-- PHASE 4: BLOG SYSTEM SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_categories TO authenticated;
GRANT ALL ON public.blog_categories TO service_role;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_categories_public_read ON public.blog_categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY blog_categories_admin_write ON public.blog_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS trg_blog_categories_updated ON public.blog_categories;
CREATE TRIGGER trg_blog_categories_updated BEFORE UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_tags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_tags TO authenticated;
GRANT ALL ON public.blog_tags TO service_role;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_tags_public_read ON public.blog_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY blog_tags_admin_write ON public.blog_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reading_minutes INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  seo_title TEXT,
  seo_description TEXT,
  og_image_url TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON public.blog_posts (category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON public.blog_posts (author_id);
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_posts_public_read_published ON public.blog_posts
  FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY blog_posts_admin_write ON public.blog_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP TRIGGER IF EXISTS trg_blog_posts_updated ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.blog_post_tags (
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
GRANT SELECT ON public.blog_post_tags TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_post_tags TO authenticated;
GRANT ALL ON public.blog_post_tags TO service_role;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_post_tags_public_read ON public.blog_post_tags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY blog_post_tags_admin_write ON public.blog_post_tags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.blog_views (
  id BIGSERIAL PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blog_views_post_time ON public.blog_views (post_id, created_at DESC);
GRANT INSERT ON public.blog_views TO anon, authenticated;
GRANT SELECT ON public.blog_views TO authenticated;
GRANT ALL ON public.blog_views TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.blog_views_id_seq TO anon, authenticated;
ALTER TABLE public.blog_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY blog_views_anyone_insert ON public.blog_views FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY blog_views_admin_read ON public.blog_views FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.blog_increment_view(_post_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.blog_posts SET view_count = view_count + 1 WHERE id = _post_id AND status = 'published';
END;
$$;
REVOKE ALL ON FUNCTION public.blog_increment_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.blog_increment_view(UUID) TO anon, authenticated;

INSERT INTO public.blog_categories (slug, name, description, sort_order)
VALUES ('general', 'General', 'General articles and announcements', 0)
ON CONFLICT (slug) DO NOTHING;
