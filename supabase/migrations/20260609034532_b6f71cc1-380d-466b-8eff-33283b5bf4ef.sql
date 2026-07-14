
-- =====================================================
-- Phase-3 Editor Engine — Production Integration Layer
-- Isolated from Phase-1; uses its own tables.
-- =====================================================

-- Role enum + user_roles guard (idempotent — Phase-1 may already define these)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
DO $$ BEGIN
  CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_editor_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.editor_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ---------- editor_pages: current working draft per page ----------
CREATE TABLE public.editor_pages (
  page_id text PRIMARY KEY,
  version_id uuid NOT NULL,
  parent_version_id uuid,
  draft_state jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.editor_pages TO authenticated;
GRANT ALL ON public.editor_pages TO service_role;
ALTER TABLE public.editor_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "editor_pages admin read"  ON public.editor_pages FOR SELECT TO authenticated USING (public.is_editor_admin());
CREATE POLICY "editor_pages admin write" ON public.editor_pages FOR ALL    TO authenticated USING (public.is_editor_admin()) WITH CHECK (public.is_editor_admin());
CREATE TRIGGER editor_pages_touch BEFORE UPDATE ON public.editor_pages FOR EACH ROW EXECUTE FUNCTION public.editor_set_updated_at();

-- ---------- editor_snapshots: immutable version chain ----------
CREATE TABLE public.editor_snapshots (
  version_id uuid PRIMARY KEY,
  page_id text NOT NULL,
  parent_version_id uuid,
  snapshot jsonb NOT NULL,
  summary text,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX editor_snapshots_page_idx ON public.editor_snapshots (page_id, created_at DESC);
GRANT SELECT, INSERT ON public.editor_snapshots TO authenticated;
GRANT ALL ON public.editor_snapshots TO service_role;
ALTER TABLE public.editor_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "editor_snapshots admin read"   ON public.editor_snapshots FOR SELECT TO authenticated USING (public.is_editor_admin());
CREATE POLICY "editor_snapshots admin insert" ON public.editor_snapshots FOR INSERT TO authenticated WITH CHECK (public.is_editor_admin());

-- ---------- editor_actions_log: action / audit log ----------
CREATE TABLE public.editor_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id text NOT NULL,
  version_id uuid,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX editor_actions_log_page_idx ON public.editor_actions_log (page_id, created_at DESC);
GRANT SELECT, INSERT ON public.editor_actions_log TO authenticated;
GRANT ALL ON public.editor_actions_log TO service_role;
ALTER TABLE public.editor_actions_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "editor_actions admin read"   ON public.editor_actions_log FOR SELECT TO authenticated USING (public.is_editor_admin());
CREATE POLICY "editor_actions admin insert" ON public.editor_actions_log FOR INSERT TO authenticated WITH CHECK (public.is_editor_admin());

-- ---------- editor_published_pages: live target (publish pipeline) ----------
-- Isolated from Phase-1 site_settings/homepage_sections; the public site can
-- read this table to render published content without Phase-1 changes.
CREATE TABLE public.editor_published_pages (
  page_id text PRIMARY KEY,
  version_id uuid NOT NULL,
  published_state jsonb NOT NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.editor_published_pages TO anon, authenticated;
GRANT ALL ON public.editor_published_pages TO service_role;
ALTER TABLE public.editor_published_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published pages public read" ON public.editor_published_pages FOR SELECT USING (true);
CREATE POLICY "published pages admin write" ON public.editor_published_pages FOR ALL TO authenticated USING (public.is_editor_admin()) WITH CHECK (public.is_editor_admin());

-- ---------- Atomic publish RPC ----------
-- Validates expected version, writes snapshot, upserts live row, logs the action — all in one txn.
CREATE OR REPLACE FUNCTION public.editor_publish_page(
  _page_id text,
  _expected_version uuid,
  _new_version uuid,
  _state jsonb,
  _summary text DEFAULT NULL
) RETURNS public.editor_published_pages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_version uuid;
  result public.editor_published_pages;
BEGIN
  IF NOT public.is_editor_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT version_id INTO current_version FROM public.editor_pages WHERE page_id = _page_id;
  IF current_version IS NOT NULL AND _expected_version IS NOT NULL AND current_version <> _expected_version THEN
    RAISE EXCEPTION 'version_conflict: expected=% actual=%', _expected_version, current_version USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.editor_snapshots (version_id, page_id, parent_version_id, snapshot, summary, author_id)
  VALUES (_new_version, _page_id, current_version, _state, COALESCE(_summary, 'publish'), auth.uid())
  ON CONFLICT (version_id) DO NOTHING;

  INSERT INTO public.editor_published_pages (page_id, version_id, published_state, published_by, published_at)
  VALUES (_page_id, _new_version, _state, auth.uid(), now())
  ON CONFLICT (page_id) DO UPDATE
    SET version_id = EXCLUDED.version_id,
        published_state = EXCLUDED.published_state,
        published_by = EXCLUDED.published_by,
        published_at = now()
  RETURNING * INTO result;

  INSERT INTO public.editor_actions_log (page_id, version_id, author_id, action_type, payload)
  VALUES (_page_id, _new_version, auth.uid(), 'publish', jsonb_build_object('summary', _summary));

  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.editor_publish_page(text, uuid, uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.editor_publish_page(text, uuid, uuid, jsonb, text) TO authenticated;

-- ---------- Realtime ----------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.editor_pages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.editor_snapshots;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.editor_published_pages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
