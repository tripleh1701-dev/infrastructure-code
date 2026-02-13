-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Authenticated users can manage role_workstreams" ON public.role_workstreams;

-- Create a permissive policy that allows all operations for authenticated users
CREATE POLICY "Allow all operations on role_workstreams"
ON public.role_workstreams
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also add a policy for anon role (for public access if needed)
CREATE POLICY "Allow anon access to role_workstreams"
ON public.role_workstreams
FOR ALL
TO anon
USING (true)
WITH CHECK (true);