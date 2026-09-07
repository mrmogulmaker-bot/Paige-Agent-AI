export type SecureBrowserActorRole = "admin" | "agency";
export type SecureBrowserInvocationKind = "admin" | "agency" | "mcp";

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
  resolveContactTenant(contactId: string): Promise<string | null>;
  isTenantAdmin(actorUserId: string, tenantId: string): Promise<boolean>;
  canAgencyManage(actorUserId: string, tenantId: string): Promise<boolean>;
}

export function secureBrowserNeedsAdminConfirmation(
  requireAdminConfirmFirstN: number,
  runCount: number,
  invocationKind: SecureBrowserInvocationKind | undefined,
  confirmToken: string | undefined,
): boolean {
  return requireAdminConfirmFirstN > 0
    && runCount < requireAdminConfirmFirstN
    && invocationKind !== "admin"
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

  if (internalServiceCall) {
    actorUserId = input.invokerUserId ?? null;
    activeTenantId = input.tenantHint ?? null;
    invocationKind = "mcp";
    if (!actorUserId || !activeTenantId) throw new Error("browser_authority_unresolved");
  } else {
    actorUserId = await deps.authenticate(presented);
    if (!actorUserId) throw new Error("browser_session_invalid");
    activeTenantId = await deps.resolveActiveTenant(actorUserId);
    if (!activeTenantId) throw new Error("browser_active_workspace_required");
    invocationKind = "admin";
  }

  // Deliberately after authentication: invalid callers cannot probe contact existence.
  const contactTenantId = input.contactId ? await deps.resolveContactTenant(input.contactId) : null;
  if (input.contactId && !contactTenantId) throw new Error("browser_contact_unresolved");
  if (contactTenantId && contactTenantId !== activeTenantId) {
    throw new Error(internalServiceCall ? "browser_tenant_mismatch" : "browser_contact_outside_active_workspace");
  }

  const [directAdmin, agencyManager] = await Promise.all([
    deps.isTenantAdmin(actorUserId, activeTenantId),
    deps.canAgencyManage(actorUserId, activeTenantId),
  ]);
  if (!directAdmin && !agencyManager) throw new Error("browser_actor_not_authorized");
  const actorRole: SecureBrowserActorRole = directAdmin ? "admin" : "agency";
  if (!internalServiceCall) invocationKind = actorRole;
  return { tenantId: activeTenantId, actorUserId, actorRole, invocationKind };
}
