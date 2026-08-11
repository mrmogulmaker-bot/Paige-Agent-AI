-- BUG A (launch-blocker) — create the missing `btf-onboarding` storage bucket for signed
-- agreement PDFs, with §9 tenant-isolated read RLS, and reconcile the orphaned legacy policies.
-- ============================================================================
-- Root cause (verified on prod xygzykjyynhzqytbqnzu): the `btf-onboarding` bucket does NOT
-- exist in storage.buckets. `finalize-agreement` (service role) uploads the finalized signed
-- agreement PDF to `${client_id}/agreements/${file}` in that bucket (index.ts:198); with the
-- bucket absent the upload throws, the error is swallowed (index.ts:201), and
-- paige_signed_agreements.signed_pdf_path silently stays NULL — tenants cannot complete a
-- signed onboarding with a persisted PDF.
--
-- §37 producer inventory (verified): WRITE — finalize-agreement, via the SERVICE-ROLE client,
-- which BYPASSES RLS, so it only needs the bucket to EXIST. READS — Step2Agreement posts to the
-- writer (no direct storage), AgreementsAdmin shows metadata only, paige-mcp returns the path
-- string as document_url. None currently authenticate a storage download, but the SELECT policy
-- below makes the eventual/authenticated download path §9-correct and future-proof. No cron /
-- n8n / Zapier / test caller of the bucket exists.
--
-- LEGACY-POLICY RECONCILIATION (§39 peer-gate finding, verified against repo + prod):
--   The repo history DOES leave three authenticated `storage.objects` policies pointing at this
--   bucket: 20260629160512 created `btf_onboarding_client_{read,insert,delete}`, and
--   20260702184358 renamed them to `program_onboarding_client_{read,insert,delete}` (still
--   filtering bucket_id='btf-onboarding'); NO later migration drops them, and 20260702193352
--   explicitly defers "final disposition" of the btf-onboarding storage orphan to a later
--   migration — this one. So on a FRESH REPLAY (Supabase preview branch, any DR rebuild) those
--   policies exist and would grant a linked client INSERT/DELETE over their OWN signed legal
--   PDF — a legal-record-tamper hole contradicting the service-role-writes-only design below.
--   On CURRENT PROD they are ABSENT (verified via pg_policies: only `signed_agreements_read`
--   references this bucket) — prod diverged and dropped them outside migrations. The DROPs below
--   are therefore idempotent no-ops on prod and a real fix on any replay: every environment
--   converges to exactly ONE btf-onboarding policy — the §9 read below. (The dropped
--   `program_onboarding_client_read` is fully superseded by `signed_agreements_read`.)
-- ============================================================================

-- Private bucket, PDFs only, 10 MB cap. Idempotent.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('btf-onboarding', 'btf-onboarding', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Reconcile the orphaned legacy policies (see header). Idempotent: no-op where already absent
-- (prod), removes the tamper-capable INSERT/DELETE + the superseded SELECT on any fresh replay.
DROP POLICY IF EXISTS program_onboarding_client_read   ON storage.objects;
DROP POLICY IF EXISTS program_onboarding_client_insert ON storage.objects;
DROP POLICY IF EXISTS program_onboarding_client_delete ON storage.objects;
-- Belt-and-suspenders: kill the pre-rename names too, in case an environment predates 20260702184358.
DROP POLICY IF EXISTS btf_onboarding_client_read   ON storage.objects;
DROP POLICY IF EXISTS btf_onboarding_client_insert ON storage.objects;
DROP POLICY IF EXISTS btf_onboarding_client_delete ON storage.objects;

-- READ (download) RLS. The object key is `${client_id}/agreements/${file}`, so the first path
-- segment is the owning client's id. A row is readable ONLY by: the owning client themselves
-- (clients.linked_user_id = auth.uid()), that client's TENANT staff
-- (clients.tenant_id = current_user_tenant_id()), or the platform operator (is_platform_owner()).
-- A staff member of a DIFFERENT tenant fails clients.tenant_id = current_user_tenant_id() → denied.
-- WRITES are intentionally NOT granted to authenticated callers — only the service-role edge
-- function writes (bypassing RLS) — so a tenant user can never upload/overwrite/delete a signed
-- legal document directly. (The DROPs above guarantee this holds on every replay, not just prod.)
DROP POLICY IF EXISTS signed_agreements_read ON storage.objects;
CREATE POLICY signed_agreements_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'btf-onboarding'
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = NULLIF((storage.foldername(name))[1], '')::uuid
        AND (
             c.linked_user_id = auth.uid()
          OR c.tenant_id = public.current_user_tenant_id()
          OR public.is_platform_owner()
        )
    )
  );
