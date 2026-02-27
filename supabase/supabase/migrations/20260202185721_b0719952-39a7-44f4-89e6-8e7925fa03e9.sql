-- Add UPDATE policy for products table
CREATE POLICY "Anyone can update products" 
ON public.products 
FOR UPDATE 
USING (true);

-- Add DELETE policy for products table
CREATE POLICY "Anyone can delete products" 
ON public.products 
FOR DELETE 
USING (true);

-- Add UPDATE policy for services table
CREATE POLICY "Anyone can update services" 
ON public.services 
FOR UPDATE 
USING (true);

-- Add DELETE policy for services table
CREATE POLICY "Anyone can delete services" 
ON public.services 
FOR DELETE 
USING (true);