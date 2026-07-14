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

DO $$ BEGIN
  CREATE POLICY activity_events_insert_own ON public.activity_events
    FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY activity_events_select_admin ON public.activity_events
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS activity_events_created_at_idx ON public.activity_events (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_user_created_idx ON public.activity_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_type_created_idx ON public.activity_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_path_created_idx ON public.activity_events (page_path, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_element_created_idx ON public.activity_events (element_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_events_module_created_idx ON public.activity_events (module, created_at DESC);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.activity_events REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.admin_activity_overview(_range_hours integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE since timestamptz := now() - make_interval(hours => _range_hours); result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT jsonb_build_object(
    'active_now', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '5 minutes' AND user_id IS NOT NULL),
    'unique_users_24h', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '24 hours' AND user_id IS NOT NULL),
    'unique_users_7d', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '7 days' AND user_id IS NOT NULL),
    'unique_users_30d', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '30 days' AND user_id IS NOT NULL),
    'total_events', (SELECT count(*) FROM public.activity_events WHERE created_at >= since),
    'total_clicks', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'click'),
    'total_page_views', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'page_view'),
    'total_logins', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'login'),
    'total_submits', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'submit'),
    'total_crud', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'crud'),
    'total_admin_actions', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'admin_action'),
    'api_errors', (SELECT count(*) FROM public.activity_events WHERE created_at >= since AND event_type = 'api_call' AND (metadata->>'ok')::boolean IS FALSE),
    'range_hours', _range_hours
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.admin_top_buttons(_range_hours integer DEFAULT 24, _limit integer DEFAULT 10)
RETURNS TABLE(element_id text, element_label text, page_path text, click_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT
    COALESCE(e.element_id, e.element_label, '(unknown)'),
    COALESCE(e.element_label, e.element_id, '(unknown)'),
    COALESCE(e.page_path, '/'),
    count(*)::bigint
    FROM public.activity_events e
    WHERE e.event_type = 'click' AND e.created_at >= now() - make_interval(hours => _range_hours)
    GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_top_pages(_range_hours integer DEFAULT 24, _limit integer DEFAULT 10)
RETURNS TABLE(page_path text, view_count bigint, unique_users bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT COALESCE(e.page_path, '/'), count(*)::bigint, count(DISTINCT e.user_id)::bigint
    FROM public.activity_events e
    WHERE e.event_type = 'page_view' AND e.created_at >= now() - make_interval(hours => _range_hours)
    GROUP BY 1 ORDER BY 2 DESC LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_top_modules(_range_hours integer DEFAULT 24, _limit integer DEFAULT 10)
RETURNS TABLE(module text, event_count bigint, unique_users bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT COALESCE(e.module, '(none)'), count(*)::bigint, count(DISTINCT e.user_id)::bigint
    FROM public.activity_events e
    WHERE e.created_at >= now() - make_interval(hours => _range_hours) AND e.module IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT _limit;
END $$;

CREATE OR REPLACE FUNCTION public.admin_activity_timeseries(_range_hours integer DEFAULT 24, _bucket_minutes integer DEFAULT 60)
RETURNS TABLE(bucket timestamptz, event_type text, event_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT date_bin(make_interval(mins => _bucket_minutes), e.created_at, timestamptz 'epoch'),
    e.event_type, count(*)::bigint
    FROM public.activity_events e
    WHERE e.created_at >= now() - make_interval(hours => _range_hours)
    GROUP BY 1, 2 ORDER BY 1 ASC;
END $$;

CREATE OR REPLACE FUNCTION public.admin_user_activity(_user_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE(id uuid, user_id uuid, event_type text, page_path text, element_label text, module text, metadata jsonb, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT e.id, e.user_id, e.event_type, e.page_path, e.element_label, e.module, e.metadata, e.created_at
    FROM public.activity_events e WHERE e.user_id = _user_id ORDER BY e.created_at DESC LIMIT _limit;
END $$;

DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
DO $$ BEGIN
  CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS user_roles_insert_admin ON public.user_roles;
CREATE POLICY user_roles_insert_admin ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS user_roles_update_admin ON public.user_roles;
CREATE POLICY user_roles_update_admin ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS user_roles_delete_admin ON public.user_roles;
CREATE POLICY user_roles_delete_admin ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS notifications_select_sent ON public.notifications;
DO $$ BEGIN
  CREATE POLICY notifications_select_admin ON public.notifications FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::public.app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY notifications_select_audience ON public.notifications FOR SELECT TO authenticated
    USING (
      status = 'sent' AND (
        audience = 'all'
        OR (audience = 'users' AND auth.uid() = ANY(audience_user_ids))
        OR (audience = 'level' AND audience_level IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.level = audience_level))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE EXECUTE ON FUNCTION public.admin_get_db_size() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_table_sizes() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_restore_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_soft_delete_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_user_analytics() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_activity_overview(integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_top_buttons(integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_top_users(text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_top_pages(integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_top_modules(integer, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_activity_timeseries(integer, integer) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.admin_activity_overview(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_buttons(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_pages(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_modules(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activity_timeseries(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_activity(uuid, integer) TO authenticated;