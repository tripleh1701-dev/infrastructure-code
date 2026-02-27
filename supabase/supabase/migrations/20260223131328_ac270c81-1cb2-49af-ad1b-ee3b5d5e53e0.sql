-- Update the enterprises SELECT policy to also allow access via account_licenses
DROP POLICY IF EXISTS "Users can view enterprises they have access to" ON public.enterprises;

CREATE POLICY "Users can view enterprises they have access to"
ON public.enterprises
FOR SELECT
USING (
  has_enterprise_access(auth.uid(), id) 
  OR is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 
    FROM public.account_licenses al
    WHERE al.enterprise_id = enterprises.id
      AND has_account_access(auth.uid(), al.account_id)
  )
);