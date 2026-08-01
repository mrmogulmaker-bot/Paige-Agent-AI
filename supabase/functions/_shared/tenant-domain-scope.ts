// #178 Slice 2 — the §9 tenant-derivation decision for manage-tenant-domain, extracted as a
// PURE function (no imports) so the exact cross-tenant-attack cases can be proven headless (§32)
// AND so the edge fn and the smoke exercise the SAME logic. This is the gate that turned a live
// cross-tenant IDOR into a 403: a non-owner admin can NEVER act on a tenant other than their own.

export type TenantDecision =
  | { ok: true; tenantId: string }
  | { ok: false; status: 400 | 403; error: "no_tenant" | "cross_tenant_forbidden" };

/**
 * Decide which tenant a caller of manage-tenant-domain may act on.
 *  - platform owner: may target any tenant via bodyTenantId (fleet op), else their active tenant.
 *  - tenant admin: pinned to their OWN active tenant. A bodyTenantId that disagrees is a forged
 *    cross-tenant attempt → 403 (the caller must never be able to steer at another tenant's rows).
 *  - no resolvable tenant → 400.
 */
export function deriveCallerTenant(input: {
  isOwner: boolean;
  bodyTenantId: string | null | undefined;
  activeTenant: string | null | undefined;
}): TenantDecision {
  const { isOwner, bodyTenantId, activeTenant } = input;
  if (isOwner) {
    const tenantId = bodyTenantId || activeTenant;
    return tenantId ? { ok: true, tenantId } : { ok: false, status: 400, error: "no_tenant" };
  }
  // Non-owner: a body tenant that disagrees with the caller's own active tenant is an attack.
  if (bodyTenantId && bodyTenantId !== activeTenant) {
    return { ok: false, status: 403, error: "cross_tenant_forbidden" };
  }
  return activeTenant
    ? { ok: true, tenantId: activeTenant }
    : { ok: false, status: 400, error: "no_tenant" };
}
