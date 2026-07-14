REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('internal.has_role(uuid, public.app_role)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION internal.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION internal.has_role(uuid, public.app_role) TO service_role;
  END IF;
END $$;