-- Create a function to update status of users whose end_date has passed
CREATE OR REPLACE FUNCTION public.update_expired_user_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE account_technical_users
  SET status = 'inactive',
      updated_at = now()
  WHERE end_date IS NOT NULL
    AND end_date < CURRENT_DATE
    AND status = 'active';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Also create a trigger to automatically set status on insert/update if end_date is in the past
CREATE OR REPLACE FUNCTION public.check_user_end_date_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.end_date IS NOT NULL AND NEW.end_date < CURRENT_DATE THEN
    NEW.status := 'inactive';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_user_end_date_trigger
BEFORE INSERT OR UPDATE ON account_technical_users
FOR EACH ROW
EXECUTE FUNCTION public.check_user_end_date_on_change();