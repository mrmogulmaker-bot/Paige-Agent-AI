/**
 * The band's scope states — the pack's `P.SCOPES`, verbatim
 * (`docs/design-references/cd-packs/super-admin-shell-v3/paige-ia.js` L2621-L2625).
 *
 * They live beside the band rather than inside it so the component file exports a component and
 * nothing else, and so the later scope wiring changes a VALUE here rather than the band's shape.
 * Round 1 renders `PLATFORM_SCOPE` only: read and act are session states, and inventing one would
 * tell the operator they are inside a tenant when they are not (§9/§13).
 */
export type ScopeTone = "none" | "read" | "act";

export type ScopeState = {
  readonly tone: ScopeTone;
  readonly kicker: string;
  readonly scope: string;
  readonly audit: string;
};

/** Scope 0 — the operator's own ground. `tenant_id IS NULL` is the literal state, not a label. */
export const PLATFORM_SCOPE: ScopeState = {
  tone: "none",
  kicker: "Platform scope",
  scope: "No tenant · operator surface",
  audit: "tenant_id IS NULL",
};
