
-- 1. Drop the unused bootstrap helper. It runs arbitrary SQL via EXECUTE and
--    has no search_path pinned. It is no longer needed post-bootstrap.
DROP FUNCTION IF EXISTS public._bootstrap_exec(text);

-- 2. Revoke EXECUTE from anon on every admin-only function. The in-function
--    has_role(auth.uid(),'admin') check already blocks non-admins, but
--    revoking at the grant layer means anonymous (signed-out) requests are
--    rejected before the function body ever runs.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT n.nspname AS schema_name, p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE 'admin\_%' ESCAPE '\'
           OR p.proname IN ('editor_publish_page','claim_user_session'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon;',
                   fn.schema_name, fn.func_name, fn.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %I.%I(%s) TO authenticated;',
                   fn.schema_name, fn.func_name, fn.args);
  END LOOP;
END $$;
