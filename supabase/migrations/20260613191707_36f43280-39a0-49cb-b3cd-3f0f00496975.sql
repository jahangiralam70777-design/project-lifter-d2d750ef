
-- Audit log table
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  permission text,
  action text,
  allowed boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read audit log" ON public.admin_action_log;
CREATE POLICY "admins read audit log" ON public.admin_action_log FOR SELECT TO authenticated
  USING (internal.is_admin(auth.uid()));
DROP POLICY IF EXISTS "service inserts audit log" ON public.admin_action_log;
CREATE POLICY "service inserts audit log" ON public.admin_action_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- has_permission: admin/super_admin gets all permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, internal AS $$
  SELECT internal.is_admin(_user_id);
$$;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

-- record_admin_action
CREATE OR REPLACE FUNCTION public.record_admin_action(
  _permission text, _action text, _allowed boolean, _metadata jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_action_log(user_id, permission, action, allowed, metadata)
  VALUES (auth.uid(), _permission, _action, COALESCE(_allowed,false), _metadata);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;$$;
GRANT EXECUTE ON FUNCTION public.record_admin_action(text, text, boolean, jsonb) TO authenticated, service_role;

-- admin_get_db_size
CREATE OR REPLACE FUNCTION public.admin_get_db_size()
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, internal AS $$
BEGIN
  IF NOT internal.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN pg_database_size(current_database());
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_get_db_size() TO authenticated, service_role;

-- admin_get_table_sizes
CREATE OR REPLACE FUNCTION public.admin_get_table_sizes()
RETURNS TABLE(table_name text, size_bytes bigint, row_estimate bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, internal AS $$
BEGIN
  IF NOT internal.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN QUERY
  SELECT c.relname::text,
         pg_total_relation_size(c.oid)::bigint,
         GREATEST(c.reltuples, 0)::bigint
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC;
END;$$;
GRANT EXECUTE ON FUNCTION public.admin_get_table_sizes() TO authenticated, service_role;
