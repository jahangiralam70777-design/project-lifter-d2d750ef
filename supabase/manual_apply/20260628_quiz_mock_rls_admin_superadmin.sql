-- Fix: "new row violates row-level security policy for table quiz_questions"
--
-- Root cause: existing RLS policies on quizzes / quiz_questions only allow
-- has_role(auth.uid(),'admin'). Users whose only role is 'super_admin' (and
-- any admin path that depends on super_admin being recognised) get rejected
-- by the WITH CHECK clause when inserting generated quiz/mock questions.
--
-- This migration keeps RLS ENABLED and only widens the admin write policies
-- to recognise BOTH 'admin' and 'super_admin'. Moderator and student access
-- is untouched. Fully idempotent.

-- ---------------------------------------------------------------------------
-- quizzes (also stores mock tests via kind='mock')
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.quizzes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "quizzes_admin_write" ON public.quizzes;
    DROP POLICY IF EXISTS "quizzes_write_admin" ON public.quizzes;
    CREATE POLICY "quizzes_admin_write" ON public.quizzes
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

    DROP POLICY IF EXISTS "quizzes_published_read" ON public.quizzes;
    CREATE POLICY "quizzes_published_read" ON public.quizzes
      FOR SELECT
      USING (
        status = 'published'
        OR public.has_role(auth.uid(),'admin')
        OR public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'moderator')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- quiz_questions (mapping table used by both quizzes and mock tests)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.quiz_questions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "qq_admin_write" ON public.quiz_questions;
    DROP POLICY IF EXISTS "quiz_questions_write_admin" ON public.quiz_questions;
    CREATE POLICY "qq_admin_write" ON public.quiz_questions
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
      WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

    DROP POLICY IF EXISTS "qq_public_read" ON public.quiz_questions;
    DROP POLICY IF EXISTS "quiz_questions_select" ON public.quiz_questions;
    CREATE POLICY "qq_public_read" ON public.quiz_questions
      FOR SELECT USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Defensive: same widening for any other admin-managed content tables that
-- the quiz/mock generation flow touches transitively. Safe no-ops if the
-- table or policy is absent.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mcqs','subjects','chapters','levels','question_bank_resources'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "%s_admin_write" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "%s_admin_write" ON public.%I FOR ALL TO authenticated '||
        'USING (public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''super_admin'')) '||
        'WITH CHECK (public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''super_admin''))',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- Make sure GRANTs are present (idempotent).
DO $$ BEGIN
  IF to_regclass('public.quiz_questions') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated';
    EXECUTE 'GRANT ALL ON public.quiz_questions TO service_role';
  END IF;
  IF to_regclass('public.quizzes') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated';
    EXECUTE 'GRANT ALL ON public.quizzes TO service_role';
  END IF;
END $$;
