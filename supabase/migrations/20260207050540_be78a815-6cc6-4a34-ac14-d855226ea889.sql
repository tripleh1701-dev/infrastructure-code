-- Create pipeline status enum
CREATE TYPE public.pipeline_status AS ENUM ('draft', 'active', 'inactive', 'archived');

-- Create pipelines table
CREATE TABLE public.pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status pipeline_status NOT NULL DEFAULT 'draft',
  deployment_type TEXT NOT NULL DEFAULT 'Integration',
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  yaml_content TEXT,
  product_id UUID REFERENCES public.products(id),
  service_ids UUID[] DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX idx_pipelines_account_id ON public.pipelines(account_id);
CREATE INDEX idx_pipelines_enterprise_id ON public.pipelines(enterprise_id);
CREATE INDEX idx_pipelines_status ON public.pipelines(status);
CREATE INDEX idx_pipelines_created_at ON public.pipelines(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view pipelines in their account"
  ON public.pipelines
  FOR SELECT
  USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can create pipelines in their account"
  ON public.pipelines
  FOR INSERT
  WITH CHECK (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can update pipelines in their account"
  ON public.pipelines
  FOR UPDATE
  USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can delete pipelines in their account"
  ON public.pipelines
  FOR DELETE
  USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

-- Create trigger to update updated_at
CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();