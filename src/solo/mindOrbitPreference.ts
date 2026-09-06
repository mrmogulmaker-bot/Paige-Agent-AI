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

// Motion preference — a THREE-state override of the OS `prefers-reduced-motion` setting.
//  - "system" (default, unstored): follow the OS. A user who never touches the control gets the
//    accessible default — no auto-motion when the OS asks to reduce it (§11 motion-safe).
//  - "full": the user EXPLICITLY asked for motion; play the ambient orbit even if the OS reduces
//    motion (a user-initiated opt-in is a legitimate override of the passive OS preference).
//  - "reduced": the user EXPLICITLY asked to stop motion; hold the orb still regardless of the OS.
// Storing only an explicit choice keeps first use following the OS.
export type MindMotionChoice = "system" | "reduced" | "full";

const MIND_MOTION_PREFIX = "paige.mind.motion";

export function mindMotionPreferenceKey(scope: MindOrbitPreferenceScope): string {
  return `${MIND_MOTION_PREFIX}.${scope.userId}.${scope.tenantId}`;
}

export function readMindMotionChoice(scope?: MindOrbitPreferenceScope | null): MindMotionChoice {
  if (!scope) return "system";
  try {
    const v = window.localStorage.getItem(mindMotionPreferenceKey(scope));
    return v === "reduced" || v === "full" ? v : "system";
  } catch {
    return "system";
  }
}

export function writeMindMotionChoice(
  scope: MindOrbitPreferenceScope | null | undefined,
  choice: MindMotionChoice,
): void {
  if (!scope) return;
  try {
    const key = mindMotionPreferenceKey(scope);
    if (choice === "system") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, choice);
  } catch {
    // Private mode or disabled storage must not break the in-session control.
  }
}
