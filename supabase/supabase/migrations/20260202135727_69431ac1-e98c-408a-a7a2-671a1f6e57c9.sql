-- Create enterprises table
CREATE TABLE public.enterprises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create products_services table (master list)
CREATE TABLE public.products_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create linkage table between enterprises and products/services
CREATE TABLE public.enterprise_products_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
    product_service_id UUID NOT NULL REFERENCES public.products_services(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(enterprise_id, product_service_id)
);

-- Enable RLS
ALTER TABLE public.enterprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprise_products_services ENABLE ROW LEVEL SECURITY;

-- RLS policies for enterprises (public read, authenticated write)
CREATE POLICY "Anyone can view enterprises" ON public.enterprises FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert enterprises" ON public.enterprises FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update enterprises" ON public.enterprises FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete enterprises" ON public.enterprises FOR DELETE TO authenticated USING (true);

-- RLS policies for products_services (public read, authenticated write)
CREATE POLICY "Anyone can view products_services" ON public.products_services FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert products_services" ON public.products_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products_services" ON public.products_services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete products_services" ON public.products_services FOR DELETE TO authenticated USING (true);

-- RLS policies for enterprise_products_services (public read, authenticated write)
CREATE POLICY "Anyone can view enterprise_products_services" ON public.enterprise_products_services FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert enterprise_products_services" ON public.enterprise_products_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete enterprise_products_services" ON public.enterprise_products_services FOR DELETE TO authenticated USING (true);

-- Insert some default products/services
INSERT INTO public.products_services (name, description) VALUES
    ('Cloud Computing', 'Cloud infrastructure and services'),
    ('Data Analytics', 'Business intelligence and analytics solutions'),
    ('Cybersecurity', 'Security solutions and consulting'),
    ('AI/ML Services', 'Artificial intelligence and machine learning'),
    ('DevOps', 'Development and operations automation'),
    ('Consulting', 'Strategic IT consulting services'),
    ('Support Services', 'Technical support and maintenance'),
    ('Training', 'Professional training and certification');

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates on enterprises
CREATE TRIGGER update_enterprises_updated_at
BEFORE UPDATE ON public.enterprises
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();