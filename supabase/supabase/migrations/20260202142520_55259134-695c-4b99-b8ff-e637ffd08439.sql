-- Drop existing restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can insert enterprises" ON public.enterprises;
DROP POLICY IF EXISTS "Anyone can view enterprises" ON public.enterprises;
DROP POLICY IF EXISTS "Authenticated users can update enterprises" ON public.enterprises;
DROP POLICY IF EXISTS "Authenticated users can delete enterprises" ON public.enterprises;

-- Create permissive policies that allow operations
CREATE POLICY "Allow all to view enterprises" 
ON public.enterprises 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all to insert enterprises" 
ON public.enterprises 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow all to update enterprises" 
ON public.enterprises 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow all to delete enterprises" 
ON public.enterprises 
FOR DELETE 
USING (true);

-- Also fix enterprise_products and enterprise_services policies
DROP POLICY IF EXISTS "Anyone can view enterprise_products" ON public.enterprise_products;
DROP POLICY IF EXISTS "Anyone can insert enterprise_products" ON public.enterprise_products;
DROP POLICY IF EXISTS "Anyone can delete enterprise_products" ON public.enterprise_products;

CREATE POLICY "Allow all to view enterprise_products" 
ON public.enterprise_products 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all to insert enterprise_products" 
ON public.enterprise_products 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow all to update enterprise_products" 
ON public.enterprise_products 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow all to delete enterprise_products" 
ON public.enterprise_products 
FOR DELETE 
USING (true);

DROP POLICY IF EXISTS "Anyone can view enterprise_services" ON public.enterprise_services;
DROP POLICY IF EXISTS "Anyone can insert enterprise_services" ON public.enterprise_services;
DROP POLICY IF EXISTS "Anyone can delete enterprise_services" ON public.enterprise_services;

CREATE POLICY "Allow all to view enterprise_services" 
ON public.enterprise_services 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all to insert enterprise_services" 
ON public.enterprise_services 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow all to update enterprise_services" 
ON public.enterprise_services 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow all to delete enterprise_services" 
ON public.enterprise_services 
FOR DELETE 
USING (true);