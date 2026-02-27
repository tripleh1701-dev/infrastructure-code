-- Create junction table for role-workstream many-to-many relationship
CREATE TABLE public.role_workstreams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (role_id, workstream_id)
);

-- Enable Row Level Security
ALTER TABLE public.role_workstreams ENABLE ROW LEVEL SECURITY;

-- Create policy for all authenticated users to manage role_workstreams
CREATE POLICY "Authenticated users can manage role_workstreams"
ON public.role_workstreams
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_role_workstreams_role_id ON public.role_workstreams(role_id);
CREATE INDEX idx_role_workstreams_workstream_id ON public.role_workstreams(workstream_id);

-- Migrate existing workstream_id data to the new junction table
INSERT INTO public.role_workstreams (role_id, workstream_id)
SELECT id, workstream_id 
FROM public.roles 
WHERE workstream_id IS NOT NULL
ON CONFLICT DO NOTHING;