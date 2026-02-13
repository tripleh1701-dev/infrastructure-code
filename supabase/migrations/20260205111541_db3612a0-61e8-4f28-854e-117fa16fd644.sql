-- Step 1: Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'manager', 'user', 'viewer');

-- Step 2: Create user_roles table linked to auth.users
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
    enterprise_id UUID REFERENCES public.enterprises(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, account_id)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create security definer functions to check roles and access

-- Function to check if a user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Function to check if user has access to an account
CREATE OR REPLACE FUNCTION public.has_account_access(_user_id UUID, _account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (account_id = _account_id OR role = 'super_admin')
  )
$$;

-- Function to check if user has access to an enterprise
CREATE OR REPLACE FUNCTION public.has_enterprise_access(_user_id UUID, _enterprise_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (enterprise_id = _enterprise_id OR role = 'super_admin')
  )
$$;

-- Function to get user's account_id
CREATE OR REPLACE FUNCTION public.get_user_account_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Step 4: RLS policies for user_roles table
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Step 5: Update accounts table policies
DROP POLICY IF EXISTS "Allow all to view accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow all to insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow all to update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Allow all to delete accounts" ON public.accounts;

CREATE POLICY "Users can view accounts they have access to"
ON public.accounts
FOR SELECT
TO authenticated
USING (public.has_account_access(auth.uid(), id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert accounts"
ON public.accounts
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can update their accounts"
ON public.accounts
FOR UPDATE
TO authenticated
USING (public.has_account_access(auth.uid(), id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete accounts"
ON public.accounts
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Step 6: Update enterprises table policies
DROP POLICY IF EXISTS "Allow all to view enterprises" ON public.enterprises;
DROP POLICY IF EXISTS "Allow all to insert enterprises" ON public.enterprises;
DROP POLICY IF EXISTS "Allow all to update enterprises" ON public.enterprises;
DROP POLICY IF EXISTS "Allow all to delete enterprises" ON public.enterprises;

CREATE POLICY "Users can view enterprises they have access to"
ON public.enterprises
FOR SELECT
TO authenticated
USING (public.has_enterprise_access(auth.uid(), id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert enterprises"
ON public.enterprises
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can update their enterprises"
ON public.enterprises
FOR UPDATE
TO authenticated
USING (public.has_enterprise_access(auth.uid(), id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete enterprises"
ON public.enterprises
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- Step 7: Update roles table policies
DROP POLICY IF EXISTS "Allow all to view roles" ON public.roles;
DROP POLICY IF EXISTS "Allow all to insert roles" ON public.roles;
DROP POLICY IF EXISTS "Allow all to update roles" ON public.roles;
DROP POLICY IF EXISTS "Allow all to delete roles" ON public.roles;

CREATE POLICY "Users can view roles in their account"
ON public.roles
FOR SELECT
TO authenticated
USING (
  account_id IS NULL 
  OR public.has_account_access(auth.uid(), account_id) 
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Users can manage roles in their account"
ON public.roles
FOR ALL
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

-- Step 8: Update groups table policies
DROP POLICY IF EXISTS "Allow all to view groups" ON public.groups;
DROP POLICY IF EXISTS "Allow all to insert groups" ON public.groups;
DROP POLICY IF EXISTS "Allow all to update groups" ON public.groups;
DROP POLICY IF EXISTS "Allow all to delete groups" ON public.groups;

CREATE POLICY "Users can view groups in their account"
ON public.groups
FOR SELECT
TO authenticated
USING (
  account_id IS NULL 
  OR public.has_account_access(auth.uid(), account_id) 
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Users can manage groups in their account"
ON public.groups
FOR ALL
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

-- Step 9: Update workstreams table policies
DROP POLICY IF EXISTS "Allow all to view workstreams" ON public.workstreams;
DROP POLICY IF EXISTS "Allow all to insert workstreams" ON public.workstreams;
DROP POLICY IF EXISTS "Allow all to update workstreams" ON public.workstreams;
DROP POLICY IF EXISTS "Allow all to delete workstreams" ON public.workstreams;

CREATE POLICY "Users can view workstreams in their account"
ON public.workstreams
FOR SELECT
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users can manage workstreams in their account"
ON public.workstreams
FOR ALL
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

-- Step 10: Update account_technical_users policies
DROP POLICY IF EXISTS "Allow all to view account_technical_users" ON public.account_technical_users;
DROP POLICY IF EXISTS "Allow all to insert account_technical_users" ON public.account_technical_users;
DROP POLICY IF EXISTS "Allow all to update account_technical_users" ON public.account_technical_users;
DROP POLICY IF EXISTS "Allow all to delete account_technical_users" ON public.account_technical_users;

CREATE POLICY "Users can view technical users in their account"
ON public.account_technical_users
FOR SELECT
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users can manage technical users in their account"
ON public.account_technical_users
FOR ALL
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

-- Step 11: Update account_licenses policies
DROP POLICY IF EXISTS "Allow all to view account_licenses" ON public.account_licenses;
DROP POLICY IF EXISTS "Allow all to insert account_licenses" ON public.account_licenses;
DROP POLICY IF EXISTS "Allow all to update account_licenses" ON public.account_licenses;
DROP POLICY IF EXISTS "Allow all to delete account_licenses" ON public.account_licenses;

CREATE POLICY "Users can view licenses in their account"
ON public.account_licenses
FOR SELECT
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users can manage licenses in their account"
ON public.account_licenses
FOR ALL
TO authenticated
USING (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_account_access(auth.uid(), account_id) OR public.is_super_admin(auth.uid()));

-- Step 12: Update role_permissions policies
DROP POLICY IF EXISTS "Allow all to view role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow all to insert role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow all to update role_permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow all to delete role_permissions" ON public.role_permissions;

CREATE POLICY "Authenticated users can view role_permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can manage role_permissions"
ON public.role_permissions
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Step 13: Update junction tables (group_roles, role_workstreams, user_groups, user_workstreams)
-- These need to be accessible by authenticated users for the app to function

-- group_roles - already has policy, update it
DROP POLICY IF EXISTS "Allow all access to group_roles" ON public.group_roles;

CREATE POLICY "Authenticated users can manage group_roles"
ON public.group_roles
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- role_workstreams - already updated in previous migration

-- user_groups
DROP POLICY IF EXISTS "Allow all operations for now" ON public.user_groups;

CREATE POLICY "Authenticated users can manage user_groups"
ON public.user_groups
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- user_workstreams
DROP POLICY IF EXISTS "Allow all to view user_workstreams" ON public.user_workstreams;
DROP POLICY IF EXISTS "Allow all to insert user_workstreams" ON public.user_workstreams;
DROP POLICY IF EXISTS "Allow all to update user_workstreams" ON public.user_workstreams;
DROP POLICY IF EXISTS "Allow all to delete user_workstreams" ON public.user_workstreams;

CREATE POLICY "Authenticated users can manage user_workstreams"
ON public.user_workstreams
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Step 14: Products and Services (global reference data - viewable by all authenticated)
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
DROP POLICY IF EXISTS "Anyone can insert products" ON public.products;
DROP POLICY IF EXISTS "Anyone can update products" ON public.products;
DROP POLICY IF EXISTS "Anyone can delete products" ON public.products;

CREATE POLICY "Authenticated users can view products"
ON public.products
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super admins can manage products"
ON public.products
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view services" ON public.services;
DROP POLICY IF EXISTS "Anyone can insert services" ON public.services;
DROP POLICY IF EXISTS "Anyone can update services" ON public.services;
DROP POLICY IF EXISTS "Anyone can delete services" ON public.services;

CREATE POLICY "Authenticated users can view services"
ON public.services
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super admins can manage services"
ON public.services
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));