-- Create credential_workstreams junction table for many-to-many relationship
CREATE TABLE public.credential_workstreams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_id uuid NOT NULL REFERENCES public.credentials(id) ON DELETE CASCADE,
  workstream_id uuid NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(credential_id, workstream_id)
);

-- Enable RLS
ALTER TABLE public.credential_workstreams ENABLE ROW LEVEL SECURITY;

-- RLS policies matching credentials table patterns
CREATE POLICY "Users can view credential workstreams in their account"
ON public.credential_workstreams
FOR SELECT
USING (
  credential_id IN (
    SELECT c.id FROM public.credentials c
    WHERE c.account_id IN (
      SELECT atu.account_id FROM public.account_technical_users atu
      WHERE atu.account_id = c.account_id
    )
  )
);

CREATE POLICY "Users can manage credential workstreams in their account"
ON public.credential_workstreams
FOR ALL
USING (
  credential_id IN (
    SELECT c.id FROM public.credentials c
    WHERE c.account_id IN (
      SELECT atu.account_id FROM public.account_technical_users atu
      WHERE atu.account_id = c.account_id
    )
  )
)
WITH CHECK (
  credential_id IN (
    SELECT c.id FROM public.credentials c
    WHERE c.account_id IN (
      SELECT atu.account_id FROM public.account_technical_users atu
      WHERE atu.account_id = c.account_id
    )
  )
);

-- Make existing workstream_id column nullable for backward compatibility
ALTER TABLE public.credentials ALTER COLUMN workstream_id DROP NOT NULL;

-- Create index for better query performance
CREATE INDEX idx_credential_workstreams_credential_id ON public.credential_workstreams(credential_id);
CREATE INDEX idx_credential_workstreams_workstream_id ON public.credential_workstreams(workstream_id);