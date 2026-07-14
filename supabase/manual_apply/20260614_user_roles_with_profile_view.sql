-- ============================================================
-- View: public.user_roles_with_profile
-- Run this in Supabase Studio -> SQL Editor (one time).
-- After running, open the "user_roles_with_profile" view in
-- Table Editor instead of the raw user_roles table to see
-- display_name and email next to each role.
-- ============================================================

CREATE OR REPLACE VIEW public.user_roles_with_profile
WITH (security_invoker = true) AS
SELECT
  ur.id              AS role_row_id,
  ur.user_id,
  ur.role,
  COALESCE(
    NULLIF(p.display_name, ''),
    NULLIF((u.raw_user_meta_data->>'display_name'), ''),
    NULLIF((u.raw_user_meta_data->>'full_name'), ''),
    NULLIF((u.raw_user_meta_data->>'name'), ''),
    u.email
  )                  AS display_name,
  u.email,
  ur.created_at
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
LEFT JOIN auth.users     u ON u.id = ur.user_id;

GRANT SELECT ON public.user_roles_with_profile TO authenticated;
GRANT SELECT ON public.user_roles_with_profile TO service_role;

COMMENT ON VIEW public.user_roles_with_profile IS
  'Read-only join of user_roles + profiles + auth.users. Use this in Supabase Studio to see display_name and email instead of just user_id UUIDs.';
