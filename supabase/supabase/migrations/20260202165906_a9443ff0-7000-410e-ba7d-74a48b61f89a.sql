-- Create notification history table
CREATE TABLE public.notification_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  license_id UUID NOT NULL REFERENCES public.account_licenses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'renewal_reminder',
  subject TEXT NOT NULL,
  days_until_expiry INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all to view notification_history" 
ON public.notification_history 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all to insert notification_history" 
ON public.notification_history 
FOR INSERT 
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notification_history_license_id ON public.notification_history(license_id);
CREATE INDEX idx_notification_history_sent_at ON public.notification_history(sent_at DESC);