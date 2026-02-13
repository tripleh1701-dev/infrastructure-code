-- Create workstreams table
CREATE TABLE public.workstreams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create workstream_tools table for tool configurations
CREATE TABLE public.workstream_tools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workstream_id, category, tool_name)
);

-- Enable RLS
ALTER TABLE public.workstreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstream_tools ENABLE ROW LEVEL SECURITY;

-- RLS policies for workstreams
CREATE POLICY "Allow all to view workstreams" ON public.workstreams FOR SELECT USING (true);
CREATE POLICY "Allow all to insert workstreams" ON public.workstreams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update workstreams" ON public.workstreams FOR UPDATE USING (true);
CREATE POLICY "Allow all to delete workstreams" ON public.workstreams FOR DELETE USING (true);

-- RLS policies for workstream_tools
CREATE POLICY "Allow all to view workstream_tools" ON public.workstream_tools FOR SELECT USING (true);
CREATE POLICY "Allow all to insert workstream_tools" ON public.workstream_tools FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update workstream_tools" ON public.workstream_tools FOR UPDATE USING (true);
CREATE POLICY "Allow all to delete workstream_tools" ON public.workstream_tools FOR DELETE USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_workstreams_updated_at
BEFORE UPDATE ON public.workstreams
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();