ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS display_name TEXT;

UPDATE public.user_roles SET display_name = CASE role::text
  WHEN 'admin' THEN 'Admin'
  WHEN 'moderator' THEN 'Moderator'
  WHEN 'user' THEN 'User'
  WHEN 'student' THEN 'Student'
  WHEN 'super_admin' THEN 'Super Admin'
  ELSE initcap(role::text)
END;

-- For future inserts, set a default display_name based on role via trigger
CREATE OR REPLACE FUNCTION public.set_role_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.display_name IS NULL OR NEW.display_name = '' THEN
    NEW.display_name := CASE NEW.role::text
      WHEN 'admin' THEN 'Admin'
      WHEN 'moderator' THEN 'Moderator'
      WHEN 'user' THEN 'User'
      WHEN 'student' THEN 'Student'
      WHEN 'super_admin' THEN 'Super Admin'
      ELSE initcap(NEW.role::text)
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_role_display_name_trigger ON public.user_roles;
CREATE TRIGGER set_role_display_name_trigger
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_role_display_name();