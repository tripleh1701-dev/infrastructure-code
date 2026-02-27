
-- Update handle_new_user to assign 'viewer' role and a default group
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_technical_user RECORD;
  v_default_group_id uuid;
BEGIN
  -- Find matching technical user by email
  SELECT atu.id, atu.account_id, atu.enterprise_id
  INTO v_technical_user
  FROM public.account_technical_users atu
  WHERE LOWER(atu.email) = LOWER(NEW.email)
    AND atu.status = 'active'
  LIMIT 1;

  -- If a matching technical user is found, create user_roles and user_groups entries
  IF v_technical_user.id IS NOT NULL THEN
    -- Create user_roles entry if not exists
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
    ) THEN
      -- For admin@adminplatform.com, assign super_admin role
      IF LOWER(NEW.email) = 'admin@adminplatform.com' THEN
        INSERT INTO public.user_roles (user_id, role, account_id, enterprise_id)
        VALUES (NEW.id, 'super_admin', v_technical_user.account_id, v_technical_user.enterprise_id);
      ELSE
        -- For other users, assign 'viewer' role
        INSERT INTO public.user_roles (user_id, role, account_id, enterprise_id)
        VALUES (NEW.id, 'viewer', v_technical_user.account_id, v_technical_user.enterprise_id);
      END IF;
    END IF;

    -- Assign to default group: find or create one for the account
    SELECT g.id INTO v_default_group_id
    FROM public.groups g
    WHERE g.account_id = v_technical_user.account_id
      AND g.name = 'Default'
    LIMIT 1;

    -- If no 'Default' group exists for this account, create one
    IF v_default_group_id IS NULL THEN
      INSERT INTO public.groups (name, description, account_id, enterprise_id)
      VALUES ('Default', 'Default group for new users', v_technical_user.account_id, v_technical_user.enterprise_id)
      RETURNING id INTO v_default_group_id;
    END IF;

    -- Assign user to the default group if not already assigned
    IF NOT EXISTS (
      SELECT 1 FROM public.user_groups WHERE user_id = v_technical_user.id AND group_id = v_default_group_id
    ) THEN
      INSERT INTO public.user_groups (user_id, group_id)
      VALUES (v_technical_user.id, v_default_group_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
