
-- 1) List all public tables with size + row estimate (admin only)
CREATE OR REPLACE FUNCTION public.admin_list_public_tables()
RETURNS TABLE(table_name text, size_bytes bigint, row_estimate bigint, rls_enabled boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  RETURN QUERY
    SELECT c.relname::text,
           pg_total_relation_size(c.oid)::bigint,
           c.reltuples::bigint,
           c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname ASC;
END; $$;

-- 2) Full table metadata as JSON (columns, fks, indexes, policies)
CREATE OR REPLACE FUNCTION public.admin_table_metadata(_table text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  cols jsonb;
  fks jsonb;
  inbound_fks jsonb;
  idx jsonb;
  pols jsonb;
  pk_cols text[];
  tbl_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname = _table AND c.relkind='r'
  ) INTO tbl_exists;
  IF NOT tbl_exists THEN
    RAISE EXCEPTION 'Unknown public table: %', _table;
  END IF;

  -- primary key columns
  SELECT COALESCE(array_agg(a.attname ORDER BY array_position(i.indkey::int[], a.attnum)), ARRAY[]::text[])
  INTO pk_cols
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey)
  WHERE i.indisprimary AND n.nspname='public' AND c.relname=_table;

  -- columns
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', column_name,
      'data_type', data_type,
      'is_nullable', is_nullable = 'YES',
      'default', column_default,
      'ordinal_position', ordinal_position,
      'is_pk', column_name = ANY(pk_cols)
  ) ORDER BY ordinal_position), '[]'::jsonb)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name=_table;

  -- outbound foreign keys (this table -> other)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'constraint_name', conname,
      'columns', cols_arr,
      'foreign_table', ref_tbl,
      'foreign_columns', ref_cols
  )), '[]'::jsonb)
  INTO fks
  FROM (
    SELECT con.conname,
      (SELECT array_agg(attname ORDER BY a.ord) FROM unnest(con.conkey) WITH ORDINALITY a(attnum, ord)
         JOIN pg_attribute pa ON pa.attrelid = con.conrelid AND pa.attnum = a.attnum) AS cols_arr,
      ref_cls.relname AS ref_tbl,
      (SELECT array_agg(attname ORDER BY a.ord) FROM unnest(con.confkey) WITH ORDINALITY a(attnum, ord)
         JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = a.attnum) AS ref_cols
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
    WHERE con.contype='f' AND ns.nspname='public' AND cls.relname=_table
  ) s;

  -- inbound foreign keys (other -> this table)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'constraint_name', conname,
      'from_table', from_tbl,
      'from_columns', from_cols,
      'columns', to_cols
  )), '[]'::jsonb)
  INTO inbound_fks
  FROM (
    SELECT con.conname,
      cls.relname AS from_tbl,
      (SELECT array_agg(attname ORDER BY a.ord) FROM unnest(con.conkey) WITH ORDINALITY a(attnum, ord)
         JOIN pg_attribute pa ON pa.attrelid = con.conrelid AND pa.attnum = a.attnum) AS from_cols,
      (SELECT array_agg(attname ORDER BY a.ord) FROM unnest(con.confkey) WITH ORDINALITY a(attnum, ord)
         JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = a.attnum) AS to_cols
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
    JOIN pg_namespace rns ON rns.oid = ref_cls.relnamespace
    WHERE con.contype='f' AND rns.nspname='public' AND ref_cls.relname=_table
  ) s;

  -- indexes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', indexname, 'definition', indexdef
  )), '[]'::jsonb)
  INTO idx
  FROM pg_indexes WHERE schemaname='public' AND tablename=_table;

  -- RLS policies
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', policyname,
      'command', cmd,
      'roles', roles,
      'permissive', permissive,
      'using', qual,
      'with_check', with_check
  )), '[]'::jsonb)
  INTO pols
  FROM pg_policies WHERE schemaname='public' AND tablename=_table;

  RETURN jsonb_build_object(
    'table', _table,
    'primary_key', to_jsonb(pk_cols),
    'columns', cols,
    'foreign_keys', fks,
    'referenced_by', inbound_fks,
    'indexes', idx,
    'policies', pols
  );
END; $$;

-- 3) Safe SELECT runner: only single SELECT/WITH, admin only, hard row cap
CREATE OR REPLACE FUNCTION public.admin_run_select_query(_sql text, _max_rows int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
  -- strip trailing semicolons
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
    'security definer','pg_sleep'
  ] LOOP
    IF position(forbidden in lowered) > 0 THEN
      RAISE EXCEPTION 'Forbidden token in query: %', trim(forbidden);
    END IF;
  END LOOP;

  _max_rows := GREATEST(1, LEAST(COALESCE(_max_rows, 200), 1000));
  wrapped := format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT %s) t', trimmed, _max_rows);
  EXECUTE wrapped INTO result;
  RETURN jsonb_build_object('rows', result, 'limit', _max_rows);
END; $$;

-- 4) Global search across common text columns in public tables (admin only)
CREATE OR REPLACE FUNCTION public.admin_global_search(_term text, _limit int DEFAULT 50)
RETURNS TABLE(table_name text, id text, snippet text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, information_schema
AS $$
DECLARE
  rec record;
  pattern text;
  sql text;
  per int := GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _term IS NULL OR length(btrim(_term)) < 2 THEN
    RETURN;
  END IF;
  pattern := '%' || btrim(_term) || '%';
  FOR rec IN
    SELECT c.table_name, string_agg(quote_ident(c.column_name), ',' ORDER BY c.ordinal_position) AS cols,
           string_agg(format('%I::text ILIKE %L', c.column_name, pattern), ' OR ' ORDER BY c.ordinal_position) AS where_clause,
           (SELECT a.attname FROM pg_index i
              JOIN pg_class cls ON cls.oid = i.indrelid
              JOIN pg_namespace ns ON ns.oid = cls.relnamespace
              JOIN pg_attribute a ON a.attrelid = cls.oid AND a.attnum = ANY (i.indkey)
              WHERE i.indisprimary AND ns.nspname='public' AND cls.relname = c.table_name
              LIMIT 1) AS pk_col
    FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.column_name IN ('name','title','email','label','key','slug','display_name','description','question','body','content')
      AND c.data_type IN ('text','character varying','character','uuid')
    GROUP BY c.table_name
  LOOP
    BEGIN
      sql := format(
        'SELECT %L::text, COALESCE(%s::text, ''(no pk)''), left(concat_ws('' | '', %s)::text, 200) FROM public.%I WHERE %s LIMIT %s',
        rec.table_name,
        COALESCE(quote_ident(rec.pk_col), '''(no pk)'''),
        rec.cols, rec.table_name, rec.where_clause, per
      );
      RETURN QUERY EXECUTE sql;
    EXCEPTION WHEN OTHERS THEN
      -- skip tables that fail (permission, type mismatches, etc.)
      CONTINUE;
    END;
  END LOOP;
END; $$;

-- Permissions: only authenticated callers (admin gate is inside the functions)
REVOKE ALL ON FUNCTION public.admin_list_public_tables() FROM public;
REVOKE ALL ON FUNCTION public.admin_table_metadata(text) FROM public;
REVOKE ALL ON FUNCTION public.admin_run_select_query(text, int) FROM public;
REVOKE ALL ON FUNCTION public.admin_global_search(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_public_tables() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_table_metadata(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_run_select_query(text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_global_search(text, int) TO authenticated, service_role;
