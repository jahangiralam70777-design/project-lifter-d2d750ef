-- =============================================================================
-- Study Routine — Admin monitoring: SQL-level filtering / sorting / pagination
-- Incremental. Idempotent. Adds indexes and a security-definer RPC that
-- aggregates per-student data server-side so the admin panel scales to
-- hundreds of thousands of rows without loading them into the app runtime.
-- Apply manually via the Supabase SQL editor. No demo/seed data.
-- =============================================================================

-- --------- Supporting indexes -------------------------------------------------
CREATE INDEX IF NOT EXISTS study_routines_user_type_idx
  ON public.study_routines(user_id, type);
CREATE INDEX IF NOT EXISTS study_routines_filters_idx
  ON public.study_routines(level_code, subject_id, chapter_id)
  WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS study_routines_user_created_idx
  ON public.study_routines(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS study_routine_tasks_user_status_idx
  ON public.study_routine_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_updated_idx
  ON public.study_routine_tasks(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS study_routine_tasks_user_date_idx
  ON public.study_routine_tasks(user_id, task_date);

-- --------- Admin students RPC -------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_routine_students(
  p_search        text DEFAULT '',
  p_level_code    text DEFAULT '',
  p_subject_id    uuid DEFAULT NULL,
  p_chapter_id    uuid DEFAULT NULL,
  p_routine_type  public.study_routine_type DEFAULT NULL,
  p_status        text DEFAULT 'all',
  p_sort_by       text DEFAULT 'last_active',
  p_sort_dir      text DEFAULT 'desc',
  p_page          int  DEFAULT 1,
  p_page_size     int  DEFAULT 20
) RETURNS TABLE (
  user_id        uuid,
  routine_count  bigint,
  total_tasks    bigint,
  completed      bigint,
  pending        bigint,
  study_minutes  bigint,
  last_active    timestamptz,
  created_at     timestamptz,
  level_code     text,
  subject_id     uuid,
  chapter_id     uuid,
  routine_type   public.study_routine_type,
  completion     int,
  email          text,
  name           text,
  total_count    bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT COALESCE(public.has_role(auth.uid(), 'admin'::app_role), false)
      OR COALESCE(public.has_role(auth.uid(), 'super_admin'::app_role), false)
    INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered_routines AS (
    SELECT r.user_id, r.level_code, r.subject_id, r.chapter_id,
           r.type, r.created_at
      FROM public.study_routines r
     WHERE r.is_archived = false
       AND (COALESCE(p_level_code, '') = '' OR r.level_code = p_level_code)
       AND (p_subject_id   IS NULL OR r.subject_id   = p_subject_id)
       AND (p_chapter_id   IS NULL OR r.chapter_id   = p_chapter_id)
       AND (p_routine_type IS NULL OR r.type         = p_routine_type)
  ),
  primary_routine AS (
    SELECT DISTINCT ON (fr.user_id)
           fr.user_id, fr.level_code, fr.subject_id, fr.chapter_id,
           fr.type AS routine_type
      FROM filtered_routines fr
     ORDER BY fr.user_id, fr.created_at DESC
  ),
  routine_agg AS (
    SELECT fr.user_id,
           COUNT(*)::bigint         AS routine_count,
           MIN(fr.created_at)::timestamptz AS created_at
      FROM filtered_routines fr
     GROUP BY fr.user_id
  ),
  task_agg AS (
    SELECT t.user_id,
           COUNT(*)::bigint                                                       AS total_tasks,
           COUNT(*) FILTER (WHERE t.status = 'completed')::bigint                 AS completed,
           COUNT(*) FILTER (WHERE t.status <> 'completed')::bigint                AS pending,
           COALESCE(SUM(
             CASE WHEN t.status = 'completed'
                  THEN GREATEST(0, (EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 60)::int)
                  ELSE 0 END
           ), 0)::bigint                                                          AS study_minutes,
           MAX(COALESCE(t.updated_at, t.created_at))::timestamptz                 AS last_active
      FROM public.study_routine_tasks t
     WHERE t.user_id IN (SELECT user_id FROM routine_agg)
     GROUP BY t.user_id
  ),
  merged AS (
    SELECT ra.user_id,
           ra.routine_count,
           COALESCE(ta.total_tasks,   0) AS total_tasks,
           COALESCE(ta.completed,     0) AS completed,
           COALESCE(ta.pending,       0) AS pending,
           COALESCE(ta.study_minutes, 0) AS study_minutes,
           ta.last_active,
           ra.created_at,
           pr.level_code,
           pr.subject_id,
           pr.chapter_id,
           pr.routine_type,
           CASE WHEN COALESCE(ta.total_tasks, 0) > 0
                THEN ROUND(ta.completed::numeric * 100 / ta.total_tasks)::int
                ELSE 0 END AS completion,
           NULLIF(p.email, '')::text AS email,
           NULLIF(COALESCE(p.display_name, p.full_name), '')::text AS name
      FROM routine_agg ra
      LEFT JOIN task_agg        ta ON ta.user_id = ra.user_id
      LEFT JOIN primary_routine pr ON pr.user_id = ra.user_id
      LEFT JOIN public.profiles p  ON p.id       = ra.user_id
  ),
  searched AS (
    SELECT m.*
      FROM merged m
     WHERE (
             COALESCE(p_search, '') = '' OR
             COALESCE(m.name,  '') ILIKE '%' || p_search || '%' OR
             COALESCE(m.email, '') ILIKE '%' || p_search || '%'
           )
       AND (
             p_status = 'all' OR
             (p_status = 'active'   AND m.completed >  0) OR
             (p_status = 'inactive' AND m.completed =  0)
           )
  ),
  counted AS (
    SELECT s.*, (COUNT(*) OVER ())::bigint AS total_count FROM searched s
  )
  SELECT c.user_id, c.routine_count, c.total_tasks, c.completed, c.pending,
         c.study_minutes, c.last_active, c.created_at,
         c.level_code, c.subject_id, c.chapter_id, c.routine_type,
         c.completion, c.email, c.name, c.total_count
    FROM counted c
   ORDER BY
     CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'desc' THEN c.last_active END DESC NULLS LAST,
     CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'asc'  THEN c.last_active END ASC  NULLS LAST,
     CASE WHEN p_sort_by = 'completion'  AND p_sort_dir = 'desc' THEN c.completion  END DESC,
     CASE WHEN p_sort_by = 'completion'  AND p_sort_dir = 'asc'  THEN c.completion  END ASC,
     CASE WHEN p_sort_by = 'tasks'       AND p_sort_dir = 'desc' THEN c.total_tasks END DESC,
     CASE WHEN p_sort_by = 'tasks'       AND p_sort_dir = 'asc'  THEN c.total_tasks END ASC,
     CASE WHEN p_sort_by = 'created'     AND p_sort_dir = 'desc' THEN c.created_at  END DESC,
     CASE WHEN p_sort_by = 'created'     AND p_sort_dir = 'asc'  THEN c.created_at  END ASC,
     c.user_id ASC
   LIMIT GREATEST(1, LEAST(p_page_size, 200))
   OFFSET GREATEST(0, (p_page - 1) * p_page_size);
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_routine_students(
  text, text, uuid, uuid, public.study_routine_type, text, text, text, int, int
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_routine_students(
  text, text, uuid, uuid, public.study_routine_type, text, text, text, int, int
) TO authenticated;
