-- Drop the global unique constraint on group names
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_name_key;

-- Create a unique index for groups within the same account
-- This allows the same group name across different accounts
CREATE UNIQUE INDEX IF NOT EXISTS groups_name_account_unique 
ON public.groups (name, account_id) 
WHERE account_id IS NOT NULL;

-- Create a unique index for global groups (where account_id is null)
-- This ensures global group names are unique among themselves
CREATE UNIQUE INDEX IF NOT EXISTS groups_name_global_unique 
ON public.groups (name) 
WHERE account_id IS NULL;