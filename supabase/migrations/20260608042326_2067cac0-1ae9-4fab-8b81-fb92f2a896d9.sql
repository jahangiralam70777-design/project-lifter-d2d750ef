ALTER TABLE public.mcqs
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'mcq'
    CHECK (question_type IN ('mcq', 'true_false'));

ALTER TABLE public.mcqs ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE public.mcqs ALTER COLUMN option_d DROP NOT NULL;

CREATE INDEX IF NOT EXISTS mcqs_question_type_idx ON public.mcqs (question_type);

CREATE OR REPLACE FUNCTION public.mcqs_validate_question_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.question_type = 'true_false' THEN
    IF NEW.option_a IS NULL OR length(btrim(NEW.option_a)) = 0
       OR NEW.option_b IS NULL OR length(btrim(NEW.option_b)) = 0 THEN
      RAISE EXCEPTION 'True/False questions require option_a and option_b';
    END IF;
    NEW.option_c := NULL;
    NEW.option_d := NULL;
    IF NEW.correct_option NOT IN ('A','B') THEN
      RAISE EXCEPTION 'True/False correct_option must be A or B';
    END IF;
  ELSE
    IF NEW.option_a IS NULL OR NEW.option_b IS NULL OR NEW.option_c IS NULL OR NEW.option_d IS NULL THEN
      RAISE EXCEPTION 'MCQ questions require all four options';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mcqs_validate_question_type_trg ON public.mcqs;
CREATE TRIGGER mcqs_validate_question_type_trg
  BEFORE INSERT OR UPDATE ON public.mcqs
  FOR EACH ROW EXECUTE FUNCTION public.mcqs_validate_question_type();