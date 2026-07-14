
CREATE OR REPLACE FUNCTION public.admin_run_select_query(_sql text, _max_rows integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  trimmed text;
  lowered text;
  forbidden text;
  result jsonb;
  wrapped text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _sql IS NULL OR length(btrim(_sql)) = 0 THEN
    RAISE EXCEPTION 'Empty query';
  END IF;
  trimmed := btrim(_sql);
  WHILE right(trimmed, 1) = ';' LOOP
    trimmed := btrim(left(trimmed, length(trimmed)-1));
  END LOOP;
  IF position(';' in trimmed) > 0 THEN
    RAISE EXCEPTION 'Only a single statement is allowed';
  END IF;
  lowered := lower(trimmed);
  IF NOT (lowered LIKE 'select%' OR lowered LIKE 'with%') THEN
    RAISE EXCEPTION 'Only SELECT / WITH queries are allowed';
  END IF;
  FOREACH forbidden IN ARRAY ARRAY[
    'insert ','update ','delete ','drop ','alter ','create ','grant ','revoke ',
    'truncate ','vacuum ','copy ','do ','call ','comment ','reindex ','listen ',
    'notify ','prepare ','execute ','reset ','set ','lock ','refresh ','cluster ',
    'security definer','pg_sleep','pg_read_server_files','pg_read_binary_file',
    'pg_ls_dir','pg_stat_file','lo_import','lo_export','dblink',
    'pg_catalog.','information_schema.','pg_authid','pg_shadow','pg_user',
    'pg_largeobject','pg_roles'
  ] LOOP
    IF position(forbidden in lowered) > 0 THEN
      RAISE EXCEPTION 'Forbidden token in query: %', trim(forbidden);
    END IF;
  END LOOP;

  _max_rows := GREATEST(1, LEAST(COALESCE(_max_rows, 200), 500));
  -- Defense-in-depth: cap how long this query can run on the server.
  PERFORM set_config('statement_timeout', '5000', true);
  wrapped := format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT %s) t', trimmed, _max_rows);
  EXECUTE wrapped INTO result;
  RETURN jsonb_build_object('rows', result, 'limit', _max_rows);
END; $function$;
