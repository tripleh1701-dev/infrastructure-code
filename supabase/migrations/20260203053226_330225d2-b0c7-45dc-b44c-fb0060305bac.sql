-- Create groups table
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create roles table
CREATE TABLE public.roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for groups
CREATE POLICY "Allow all to view groups" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Allow all to insert groups" ON public.groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update groups" ON public.groups FOR UPDATE USING (true);
CREATE POLICY "Allow all to delete groups" ON public.groups FOR DELETE USING (true);

-- RLS policies for roles
CREATE POLICY "Allow all to view roles" ON public.roles FOR SELECT USING (true);
CREATE POLICY "Allow all to insert roles" ON public.roles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update roles" ON public.roles FOR UPDATE USING (true);
CREATE POLICY "Allow all to delete roles" ON public.roles FOR DELETE USING (true);

-- Add triggers for updated_at
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default groups
INSERT INTO public.groups (name, description) VALUES
  ('Engineering', 'Core engineering team'),
  ('DevOps', 'DevOps and infrastructure team'),
  ('QA', 'Quality assurance team'),
  ('Mobile', 'Mobile development team'),
  ('Security', 'Security and compliance team'),
  ('Support', 'Customer support team'),
  ('Management', 'Management team');

-- Insert default roles
INSERT INTO public.roles (name, description, permissions) VALUES
  ('Admin', 'Full system access', 24),
  ('Developer', 'Development and deployment access', 16),
  ('Viewer', 'Read-only access', 6),
  ('DevOps', 'Infrastructure and CI/CD access', 20),
  ('Manager', 'Team management access', 18),
  ('Support', 'Support and customer access', 10);