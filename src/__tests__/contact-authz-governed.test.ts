/**
 * THE CONTACT-SCOPED GOVERNED ADAPTER — proving the shared `_shared/contact-authz` door closes the
 * cross-tenant contact IDOR class and records a governed receipt, exercised through its FIRST consumer,
 * `smartcredit-pull-snapshot` (the consumer 3-bureau credit pull). The same door backs nav-pull's
 * pattern and the forthcoming paige-plaid-* closes.
 *
 * Pure modules, exercised as the SHIPPED code (no doubles of the decision):
 *   - `authorizeContactScopedAction` (the §9/§53/§59 authority decision) over an INJECTED
 *     `can_access_contact` dep.
 *   - `buildContactScopedAudit` + `contactScopedGovernedAuditRow` (the governed receipt) over
 *     `classifyAction`, parameterized by the caller's capability key / actionType / actionPrefix.
 *
 * WHAT THIS PROVES: a contact-authorized caller → allowed (basis `contact_authorized`) · a cross-tenant /
 * non-existent-contact person → DENIED (the IDOR, uniform, no existence oracle) · a person with no
 * resolved uid → fail closed · a service-role `system` caller → allowed with the dep NOT consulted ·
 * `smartcredit_pull_snapshot` is classified `high` and recorded on every audit row · the receipt is
 * honestly scoped (`enforcement:"authority"`, `autonomy_gate:"deferred_upstream"`) · the action/target
 * names derive from the caller's actionPrefix/actionType.
 *
 * WHAT IT DOES NOT PROVE (§13/§32): the authenticated runtime against the deployed function, and the
 * JWT→identity / service-key detection + the `can_access_contact` RPC inside the Deno edge function — a
 * separate evidence class, owed to a live drive, not claimed here.
 */
import { describe, it, expect } from "vitest";
import {
  authorizeContactScopedAction,
  buildContactScopedAudit,
  contactScopedGovernedAuditRow,
  type ContactScopedAuthzDeps,
  type ContactScopedPrincipal,
} from "../../supabase/functions/_shared/contact-authz/governed-adapter.ts";

// smartcredit-pull-snapshot's canonical binding of the shared door.
const SC = { capability: "smartcredit_pull_snapshot", actionType: "smartcredit_snapshot", actionPrefix: "smartcredit_pull" };

const deps = (canAccess: boolean): ContactScopedAuthzDeps => ({ callerCanAccessContact: async () => canAccess });
const authorize = (canAccess: boolean, principal: ContactScopedPrincipal, callerUserId: string | null) =>
  authorizeContactScopedAction(deps(canAccess), { principal, callerUserId });

describe("authorizeContactScopedAction — the cross-tenant contact IDOR matrix", () => {
  it("a caller who CAN ACCESS the contact is allowed", async () => {
    const a = await authorize(true, "person", "staff-A");
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("contact_authorized");
  });

  it("THE IDOR: a person who CANNOT access the contact (cross-tenant / non-existent) is DENIED", async () => {
    const a = await authorize(false, "person", "admin-A");
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
    expect(a.reason).toMatch(/not authorized/i);
  });

  it("a person with no resolved user id is DENIED (fail closed)", async () => {
    const a = await authorize(true, "person", null);
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
  });

  it("a SYSTEM (service-role) caller is allowed with NO auth checks (the dep is not consulted)", async () => {
    const throwingDeps: ContactScopedAuthzDeps = {
      callerCanAccessContact: async () => { throw new Error("must not be called for system"); },
    };
    const a = await authorizeContactScopedAction(throwingDeps, { principal: "system", callerUserId: null });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("system");
  });
});

describe("buildContactScopedAudit + contactScopedGovernedAuditRow — the smartcredit receipt", () => {
  it("records the `high` risk class honestly even though the seam's autonomy gate is not run", () => {
    const audit = buildContactScopedAudit({
      ...SC, principal: "person", userId: "staff-A", contactId: "contact-1", tenantId: "tenant-A",
      authzBasis: "contact_authorized", allowed: true, startedAtMs: Date.now(), nowIso: new Date().toISOString(),
    });
    expect(audit.capability).toBe("smartcredit_pull_snapshot");
    expect(audit.risk).toBe("high"); // proves the canonical key is classified high
    expect(audit.decision).toBe("execute");
    expect(audit.tenant_source).toBe("server");
  });

  it("an ALLOW row carries the tenant on the column, contact_id in the payload, target_id null, and the smartcredit action names", () => {
    const audit = buildContactScopedAudit({
      ...SC, principal: "person", userId: "staff-A", contactId: "contact-1", tenantId: "tenant-A",
      authzBasis: "contact_authorized", allowed: true, startedAtMs: Date.now(), nowIso: new Date().toISOString(),
    });
    const row = contactScopedGovernedAuditRow(audit);
    expect(row.action).toBe("smartcredit_pull_governed_allow");
    expect(row.target_type).toBe("smartcredit_snapshot");
    expect(row.tenant_id).toBe("tenant-A");
    expect(row.target_id).toBeNull();
    expect(row.payload.contact_id).toBe("contact-1");
    expect(row.payload.authz_basis).toBe("contact_authorized");
    expect(row.payload.risk).toBe("high");
    expect(row.payload.enforcement).toBe("authority");
    expect(row.payload.autonomy_gate).toBe("deferred_upstream");
  });

  it("a REFUSE row is labelled as such (the only trace of a refused pull), actor is the JWT id, tenant null", () => {
    const audit = buildContactScopedAudit({
      ...SC, principal: "person", userId: "admin-A", contactId: "contact-1", tenantId: null,
      authzBasis: "denied", allowed: false, startedAtMs: Date.now(), nowIso: new Date().toISOString(),
    });
    const row = contactScopedGovernedAuditRow(audit);
    expect(row.action).toBe("smartcredit_pull_governed_refuse");
    expect(row.payload.decision).toBe("refuse");
    expect(row.tenant_id).toBeNull();
    expect(audit.user_id).toBe("admin-A");
  });

  it("a SYSTEM allow row records the system principal", () => {
    const audit = buildContactScopedAudit({
      ...SC, principal: "system", userId: null, contactId: "contact-1", tenantId: "tenant-A",
      authzBasis: "system", allowed: true, startedAtMs: Date.now(), nowIso: new Date().toISOString(),
    });
    const row = contactScopedGovernedAuditRow(audit);
    expect(row.action).toBe("smartcredit_pull_governed_allow");
    expect(row.payload.principal).toBe("system");
    expect(audit.user_id).toBeNull();
  });
});
