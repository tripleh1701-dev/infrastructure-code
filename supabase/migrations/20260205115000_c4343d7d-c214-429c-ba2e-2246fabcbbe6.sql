
-- Create a function to automatically assign user_roles when a user signs up
-- This links auth.users to account_technical_users via email matching

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_technical_user RECORD;
BEGIN
  -- Find matching technical user by email
  SELECT atu.id, atu.account_id, atu.enterprise_id
  INTO v_technical_user
  FROM public.account_technical_users atu
  WHERE LOWER(atu.email) = LOWER(NEW.email)
    AND atu.status = 'active'
  LIMIT 1;

  -- If a matching technical user is found, create user_roles entry
  IF v_technical_user.id IS NOT NULL THEN
    -- Check if user_roles entry already exists
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
    ) THEN
      -- For admin@adminplatform.com, assign super_admin role
      IF LOWER(NEW.email) = 'admin@adminplatform.com' THEN
        INSERT INTO public.user_roles (user_id, role, account_id, enterprise_id)
        VALUES (NEW.id, 'super_admin', v_technical_user.account_id, v_technical_user.enterprise_id);
      ELSE
        -- For other users, assign 'user' role with their account/enterprise
        INSERT INTO public.user_roles (user_id, role, account_id, enterprise_id)
        VALUES (NEW.id, 'user', v_technical_user.account_id, v_technical_user.enterprise_id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users for new signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
