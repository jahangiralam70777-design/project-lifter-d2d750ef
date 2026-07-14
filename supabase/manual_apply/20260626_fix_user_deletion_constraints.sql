-- =============================================================
-- FIX: User Deletion Constraints
-- =============================================================
-- Root causes of "Database error deleting user" and re-registration
-- failure identified in audit of 2026-06-26.
--
-- BUG 1 — live_chat_notes.author_id (CRITICAL BLOCKER)
--   Declaration: author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL
--   When auth.admin.deleteUser() fires, Postgres tries to SET author_id = NULL
--   but the NOT NULL constraint rejects it → FK violation →
--   "Database error deleting user" → auth.users row never removed →
--   same email cannot re-register.
--   Fix: Drop the NOT NULL constraint so SET NULL can succeed.
--
-- BUG 2 — live_chat_conversations CHECK constraint (SECONDARY BLOCKER)
--   Constraint: check (user_id is not null OR (guest_token IS NOT NULL AND guest_email IS NOT NULL))
--   When a registered-user conversation has user_id SET NULL on delete,
--   and guest_token / guest_email are NULL, the CHECK fires →
--   second FK violation that also blocks auth.users deletion.
--   Fix: Drop the old check; replace with a permissive version that
--   only enforces the party constraint at INSERT/creation time via
--   a trigger (or drop entirely — historical rows must not block deletes).
--
-- HOW TO APPLY:
--   Supabase Dashboard → SQL Editor → run once. Safe to re-run.
-- =============================================================

-- ---------------------------------------------------------------
-- BUG 1 FIX: Remove NOT NULL from live_chat_notes.author_id
-- ---------------------------------------------------------------
ALTER TABLE public.live_chat_notes
  ALTER COLUMN author_id DROP NOT NULL;

-- ---------------------------------------------------------------
-- BUG 2 FIX: Drop the blocking CHECK on live_chat_conversations
-- ---------------------------------------------------------------
ALTER TABLE public.live_chat_conversations
  DROP CONSTRAINT IF EXISTS live_chat_conversations_party_chk;

-- Replace with a trigger-based check that fires only on INSERT,
-- so deletions (which SET user_id = NULL) are never blocked.
CREATE OR REPLACE FUNCTION public.tg_lcc_party_check()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.user_id IS NULL AND (NEW.guest_token IS NULL OR NEW.guest_email IS NULL) THEN
    RAISE EXCEPTION
      'live_chat_conversations: either user_id or (guest_token + guest_email) must be set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lcc_party_check ON public.live_chat_conversations;
CREATE TRIGGER trg_lcc_party_check
  BEFORE INSERT ON public.live_chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_lcc_party_check();

-- ---------------------------------------------------------------
-- HARDENING: keep this later-dated file as the authoritative final version of
-- admin_hard_delete_user. It includes the generic auth.users FK cleanup from
-- 20260625_auth_user_delete_hardening.sql plus the exact live-chat blockers
-- fixed above. This prevents timestamp-order application from overwriting the
-- robust RPC with an older table-specific implementation.
-- ---------------------------------------------------------------
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

  -- Clean every public table that points at auth.users. Tables whose FK is
  -- SET NULL / nullable preserve history; tables whose FK is CASCADE or whose
  -- columns cannot be nulled delete user-owned rows. This is resilient to
  -- production drift and future tables.
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

  -- Attempt direct auth.users delete. If anything still blocks deletion, expose
  -- the exact remaining constraint instead of swallowing the error.
  BEGIN
    DELETE FROM auth.users WHERE id = _id;
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Auth user delete blocked by remaining foreign key constraint: %', SQLERRM
      USING ERRCODE = '23503';
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) TO authenticated, service_role;
