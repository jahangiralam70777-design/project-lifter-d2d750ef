-- Exam Batch: safe admin-only lookup for student contact info.
--
-- `public.profiles` intentionally does NOT store `email` (email lives on
-- `auth.users`). Prior versions of `adminListExamBatchEnrollments` selected
-- `profiles.email`, which fails with PostgreSQL 42703 (undefined_column) and
-- causes the Student Management / Enrollment queue pages to render nothing.
--
-- This RPC joins `profiles` with `auth.users` behind a SECURITY DEFINER
-- boundary and is gated by the `manage_content` permission, so it exposes
-- the display_name + email that admins already see elsewhere without
-- loosening RLS on either base table.

CREATE OR REPLACE FUNCTION public.exam_batch_admin_user_contacts(_ids uuid[])
RETURNS TABLE (id uuid, display_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_permission(auth.uid(), 'manage_content') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF((u.raw_user_meta_data->>'display_name'), ''),
      NULLIF((u.raw_user_meta_data->>'full_name'), ''),
      NULLIF((u.raw_user_meta_data->>'name'), ''),
      u.email
    )::text                                    AS display_name,
    u.email::text                              AS email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = ANY(_ids);
END
$$;

REVOKE EXECUTE ON FUNCTION public.exam_batch_admin_user_contacts(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.exam_batch_admin_user_contacts(uuid[]) TO authenticated, service_role;