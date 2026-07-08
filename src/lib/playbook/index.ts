// Playbook — public entry point.
//
// Surfaces read the ACTIVE playbook via usePlaybook() / getActivePlaybook()
// instead of hardcoding vertical strings. Today it resolves to the neutral
// coaching default; the seam below is where a later step loads the tenant's
// authored playbook (by slug from tenant config) once the config table exists.

import { coachingDefault, PLAYBOOK_LIBRARY } from "./presets";
import type { Playbook } from "./types";

export * from "./types";
export { coachingDefault, fitnessCoach, businessConsultant, marketingAgency, PLAYBOOK_LIBRARY } from "./presets";

/** Resolve a playbook by slug, falling back to the coaching default. */
export function getPlaybookBySlug(slug?: string | null): Playbook {
  if (!slug) return coachingDefault;
  return PLAYBOOK_LIBRARY.find((p) => p.slug === slug) ?? coachingDefault;
}

/**
 * The active playbook for the current tenant. Neutral coaching default for now;
 * this is the single place to swap in a per-tenant lookup (tenant config →
 * playbook slug or a fully authored playbook) without touching call sites.
 */
export function getActivePlaybook(): Playbook {
  return coachingDefault;
}

/** React hook form — same resolution, hook-shaped for components. */
export function usePlaybook(): Playbook {
  return getActivePlaybook();
}
