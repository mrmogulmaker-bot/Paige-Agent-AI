/**
 * THE BUSINESS-VERIFIER SECURITY MATRIX — proving `business-verifier` closes the cross-tenant
 * verification IDOR + the actor-spoof, and records a governed receipt.
 *
 * Pure modules, exercised as the SHIPPED code (no doubles of the decision):
 *   - `authorizeBusinessVerify` (the §9/§53/§59 authority decision) over INJECTED deps.
 *   - `buildBusinessVerifyAudit` + `businessVerifyGovernedAuditRow` (the governed receipt) over
 *     `classifyAction`.
 *
 * WHAT THIS PROVES (the acceptance matrix):
 *   platform owner (super_admin) → allowed · same-tenant owner/admin → allowed · agency manager →
 *   allowed · CROSS-TENANT person → DENIED (the IDOR) · non-admin person (coach/member) → DENIED (the
 *   deliberate "a coach may not verify" scope decision — a `high` spend act) · unresolved business
 *   tenant → fail closed (except a platform owner) · a service-role `system` caller → allowed
 *   (skill-runner / paige-mcp) · the ACTOR is never taken from the body (a forged `triggered_by` is a
 *   provenance label only and never grants authority) · `business_verify` is classified `high` and the
 *   class is recorded on every audit row even though the seam's autonomy gate is deliberately not run.
 *
 * WHAT IT DOES NOT PROVE (§13/§32): the authenticated runtime against the deployed function, and the
 * JWT→identity / service-key detection inside `business-verifier/index.ts` (Deno, not importable here)
 * — a separate evidence class, owed to a live drive, not claimed here.
 */
import { describe, it, expect } from "vitest";
import {
  authorizeBusinessVerify,
  buildBusinessVerifyAudit,
  businessVerifyGovernedAuditRow,
  BUSINESS_VERIFY_CAPABILITY,
  type BusinessVerifyAuthzDeps,
  type BusinessVerifyPrincipal,
} from "../../supabase/functions/_shared/business-verifier/governed-adapter.ts";

// ── authorizeBusinessVerify — the IDOR matrix ────────────────────────────────────────────────────

type Scenario = {
  platformOwner?: boolean;
  /** is_tenant_admin(businessTenantId) — owner/admin of the BUSINESS'S tenant. */
  tenantAdmin?: boolean;
  /** agency_can_manage_child(businessTenantId, caller) — agency delegation over the business's tenant. */
  agencyManages?: boolean;
};

const deps = (s: Scenario): BusinessVerifyAuthzDeps => ({
  isPlatformOwner: async () => !!s.platformOwner,
  callerIsTenantAdmin: async () => !!s.tenantAdmin,
  callerManagesTenantViaAgency: async () => !!s.agencyManages,
});

const authorize = (
  s: Scenario,
  input: { principal: BusinessVerifyPrincipal; callerUserId: string | null; businessTenantId: string | null },
) => authorizeBusinessVerify(deps(s), input);

const person = (callerUserId: string | null, businessTenantId: string | null) =>
  ({ principal: "person" as const, callerUserId, businessTenantId });

