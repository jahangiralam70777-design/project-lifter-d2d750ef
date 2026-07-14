
CREATE TABLE IF NOT EXISTS public.module_visibility (
  key text PRIMARY KEY,
  label text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.module_visibility TO anon, authenticated;
GRANT SELECT, UPDATE ON public.module_visibility TO authenticated;
GRANT ALL ON public.module_visibility TO service_role;

ALTER TABLE public.module_visibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "module_visibility public read"
  ON public.module_visibility FOR SELECT USING (true);

CREATE POLICY "module_visibility admin write"
  ON public.module_visibility FOR UPDATE TO authenticated
  USING (public.is_editor_admin()) WITH CHECK (public.is_editor_admin());

INSERT INTO public.module_visibility (key, label) VALUES
  ('mcq_practice', 'MCQ Practice'),
  ('quiz',        'Quiz'),
  ('mock_test',   'Mock Test'),
  ('flash_cards', 'Flash Cards'),
  ('short_notes', 'Short Notes'),
  ('qns_bank',    'Question Bank'),
  ('classes',     'Video Classes')
ON CONFLICT (key) DO NOTHING;
