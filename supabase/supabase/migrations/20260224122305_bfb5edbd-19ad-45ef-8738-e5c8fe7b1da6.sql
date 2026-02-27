
-- Add yaml_content column to build_jobs to store generated Build YAML
ALTER TABLE public.build_jobs ADD COLUMN IF NOT EXISTS yaml_content text;