describe("authorizeBusinessVerify — the cross-tenant verification IDOR matrix", () => {
  it("a PLATFORM OWNER (super_admin) may verify (the one sanctioned cross-tenant caller)", async () => {
    const a = await authorize({ platformOwner: true }, person("op-1", "tenant-Z"));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("platform_owner");
    expect(a.tenantId).toBe("tenant-Z");
  });

  it("a PLATFORM OWNER may verify even a legacy business with NO tenant attached", async () => {
    // Checked before the business-tenant guard, so a null tenant does not deny an operator.
    const a = await authorize({ platformOwner: true }, person("op-1", null));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("platform_owner");
    expect(a.tenantId).toBeNull();
  });

  it("a SAME-TENANT owner/admin (of the BUSINESS'S tenant) is allowed", async () => {
    const a = await authorize({ tenantAdmin: true }, person("admin-A", "tenant-A"));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("same_tenant_admin");
    expect(a.tenantId).toBe("tenant-A");
  });

  it("an AGENCY MANAGER of the business's tenant (no direct membership row) is allowed", async () => {
    const a = await authorize({ tenantAdmin: false, agencyManages: true }, person("agency-op", "child-C"));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("agency_manager");
    expect(a.tenantId).toBe("child-C");
  });

  it("THE IDOR: a CROSS-TENANT person (not owner, not admin of the business's tenant, not agency mgr) is DENIED", async () => {
    // A tenant-A admin acting on a tenant-B business: is_tenant_admin(tenant-B) is false, agency false.
    const a = await authorize({ platformOwner: false, tenantAdmin: false, agencyManages: false }, person("admin-A", "tenant-B"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
    expect(a.reason).toMatch(/not authorized/i);
    expect(a.tenantId).toBe("tenant-B");
  });

  it("A COACH/MEMBER of the business's tenant is DENIED (the deliberate scope decision — a `high` spend act)", async () => {
    // is_tenant_admin is owner/admin ONLY, so a coach/member of the tenant resolves false here, and does
    // not manage it via agency. Denied — verification is admin/owner authority.
    const a = await authorize({ tenantAdmin: false, agencyManages: false }, person("coach-A", "tenant-A"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
  });

  it("a person whose business has NO resolvable tenant is DENIED (fail closed)", async () => {
    const a = await authorize({ tenantAdmin: true, agencyManages: true }, person("admin-A", null));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
    expect(a.reason).toMatch(/not attached to a workspace/i);
    expect(a.tenantId).toBeNull();
  });

  it("a person with no resolved user id is DENIED (fail closed)", async () => {
    const a = await authorize({ platformOwner: true }, person(null, "tenant-A"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
  });

  it("a SYSTEM (service-role) caller is allowed — skill-runner / paige-mcp — even with a null tenant, with NO auth checks", async () => {
    // The deps must NOT be consulted for a system caller; prove it by throwing from every dep.
    const throwingDeps: BusinessVerifyAuthzDeps = {
      isPlatformOwner: async () => { throw new Error("must not be called for system"); },
      callerIsTenantAdmin: async () => { throw new Error("must not be called for system"); },
      callerManagesTenantViaAgency: async () => { throw new Error("must not be called for system"); },
    };
    const a = await authorizeBusinessVerify(throwingDeps, { principal: "system", callerUserId: null, businessTenantId: null });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("system");
  });
});

// ── the actor is the JWT, never the body ─────────────────────────────────────────────────────────

describe("the ACTOR is never taken from the body", () => {
  it("a forged `triggered_by` cannot grant authority — a non-admin person is still DENIED", async () => {
    // The adapter takes NO `triggered_by`; authority is principal + resolved role only. The audit
    // records the label as provenance, and the decision is `refuse`.
    const authz = await authorize({ tenantAdmin: false, agencyManages: false }, person("member-A", "tenant-A"));
    expect(authz.allowed).toBe(false);
    const audit = buildBusinessVerifyAudit({
      principal: "person",
      userId: "member-A",
      businessId: "biz-1",
      tenantId: authz.tenantId,
      authzBasis: authz.basis,
      allowed: authz.allowed,
      source: "admin", // spoofed label
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    expect(audit.decision).toBe("refuse");
    expect(audit.user_id).toBe("member-A"); // actor is the JWT-derived id, not the label
    expect(audit.source).toBe("admin");     // label recorded as provenance only
  });
});

// ── the governed receipt ─────────────────────────────────────────────────────────────────────────

describe("buildBusinessVerifyAudit + businessVerifyGovernedAuditRow — the receipt", () => {
  it("records the `high` risk class honestly even though the seam's autonomy gate is not run", () => {
    const audit = buildBusinessVerifyAudit({
      principal: "person",
      userId: "admin-A",
      businessId: "biz-1",
      tenantId: "tenant-A",
      authzBasis: "same_tenant_admin",
      allowed: true,
      source: "admin",
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    expect(audit.capability).toBe(BUSINESS_VERIFY_CAPABILITY);
    expect(audit.risk).toBe("high"); // proves the canonical key is classified high
    expect(audit.decision).toBe("execute");
    expect(audit.tenant_source).toBe("server");
  });

  it("an ALLOW row carries the tenant on the column, business_id in the payload, and target_id null", () => {
    const audit = buildBusinessVerifyAudit({
      principal: "person",
      userId: "admin-A",
      businessId: "biz-1",
      tenantId: "tenant-A",
      authzBasis: "same_tenant_admin",
      allowed: true,
      source: "admin",
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    const row = businessVerifyGovernedAuditRow(audit);
    expect(row.action).toBe("business_verify_governed_allow");
    expect(row.tenant_id).toBe("tenant-A");
    expect(row.target_type).toBe("business_verify");
    expect(row.target_id).toBeNull();
    expect(row.payload.business_id).toBe("biz-1");
    expect(row.payload.authz_basis).toBe("same_tenant_admin");
    expect(row.payload.source).toBe("admin"); // provenance only
    expect(row.payload.risk).toBe("high");
  });

  it("a REFUSE row is labelled as such (the only trace of a refused verification)", () => {
    const audit = buildBusinessVerifyAudit({
      principal: "person",
      userId: "admin-A",
      businessId: "biz-1",
      tenantId: "tenant-B",
      authzBasis: "denied",
      allowed: false,
      source: "admin",
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    const row = businessVerifyGovernedAuditRow(audit);
    expect(row.action).toBe("business_verify_governed_refuse");
    expect(row.payload.decision).toBe("refuse");
    expect(row.tenant_id).toBe("tenant-B");
  });

  it("a SYSTEM allow row records the system principal", () => {
    const audit = buildBusinessVerifyAudit({
      principal: "system",
      userId: null,
      businessId: "biz-1",
      tenantId: "tenant-A",
      authzBasis: "system",
      allowed: true,
      source: "skill",
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    const row = businessVerifyGovernedAuditRow(audit);
    expect(row.action).toBe("business_verify_governed_allow");
    expect(row.payload.principal).toBe("system");
    expect(audit.user_id).toBeNull();
  });
});
