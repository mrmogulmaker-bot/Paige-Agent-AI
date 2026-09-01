export type MindOrbitPreferenceScope = {
  userId: string;
  tenantId: string;
};

const MIND_ORBIT_PAUSED_PREFIX = "paige.mind.presentationOrbit.paused";

export function mindOrbitPreferenceKey(scope: MindOrbitPreferenceScope): string {
  return `${MIND_ORBIT_PAUSED_PREFIX}.${scope.userId}.${scope.tenantId}`;
}

/**
 * The presentation orbit is on by default. Only an explicit pause is stored, so
 * first use and storage failures both fail toward the owner-approved running state.
 */
export function readMindOrbitEnabled(scope?: MindOrbitPreferenceScope | null): boolean {
  if (!scope) return true;
  try {
    return window.localStorage.getItem(mindOrbitPreferenceKey(scope)) !== "true";
  } catch {
    return true;
  }
}

export function writeMindOrbitEnabled(
  scope: MindOrbitPreferenceScope | null | undefined,
  enabled: boolean,
): void {
  if (!scope) return;
  try {
    const key = mindOrbitPreferenceKey(scope);
    if (enabled) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, "true");
  } catch {
    // Private mode or disabled storage must not break the in-session control.
  }
}
