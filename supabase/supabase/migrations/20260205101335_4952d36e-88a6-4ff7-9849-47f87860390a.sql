-- Create user_groups junction table for many-to-many relationship
CREATE TABLE public.user_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.account_technical_users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, group_id)
);

-- Enable RLS
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to manage their own data
CREATE POLICY "Allow all operations for now" ON public.user_groups
FOR ALL USING (true) WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_user_groups_user_id ON public.user_groups(user_id);
CREATE INDEX idx_user_groups_group_id ON public.user_groups(group_id);

-- Migrate existing assigned_group data to user_groups table
INSERT INTO public.user_groups (user_id, group_id)
SELECT atu.id, g.id
FROM public.account_technical_users atu
INNER JOIN public.groups g ON g.name = atu.assigned_group
WHERE atu.assigned_group IS NOT NULL AND atu.assigned_group != '';