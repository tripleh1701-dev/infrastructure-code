
-- Create environments table
CREATE TABLE public.environments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  account_id TEXT NOT NULL,
  enterprise_id TEXT NOT NULL,
  workstream_id TEXT,
  product_id TEXT,
  service_id TEXT,
  connector_name TEXT,
  connectivity_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;

-- RLS policies (open for now since app uses service-level auth)
CREATE POLICY "Allow all access to environments"
  ON public.environments FOR ALL
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_environments_updated_at
  BEFORE UPDATE ON public.environments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Unique constraint to prevent duplicates
ALTER TABLE public.environments
  ADD CONSTRAINT environments_unique_combo
  UNIQUE (name, account_id, enterprise_id, workstream_id, product_id, service_id);
