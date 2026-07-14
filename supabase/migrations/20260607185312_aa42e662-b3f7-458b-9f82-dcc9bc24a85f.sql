
-- Enum additions
ALTER TYPE public.attempt_kind ADD VALUE IF NOT EXISTS 'mcq_practice';
ALTER TYPE public.attempt_kind ADD VALUE IF NOT EXISTS 'custom_exam';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';

-- Column additions
ALTER TABLE public.activity_events ADD COLUMN IF NOT EXISTS target_kind text;
CREATE INDEX IF NOT EXISTS idx_ae_target_kind ON public.activity_events(target_kind);

ALTER TABLE public.attempt_answers ADD COLUMN IF NOT EXISTS time_spent_ms integer NOT NULL DEFAULT 0;

ALTER TABLE public.study_sessions ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

-- Stub RPCs (return shapes that match what the app reads; safe to refine later)
CREATE OR REPLACE FUNCTION public.admin_user_analytics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'dau', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '1 day' AND user_id IS NOT NULL),
    'wau', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '7 days' AND user_id IS NOT NULL),
    'mau', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '30 days' AND user_id IS NOT NULL),
    'total_users', (SELECT count(*) FROM public.profiles),
    'new_7d', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
    'new_30d', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_activity_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'events_24h', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - interval '1 day'),
    'events_7d', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - interval '7 days'),
    'events_30d', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - interval '30 days')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_top_modules()
RETURNS TABLE(module text, event_count bigint, unique_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT module, count(*)::bigint, count(DISTINCT user_id)::bigint
  FROM public.activity_events
  WHERE module IS NOT NULL AND created_at >= now() - interval '30 days'
  GROUP BY module ORDER BY count(*) DESC LIMIT 20
$$;

CREATE OR REPLACE FUNCTION public.admin_top_users()
RETURNS TABLE(user_id uuid, event_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, count(*)::bigint
  FROM public.activity_events
  WHERE user_id IS NOT NULL AND created_at >= now() - interval '30 days'
  GROUP BY user_id ORDER BY count(*) DESC LIMIT 20
$$;

CREATE OR REPLACE FUNCTION public.admin_top_buttons()
RETURNS TABLE(element_id text, element_label text, page_path text, click_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_id, element_label, page_path, count(*)::bigint
  FROM public.activity_events
  WHERE event_type = 'click' AND created_at >= now() - interval '30 days'
  GROUP BY target_id, element_label, page_path
  ORDER BY count(*) DESC LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.admin_top_pages()
RETURNS TABLE(page_path text, view_count bigint, unique_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT page_path, count(*)::bigint, count(DISTINCT user_id)::bigint
  FROM public.activity_events
  WHERE event_type = 'page_view' AND page_path IS NOT NULL AND created_at >= now() - interval '30 days'
  GROUP BY page_path ORDER BY count(*) DESC LIMIT 50
$$;

CREATE OR REPLACE FUNCTION public.admin_activity_timeseries()
RETURNS TABLE(bucket text, event_type text, event_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD'), event_type, count(*)::bigint
  FROM public.activity_events
  WHERE created_at >= now() - interval '30 days'
  GROUP BY 1,2 ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.admin_user_activity()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'active_now', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '5 minutes' AND user_id IS NOT NULL),
    'active_24h', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '1 day' AND user_id IS NOT NULL)
  )
$$;

-- Grant execute to authenticated only (admins enforce via assertAdmin in server fns)
REVOKE EXECUTE ON FUNCTION public.admin_user_analytics() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_activity_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_top_modules() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_top_users() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_top_buttons() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_top_pages() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_activity_timeseries() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_analytics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_modules() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_buttons() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_top_pages() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_activity_timeseries() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_activity() TO authenticated, service_role;

-- Tighten security: scope has_role to authenticated only (linter WARN 28/29)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
