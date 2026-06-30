
UPDATE public.paige_config SET meta_capi_access_token = NULL WHERE meta_capi_access_token IS NOT NULL;
ALTER TABLE public.paige_config DROP COLUMN IF EXISTS meta_capi_access_token;

DROP POLICY IF EXISTS growth_form_submissions_tenant_read ON public.growth_form_submissions;
CREATE POLICY growth_form_submissions_tenant_read
ON public.growth_form_submissions
FOR SELECT
TO authenticated
USING (
  tenant_id = public.current_user_tenant_id()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
