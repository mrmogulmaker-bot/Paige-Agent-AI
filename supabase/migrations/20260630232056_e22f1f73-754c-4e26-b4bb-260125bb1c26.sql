
DROP POLICY IF EXISTS "growth_forms_public_read_active" ON public.growth_forms;
REVOKE SELECT ON public.growth_forms FROM anon;
