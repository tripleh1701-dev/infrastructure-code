-- Create a junction table for user-workstream assignments (many-to-many)
CREATE TABLE public.user_workstreams (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.account_technical_users(id) ON DELETE CASCADE,
    workstream_id uuid NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(user_id, workstream_id)
);

-- Enable RLS
ALTER TABLE public.user_workstreams ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all to view user_workstreams" ON public.user_workstreams FOR SELECT USING (true);
CREATE POLICY "Allow all to insert user_workstreams" ON public.user_workstreams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow all to update user_workstreams" ON public.user_workstreams FOR UPDATE USING (true);
CREATE POLICY "Allow all to delete user_workstreams" ON public.user_workstreams FOR DELETE USING (true);

-- Add indexes for performance
CREATE INDEX idx_user_workstreams_user_id ON public.user_workstreams(user_id);
CREATE INDEX idx_user_workstreams_workstream_id ON public.user_workstreams(workstream_id);