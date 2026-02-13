-- Create account_licenses table for storing license details per account
CREATE TABLE public.account_licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  service_id UUID NOT NULL REFERENCES public.services(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  number_of_users INTEGER NOT NULL DEFAULT 1,
  -- Contact person details
  contact_full_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_department TEXT,
  contact_designation TEXT,
  -- Renewal settings
  renewal_notify BOOLEAN NOT NULL DEFAULT true,
  notice_days INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.account_licenses ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for account_licenses
CREATE POLICY "Allow all to view account_licenses" ON public.account_licenses FOR SELECT USING (true);
CREATE POLICY "Allow all to insert account_licenses" ON public.account_licenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update account_licenses" ON public.account_licenses FOR UPDATE USING (true);
CREATE POLICY "Allow all to delete account_licenses" ON public.account_licenses FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_account_licenses_updated_at
  BEFORE UPDATE ON public.account_licenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();