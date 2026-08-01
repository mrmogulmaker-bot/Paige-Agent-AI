// Headless §32 smoke for the manage-tenant-domain §9 tenant-derivation (#178 Slice 2).
// Run: node --experimental-strip-types scripts/tenant-domain-scope-smoke.mts
//
// A green build proves nothing about whether the IDOR is actually closed. This exercises the
// REAL shipped decision function against the concrete cross-tenant ATTACK cases and asserts each
// forged attempt is refused (403), while legitimate calls resolve to the caller's OWN tenant.
import { deriveCallerTenant } from "../supabase/functions/_shared/tenant-domain-scope.ts";

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (cond) console.log(`  ok   — ${msg}`);
  else { console.error(`  FAIL — ${msg}`); failures++; }
}

const A = "tenant-A";
const B = "tenant-B";

// ── ATTACK: a non-owner admin of tenant A forges body.tenant_id = B. ──────────────────
{
  const d = deriveCallerTenant({ isOwner: false, bodyTenantId: B, activeTenant: A });
  assert(d.ok === false && d.error === "cross_tenant_forbidden" && d.status === 403,
    "non-owner forging another tenant → 403 cross_tenant_forbidden (the live IDOR, now closed)");
}

// ── Legit: non-owner admin, no body tenant → pinned to their OWN active tenant. ───────
{
  const d = deriveCallerTenant({ isOwner: false, bodyTenantId: undefined, activeTenant: A });
  assert(d.ok === true && d.tenantId === A, "non-owner with no body → own active tenant");
}

// ── Legit: non-owner admin passes body.tenant_id EQUAL to their own tenant → allowed. ─
{
  const d = deriveCallerTenant({ isOwner: false, bodyTenantId: A, activeTenant: A });
  assert(d.ok === true && d.tenantId === A, "non-owner passing their OWN tenant id → allowed");
}

// ── Owner: may target any tenant (fleet operation). ──────────────────────────────────
{
  const d = deriveCallerTenant({ isOwner: true, bodyTenantId: B, activeTenant: A });
  assert(d.ok === true && d.tenantId === B, "platform owner targeting another tenant → allowed (fleet op)");
}

// ── Owner with no body → own active tenant. ──────────────────────────────────────────
{
  const d = deriveCallerTenant({ isOwner: true, bodyTenantId: undefined, activeTenant: A });
  assert(d.ok === true && d.tenantId === A, "owner with no body → own active tenant");
}

// ── No resolvable tenant → 400 (not a silent pass). ──────────────────────────────────
{
  const d = deriveCallerTenant({ isOwner: false, bodyTenantId: undefined, activeTenant: null });
  assert(d.ok === false && d.error === "no_tenant" && d.status === 400, "no active tenant → 400 no_tenant");
}
{
  const d = deriveCallerTenant({ isOwner: false, bodyTenantId: B, activeTenant: null });
  assert(d.ok === false && d.status === 403,
    "non-owner with NO active tenant still cannot target another → 403 (never falls through to attacker's id)");
}

if (failures > 0) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
console.log("\nAll tenant-domain §9 scope smoke assertions passed.");
