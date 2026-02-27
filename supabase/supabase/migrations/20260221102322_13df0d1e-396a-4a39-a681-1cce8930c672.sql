
-- Provisioning notification subscribers
-- Stores email recipients and their filter preferences for SNS provisioning notifications
CREATE TABLE public.provisioning_notification_subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  filter_type TEXT NOT NULL DEFAULT 'all' CHECK (filter_type IN ('all', 'failures_only', 'cloud_type')),
  cloud_type_filter TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE(account_id, email)
);

-- Enable RLS
ALTER TABLE public.provisioning_notification_subscribers ENABLE ROW LEVEL SECURITY;

-- RLS policies: users with account access can manage subscribers
CREATE POLICY "Users can view subscribers for their account"
  ON public.provisioning_notification_subscribers
  FOR SELECT
  USING (
    public.has_account_access(auth.uid(), account_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can create subscribers for their account"
  ON public.provisioning_notification_subscribers
  FOR INSERT
  WITH CHECK (
    public.has_account_access(auth.uid(), account_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can update subscribers for their account"
  ON public.provisioning_notification_subscribers
  FOR UPDATE
  USING (
    public.has_account_access(auth.uid(), account_id)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can delete subscribers for their account"
  ON public.provisioning_notification_subscribers
  FOR DELETE
  USING (
    public.has_account_access(auth.uid(), account_id)
    OR public.is_super_admin(auth.uid())
  );

-- Auto-update updated_at
CREATE TRIGGER update_provisioning_notification_subscribers_updated_at
  BEFORE UPDATE ON public.provisioning_notification_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast account-level queries
CREATE INDEX idx_provisioning_notif_subs_account 
  ON public.provisioning_notification_subscribers(account_id);
