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
 *   platform owner (super_admin) → allowed (basis `platform_owner`) · a caller who can READ the business
 *   under RLS → allowed (basis `tenant_authorized` — the surface's own `businesses_tenant_staff_select`
 *   authority: the business's owner_user_id or same-active-tenant staff of ANY staff app_role
 *   admin/coach/sales_rep/cs_rep/finance/viewer; mirroring the read gate is what stops a same-tenant
 *   sales_rep/cs_rep/finance/viewer from being silently 403'd, §58/§70) · agency manager → allowed ·
 *   CROSS-TENANT / non-staff person who cannot read the business and does not agency-manage its tenant →
 *   DENIED (the IDOR, closed at the surface's own contract) · unresolved business tenant → fail closed
 *   (except a platform owner) · a service-role `system` caller → allowed (skill-runner / paige-mcp) ·
 *   the ACTOR is never taken from the body (a forged `triggered_by` is a provenance label only and never
 *   grants authority) · `business_verify` is classified `high` and the class is recorded on every audit
 *   row even though the seam's autonomy gate is deliberately not run.
 *
 * WHAT IT DOES NOT PROVE (§13/§32): the authenticated runtime against the deployed function, and the
 * JWT→identity / service-key detection + the JWT-scoped RLS read inside `business-verifier/index.ts`
 * (Deno, not importable here) — a separate evidence class, owed to a live drive, not claimed here.
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
  /** callerCanReadBusiness() — can the caller SELECT the target business under RLS via their OWN JWT?
   *  True ⟺ the surface's `businesses_tenant_staff_select` policy admits them (owner_user_id, or
   *  same-active-tenant staff of any staff app_role). A cross-tenant / non-staff caller reads nothing. */
  canReadBusiness?: boolean;
  /** agency_can_manage_child(businessTenantId, caller) — agency delegation over the business's tenant. */
  agencyManages?: boolean;
};

const deps = (s: Scenario): BusinessVerifyAuthzDeps => ({
  isPlatformOwner: async () => !!s.platformOwner,
  callerCanReadBusiness: async () => !!s.canReadBusiness,
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

  it("a caller who can READ the business under RLS is allowed (the surface's own staff authority)", async () => {
    // callerCanReadBusiness() true ⟺ businesses_tenant_staff_select admits them: owner_user_id, or
    // same-active-tenant staff of ANY staff app_role (admin/coach/sales_rep/cs_rep/finance/viewer).
    // Mirroring the read gate is what keeps a same-tenant sales_rep/finance/viewer from a §58/§70 403.
    const a = await authorize({ canReadBusiness: true }, person("staff-A", "tenant-A"));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("tenant_authorized");
    expect(a.tenantId).toBe("tenant-A");
  });

  it("an AGENCY MANAGER of the business's tenant (RLS read did not authorize) is allowed", async () => {
    const a = await authorize({ canReadBusiness: false, agencyManages: true }, person("agency-op", "child-C"));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("agency_manager");
    expect(a.tenantId).toBe("child-C");
  });

  it("THE IDOR: a CROSS-TENANT person who cannot read the business and is not an agency mgr is DENIED", async () => {
    // A tenant-A staffer acting on a tenant-B business: the JWT RLS read returns nothing
    // (tenant_id = current_user_tenant_id() fails), agency false. Denied — the hole, closed.
    const a = await authorize({ platformOwner: false, canReadBusiness: false, agencyManages: false }, person("admin-A", "tenant-B"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
    expect(a.reason).toMatch(/not authorized/i);
    expect(a.tenantId).toBe("tenant-B");
  });

  it("a non-staff person who cannot read the business is DENIED (they never saw the card)", async () => {
    // A plain member with no staff app_role reads nothing under businesses_tenant_staff_select, so
    // callerCanReadBusiness is false and, without agency management, they are denied.
    const a = await authorize({ canReadBusiness: false, agencyManages: false }, person("member-A", "tenant-A"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
  });

  it("a person whose business has NO resolvable tenant is DENIED (fail closed), even if agency-mgr", async () => {
    const a = await authorize({ canReadBusiness: true, agencyManages: true }, person("staff-A", null));
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
      callerCanReadBusiness: async () => { throw new Error("must not be called for system"); },
      callerManagesTenantViaAgency: async () => { throw new Error("must not be called for system"); },
    };
    const a = await authorizeBusinessVerify(throwingDeps, { principal: "system", callerUserId: null, businessTenantId: null });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("system");
  });
});

// ── the actor is the JWT, never the body ─────────────────────────────────────────────────────────

describe("the ACTOR is never taken from the body", () => {
  it("a forged `triggered_by` cannot grant authority — a non-authorized person is still DENIED", async () => {
    // The adapter takes NO `triggered_by`; authority is principal + resolved read/agency only. The audit
    // records the label as provenance, and the decision is `refuse`.
    const authz = await authorize({ canReadBusiness: false, agencyManages: false }, person("member-A", "tenant-A"));
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
      userId: "staff-A",
      businessId: "biz-1",
      tenantId: "tenant-A",
      authzBasis: "tenant_authorized",
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
      userId: "staff-A",
      businessId: "biz-1",
      tenantId: "tenant-A",
      authzBasis: "tenant_authorized",
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
    expect(row.payload.authz_basis).toBe("tenant_authorized");
    expect(row.payload.source).toBe("admin"); // provenance only
    expect(row.payload.risk).toBe("high");
    // Honest scope of enforcement (§13): AUTHORITY is enforced here; the autonomy/budget clamp for
    // `high` is deliberately deferred upstream — the receipt must say exactly that, never a blanket
    // "enforced" that would overclaim the autonomy gate this door does not run.
    expect(row.payload.enforcement).toBe("authority");
    expect(row.payload.autonomy_gate).toBe("deferred_upstream");
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
