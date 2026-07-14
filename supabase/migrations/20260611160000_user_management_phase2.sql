-- =============================================================
-- Phase 2 — Enterprise User Management (additive, non-destructive)
-- =============================================================
-- HOW TO APPLY:
--   Open Lovable Cloud → SQL Editor and run this file once.
--   Safe to re-run (all statements are idempotent).
-- Adds: admin_notes, user_tags, user_messages, user_bans + helper RPC.
-- Nothing existing is dropped or altered destructively.

-- profiles: additive ban columns ------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;

-- admin_notes -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note_type text NOT NULL DEFAULT 'internal',
  title text,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notes TO authenticated;
GRANT ALL ON public.admin_notes TO service_role;
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage admin_notes" ON public.admin_notes;
CREATE POLICY "Admins manage admin_notes" ON public.admin_notes
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));
CREATE INDEX IF NOT EXISTS idx_admin_notes_user ON public.admin_notes (user_id, is_pinned DESC, created_at DESC);

-- user_tags ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag text NOT NULL,
  color text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tags TO authenticated;
GRANT ALL ON public.user_tags TO service_role;
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage user_tags" ON public.user_tags;
CREATE POLICY "Admins manage user_tags" ON public.user_tags
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));
DROP POLICY IF EXISTS "Users read own tags" ON public.user_tags;
CREATE POLICY "Users read own tags" ON public.user_tags
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_user_tags_user ON public.user_tags (user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag ON public.user_tags (tag);

-- user_messages -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'message',
  subject text,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_messages TO authenticated;
GRANT ALL ON public.user_messages TO service_role;
ALTER TABLE public.user_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage user_messages" ON public.user_messages;
CREATE POLICY "Admins manage user_messages" ON public.user_messages
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));
DROP POLICY IF EXISTS "Recipients read own messages" ON public.user_messages;
CREATE POLICY "Recipients read own messages" ON public.user_messages
  FOR SELECT TO authenticated USING (to_user_id = auth.uid());
DROP POLICY IF EXISTS "Recipients mark own read" ON public.user_messages;
CREATE POLICY "Recipients mark own read" ON public.user_messages
  FOR UPDATE TO authenticated USING (to_user_id = auth.uid()) WITH CHECK (to_user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_user_messages_to ON public.user_messages (to_user_id, created_at DESC);

-- user_bans ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'suspension',
  reason text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage user_bans" ON public.user_bans;
CREATE POLICY "Admins manage user_bans" ON public.user_bans
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_users'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_users'));
DROP POLICY IF EXISTS "Users read own bans" ON public.user_bans;
CREATE POLICY "Users read own bans" ON public.user_bans
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_user_bans_user ON public.user_bans (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_bans_active ON public.user_bans (user_id) WHERE lifted_at IS NULL;

-- is_user_banned helper ---------------------------------------
CREATE OR REPLACE FUNCTION public.is_user_banned(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_bans b
    WHERE b.user_id = _user_id
      AND b.lifted_at IS NULL
      AND (b.ends_at IS NULL OR b.ends_at > now())
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated, service_role;
