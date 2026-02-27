
ALTER TABLE public.environments 
  ADD COLUMN IF NOT EXISTS connectors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scope text NULL,
  ADD COLUMN IF NOT EXISTS entity text NULL,
  ADD COLUMN IF NOT EXISTS connector_icon_name text NULL;
