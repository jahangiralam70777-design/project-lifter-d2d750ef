-- Phase 3a Q-H2: tighten quiz_questions SELECT.
--
-- The previous policy was `USING (true)` which let every authenticated user
-- enumerate the entire quiz→MCQ mapping table for ALL quizzes, including
-- drafts and unpublished mocks. Combined with any future weakening of the
-- `mcqs` projection (which currently strips correct_option in server fns),
-- this becomes a pre-exam answer-key reconnaissance path.
--
-- New rule:
--   * authenticated students see rows only for quizzes that are published
--   * admin / super_admin keep unrestricted read for the editor UI
--
-- Idempotent (drop then create), safe to re-apply.

DO $$
BEGIN
  IF to_regclass('public.quiz_questions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "qq_public_read" ON public.quiz_questions;
    CREATE POLICY "qq_public_read" ON public.quiz_questions
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.quizzes q
          WHERE q.id = quiz_questions.quiz_id
            AND q.status = 'published'
        )
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'super_admin')
      );
  END IF;
END $$;
