
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  target_user_id TEXT,
  target_user_email TEXT,
  changed_by_user_id TEXT,
  changed_by_email TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  account_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs in their account"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can create audit log entries"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE INDEX idx_audit_logs_account_id ON public.audit_logs(account_id);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
