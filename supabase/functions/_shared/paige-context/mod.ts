/**
 * Paige Context Assembly Contract — shared seam module.
 *
 * Implements `docs/brain/paige-context-assembly-contract.md` (merged 2026-09-10, #1094),
 * which extends the Paige Runtime Harness doctrine in
 * `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §3, responsibility #1 (context assembly).
 *
 * ONE ContextBundle per turn, many typed sources, ZERO silent degradation:
 *   - identity resolves ONCE per turn; every step re-validates scope;
 *   - every source reports available | unavailable | degraded WITH a reason —
 *     catch-to-empty, default-to-neutral, and null-then-onward are forbidden;
 *   - string projections are built LAST, from structured results, so callers can
 *     render, test, and audit exactly what was included;
 *   - account shape (solo | agency | sub_account | operator | enterprise) is a
 *     RESOLVED dimension of identity (canonical sources: tierBranches.ts +
 *     tierFeatures.ts + server membership resolvers), never a prompt or client
 *     claim. Shape selects the bundle's PROJECTION — never its governance.
 *
 * Dependency-free (no `npm:` / Deno globals) so vitest imports it directly, like
 * `_shared/durable-job/mod.ts` and `_shared/paige-spine/registry.ts`.
 */

/**
 * A context source's honest availability. `degraded` means the source was asked and
 * the read failed — the reason names the failure. `unavailable` means the source is
 * not applicable to this turn (lane not required, feature not enabled, no record).
 */
export type ContextSourceStatus = "available" | "unavailable" | "degraded";

export type ContextSourceResult<T> = {
  readonly status: ContextSourceStatus;
  readonly reason?: string;
  readonly data: T | null;
};

export function contextAvailable<T>(data: T | null): ContextSourceResult<T> {
  // A successful read of nothing is still an available source (empty is a claim the
  // source is entitled to make — e.g. zero tasks). unavailable is for applicability.
  return { status: "available", data };
}

export function contextUnavailable(reason: string): ContextSourceResult<null> {
  return { status: "unavailable", reason, data: null };
}

export function contextDegraded<T>(reason: string): ContextSourceResult<T> {
  return { status: "degraded", reason, data: null };
}

/**
 * Account shape per the owner directive (2026-09-10) and `RouteTierKey`
 * (src/lib/routing/tierBranches.ts): sub_account inherits the SOLO tree except
 * billing (§11c/§60); enterprise is agency baseline + branches, never a fork (§3/§61);
 * operator is the §200 designated-system-tenant audience. Mirrors the canonical
 * `RouteTierKey` plus nothing else — these five and only these five.
 */
export type AccountShape = "solo" | "agency" | "sub_account" | "operator" | "enterprise";

/**
 * Resolved once per turn. `scopeEpoch` is a caller-maintained generation counter (or
 * equivalent fence): steps compare the bundle's epoch against the live one before
 * acting — a mismatch is `scope_changed` and the step fails closed, the
 * `_shared/paige-spine/resolveEvidence.ts` precedent.
 */
export interface ContextIdentity {
  readonly actorId: string;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly role: string | null;
  readonly actAsClientId: string | null;
  /** Null ONLY when unresolved-but-applicable is impossible; a resolved shape never defaults silently. */
  readonly accountShape: AccountShape | null;
  readonly scopeEpoch: number | string;
}

export function identityScopeChanged(
  identity: ContextIdentity,
  currentEpoch: number | string,
): boolean {
  return identity.scopeEpoch !== currentEpoch;
}

/**
 * The degradation ledger: every non-available source of a bundle, with its reason.
 * Recorded, never silent — feedable to traces/Rail per the receipt contract.
 */
export interface DegradationEntry {
  readonly source: string;
  readonly status: "unavailable" | "degraded";
  readonly reason: string;
}

export function degradationLedger(
  sources: Readonly<Record<string, ContextSourceResult<unknown>>>,
): readonly DegradationEntry[] {
  const entries: DegradationEntry[] = [];
  for (const [name, result] of Object.entries(sources)) {
    if (result.status === "available") continue;
    entries.push({ source: name, status: result.status, reason: result.reason ?? "unspecified" });
  }
  return entries;
}
