
-- Create connectors table
CREATE TABLE public.connectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  connector_type TEXT NOT NULL, -- e.g. "Source Control", "Project Management", etc.
  connector_tool TEXT NOT NULL, -- e.g. "GitHub", "Jira", "ServiceNow"
  category TEXT NOT NULL, -- e.g. "Plan", "Code", "Build", "Deploy"
  url TEXT, -- connectivity URL
  status TEXT NOT NULL DEFAULT 'connected',
  health TEXT NOT NULL DEFAULT 'healthy',
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_count INTEGER NOT NULL DEFAULT 0,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  service_id UUID REFERENCES public.services(id),
  credential_id UUID REFERENCES public.credentials(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create connector_workstreams join table
CREATE TABLE public.connector_workstreams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connector_id UUID NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(connector_id, workstream_id)
);

-- Enable RLS
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_workstreams ENABLE ROW LEVEL SECURITY;

-- RLS policies for connectors (same pattern as credentials)
CREATE POLICY "Users can view connectors in their account"
  ON public.connectors FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM account_technical_users
    WHERE account_id = connectors.account_id
  ));

CREATE POLICY "Users can create connectors in their account"
  ON public.connectors FOR INSERT
  WITH CHECK (account_id IN (
    SELECT account_id FROM account_technical_users
    WHERE account_id = connectors.account_id
  ));

CREATE POLICY "Users can update connectors in their account"
  ON public.connectors FOR UPDATE
  USING (account_id IN (
    SELECT account_id FROM account_technical_users
    WHERE account_id = connectors.account_id
  ));

CREATE POLICY "Users can delete connectors in their account"
  ON public.connectors FOR DELETE
  USING (account_id IN (
    SELECT account_id FROM account_technical_users
    WHERE account_id = connectors.account_id
  ));

-- RLS policies for connector_workstreams
CREATE POLICY "Users can view connector workstreams"
  ON public.connector_workstreams FOR SELECT
  USING (connector_id IN (
    SELECT id FROM connectors c
    WHERE c.account_id IN (
      SELECT account_id FROM account_technical_users
      WHERE account_id = c.account_id
    )
  ));

CREATE POLICY "Users can manage connector workstreams"
  ON public.connector_workstreams FOR ALL
  USING (connector_id IN (
    SELECT id FROM connectors c
    WHERE c.account_id IN (
      SELECT account_id FROM account_technical_users
      WHERE account_id = c.account_id
    )
  ))
  WITH CHECK (connector_id IN (
    SELECT id FROM connectors c
    WHERE c.account_id IN (
      SELECT account_id FROM account_technical_users
      WHERE account_id = c.account_id
    )
  ));
