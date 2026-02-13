-- Create credentials table for storing connector authentication
CREATE TABLE public.credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  connector TEXT NOT NULL,
  auth_type TEXT NOT NULL,
  -- Encrypted credentials storage
  credentials JSONB DEFAULT '{}',
  -- OAuth specific fields
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
  oauth_scope TEXT,
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
  last_used_at TIMESTAMP WITH TIME ZONE,
  -- Metadata
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for credentials access (scoped by account/enterprise)
CREATE POLICY "Users can view credentials in their account"
ON public.credentials
FOR SELECT
USING (
  account_id IN (
    SELECT account_id FROM public.account_technical_users 
    WHERE account_id = credentials.account_id
  )
);

CREATE POLICY "Users can create credentials in their account"
ON public.credentials
FOR INSERT
WITH CHECK (
  account_id IN (
    SELECT account_id FROM public.account_technical_users 
    WHERE account_id = credentials.account_id
  )
);

CREATE POLICY "Users can update credentials in their account"
ON public.credentials
FOR UPDATE
USING (
  account_id IN (
    SELECT account_id FROM public.account_technical_users 
    WHERE account_id = credentials.account_id
  )
);

CREATE POLICY "Users can delete credentials in their account"
ON public.credentials
FOR DELETE
USING (
  account_id IN (
    SELECT account_id FROM public.account_technical_users 
    WHERE account_id = credentials.account_id
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_credentials_updated_at
BEFORE UPDATE ON public.credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_credentials_account_enterprise ON public.credentials(account_id, enterprise_id);
CREATE INDEX idx_credentials_workstream ON public.credentials(workstream_id);
CREATE INDEX idx_credentials_connector ON public.credentials(connector);
CREATE INDEX idx_credentials_status ON public.credentials(status);

-- Create OAuth states table for CSRF protection during OAuth flow
CREATE TABLE public.oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  credential_id UUID REFERENCES public.credentials(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on oauth_states
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- OAuth states should be accessible by the edge function (service role)
CREATE POLICY "Service role can manage oauth states"
ON public.oauth_states
FOR ALL
USING (true)
WITH CHECK (true);

-- Create index for state lookups
CREATE INDEX idx_oauth_states_state ON public.oauth_states(state);
CREATE INDEX idx_oauth_states_expires ON public.oauth_states(expires_at);