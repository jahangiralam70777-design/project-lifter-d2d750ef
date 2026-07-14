REVOKE EXECUTE ON FUNCTION internal.is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.is_admin(uuid) TO service_role;