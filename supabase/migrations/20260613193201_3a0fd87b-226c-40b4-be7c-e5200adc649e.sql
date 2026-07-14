CREATE OR REPLACE FUNCTION public.admin_get_db_size_for_user(_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  IF _user_id IS NULL OR NOT internal.is_admin(_user_id) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  RETURN pg_database_size(current_database());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_db_size_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_db_size_for_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_get_table_sizes_for_user(_user_id uuid)
RETURNS TABLE(table_name text, size_bytes bigint, row_estimate bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, internal
AS $$
BEGIN
  IF _user_id IS NULL OR NOT internal.is_admin(_user_id) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  RETURN QUERY
  SELECT c.relname::text,
         pg_total_relation_size(c.oid)::bigint,
         GREATEST(c.reltuples, 0)::bigint
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_table_sizes_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_table_sizes_for_user(uuid) TO service_role;