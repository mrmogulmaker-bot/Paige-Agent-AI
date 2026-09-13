/**
 * Layer C — the INDEPENDENT event-integrity check (`_shared/paige-orchestration/subject-tenant.ts`).
 * Proves the tenant a governed act runs under is re-derived from the canonical subject record and asserted
 * against the claimed event tenant, and that EVERY anomaly fails CLOSED (owner correction #2, 2026-09-13):
 * a match passes; a mismatch, a missing subject, a null tenant, an unregistered subject table, and a lookup
 * error all refuse — so the dispatcher makes no authority/adapter/provider decision on a poisoned event.
 */
import { describe, it, expect } from "vitest";
import {
  verifySubjectTenant,
  registeredSubjectTables,
  type SubjectDb,
} from "../../supabase/functions/_shared/paige-orchestration/subject-tenant.ts";

/** A minimal thenable mock of `db.from(table).select(col).eq("id", id).limit(1)` → { data, error }. */
function mockDb(result: { data: unknown; error: unknown }): SubjectDb {
  const q: any = {
    select() { return q; },
    eq() { return q; },
    limit() { return q; },
    then(onF: any, onR: any) { return Promise.resolve(result).then(onF, onR); },
  };
  return { from: () => q };
}

describe("verifySubjectTenant — the subject's real tenant must equal the claimed event tenant", () => {
  it("OK when the subject's tenant matches the claimed tenant", async () => {
    const v = await verifySubjectTenant(mockDb({ data: [{ tenant_id: "t1" }], error: null }), "clients", "c1", "t1");
    expect(v.ok).toBe(true);
    if (v.ok === true) expect(v.tenantId).toBe("t1");
  });

  it("FAILS CLOSED on a tenant MISMATCH (the event claimed a different tenant than the subject owns)", async () => {
    const v = await verifySubjectTenant(mockDb({ data: [{ tenant_id: "t2" }], error: null }), "clients", "c1", "t1");
    expect(v.ok).toBe(false);
    if (v.ok === false) {
      expect(v.code).toBe("subject_tenant_mismatch");
      // the reason must NOT leak the foreign tenant id into the claimed tenant's readable last_error (§9)
      expect(v.reason).not.toContain("t2");
      expect(v.reason).toContain("different tenant");
    }
  });

  it("FAILS CLOSED when the subject row does not exist", async () => {
    const v = await verifySubjectTenant(mockDb({ data: [], error: null }), "clients", "missing", "t1");
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.code).toBe("subject_not_found");
  });

  it("FAILS CLOSED when the subject carries no tenant", async () => {
    const v = await verifySubjectTenant(mockDb({ data: [{ tenant_id: null }], error: null }), "clients", "c1", "t1");
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.code).toBe("subject_tenant_null");
  });

  it("FAILS CLOSED on an unregistered subject table (a new producer must register its tenant column first)", async () => {
    const v = await verifySubjectTenant(mockDb({ data: [{ tenant_id: "t1" }], error: null }), "some_new_table", "x", "t1");
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.code).toBe("unknown_subject_table");
  });

  it("FAILS CLOSED (retryable) when the subject lookup itself errors", async () => {
    const v = await verifySubjectTenant(mockDb({ data: null, error: { message: "boom" } }), "clients", "c1", "t1");
    expect(v.ok).toBe(false);
    if (v.ok === false) { expect(v.code).toBe("lookup_error"); expect(v.reason).toContain("boom"); }
  });

  it("clients is a registered subject table (the only live producer today)", () => {
    expect(registeredSubjectTables()).toContain("clients");
  });
});
