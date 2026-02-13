-- Add new columns to groups table for enhanced scoping
ALTER TABLE public.groups 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS enterprise_id UUID REFERENCES public.enterprises(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS workstream_id UUID REFERENCES public.workstreams(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

-- Create group_roles junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS public.group_roles (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(group_id, role_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_groups_account_id ON public.groups(account_id);
CREATE INDEX IF NOT EXISTS idx_groups_enterprise_id ON public.groups(enterprise_id);
CREATE INDEX IF NOT EXISTS idx_groups_workstream_id ON public.groups(workstream_id);
CREATE INDEX IF NOT EXISTS idx_group_roles_group_id ON public.group_roles(group_id);
CREATE INDEX IF NOT EXISTS idx_group_roles_role_id ON public.group_roles(role_id);

-- Enable RLS on group_roles
ALTER TABLE public.group_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for group_roles (allow all authenticated users for now)
CREATE POLICY "Allow all access to group_roles" ON public.group_roles
FOR ALL USING (true) WITH CHECK (true);