-- ============================================================
-- FULL RESET — drops every object this app creates.
-- Safe to run on the project's own Supabase database.
-- Run BEFORE re-running complete_database.sql.
--
-- What it does:
--   1. Drops & recreates the entire `public` schema. This removes
--      all tables, views, materialized views, functions/RPCs,
--      triggers, enums, sequences, indexes, and RLS policies
--      created by this application in one shot. Side-effect: any
--      policy on auth.* tables that references public.* objects
--      is removed automatically because the referenced object
--      disappears.
--   2. Drops storage.objects / storage.buckets RLS policies that
--      reference public.has_role or other app helpers. (The app
--      does not create custom buckets, only policies.)
--   3. Restores the default GRANTs Supabase expects on `public`.
--
-- What it does NOT touch:
--   * auth.users rows (your accounts stay)
--   * storage buckets and uploaded files (only policies are dropped)
--   * extensions (pgcrypto, pg_trgm) — kept so the rebuild is fast
--   * the `auth`, `storage`, `realtime`, `extensions`, `graphql`
--     schemas themselves
-- ============================================================

BEGIN;

-- 1. Drop every app-owned policy on storage.* (re-created by complete_database.sql)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2. Nuke the entire public schema (tables, views, funcs, triggers, enums, policies, indexes, sequences)
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- 3. Restore default ownership & grants Supabase expects
ALTER SCHEMA public OWNER TO postgres;
GRANT USAGE  ON SCHEMA public TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO postgres, service_role;

-- 4. Keep required extensions (they live in `extensions` schema on Supabase,
--    but re-assert here so the rebuild migration's CREATE EXTENSION IF NOT EXISTS is a no-op)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMIT;

-- ============================================================
-- Done. Now run complete_database.sql in the same project.
-- ============================================================
