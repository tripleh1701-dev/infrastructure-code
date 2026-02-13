-- Drop existing restrictive constraint if it exists
ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_name_key;

-- Create partial unique indices for roles: unique name within same account + enterprise combination
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_account_enterprise_unique 
ON public.roles (name, account_id, enterprise_id) 
WHERE account_id IS NOT NULL AND enterprise_id IS NOT NULL;

-- For roles with account but no enterprise
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_account_only_unique 
ON public.roles (name, account_id) 
WHERE account_id IS NOT NULL AND enterprise_id IS NULL;

-- For roles with enterprise but no account
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_enterprise_only_unique 
ON public.roles (name, enterprise_id) 
WHERE account_id IS NULL AND enterprise_id IS NOT NULL;

-- For global roles (no account, no enterprise)
CREATE UNIQUE INDEX IF NOT EXISTS roles_name_global_unique 
ON public.roles (name) 
WHERE account_id IS NULL AND enterprise_id IS NULL;

-- Update groups unique indices to include enterprise (replacing account-only constraint)
DROP INDEX IF EXISTS groups_name_account_unique;
DROP INDEX IF EXISTS groups_name_global_unique;

-- Create new indices for groups: unique name within same account + enterprise combination
CREATE UNIQUE INDEX IF NOT EXISTS groups_name_account_enterprise_unique 
ON public.groups (name, account_id, enterprise_id) 
WHERE account_id IS NOT NULL AND enterprise_id IS NOT NULL;

-- For groups with account but no enterprise
CREATE UNIQUE INDEX IF NOT EXISTS groups_name_account_only_unique 
ON public.groups (name, account_id) 
WHERE account_id IS NOT NULL AND enterprise_id IS NULL;

-- For groups with enterprise but no account
CREATE UNIQUE INDEX IF NOT EXISTS groups_name_enterprise_only_unique 
ON public.groups (name, enterprise_id) 
WHERE account_id IS NULL AND enterprise_id IS NOT NULL;

-- For global groups (no account, no enterprise)
CREATE UNIQUE INDEX IF NOT EXISTS groups_name_global_unique 
ON public.groups (name) 
WHERE account_id IS NULL AND enterprise_id IS NULL;