
DROP FUNCTION IF EXISTS public.admin_activity_overview();
DROP FUNCTION IF EXISTS public.admin_top_modules();
DROP FUNCTION IF EXISTS public.admin_top_users();
DROP FUNCTION IF EXISTS public.admin_top_buttons();
DROP FUNCTION IF EXISTS public.admin_top_pages();
DROP FUNCTION IF EXISTS public.admin_activity_timeseries();
DROP FUNCTION IF EXISTS public.admin_user_activity();
DROP FUNCTION IF EXISTS public.admin_user_analytics();

CREATE OR REPLACE FUNCTION public.admin_user_analytics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NULL),
    'deleted_users', (SELECT count(*) FROM public.profiles WHERE deleted_at IS NOT NULL),
    'active_24h', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '1 day' AND user_id IS NOT NULL),
    'active_7d', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '7 days' AND user_id IS NOT NULL),
    'active_30d', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '30 days' AND user_id IS NOT NULL),
    'lifetime_active', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE user_id IS NOT NULL),
    'total_logins', (SELECT coalesce(sum(total_login_count),0) FROM public.profiles),
    'avg_session_seconds', (SELECT coalesce(avg(duration_seconds),0)::int FROM public.user_login_events WHERE duration_seconds IS NOT NULL),
    'usage_24h', (SELECT coalesce(sum(duration_seconds),0)::int FROM public.user_login_events WHERE login_at >= now() - interval '1 day' AND duration_seconds IS NOT NULL),
    'usage_7d', (SELECT coalesce(sum(duration_seconds),0)::int FROM public.user_login_events WHERE login_at >= now() - interval '7 days' AND duration_seconds IS NOT NULL),
    'usage_30d', (SELECT coalesce(sum(duration_seconds),0)::int FROM public.user_login_events WHERE login_at >= now() - interval '30 days' AND duration_seconds IS NOT NULL),
    'dau', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '1 day' AND user_id IS NOT NULL),
    'wau', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '7 days' AND user_id IS NOT NULL),
    'mau', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - interval '30 days' AND user_id IS NOT NULL),
    'new_7d', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
    'new_30d', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_activity_overview(_range_hours int DEFAULT 24)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'events_window', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - make_interval(hours => _range_hours)),
    'unique_users_window', (SELECT count(DISTINCT user_id) FROM public.activity_events WHERE created_at >= now() - make_interval(hours => _range_hours) AND user_id IS NOT NULL),
    'page_views_window', (SELECT count(*) FROM public.activity_events WHERE event_type='page_view' AND created_at >= now() - make_interval(hours => _range_hours)),
    'clicks_window', (SELECT count(*) FROM public.activity_events WHERE event_type='click' AND created_at >= now() - make_interval(hours => _range_hours)),
    'events_24h', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - interval '1 day'),
    'events_7d', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - interval '7 days'),
    'events_30d', (SELECT count(*) FROM public.activity_events WHERE created_at >= now() - interval '30 days')
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_top_modules(_range_hours int DEFAULT 720, _limit int DEFAULT 10)
RETURNS TABLE(module text, event_count bigint, unique_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT module, count(*)::bigint, count(DISTINCT user_id)::bigint
  FROM public.activity_events
  WHERE module IS NOT NULL AND created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY module ORDER BY count(*) DESC LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.admin_top_buttons(_range_hours int DEFAULT 720, _limit int DEFAULT 50)
RETURNS TABLE(element_id text, element_label text, page_path text, click_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_id, element_label, page_path, count(*)::bigint
  FROM public.activity_events
  WHERE event_type='click' AND created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY target_id, element_label, page_path
  ORDER BY count(*) DESC LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.admin_top_pages(_range_hours int DEFAULT 720, _limit int DEFAULT 50)
RETURNS TABLE(page_path text, view_count bigint, unique_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT page_path, count(*)::bigint, count(DISTINCT user_id)::bigint
  FROM public.activity_events
  WHERE event_type='page_view' AND page_path IS NOT NULL AND created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY page_path ORDER BY count(*) DESC LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.admin_activity_timeseries(_range_hours int DEFAULT 720, _bucket_minutes int DEFAULT 1440)
RETURNS TABLE(bucket text, event_type text, event_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_char(
           to_timestamp(floor(extract(epoch from created_at) / (_bucket_minutes*60)) * (_bucket_minutes*60)),
           'YYYY-MM-DD"T"HH24:MI:SS"Z"'
         ),
         event_type, count(*)::bigint
  FROM public.activity_events
  WHERE created_at >= now() - make_interval(hours => _range_hours)
  GROUP BY 1,2 ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.admin_top_users(_order text DEFAULT 'most', _limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, display_name text, total_login_count int, total_usage_seconds bigint, last_login_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.display_name, coalesce(p.total_login_count,0),
         coalesce(p.total_usage_seconds,0)::bigint, p.last_login_at
  FROM public.profiles p
  WHERE p.deleted_at IS NULL
  ORDER BY
    CASE WHEN _order='most' THEN coalesce(p.total_usage_seconds,0) END DESC NULLS LAST,
    CASE WHEN _order='least' THEN coalesce(p.total_usage_seconds,0) END ASC NULLS LAST
  LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.admin_user_activity(_user_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(id uuid, user_id uuid, event_type text, page_path text, element_label text, module text, metadata jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, user_id, event_type, page_path, element_label, module, meta AS metadata, created_at
  FROM public.activity_events
  WHERE user_id = _user_id
  ORDER BY created_at DESC
  LIMIT _limit
$$;

CREATE OR REPLACE FUNCTION public.admin_soft_delete_user(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET deleted_at = now(), status = 'suspended' WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_user(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.profiles SET deleted_at = NULL, status = 'active' WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = _id;
  DELETE FROM public.profiles WHERE id = _id;
  BEGIN
    DELETE FROM auth.users WHERE id = _id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;
