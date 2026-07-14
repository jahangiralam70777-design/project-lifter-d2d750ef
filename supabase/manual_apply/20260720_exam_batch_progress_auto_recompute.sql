-- Auto-recompute the student progress summary whenever a scored attempt
-- result is inserted or updated. Keeps Progress Center statistics live
-- (in addition to the client-side realtime invalidation) and consistent
-- with the Result Page + Leaderboard, which read the same rows.
--
-- Idempotent: safe to re-apply.

CREATE OR REPLACE FUNCTION public.exam_batch_progress_after_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.exam_batch_recompute_progress(NEW.user_id);
  EXCEPTION WHEN OTHERS THEN
    -- Never fail the scoring write because a summary refresh had trouble.
    RAISE NOTICE 'exam_batch_progress_after_result: recompute failed for user %: %', NEW.user_id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS exam_batch_progress_after_result_ins
  ON public.exam_batch_attempt_results;
CREATE TRIGGER exam_batch_progress_after_result_ins
  AFTER INSERT OR UPDATE ON public.exam_batch_attempt_results
  FOR EACH ROW EXECUTE FUNCTION public.exam_batch_progress_after_result();
