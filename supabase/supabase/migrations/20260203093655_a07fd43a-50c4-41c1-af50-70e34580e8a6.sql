-- Add enterprise_id column to account_technical_users table
ALTER TABLE public.account_technical_users
ADD COLUMN enterprise_id uuid REFERENCES public.enterprises(id) ON DELETE SET NULL;

-- Create an index for better query performance
CREATE INDEX idx_account_technical_users_enterprise_id ON public.account_technical_users(enterprise_id);