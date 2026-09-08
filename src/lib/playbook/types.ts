// ---------------------------------------------------------------------------
// Playbook — the tenant-authored configuration of a tenant's Paige.
// ---------------------------------------------------------------------------
// A Playbook is the "snapshot" that makes one product native to many verticals
// (doctrine §7/§8): it configures WHO Paige is for this tenant, HOW she probes
// clients, the client journey, the intake, and the client-portal surface — so a
// fitness coach, a business consultant, and a marketing agency each get a Paige
// that is native to their practice, never a hardcoded vertical.
//
// This is the foundation layer: pure types + presets. Surfaces read the ACTIVE
// playbook (see ./index) instead of hardcoded strings. A later step loads the
// active playbook per-tenant from config; today it defaults to generic coaching.

/** The client-facing persona of a tenant's Paige. */
export interface PaigePersona {
  /** Assistant display name (default "Paige"; a tenant may rename her). */
  name: string;
  /** One-line role from the client's standpoint. */
  role: string;
  /** The opening greeting shown in the client portal chat. */
  greeting: string;
  /** Short tone descriptor that shapes her voice (feeds the system prompt). */
  tone: string;
  /** The tenant's domain of expertise, e.g. "fitness coaching". */
  domain: string;
}

/** A one-tap prompt shown in the client chat. */
export interface QuickAction {
  label: string;
  prompt: string;
}

/** A discovery question Paige asks a client, in her voice. */
export interface ProbingQuestion {
  id: string;
  /** How she asks it. */
  ask: string;
  /** The field / insight it captures. */
  captures: string;
}

/** A stage in this tenant's client journey. */
export interface JourneyStage {
  key: string;
  label: string;
  description: string;
}

/** An intake question a new client answers (generic — no vertical defaults). */
export interface IntakeField {
  key: string;
  label: string;
  type: "text" | "longtext" | "select" | "number" | "date" | "phone" | "address";
  options?: string[];
  required?: boolean;
}

/** The client-portal surface configuration. */
export interface PortalConfig {
  /** Nav modules shown in the client portal, in order. */
  modules: { key: string; label: string }[];
}

/** The full tenant-authored configuration of a Paige. */
export interface Playbook {
  /** Stable id, e.g. "coaching-default", "fitness". */
  slug: string;
  /** Human label for the playbook. */
  name: string;
  /** The vertical it's tuned for, e.g. "General coaching". */
  vertical: string;
  persona: PaigePersona;
  quickActions: QuickAction[];
  probingQuestions: ProbingQuestion[];
  journey: JourneyStage[];
  intake: IntakeField[];
  portal: PortalConfig;
}
