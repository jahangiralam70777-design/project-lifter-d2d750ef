-- Real-time account revocation events for immediate delete/ban logout.

CREATE TABLE IF NOT EXISTS public.account_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('deleted','banned','suspended','missing')),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.account_status_events TO authenticated;
GRANT ALL ON public.account_status_events TO service_role;

ALTER TABLE public.account_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own account revocations" ON public.account_status_events;
CREATE POLICY "Users read own account revocations"
ON public.account_status_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_permission(auth.uid(), 'manage_users'));

CREATE INDEX IF NOT EXISTS idx_account_status_events_user_created
ON public.account_status_events (user_id, created_at DESC);

ALTER TABLE public.account_status_events REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_bans REPLICA IDENTITY FULL;
ALTER TABLE public.user_sessions REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_status_events','profiles','user_bans','user_sessions'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.emit_account_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reason text;
  _uid uuid;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    _uid := COALESCE(NEW.id, OLD.id);
    IF TG_OP = 'DELETE' THEN
      _reason := 'deleted';
    ELSIF NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) THEN
      _reason := 'deleted';
    ELSIF NEW.status IN ('suspended','deleted','banned') AND OLD.status IS DISTINCT FROM NEW.status THEN
      _reason := CASE WHEN NEW.status = 'banned' THEN 'banned' ELSE 'suspended' END;
    END IF;
  ELSIF TG_TABLE_NAME = 'user_bans' THEN
    _uid := NEW.user_id;
    IF NEW.lifted_at IS NULL AND (NEW.ends_at IS NULL OR NEW.ends_at > now()) THEN
      _reason := 'banned';
    END IF;
  END IF;

  IF _uid IS NOT NULL AND _reason IS NOT NULL THEN
    INSERT INTO public.account_status_events(user_id, reason, metadata)
    VALUES (_uid, _reason, jsonb_build_object('source_table', TG_TABLE_NAME, 'operation', TG_OP));

    INSERT INTO public.user_sessions(user_id, active_session_id, user_agent, updated_at)
    VALUES (_uid, 'revoked:' || _reason || ':' || extract(epoch from clock_timestamp())::text, 'trigger:' || TG_TABLE_NAME, now())
    ON CONFLICT (user_id) DO UPDATE
      SET active_session_id = EXCLUDED.active_session_id,
          user_agent = EXCLUDED.user_agent,
          updated_at = now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_account_status_event ON public.profiles;
CREATE TRIGGER trg_profiles_account_status_event
AFTER UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.emit_account_status_event();

DROP TRIGGER IF EXISTS trg_user_bans_account_status_event ON public.user_bans;
CREATE TRIGGER trg_user_bans_account_status_event
AFTER INSERT OR UPDATE ON public.user_bans
FOR EACH ROW EXECUTE FUNCTION public.emit_account_status_event();