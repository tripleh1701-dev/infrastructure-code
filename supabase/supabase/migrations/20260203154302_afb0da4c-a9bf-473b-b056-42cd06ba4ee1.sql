-- Add account_id and enterprise_id to roles table for tenant-scoping
ALTER TABLE public.roles 
ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
ADD COLUMN enterprise_id uuid REFERENCES public.enterprises(id) ON DELETE CASCADE;

-- Add workstream_id, product_id, and service_id to roles for additional context
ALTER TABLE public.roles
ADD COLUMN workstream_id uuid REFERENCES public.workstreams(id) ON DELETE SET NULL,
ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;

-- Create role_permissions table for granular RBAC
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  menu_key text NOT NULL,
  menu_label text NOT NULL,
  is_visible boolean DEFAULT false,
  tabs jsonb DEFAULT '[]'::jsonb,
  can_create boolean DEFAULT false,
  can_view boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(role_id, menu_key)
);

-- Enable RLS on role_permissions
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for role_permissions
CREATE POLICY "Allow all to view role_permissions" 
ON public.role_permissions 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all to insert role_permissions" 
ON public.role_permissions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow all to update role_permissions" 
ON public.role_permissions 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow all to delete role_permissions" 
ON public.role_permissions 
FOR DELETE 
USING (true);

-- Add trigger for updated_at on role_permissions
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_roles_account_enterprise ON public.roles(account_id, enterprise_id);
CREATE INDEX idx_role_permissions_role_id ON public.role_permissions(role_id);