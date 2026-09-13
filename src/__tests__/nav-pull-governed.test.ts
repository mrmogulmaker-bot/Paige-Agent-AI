/**
 * THE NAV-PULL-PROFILE SECURITY MATRIX — proving `nav-pull-profile` closes the cross-tenant
 * business-credit IDOR and records a governed receipt.
 *
 * Pure modules, exercised as the SHIPPED code (no doubles of the decision):
 *   - `authorizeNavPull` (the §9/§53/§59 authority decision) over an INJECTED `can_access_contact` dep.
 *   - `buildNavPullAudit` + `navPullGovernedAuditRow` (the governed receipt) over `classifyAction`.
 *
 * WHAT THIS PROVES (the acceptance matrix):
 *   a caller who CAN ACCESS the contact → allowed (basis `contact_authorized` — `can_access_contact`
 *   already folds in super_admin / tenant owner-admin / agency parent / direct-or-coach relationship, so
 *   one predicate covers the whole model; mirrors the target table's own RLS) · a CROSS-TENANT / non-
 *   existent-contact person → DENIED (the IDOR, closed uniformly with no existence oracle) · a person
 *   with no resolved user id → fail closed · a service-role `system` caller → allowed (the
 *   nav-refresh-scores cron) with the dep NOT consulted · `nav_pull_business_credit` is classified `high`
 *   and the class is recorded on every audit row even though the seam's autonomy gate is deliberately not
 *   run · the actor is the JWT-derived id, never a body field (nav-pull takes no `triggered_by`).
 *
 * WHAT IT DOES NOT PROVE (§13/§32): the authenticated runtime against the deployed function, and the
 * JWT→identity / service-key detection + the `can_access_contact` RPC call inside
 * `nav-pull-profile/index.ts` (Deno, not importable here) — a separate evidence class, owed to a live
 * drive, not claimed here.
 */
import { describe, it, expect } from "vitest";
import {
  authorizeNavPull,
  buildNavPullAudit,
  navPullGovernedAuditRow,
  NAV_PULL_CAPABILITY,
  type NavPullAuthzDeps,
  type NavPullPrincipal,
} from "../../supabase/functions/_shared/nav-pull-profile/governed-adapter.ts";

// ── authorizeNavPull — the IDOR matrix ───────────────────────────────────────────────────────────

type Scenario = {
  /** can_access_contact(callerUserId, contact_id) — the canonical tenant-scoped contact authority. */
  canAccessContact?: boolean;
};

const deps = (s: Scenario): NavPullAuthzDeps => ({
  callerCanAccessContact: async () => !!s.canAccessContact,
});

const authorize = (
  s: Scenario,
  input: { principal: NavPullPrincipal; callerUserId: string | null },
) => authorizeNavPull(deps(s), input);

const person = (callerUserId: string | null) => ({ principal: "person" as const, callerUserId });

describe("authorizeNavPull — the cross-tenant business-credit IDOR matrix", () => {
  it("a caller who CAN ACCESS the contact is allowed (the surface's own tenant-scoped authority)", async () => {
    const a = await authorize({ canAccessContact: true }, person("staff-A"));
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("contact_authorized");
  });

  it("THE IDOR: a person who CANNOT access the contact (cross-tenant) is DENIED", async () => {
    const a = await authorize({ canAccessContact: false }, person("admin-A"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
    expect(a.reason).toMatch(/not authorized/i);
  });

  it("a non-existent contact resolves no access and is DENIED uniformly (no existence oracle)", async () => {
    // can_access_contact returns false for a contact_id with no clients row, so a missing contact and a
    // cross-tenant contact are indistinguishable to the caller — both 403, never a 404 existence oracle.
    const a = await authorize({ canAccessContact: false }, person("admin-A"));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
  });

  it("a person with no resolved user id is DENIED (fail closed)", async () => {
    const a = await authorize({ canAccessContact: true }, person(null));
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
  });

  it("a SYSTEM (service-role) caller is allowed — nav-refresh-scores cron — with NO auth checks", async () => {
    // The dep must NOT be consulted for a system caller; prove it by throwing from it.
    const throwingDeps: NavPullAuthzDeps = {
      callerCanAccessContact: async () => { throw new Error("must not be called for system"); },
    };
    const a = await authorizeNavPull(throwingDeps, { principal: "system", callerUserId: null });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("system");
  });
});

// ── the governed receipt ─────────────────────────────────────────────────────────────────────────

describe("buildNavPullAudit + navPullGovernedAuditRow — the receipt", () => {
  it("records the `high` risk class honestly even though the seam's autonomy gate is not run", () => {
    const audit = buildNavPullAudit({
      principal: "person",
      userId: "staff-A",
      contactId: "contact-1",
      tenantId: "tenant-A",
      authzBasis: "contact_authorized",
      allowed: true,
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    expect(audit.capability).toBe(NAV_PULL_CAPABILITY);
    expect(audit.risk).toBe("high"); // proves the canonical key is classified high
    expect(audit.decision).toBe("execute");
    expect(audit.tenant_source).toBe("server");
  });

  it("an ALLOW row carries the tenant on the column, contact_id in the payload, and target_id null", () => {
    const audit = buildNavPullAudit({
      principal: "person",
      userId: "staff-A",
      contactId: "contact-1",
      tenantId: "tenant-A",
      authzBasis: "contact_authorized",
      allowed: true,
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    const row = navPullGovernedAuditRow(audit);
    expect(row.action).toBe("nav_pull_governed_allow");
    expect(row.tenant_id).toBe("tenant-A");
    expect(row.target_type).toBe("nav_pull_business_credit");
    expect(row.target_id).toBeNull();
    expect(row.payload.contact_id).toBe("contact-1");
    expect(row.payload.authz_basis).toBe("contact_authorized");
    expect(row.payload.risk).toBe("high");
    // Honest scope of enforcement (§13): AUTHORITY is enforced here; the autonomy/budget clamp for
    // `high` is deliberately deferred upstream — the receipt must say exactly that.
    expect(row.payload.enforcement).toBe("authority");
    expect(row.payload.autonomy_gate).toBe("deferred_upstream");
  });

  it("a REFUSE row is labelled as such (the only trace of a refused pull), actor is the JWT id", () => {
    const audit = buildNavPullAudit({
      principal: "person",
      userId: "admin-A",
      contactId: "contact-1",
      tenantId: null, // not resolved for a denied caller
      authzBasis: "denied",
      allowed: false,
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    const row = navPullGovernedAuditRow(audit);
    expect(row.action).toBe("nav_pull_governed_refuse");
    expect(row.payload.decision).toBe("refuse");
    expect(row.tenant_id).toBeNull();
    expect(audit.user_id).toBe("admin-A"); // actor is the JWT-derived id
  });

  it("a SYSTEM allow row records the system principal", () => {
    const audit = buildNavPullAudit({
      principal: "system",
      userId: null,
      contactId: "contact-1",
      tenantId: "tenant-A",
      authzBasis: "system",
      allowed: true,
      startedAtMs: Date.now(),
      nowIso: new Date().toISOString(),
    });
    const row = navPullGovernedAuditRow(audit);
    expect(row.action).toBe("nav_pull_governed_allow");
    expect(row.payload.principal).toBe("system");
    expect(audit.user_id).toBeNull();
  });
});
