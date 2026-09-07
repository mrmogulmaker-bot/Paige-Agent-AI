export const PUBLIC_PRESENCE_STEPS = [
  "confirm_facts",
  "verify_website",
  "connect_venues",
  "compare_facts",
  "set_authority",
  "maintain_presence",
] as const;

export type PublicPresenceStep = (typeof PUBLIC_PRESENCE_STEPS)[number];
export type PaigePublicPresenceScope = {
  readonly tenantId: string;
  readonly kind: "public_presence";
  readonly step: PublicPresenceStep;
  readonly intendedAction: "review" | "plan" | "prepare_connection" | "resolve_mismatch";
};

let current: PaigePublicPresenceScope | null = null;
const listeners = new Set<() => void>();
const announce = () => { for (const listener of [...listeners]) listener(); };

export function setPaigePublicPresenceScope(scope: PaigePublicPresenceScope | null) {
  current = scope?.tenantId && PUBLIC_PRESENCE_STEPS.includes(scope.step) ? scope : null;
  announce();
}

export function getPaigePublicPresenceScope(tenantId: string | null | undefined) {
  return tenantId && current?.tenantId === tenantId ? current : null;
}

export function clearPaigePublicPresenceScope() {
  setPaigePublicPresenceScope(null);
}

export function subscribePaigePublicPresenceScope(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
