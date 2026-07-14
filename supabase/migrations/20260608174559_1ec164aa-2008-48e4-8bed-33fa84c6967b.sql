
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission text NOT NULL,
  action text,
  allowed boolean NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_action_log TO authenticated;
GRANT ALL ON public.admin_action_log TO service_role;

ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read admin_action_log" ON public.admin_action_log;
CREATE POLICY "Admins read admin_action_log" ON public.admin_action_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Users insert own admin_action_log" ON public.admin_action_log;
CREATE POLICY "Users insert own admin_action_log" ON public.admin_action_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_admin_action_log_created_at ON public.admin_action_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_log_user ON public.admin_action_log (user_id, created_at DESC);

INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','manage_system')
ON CONFLICT (role, permission) DO NOTHING;
