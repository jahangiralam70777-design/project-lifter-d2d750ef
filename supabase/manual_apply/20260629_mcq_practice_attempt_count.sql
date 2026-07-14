-- Track total MCQ Practice submissions per (user, MCQ).
-- Unique completion progress still uses one row per (user, MCQ); the new
-- `attempt_count` column lets the "MCQs Solved" counter grow every time a
-- student re-submits the same practice MCQ.
--
-- Idempotent: safe to re-apply.

ALTER TABLE public.mcq_practice_progress
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1;

-- Atomic upsert RPC: on conflict, refresh the latest answer + bump counter.
CREATE OR REPLACE FUNCTION public.record_mcq_practice_answer(
  p_mcq_id uuid,
  p_chapter_id uuid,
  p_subject_id uuid,
  p_level text,
  p_chosen_option public.mcq_option,
  p_is_correct boolean,
  p_time_spent_ms integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.mcq_practice_progress (
    user_id, mcq_id, chapter_id, subject_id, level,
    chosen_option, is_correct, time_spent_ms,
    answered_at, updated_at, attempt_count
  ) VALUES (
    auth.uid(), p_mcq_id, p_chapter_id, p_subject_id, p_level,
    p_chosen_option, COALESCE(p_is_correct, false), COALESCE(p_time_spent_ms, 0),
    now(), now(), 1
  )
  ON CONFLICT (user_id, mcq_id) DO UPDATE SET
    chapter_id    = EXCLUDED.chapter_id,
    subject_id    = EXCLUDED.subject_id,
    level         = COALESCE(EXCLUDED.level, public.mcq_practice_progress.level),
    chosen_option = EXCLUDED.chosen_option,
    is_correct    = EXCLUDED.is_correct,
    time_spent_ms = EXCLUDED.time_spent_ms,
    answered_at   = now(),
    updated_at    = now(),
    attempt_count = public.mcq_practice_progress.attempt_count + 1
  RETURNING attempt_count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_mcq_practice_answer(uuid, uuid, uuid, text, public.mcq_option, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_mcq_practice_answer(uuid, uuid, uuid, text, public.mcq_option, boolean, integer) TO authenticated;
