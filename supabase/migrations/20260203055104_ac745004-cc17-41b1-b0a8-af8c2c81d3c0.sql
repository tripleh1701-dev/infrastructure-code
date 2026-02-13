-- Add is_technical_user column to account_technical_users table
ALTER TABLE public.account_technical_users 
ADD COLUMN is_technical_user boolean NOT NULL DEFAULT false;