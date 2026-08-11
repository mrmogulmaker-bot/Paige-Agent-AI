-- HOTFIX #611 (P0, §9/§2) — tenant-scope the credit-report-uploads admin storage policies.
--
-- LIVE CROSS-TENANT PII LEAK: the storage.objects policies "Admins can view all credit reports"
-- (SELECT) and "Admins can upload credit reports" (INSERT) on bucket 'credit-report-uploads' gate
-- ONLY on has_role(auth.uid(),'admin') — a GLOBAL app_role with NO tenant scoping. Any user holding
-- the 'admin' role could therefore read (and write) EVERY tenant's client-uploaded consumer credit
-- reports (SSN, financial history, credit data) across the entire platform. That is a §9 tenant-
-- isolation breach on the most §2-sensitive PII the platform holds — the same global-admin-bypass
-- class the Move-2 finance work has been closing (#385/#398).
--
-- FIX (least privilege, no legitimate access lost): the God/operator account keeps cross-tenant
-- reach via public.is_platform_owner(); everyone else must be a TENANT ADMIN of the tenant that owns
-- the client whose folder this is. The bucket's folder convention is folder[1] = the client's
-- identifier; established policies here treat it as the client's auth user id (= clients.linked_user_id),
-- and the credit path has a known clients.id-vs-auth-uid folder ambiguity (#596), so match BOTH
-- clients.linked_user_id and clients.id defensively — either way the row is tenant-scoped, closing the
-- leak regardless of which convention produced the object. The client-self (folder = auth.uid()) and
-- assigned-coach (coach_clients) policies are already correctly scoped and are LEFT UNCHANGED.
--
-- Verified on prod (pg_policies) that these two are the only unscoped policies on this bucket.

DROP POLICY IF EXISTS "Admins can view all credit reports" ON storage.objects;
CREATE POLICY "Admins can view tenant client credit reports"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'credit-report-uploads'
    AND (
      public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE public.is_tenant_admin(c.tenant_id)
          AND (storage.foldername(objects.name))[1] IN (c.linked_user_id::text, c.id::text)
      )
    )
  );

DROP POLICY IF EXISTS "Admins can upload credit reports" ON storage.objects;
CREATE POLICY "Admins can upload tenant client credit reports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'credit-report-uploads'
    AND (
      public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE public.is_tenant_admin(c.tenant_id)
          AND (storage.foldername(objects.name))[1] IN (c.linked_user_id::text, c.id::text)
      )
    )
  );
