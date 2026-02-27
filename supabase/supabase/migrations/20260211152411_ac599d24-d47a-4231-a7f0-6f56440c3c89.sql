
-- Create build_jobs table for integration build configurations
CREATE TABLE public.build_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  connector_name TEXT NOT NULL,
  description TEXT,
  entity TEXT, -- workstream name
  pipeline TEXT, -- pipeline name
  product TEXT NOT NULL DEFAULT 'DevOps',
  service TEXT NOT NULL DEFAULT 'Integration',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  scope TEXT, -- artifacts scope
  connector_icon_name TEXT,
  pipeline_stages_state JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.build_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to account
CREATE POLICY "Users can view build jobs in their account"
ON public.build_jobs FOR SELECT
USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can create build jobs in their account"
ON public.build_jobs FOR INSERT
WITH CHECK (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can update build jobs in their account"
ON public.build_jobs FOR UPDATE
USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

CREATE POLICY "Users can delete build jobs in their account"
ON public.build_jobs FOR DELETE
USING (has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid()));

-- Build executions table
CREATE TABLE public.build_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  build_job_id UUID NOT NULL REFERENCES public.build_jobs(id) ON DELETE CASCADE,
  build_number TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'pending',
  duration TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  jira_number TEXT,
  approvers TEXT[],
  logs TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.build_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view build executions"
ON public.build_executions FOR SELECT
USING (build_job_id IN (
  SELECT id FROM public.build_jobs
  WHERE has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid())
));

CREATE POLICY "Users can create build executions"
ON public.build_executions FOR INSERT
WITH CHECK (build_job_id IN (
  SELECT id FROM public.build_jobs
  WHERE has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid())
));

CREATE POLICY "Users can update build executions"
ON public.build_executions FOR UPDATE
USING (build_job_id IN (
  SELECT id FROM public.build_jobs
  WHERE has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid())
));

CREATE POLICY "Users can delete build executions"
ON public.build_executions FOR DELETE
USING (build_job_id IN (
  SELECT id FROM public.build_jobs
  WHERE has_account_access(auth.uid(), account_id) OR is_super_admin(auth.uid())
));

-- Trigger for updated_at on build_jobs
CREATE TRIGGER update_build_jobs_updated_at
BEFORE UPDATE ON public.build_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
