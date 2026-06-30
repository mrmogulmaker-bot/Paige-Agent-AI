-- Admin/sales access to manage businesses on behalf of contacts
CREATE POLICY "Staff can view all businesses"
ON public.businesses FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_rep'::app_role)
);

CREATE POLICY "Staff can insert businesses for any user"
ON public.businesses FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_rep'::app_role)
);

CREATE POLICY "Staff can update any business"
ON public.businesses FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'sales_rep'::app_role)
);

CREATE POLICY "Staff can delete any business"
ON public.businesses FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);