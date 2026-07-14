-- =============================================================
-- Auth recovery + user deletion hardening
-- =============================================================
-- Apply once in Supabase SQL Editor for production.
--
-- Fixes production drift that can make Supabase Auth deletion fail with:
--   "Database error deleting user"
--
-- Root cause class:
--   Any public-schema FK that references auth.users(id) with NO ACTION /
--   RESTRICT blocks deletion from Authentication > Users and leaves the email
--   held in auth.users, so re-registration becomes a fake success with no new
--   confirmation email.

-- 0) DIAGNOSTIC: run this SELECT first if you need to capture the exact live
-- failing constraint/table names before applying the repair block below.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  rc.delete_rule,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class rc_tbl ON rc_tbl.oid = con.confrelid
JOIN pg_namespace rn ON rn.oid = rc_tbl.relnamespace
JOIN information_schema.referential_constraints rc
  ON rc.constraint_schema = n.nspname
 AND rc.constraint_name = con.conname
WHERE con.contype = 'f'
  AND n.nspname = 'public'
  AND rn.nspname = 'auth'
  AND rc_tbl.relname = 'users'
ORDER BY rc.delete_rule, n.nspname, c.relname, con.conname;

DO $$
DECLARE
  r record;
  _cols text;
  _ref_cols text;
  _all_nullable boolean;
  _action text;
  _deferrability text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.conrelid,
      con.confrelid,
      con.conkey,
      con.confkey,
      con.condeferrable,
      con.condeferred,
      rc.delete_rule
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class rc_tbl ON rc_tbl.oid = con.confrelid
    JOIN pg_namespace rn ON rn.oid = rc_tbl.relnamespace
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = n.nspname
     AND rc.constraint_name = con.conname
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND rn.nspname = 'auth'
      AND rc_tbl.relname = 'users'
      AND rc.delete_rule IN ('NO ACTION', 'RESTRICT')
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      INTO _cols
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      INTO _ref_cols
    FROM unnest(r.confkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.confrelid AND a.attnum = u.attnum;

    SELECT bool_and(NOT a.attnotnull)
      INTO _all_nullable
    FROM unnest(r.conkey) AS u(attnum)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    _action := CASE WHEN _all_nullable THEN 'ON DELETE SET NULL' ELSE 'ON DELETE CASCADE' END;
    _deferrability := CASE
      WHEN r.condeferrable AND r.condeferred THEN 'DEFERRABLE INITIALLY DEFERRED'
      WHEN r.condeferrable THEN 'DEFERRABLE INITIALLY IMMEDIATE'
      ELSE 'NOT DEFERRABLE'
    END;

    RAISE NOTICE 'Repairing auth.users FK %.% constraint % from % to %',
      r.schema_name, r.table_name, r.constraint_name, r.delete_rule, _action;

    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.schema_name, r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES auth.users(%s) %s %s',
      r.schema_name,
      r.table_name,
      r.constraint_name,
      _cols,
      _ref_cols,
      _action,
      _deferrability
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  _caller uuid := auth.uid();
  r record;
  _pred text;
  _set_clause text;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  IF _id = _caller THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;
  IF public.has_role(_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Cannot permanently delete an admin. Demote first.';
  END IF;

  FOR r IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.conrelid,
      con.conkey,
      rc.delete_rule,
      bool_and(NOT a.attnotnull) AS all_nullable
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class rc_tbl ON rc_tbl.oid = con.confrelid
    JOIN pg_namespace rn ON rn.oid = rc_tbl.relnamespace
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = n.nspname
     AND rc.constraint_name = con.conname
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
      AND rn.nspname = 'auth'
      AND rc_tbl.relname = 'users'
    GROUP BY n.nspname, c.relname, con.conname, con.conrelid, con.conkey, rc.delete_rule
  LOOP
    SELECT string_agg(format('%I = %L::uuid', a.attname, _id), ' AND ' ORDER BY u.ord)
      INTO _pred
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    SELECT string_agg(format('%I = NULL', a.attname), ', ' ORDER BY u.ord)
      INTO _set_clause
    FROM unnest(r.conkey) WITH ORDINALITY AS u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = r.conrelid AND a.attnum = u.attnum;

    IF r.delete_rule = 'SET NULL' OR r.all_nullable THEN
      EXECUTE format('UPDATE %I.%I SET %s WHERE %s',
        r.schema_name, r.table_name, _set_clause, _pred);
    ELSE
      EXECUTE format('DELETE FROM %I.%I WHERE %s',
        r.schema_name, r.table_name, _pred);
    END IF;
  END LOOP;

  BEGIN
    DELETE FROM auth.users WHERE id = _id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Auth user delete blocked by remaining foreign key constraint: %', SQLERRM
      USING ERRCODE = '23503';
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) TO authenticated, service_role;
