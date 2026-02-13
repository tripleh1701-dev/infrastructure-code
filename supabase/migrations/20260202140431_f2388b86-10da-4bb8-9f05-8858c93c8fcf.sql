-- Drop existing tables and recreate with new structure
DROP TABLE IF EXISTS public.enterprise_products_services CASCADE;
DROP TABLE IF EXISTS public.products_services CASCADE;

-- Create products table (master list)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create services table (master list)
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create linkage table: enterprise to single product
CREATE TABLE public.enterprise_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(enterprise_id) -- Only one product per enterprise
);

-- Create linkage table: enterprise to multiple services
CREATE TABLE public.enterprise_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(enterprise_id, service_id)
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_services ENABLE ROW LEVEL SECURITY;

-- RLS policies for products
CREATE POLICY "Anyone can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Anyone can insert products" ON public.products FOR INSERT WITH CHECK (true);

-- RLS policies for services
CREATE POLICY "Anyone can view services" ON public.services FOR SELECT USING (true);
CREATE POLICY "Anyone can insert services" ON public.services FOR INSERT WITH CHECK (true);

-- RLS policies for enterprise_products
CREATE POLICY "Anyone can view enterprise_products" ON public.enterprise_products FOR SELECT USING (true);
CREATE POLICY "Anyone can insert enterprise_products" ON public.enterprise_products FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete enterprise_products" ON public.enterprise_products FOR DELETE USING (true);

-- RLS policies for enterprise_services
CREATE POLICY "Anyone can view enterprise_services" ON public.enterprise_services FOR SELECT USING (true);
CREATE POLICY "Anyone can insert enterprise_services" ON public.enterprise_services FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete enterprise_services" ON public.enterprise_services FOR DELETE USING (true);

-- Insert some default products
INSERT INTO public.products (name, description) VALUES
    ('Cloud Platform', 'Cloud infrastructure platform'),
    ('Data Platform', 'Data management and analytics platform'),
    ('Security Suite', 'Enterprise security solutions'),
    ('Integration Hub', 'API and integration services');

-- Insert some default services
INSERT INTO public.services (name, description) VALUES
    ('Consulting', 'Strategic consulting services'),
    ('Implementation', 'Solution implementation services'),
    ('Training', 'Professional training and certification'),
    ('Support', 'Technical support and maintenance'),
    ('Managed Services', 'Fully managed operations'),
    ('Migration', 'Cloud migration services'),
    ('Custom Development', 'Custom software development'),
    ('Security Audit', 'Security assessment and audit');