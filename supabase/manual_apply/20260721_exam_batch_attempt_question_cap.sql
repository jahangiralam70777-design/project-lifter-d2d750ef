-- Ensure a student attempt receives exactly the admin-configured question count.
-- Cap the INSERT to `exam.total_questions` so an over-attached exam question
-- pool never inflates the student's Question Palette. Also enforces a stable
-- LIMIT ordering after randomisation.

CREATE OR REPLACE FUNCTION public.exam_batch_start_or_resume_attempt(
  _exam_id             uuid,
  _user_id             uuid,
  _duration_minutes    int,
  _randomize_questions boolean,
  _randomize_options   boolean
) RETURNS TABLE (attempt_id uuid, resumed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_attempt  uuid;
  v_total    int;
BEGIN
  IF _user_id <> auth.uid() AND NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('exam_batch:start:' || _exam_id::text || ':' || _user_id::text));

  SELECT a.id INTO v_existing
    FROM public.exam_batch_attempts a
   WHERE a.exam_id = _exam_id AND a.user_id = _user_id AND a.status = 'in_progress'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, true;
    RETURN;
  END IF;

  SELECT total_questions INTO v_total FROM public.exam_batch_exams WHERE id = _exam_id;
  IF v_total IS NULL OR v_total <= 0 THEN v_total := 500; END IF;

  INSERT INTO public.exam_batch_attempts(exam_id, user_id, status, started_at, expected_finish_at)
  VALUES (_exam_id, _user_id, 'in_progress', now(),
          now() + make_interval(mins => _duration_minutes))
  RETURNING id INTO v_attempt;

  INSERT INTO public.exam_batch_attempt_question_order(attempt_id, position, question_id, option_order)
  SELECT
    v_attempt,
    (row_number() OVER ()) - 1,
    question_id,
    option_order
  FROM (
    SELECT
      eq.question_id,
      (
        SELECT CASE WHEN _randomize_options
          THEN (SELECT array_agg(i ORDER BY random())
                  FROM generate_series(0, COALESCE(jsonb_array_length(q.options),0) - 1) i)
          ELSE (SELECT array_agg(i ORDER BY i)
                  FROM generate_series(0, COALESCE(jsonb_array_length(q.options),0) - 1) i)
        END
        FROM public.exam_batch_questions_v q WHERE q.id = eq.question_id
      ) AS option_order
    FROM public.exam_batch_exam_questions eq
    WHERE eq.exam_id = _exam_id
    ORDER BY CASE WHEN _randomize_questions THEN random() ELSE eq.position::float END
    LIMIT v_total
  ) picked;

  PERFORM public.exam_batch_attendance_reset_on_participation(_user_id, _exam_id);

  RETURN QUERY SELECT v_attempt, false;
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) TO authenticated, service_role;
