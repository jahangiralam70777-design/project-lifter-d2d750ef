CREATE OR REPLACE FUNCTION public._lovable_import_exec(q text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE q; END; $$;
REVOKE ALL ON FUNCTION public._lovable_import_exec(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._lovable_import_exec(text) TO service_role;