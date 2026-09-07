/**
 * Typed UI context for the one dedicated Paige workspace.
 *
 * Every value here is a locator and an enumerated intent, never authority or a
 * page snapshot. The server re-resolves the active tenant and every canonical
 * record before using it.
 */
export type PaigeClientScope = {
  readonly tenantId: string;
  readonly clientId: string;
  readonly label: string;
};

export type PaigeBusinessPlanScope = {
  readonly tenantId: string;
  readonly surface: "business_game_plan";
  readonly businessMissionId: string | null;
  readonly ask: "plan_with_paige";
  readonly label: string;
};

export type PaigeInterviewScope = {
  readonly tenantId: string;
  readonly surface: "paige_brief";
  readonly ask: "business_working_interview";
  readonly label: "Paige Brief";
};

export type PaigeDiscussionScope = {
  readonly tenantId: string;
  readonly surface: "business_game_plan";
  readonly businessMissionId: string;
  readonly ask: "resolve_missing_information";
  readonly label: string;
};

export type PaigeSurfaceScope = PaigeClientScope | PaigeBusinessPlanScope | PaigeInterviewScope | PaigeDiscussionScope;

let current: PaigeSurfaceScope | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of [...listeners]) {
    try { listener(); } catch { /* one subscriber cannot block the others */ }
  }
}

function replace(scope: PaigeSurfaceScope | null): void {
  if (JSON.stringify(current) === JSON.stringify(scope)) return;
  current = scope;
  announce();
}

export function getPaigeClientScope(tenantId: string | null | undefined): PaigeClientScope | null {
  if (!tenantId || !current || current.tenantId !== tenantId || !("clientId" in current)) return null;
  return current;
}

export function setPaigeClientScope(scope: PaigeClientScope | null): void {
  if (scope && (!scope.tenantId || !scope.clientId.trim())) return replace(null);
  replace(scope ? { ...scope, clientId: scope.clientId.trim(), label: scope.label.trim() || "this client" } : null);
}

export function clearPaigeClientScope(): void { setPaigeClientScope(null); }

export function subscribePaigeClientScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getPaigeBusinessPlanScope(tenantId: string | null | undefined): PaigeBusinessPlanScope | PaigeDiscussionScope | null {
  if (!tenantId || !current || current.tenantId !== tenantId || !("surface" in current) || current.surface !== "business_game_plan") return null;
  return current;
}

export function setPaigeBusinessPlanScope(scope: Omit<PaigeBusinessPlanScope, "ask"> & { ask?: "plan_with_paige" }): void {
  if (!scope.tenantId || !scope.label.trim() || (scope.businessMissionId !== null && !scope.businessMissionId.trim())) return replace(null);
  replace({ ...scope, businessMissionId: scope.businessMissionId?.trim() ?? null, ask: "plan_with_paige" });
}

export function setPaigeInterviewScope(tenantId: string): void {
  if (!tenantId) return replace(null);
  replace({ tenantId, surface: "paige_brief", ask: "business_working_interview", label: "Paige Brief" });
}

export function getPaigeInterviewScope(tenantId: string | null | undefined): PaigeInterviewScope | null {
  if (!tenantId || !current || current.tenantId !== tenantId || !("ask" in current) || current.ask !== "business_working_interview") return null;
  return current;
}

export function setPaigeDiscussionScope(scope: Omit<PaigeDiscussionScope, "ask">): void {
  if (!scope.tenantId || !scope.businessMissionId.trim() || !scope.label.trim()) return replace(null);
  replace({ ...scope, businessMissionId: scope.businessMissionId.trim(), ask: "resolve_missing_information" });
}

export function clearPaigeSurfaceScope(): void { replace(null); }
export const subscribePaigeSurfaceScope = subscribePaigeClientScope;

/**
 * Legacy event reader. Event detail is untrusted and may name only a complete
 * client locator. New surface intents use the typed setters above.
 */
export function readPaigeOpenScope(detail: unknown, tenantId: string | null | undefined): PaigeClientScope | null {
  if (!tenantId || !detail || typeof detail !== "object") return null;
  const { clientId, clientLabel } = detail as { clientId?: unknown; clientLabel?: unknown };
  if (typeof clientId !== "string" || !clientId.trim()) return null;
  const label = typeof clientLabel === "string" && clientLabel.trim() ? clientLabel.trim() : "this client";
  return { tenantId, clientId: clientId.trim(), label };
}
