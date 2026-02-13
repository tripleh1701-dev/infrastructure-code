-- Create cloud_type enum
CREATE TYPE public.cloud_type AS ENUM ('public', 'private', 'hybrid');

-- Create accounts table
CREATE TABLE public.accounts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    master_account_name TEXT NOT NULL,
    cloud_type cloud_type NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create account_addresses table for multiple addresses per account
CREATE TABLE public.account_addresses (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    country TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create account_technical_users table
CREATE TABLE public.account_technical_users (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    start_date DATE NOT NULL,
    end_date DATE,
    assigned_group TEXT NOT NULL,
    assigned_role TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_technical_users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for accounts table (allow all operations for now - can be restricted later)
CREATE POLICY "Allow all to view accounts"
ON public.accounts FOR SELECT
USING (true);

CREATE POLICY "Allow all to insert accounts"
ON public.accounts FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow all to update accounts"
ON public.accounts FOR UPDATE
USING (true);

CREATE POLICY "Allow all to delete accounts"
ON public.accounts FOR DELETE
USING (true);

-- Create RLS policies for account_addresses table
CREATE POLICY "Allow all to view account_addresses"
ON public.account_addresses FOR SELECT
USING (true);

CREATE POLICY "Allow all to insert account_addresses"
ON public.account_addresses FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow all to update account_addresses"
ON public.account_addresses FOR UPDATE
USING (true);

CREATE POLICY "Allow all to delete account_addresses"
ON public.account_addresses FOR DELETE
USING (true);

-- Create RLS policies for account_technical_users table
CREATE POLICY "Allow all to view account_technical_users"
ON public.account_technical_users FOR SELECT
USING (true);

CREATE POLICY "Allow all to insert account_technical_users"
ON public.account_technical_users FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow all to update account_technical_users"
ON public.account_technical_users FOR UPDATE
USING (true);

CREATE POLICY "Allow all to delete account_technical_users"
ON public.account_technical_users FOR DELETE
USING (true);

-- Create triggers for updated_at
CREATE TRIGGER update_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_account_technical_users_updated_at
BEFORE UPDATE ON public.account_technical_users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();