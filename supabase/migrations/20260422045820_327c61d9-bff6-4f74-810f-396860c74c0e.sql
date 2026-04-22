-- Admin SELECT/UPDATE on broker_profiles for oversight UI
DROP POLICY IF EXISTS "Admins view all broker profiles" ON public.broker_profiles;
CREATE POLICY "Admins view all broker profiles"
ON public.broker_profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins update broker profiles" ON public.broker_profiles;
CREATE POLICY "Admins update broker profiles"
ON public.broker_profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admin SELECT on broker_client_relationships
DROP POLICY IF EXISTS "Admins view all broker client relationships" ON public.broker_client_relationships;
CREATE POLICY "Admins view all broker client relationships"
ON public.broker_client_relationships
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admin SELECT on mcc_service_requests (existing policy is broker-only ALL)
DROP POLICY IF EXISTS "Admins view all MCC requests" ON public.mcc_service_requests;
CREATE POLICY "Admins view all MCC requests"
ON public.mcc_service_requests
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));