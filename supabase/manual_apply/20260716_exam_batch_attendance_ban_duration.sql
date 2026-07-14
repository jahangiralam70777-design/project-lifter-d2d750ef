-- Exam Batch: attendance ban duration + WhatsApp contact indexing.
--
-- Adds `banned_until` to the (user, session, subject) attendance state so a
-- manual OR automatic ban can be either permanent (NULL) or scheduled to
-- expire at a specific timestamp. The application layer treats any row
-- where `banned_until <= now()` as no longer banned, and the sweep RPC
-- below flips the flag durably.
--
-- Fully idempotent. Safe to re-run.

BEGIN;

ALTER TABLE public.exam_batch_attendance_state
  ADD COLUMN IF NOT EXISTS banned_until timestamptz;

CREATE INDEX IF NOT EXISTS exam_batch_attendance_state_ban_expiry_idx
  ON public.exam_batch_attendance_state(banned_until)
  WHERE banned = true AND banned_until IS NOT NULL;

-- Auto-expire any (session, subject) ban whose window has ended. Called
-- lazily by the server before reading state so a banned student who has
-- served their duration regains access without an admin action.
CREATE OR REPLACE FUNCTION public.exam_batch_attendance_expire_bans(_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  UPDATE public.exam_batch_attendance_state s
     SET banned         = false,
         banned_at      = NULL,
         banned_reason  = NULL,
         banned_by      = NULL,
         banned_until   = NULL,
         auto_banned    = false,
         consecutive_missed_count = 0,
         updated_at     = now()
   WHERE s.banned = true
     AND s.banned_until IS NOT NULL
     AND s.banned_until <= now()
     AND (_user_id IS NULL OR s.user_id = _user_id);

  GET DIAGNOSTICS _updated = ROW_COUNT;

  IF _updated > 0 THEN
    INSERT INTO public.exam_batch_attendance_events
      (user_id, session_id, subject_id, kind, previous_count, new_count, reason, actor_id)
    SELECT s.user_id, s.session_id, s.subject_id, 'manual_unban', 0, 0,
           'auto: ban expired', NULL
      FROM public.exam_batch_attendance_state s
     WHERE s.banned = false
       AND s.updated_at >= now() - interval '5 seconds'
       AND (_user_id IS NULL OR s.user_id = _user_id);
  END IF;

  RETURN _updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exam_batch_attendance_expire_bans(uuid) TO authenticated, service_role;

COMMIT;
