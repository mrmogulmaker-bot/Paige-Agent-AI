/**
 * The client a Solo surface has pointed PAIGE at.
 *
 * WHY THIS IS NOT REACT STATE. The `paige:open` event is dispatched by a surface
 * (a Pipeline deal card) that does not own the PAIGE fold, and the fold may not be
 * mounted at the instant it fires. A module-level store lets the fold read the scope
 * that was set before it existed, instead of racing a mount it does not control.
 *
 * WHAT THIS IS NOT. It is not authority. The value is UI context only: every
 * client-scoped read re-resolves the tenant on the server (`current_user_tenant_id()`)
 * and independently authorizes the client id by tenant equality before it is used. A
 * scope set here can name a client the caller may not read; the server answers that,
 * not this file. Nothing here widens what anyone may see.
 *
 * WHY EVERY SCOPE CARRIES ITS TENANT. A reader asks for the scope *of an account*. If
 * the account has changed, the stored scope belongs to the previous one and the answer
 * is null — computed at read time, so a stale scope can never be handed out while some
 * effect is still catching up. That is the same discipline the request fence uses: mask
 * during the read, do not wait for a cleanup.
 */

export type PaigeClientScope = {
  /** The account this scope was set under. A read for any other account returns null. */
  readonly tenantId: string;
  /** `clients.id`. UI context only — the server re-authorizes it on every request. */
  readonly clientId: string;
  /** What the surface called this client. Display only; never sent as identity. */
  readonly label: string;
};

let current: PaigeClientScope | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A broken subscriber must not stop the others from learning the scope changed.
    }
  }
}

/** Read the scope for one account. Null when nothing is set, or when it belongs to another account. */
export function getPaigeClientScope(tenantId: string | null | undefined): PaigeClientScope | null {
  if (!tenantId || !current || current.tenantId !== tenantId) return null;
  return current;
}

export function setPaigeClientScope(scope: PaigeClientScope | null): void {
  if (scope && (!scope.tenantId || !scope.clientId)) {
    // A scope missing either half cannot be re-resolved by the server, so it is not a
    // scope. Clearing is the honest outcome: no focus, rather than a half-named one.
    scope = null;
  }
  const same =
    (current === null && scope === null) ||
    (current !== null && scope !== null &&
      current.tenantId === scope.tenantId && current.clientId === scope.clientId && current.label === scope.label);
  if (same) return;
  current = scope;
  announce();
}

export function clearPaigeClientScope(): void {
  setPaigeClientScope(null);
}

export function subscribePaigeClientScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Read a `paige:open` event's detail as a client scope.
 *
 * Returns null for every shape that is not a complete, plainly-typed client scope,
 * including the two existing Pipeline dispatches that carry only a prompt. An event is
 * untrusted input from another surface: it names a client, it never grants one.
 */
export function readPaigeOpenScope(detail: unknown, tenantId: string | null | undefined): PaigeClientScope | null {
  if (!tenantId || !detail || typeof detail !== "object") return null;
  const { clientId, clientLabel } = detail as { clientId?: unknown; clientLabel?: unknown };
  if (typeof clientId !== "string" || !clientId.trim()) return null;
  const label = typeof clientLabel === "string" && clientLabel.trim() ? clientLabel.trim() : "this client";
  return { tenantId, clientId: clientId.trim(), label };
}
