-- Add expiration tracking columns to credentials table
ALTER TABLE public.credentials
ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS expiry_notice_days integer NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS expiry_notify boolean NOT NULL DEFAULT true;

-- Create credential_notification_history table for tracking credential expiry notifications
CREATE TABLE IF NOT EXISTS public.credential_notification_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name text NOT NULL,
  notification_type text NOT NULL DEFAULT 'credential_expiry_reminder',
  subject text NOT NULL,
  days_until_expiry integer NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error_message text,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on credential_notification_history
ALTER TABLE public.credential_notification_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for credential_notification_history
CREATE POLICY "Users can view credential notifications in their account"
ON public.credential_notification_history
FOR SELECT
USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Allow service role to insert credential notifications"
ON public.credential_notification_history
FOR INSERT
WITH CHECK (true);

-- Add index for efficient expiry lookups
CREATE INDEX IF NOT EXISTS idx_credentials_expires_at ON public.credentials(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credentials_expiry_notify ON public.credentials(expiry_notify) WHERE expiry_notify = true;
CREATE INDEX IF NOT EXISTS idx_credential_notification_history_credential_id ON public.credential_notification_history(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_notification_history_account_id ON public.credential_notification_history(account_id);