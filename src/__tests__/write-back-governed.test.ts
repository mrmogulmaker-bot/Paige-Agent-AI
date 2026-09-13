/**
 * THE WRITE-BACK SECURITY MATRIX — proving `paige-write-back` closes the cross-tenant write IDOR and
 * governs itself through the ONE shared seam.
 *
 * Two pure modules, exercised as the SHIPPED code (no doubles of the decision):
 *   - `authorizeWriteBackTarget` (the §9/§53/§59 authority decision) over INJECTED deps.
 *   - `decideWriteBack` (the governed gate) over `decideGovernedExecution` + `classifyAction`.
 *
 * WHAT THIS PROVES (the acceptance matrix):
 *   self-write → allowed · same-tenant admin → allowed · CROSS-TENANT admin → DENIED (the IDOR, no
 *   seam execute) · platform owner (super_admin) cross-tenant → allowed · coach→assigned same-tenant client →
 *   allowed · coach→unassigned → denied · the global role is never sufficient without the tenant
 *   bond · tenant is NEVER taken from the body · on EVERY denied path the seam returns refuse (the
 *   caller performs NO write) · the governed decision is consulted (update_client_data is ordinary;
 *   auto executes; unauthenticated / unresolved-tenant fail closed).
 *
 * WHAT IT DOES NOT PROVE (§13/§32): the authenticated runtime against the deployed function, and the
 * JWT→tenant derivation inside `paige-write-back/index.ts` (Deno, not importable here) — a separate
 * evidence class, owed to a live drive, not claimed here.
 */
import { describe, it, expect } from "vitest";
import {
  authorizeWriteBackTarget,
  decideWriteBack,
  writeBackGovernedAuditRow,
  WRITE_BACK_CAPABILITY,
  WRITE_BACK_DEFAULT_LANE,
  type WriteBackAuthzDeps,
  type WriteBackAuthz,
} from "../../supabase/functions/_shared/paige-write-back/governed-adapter.ts";

// ── authorizeWriteBackTarget — the IDOR matrix ───────────────────────────────────────────────────

type Scenario = {
  platformOwner?: boolean;
  roles?: string[];
  callerTenant?: string | null;
  targetTenant?: string | null;
  sharesTenant?: boolean;
  coachAssigned?: boolean;
};

const deps = (s: Scenario): WriteBackAuthzDeps => ({
  isPlatformOwner: async () => !!s.platformOwner,
  callerRoles: async () => s.roles ?? [],
  callerActiveTenant: async () => (s.callerTenant === undefined ? "tenant-A" : s.callerTenant),
  resolveTargetTenant: async () => (s.targetTenant === undefined ? "tenant-A" : s.targetTenant),
  targetSharesTenant: async () => !!s.sharesTenant,
  coachAssigned: async () => !!s.coachAssigned,
});

const authorize = (s: Scenario, callerUserId = "staff-A", targetUserId = "target-B") =>
  authorizeWriteBackTarget(deps(s), { callerUserId, targetUserId });

describe("authorizeWriteBackTarget — the cross-tenant write IDOR matrix", () => {
  it("SELF write is allowed (own record; not a cross-user act)", async () => {
    const a = await authorize({}, "user-A", "user-A");
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("self");
  });

  it("a PLATFORM OWNER (super_admin) may write cross-tenant (the one sanctioned cross-tenant PII-write caller)", async () => {
    const a = await authorize({ platformOwner: true, targetTenant: "tenant-Z" });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("platform_owner");
    expect(a.tenantId).toBe("tenant-Z"); // scoped to the target's workspace for audit
  });

  it("a SAME-TENANT admin is allowed", async () => {
    const a = await authorize({ roles: ["admin"], callerTenant: "tenant-A", sharesTenant: true });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("same_tenant_admin");
    expect(a.tenantId).toBe("tenant-A");
  });

  it("THE IDOR: a CROSS-TENANT admin is DENIED (global admin role is not tenant authority)", async () => {
    // A tenant-A admin acting on a tenant-B target: targetSharesTenant is false.
    const a = await authorize({ roles: ["admin"], callerTenant: "tenant-A", sharesTenant: false });
    expect(a.allowed).toBe(false);
    expect(a.basis).toBe("denied");
    expect(a.reason).toMatch(/different workspace/i);
  });

  it("a caller with NO staff role is DENIED (before any tenant resolution)", async () => {
    const a = await authorize({ roles: [], sharesTenant: true });
    expect(a.allowed).toBe(false);
    expect(a.reason).toMatch(/not authorized/i);
  });

  it("a staff caller whose ACTIVE workspace cannot be resolved is DENIED (fail closed)", async () => {
    const a = await authorize({ roles: ["admin"], callerTenant: null, sharesTenant: true });
    expect(a.allowed).toBe(false);
    expect(a.reason).toMatch(/workspace could not be resolved/i);
  });

  it("a coach assigned to a SAME-TENANT client is allowed", async () => {
    const a = await authorize({ roles: ["coach"], callerTenant: "tenant-A", sharesTenant: true, coachAssigned: true });
    expect(a.allowed).toBe(true);
    expect(a.basis).toBe("assigned_coach");
  });

  it("a coach NOT assigned to the client is DENIED, even in the same tenant", async () => {
    const a = await authorize({ roles: ["coach"], callerTenant: "tenant-A", sharesTenant: true, coachAssigned: false });
    expect(a.allowed).toBe(false);
    expect(a.reason).toMatch(/not assigned/i);
  });

  it("a coach in a DIFFERENT tenant is DENIED before the assignment is ever consulted", async () => {
    let assignmentChecked = false;
    const d: WriteBackAuthzDeps = {
      ...deps({ roles: ["coach"], callerTenant: "tenant-A", sharesTenant: false }),
      coachAssigned: async () => { assignmentChecked = true; return true; },
    };
    const a = await authorizeWriteBackTarget(d, { callerUserId: "coach-A", targetUserId: "client-B" });
    expect(a.allowed).toBe(false);
    expect(a.reason).toMatch(/different workspace/i);
    expect(assignmentChecked).toBe(false); // the tenant bond gates before the coach_clients bond
  });

  it("an admin never consults coach_clients (admin authority is the tenant bond)", async () => {
    let assignmentChecked = false;
    const d: WriteBackAuthzDeps = {
      ...deps({ roles: ["admin"], callerTenant: "tenant-A", sharesTenant: true }),
      coachAssigned: async () => { assignmentChecked = true; return false; },
    };
    const a = await authorizeWriteBackTarget(d, { callerUserId: "admin-A", targetUserId: "client-B" });
    expect(a.allowed).toBe(true);
    expect(assignmentChecked).toBe(false);
  });
});

