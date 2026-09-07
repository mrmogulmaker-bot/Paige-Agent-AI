export type SecureBrowserActorRole = "admin" | "agency" | "platform_owner";
export type SecureBrowserInvocationKind = "admin" | "agency" | "platform_owner" | "mcp";

export interface SecureBrowserAuthority {
  tenantId: string;
  actorUserId: string;
  actorRole: SecureBrowserActorRole;
  invocationKind: SecureBrowserInvocationKind;
}

export interface SecureBrowserAuthorityInput {
  bearerToken: string;
  serviceKey: string;
  contactId?: string;
  tenantHint?: string;
  invokerUserId?: string;
}

export interface SecureBrowserAuthorityDeps {
  authenticate(token: string): Promise<string | null>;
  resolveActiveTenant(actorUserId: string): Promise<string | null>;
  resolveContactTenant(contactId: string, tenantId?: string): Promise<string | null>;
  isPlatformOwner(actorUserId: string): Promise<boolean>;
  resolvePlatformOperatorTenant(): Promise<string | null>;
  isTenantAdmin(actorUserId: string, tenantId: string): Promise<boolean>;
  canAgencyManage(actorUserId: string, tenantId: string): Promise<boolean>;
}

export function secureBrowserNeedsAdminConfirmation(
  requireAdminConfirmFirstN: number,
  runCount: number,
  invocationKind: string | undefined,
  confirmToken: string | undefined,
): boolean {
  return requireAdminConfirmFirstN > 0
    && runCount < requireAdminConfirmFirstN
    && invocationKind !== "admin"
    && invocationKind !== "platform_owner"
    && !confirmToken;
}

/** Provider-neutral, authenticate-before-tenant-read Secure Browser authority boundary. */
export async function resolveSecureBrowserAuthority(
  input: SecureBrowserAuthorityInput,
  deps: SecureBrowserAuthorityDeps,
): Promise<SecureBrowserAuthority> {
  const presented = input.bearerToken.trim();
  const internalServiceCall = input.serviceKey.length > 0 && presented === input.serviceKey;
  let actorUserId: string | null = null;
  let activeTenantId: string | null = null;
  let invocationKind: SecureBrowserInvocationKind;
  let platformOwner = false;
  let directAdmin = false;
  let agencyManager = false;

  if (internalServiceCall) {
    actorUserId = input.invokerUserId ?? null;
    activeTenantId = input.tenantHint ?? null;
    invocationKind = "mcp";
    // Browser authority must still resolve to a human owner/admin or authorized representative.
    // An actorless platform key is authenticated infrastructure, not delegated browser authority.
    if (!actorUserId) throw new Error("browser_human_actor_required");
  } else {
    actorUserId = await deps.authenticate(presented);
    if (!actorUserId) throw new Error("browser_session_invalid");
    platformOwner = await deps.isPlatformOwner(actorUserId);
    activeTenantId = await deps.resolveActiveTenant(actorUserId);
    if (!activeTenantId && platformOwner) activeTenantId = await deps.resolvePlatformOperatorTenant();
    if (!activeTenantId) throw new Error("browser_active_workspace_required");

    // Authorize the direct actor before any service-role contact lookup. This keeps absent, foreign, and
    // same-tenant contact identifiers from becoming an oracle for an otherwise unauthorized member.
    [directAdmin, agencyManager] = await Promise.all([
      deps.isTenantAdmin(actorUserId, activeTenantId),
      deps.canAgencyManage(actorUserId, activeTenantId),
    ]);
    if (!platformOwner && !directAdmin && !agencyManager) throw new Error("browser_actor_not_authorized");
    invocationKind = platformOwner ? "platform_owner" : directAdmin ? "admin" : "agency";
  }

  if (internalServiceCall) {
    // A contact may supply the tenant only for the authenticated internal channel. When a tenant hint is
    // already present the lookup is constrained to it, so a mismatch and an absent id are indistinguishable.
    const contactTenantId = input.contactId
      ? await deps.resolveContactTenant(input.contactId, activeTenantId ?? undefined)
      : null;
    if (input.contactId && !contactTenantId) throw new Error("browser_contact_not_available");
    activeTenantId = contactTenantId ?? activeTenantId;
    if (!activeTenantId) throw new Error("browser_authority_unresolved");
    [platformOwner, directAdmin, agencyManager] = await Promise.all([
      deps.isPlatformOwner(actorUserId),
      deps.isTenantAdmin(actorUserId, activeTenantId),
      deps.canAgencyManage(actorUserId, activeTenantId),
    ]);
    if (!platformOwner && !directAdmin && !agencyManager) throw new Error("browser_actor_not_authorized");
  } else if (input.contactId) {
    const contactTenantId = await deps.resolveContactTenant(input.contactId, activeTenantId ?? undefined);
    if (!contactTenantId) throw new Error("browser_contact_not_available");
  }

  const resolvedTenantId = activeTenantId;
  if (!resolvedTenantId) throw new Error("browser_authority_unresolved");
  const actorRole: SecureBrowserActorRole = platformOwner ? "platform_owner" : directAdmin ? "admin" : "agency";
  return { tenantId: resolvedTenantId, actorUserId, actorRole, invocationKind };
}
