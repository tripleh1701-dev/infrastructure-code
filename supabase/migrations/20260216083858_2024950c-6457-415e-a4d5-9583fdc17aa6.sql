
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_technical_user RECORD;
  v_default_group_id uuid;
  v_viewer_role_id uuid;
BEGIN
  -- Find matching technical user by email
  SELECT atu.id, atu.account_id, atu.enterprise_id
  INTO v_technical_user
  FROM public.account_technical_users atu
  WHERE LOWER(atu.email) = LOWER(NEW.email)
    AND atu.status = 'active'
  LIMIT 1;

  IF v_technical_user.id IS NOT NULL THEN
    -- Create user_roles entry if not exists
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
    ) THEN
      IF LOWER(NEW.email) = 'admin@adminplatform.com' THEN
        INSERT INTO public.user_roles (user_id, role, account_id, enterprise_id)
        VALUES (NEW.id, 'super_admin', v_technical_user.account_id, v_technical_user.enterprise_id);
      ELSE
        INSERT INTO public.user_roles (user_id, role, account_id, enterprise_id)
        VALUES (NEW.id, 'viewer', v_technical_user.account_id, v_technical_user.enterprise_id);
      END IF;
    END IF;

    -- Find or create Default group for the account
    SELECT g.id INTO v_default_group_id
    FROM public.groups g
    WHERE g.account_id = v_technical_user.account_id
      AND g.name = 'Default'
    LIMIT 1;

    IF v_default_group_id IS NULL THEN
      INSERT INTO public.groups (name, description, account_id, enterprise_id)
      VALUES ('Default', 'Default group for new users', v_technical_user.account_id, v_technical_user.enterprise_id)
      RETURNING id INTO v_default_group_id;
    END IF;

    -- Assign user to default group
    IF NOT EXISTS (
      SELECT 1 FROM public.user_groups WHERE user_id = v_technical_user.id AND group_id = v_default_group_id
    ) THEN
      INSERT INTO public.user_groups (user_id, group_id)
      VALUES (v_technical_user.id, v_default_group_id);
    END IF;

    -- Find the Viewer role in roles table and link to Default group
    SELECT r.id INTO v_viewer_role_id
    FROM public.roles r
    WHERE r.name = 'Viewer'
      AND r.account_id = v_technical_user.account_id
    LIMIT 1;

    IF v_viewer_role_id IS NOT NULL AND v_default_group_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.group_roles WHERE group_id = v_default_group_id AND role_id = v_viewer_role_id
      ) THEN
        INSERT INTO public.group_roles (group_id, role_id)
        VALUES (v_default_group_id, v_viewer_role_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