// ── decideWriteBack — the governed gate over the shared seam ──────────────────────────────────────

const governed = (over: Partial<Parameters<typeof decideWriteBack>[0]> = {}) =>
  decideWriteBack({
    authenticated: true,
    userId: "staff-A",
    targetUserId: "target-B",
    tenantId: "tenant-A",
    access: { allowed: true },
    authzBasis: "same_tenant_admin",
    fieldPaths: ["profile.full_name", "foundation.ein"],
    startedAtMs: Date.now(),
    nowIso: new Date().toISOString(),
    ...over,
  });

describe("decideWriteBack — the governed gate", () => {
  it("an authorized same-tenant write EXECUTES (update_client_data is ordinary → auto executes)", () => {
    const { outcome, audit } = governed();
    expect(outcome.kind).toBe("execute");
    expect(audit.capability).toBe(WRITE_BACK_CAPABILITY);
    expect(audit.risk).toBe("ordinary");
    expect(audit.lane_requested).toBe(WRITE_BACK_DEFAULT_LANE);
    expect(audit.clamped).toBe(false);
    expect(audit.tenant_id).toBe("tenant-A");
  });

  it("an access-DENIED verdict (the IDOR refusal) produces REFUSE — the caller performs NO write", () => {
    const { outcome, audit } = governed({
      access: { allowed: false, reason: "This record belongs to a different workspace." },
      authzBasis: "denied",
    });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") {
      expect(outcome.code).toBe("access_denied");
      expect(outcome.message).toMatch(/different workspace/i);
    }
    expect(audit.decision).toBe("refuse");
  });

  it("an unauthenticated caller is REFUSED (fail closed)", () => {
    const { outcome } = governed({ authenticated: false });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("unauthenticated");
  });

  it("a resolved-allow with NO tenant is REFUSED (tenant is never defaulted — fail closed)", () => {
    const { outcome } = governed({ tenantId: null });
    expect(outcome.kind).toBe("refuse");
    if (outcome.kind === "refuse") expect(outcome.code).toBe("tenant_unresolved");
  });

  it("the tenant the decision uses is the RESOLVED one passed in, not anything the batch could carry", () => {
    // decideWriteBack has no body/args governance input at all; fieldPaths are evidence only. The
    // tenant is whatever the server-side authorization resolved.
    const { audit } = governed({ tenantId: "tenant-A", fieldPaths: ["profile.ssn", "foundation.ein"] });
    expect(audit.tenant_id).toBe("tenant-A");
    expect(audit.field_paths).toEqual(["profile.ssn", "foundation.ein"]);
  });
});

// ── writeBackGovernedAuditRow — the durable receipt shape ─────────────────────────────────────────

describe("writeBackGovernedAuditRow — the paige_audit_log row", () => {
  it("an ALLOW row carries the workspace on the COLUMN and the evidence in the payload", () => {
    const { audit } = governed();
    const row = writeBackGovernedAuditRow(audit);
    expect(row.action).toBe("write_back_governed_allow");
    expect(row.tenant_id).toBe("tenant-A"); // the column the tenant-admin read policy gates on
    expect(row.target_type).toBe("profile_write_back");
    expect(row.target_id).toBeNull(); // the subject travels in the payload, never the uuid column
    expect(row.payload.capability).toBe(WRITE_BACK_CAPABILITY);
    expect(row.payload.target_user_id).toBe("target-B");
    expect(row.payload.field_count).toBe(2);
    expect(row.payload.enforcement).toBe("enforced");
  });

  it("a REFUSE row names the refusal and records NO field values (only paths + count)", () => {
    const { audit } = governed({ access: { allowed: false, reason: "different workspace" }, authzBasis: "denied" });
    const row = writeBackGovernedAuditRow(audit);
    expect(row.action).toBe("write_back_governed_refuse");
    expect(row.payload.decision).toBe("refuse");
    expect(row.payload.refusal_code).toBe("access_denied");
    // The payload carries field PATHS and a count — never a field VALUE (the PII).
    expect(row.payload.field_count).toBe(2);
    expect(JSON.stringify(row.payload)).not.toContain("field_value");
  });
});
