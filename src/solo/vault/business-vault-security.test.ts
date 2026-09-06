// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";


const foundation = readFileSync(
  "supabase/migrations/20261225013700_business_vault_phase2_foundation.sql",
  "utf8",
);
const writes = readFileSync(
  "supabase/migrations/20261225013800_business_vault_phase2_writes.sql",
  "utf8",
);
const repairs = readFileSync(
  "supabase/migrations/20261225013900_business_vault_phase2_security_repairs.sql",
  "utf8",
);
const quarantine = readFileSync(
  "supabase/migrations/20261225014000_business_vault_quarantine_inspection.sql",
  "utf8",
);
const upload = readFileSync(
  "supabase/functions/business-vault-upload/index.ts",
  "utf8",
);
const download = readFileSync(
  "supabase/functions/business-vault-download/index.ts",
  "utf8",
);

describe("Business Vault server contract", () => {
  it("resolves exact active tenant and admin standing without a tenant parameter", () => {
    expect(foundation).toContain("p.active_tenant_id");
    expect(foundation).toContain("tm.status = 'active'");
    expect(foundation).toContain("tm.role::text IN ('owner', 'admin')");
    expect(foundation).not.toMatch(
      /business_vault_access_status\s*\(\s*p_tenant/i,
    );
    expect(foundation).not.toContain("current_user_tenant_id()");
  });

  it("keeps source storage private, opaque, forced through RLS and attachment retrieval", () => {
    expect(foundation).toMatch(
      /'business-vault-files',\s*'business-vault-files',\s*false/,
    );
    expect(foundation).toMatch(/FORCE ROW LEVEL SECURITY/g);
    expect(foundation).toContain(
      "v_tenant::text || '/' || v_record.id::text || '/' || v_version::text || '/' || v_object::text",
    );
    expect(download).toContain("Content-Disposition");
    expect(download).toContain("attachment;");
    expect(download).not.toContain("createSignedUrl");
    expect(download).not.toMatch(/publicUrl|getPublicUrl/);
  });

  it("fails closed when no approved inspection adapter is configured", () => {
    expect(upload).toContain("BUSINESS_VAULT_INSPECTION_ADAPTER");
    expect(upload).toContain("inspection_unavailable");
    expect(upload).toContain("business_vault_inspection_capability");
    expect(upload).not.toContain('.from("business-vault-files")');
    expect(upload).not.toContain("business_vault_finalize_upload");
    expect(upload).not.toMatch(
      /openai|anthropic|generateText|createTask|client.portal/i,
    );
  });

  it("keeps all binary bytes in a private short-lived quarantine until inspection passes", () => {
    expect(quarantine).toMatch(
      /'business-vault-quarantine',\s*'business-vault-quarantine',\s*false/,
    );
    expect(quarantine).toContain("CREATE TABLE public.business_vault_quarantine_uploads");
    expect(quarantine).toContain("FORCE ROW LEVEL SECURITY");
    expect(quarantine).toContain("business_vault_reserve_quarantine_upload");
    expect(quarantine).toContain("business_vault_claim_quarantine_inspections");
    expect(quarantine).toContain("business_vault_record_inspection_result");
    expect(quarantine).toContain("business_vault_promote_quarantine_upload");
    expect(quarantine).toMatch(/expires_at[\s\S]*interval '24 hours'/);
    expect(quarantine).not.toMatch(/raw_text|extracted_text|document_text|secret_value/i);
  });

  it("requires complete OCR and secret-sensitive evidence while keeping promotion disabled", () => {
    expect(quarantine).toContain("ocr_completed");
    expect(quarantine).toContain("secret_pattern_detected");
    expect(quarantine).toContain("financial_sensitive_detected");
    expect(quarantine).toContain("low_confidence");
    expect(quarantine).toContain("encrypted");
    expect(quarantine).toContain("timed_out");
    expect(quarantine).toContain("inspection_passed");
    expect(quarantine).toMatch(/inspection_state\s*=\s*'passed'/);
    expect(quarantine).toMatch(
      /REVOKE ALL ON FUNCTION public\.business_vault_promote_quarantine_upload\([^;]+service_role/,
    );
    expect(quarantine).toMatch(/p_confidence IS NULL/);
    expect(quarantine).toMatch(/c\.pdf_ocr AND c\.image_ocr[\s\S]*c\.secret_inspection AND c\.financial_sensitive_inspection/);
  });

  it("never exposes quarantined objects or unpassed normal versions to download and context", () => {
    expect(quarantine).toMatch(/REVOKE ALL ON public\.business_vault_quarantine_uploads FROM [^;]*authenticated/);
    expect(quarantine).toMatch(/REVOKE ALL ON public\.business_vault_inspection_events FROM [^;]*authenticated/);
    expect(download).toContain("validation_state");
    expect(download).not.toContain("validation_unavailable");
    expect(quarantine).toContain("v.validation_state='ready'");
  });

  it("allows only bounded reviewed context and retires it with the source", () => {
    expect(foundation).toContain("f.state = 'approved'");
    expect(foundation).toContain("r.lifecycle_state = 'active'");
    expect(foundation).toContain("r.source_state = 'current'");
    expect(writes).toContain("p_input - ARRAY[");
    expect(writes).toContain(
      "jsonb_typeof(v_value) NOT IN ('string','number','boolean')",
    );
    expect(writes).toContain("public._business_vault_current_owner_tenant()");
    expect(writes).toContain(
      "UPDATE public.business_vault_context_facts SET state='retired'",
    );
    expect(foundation).toContain("AND f.version_id = r.current_version_id");
    expect(foundation).toContain("'version_replaced'");
  });

  it("does not allow browser users to assert completed or renewed outcomes", () => {
    const obligationAllowlist =
      writes.match(/v_state NOT IN \(([^)]+)\)/g)?.[1] || "";
    expect(obligationAllowlist).not.toContain("'completed'");
    expect(obligationAllowlist).not.toContain("'renewed'");
    expect(writes).toMatch(
      /GRANT EXECUTE ON FUNCTION[\s\S]*public\.business_vault_save_obligation\(jsonb\)/,
    );
  });

  it("revalidates the active workspace and actor at every privileged boundary", () => {
    expect(repairs).toContain("p_expected_tenant");
    expect(repairs).toContain("_business_vault_assert_expected_tenant");
    expect(repairs).toContain("_business_vault_assert_actor");
    expect(upload).toContain("p_expected_tenant");
    expect(download).toContain("expected_tenant");
  });

  it("keeps owner-only records and their dependent metadata owner-only", () => {
    expect(repairs).toContain("_business_vault_can_read");
    expect(repairs).toContain("business_vault_obligations_read");
    expect(repairs).toContain("business_vault_contracts_read");
    expect(repairs).toContain("owner_only");
    expect(repairs).toContain("VAULT_UNAVAILABLE");
  });

  it("preserves a valid current version when a replacement fails", () => {
    expect(repairs).toContain("current_version_id IS NULL");
    expect(repairs).toMatch(/p_validation_state\s*=\s*'failed'/);
    expect(repairs).toContain("state IN ('proposed','approved')");
  });

  it("rejects unsupported OOXML and constrains finalized storage evidence", () => {
    expect(upload).not.toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(repairs).not.toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(repairs).toContain("storage.objects");
    expect(repairs).toContain("p_sha256 !~ '^[0-9a-f]{64}$'");
    expect(repairs).not.toContain("p_validation_state IN ('ready'");
  });

  it("serializes duplicate finalization and exposes a bounded cleanup contract", () => {
    expect(repairs).toContain("pg_advisory_xact_lock");
    expect(repairs).toContain("business_vault_claim_stale_uploads");
    expect(repairs).toContain("business_vault_cancel_stale_upload");
    expect(repairs).toContain("service_role");
    expect(quarantine).toContain("cleanup_lease_until");
    expect(quarantine).toContain("business_vault_defer_quarantine_cleanup");
    expect(quarantine).toMatch(/inspection_state='deleting' AND q\.cleanup_lease_until<now\(\)/);
  });
});
