// The tenant capability-status resolver (Main Paige Operational Chat · P3) — PURE core.
//
// "What can Paige do for THIS tenant right now?" answered truthfully (§13/§36/§70). There is no
// existing resolver; this is the ONE home (§18) that COMPOSES the already-distributed truth
// sources — Spine maturity × tier eligibility × connection state × autonomy lane × evidence
// presence — into a SINGLE honest availability per capability. It decides nothing about the UI
// (§00); it reports facts the chat renders. Side-effect-free so it is unit-testable; the async
// gatherer feeds it the real signals resolved server-side from the verified JWT (never the body).

/** How Paige may act on a capability for this tenant — in the owner's own verbs. */
export type CapabilityAvailability =
  | "live"            // available now with no approval (a read, or an auto-lane write)
  | "needs_approval"  // available, but drafted for the owner to approve/run (confirm or off lane)
  | "needs_setup"     // a connection or setup step is required before Paige can do it
  | "planned"         // no governed path here yet — not something Paige can do (whether the seam is
                      // unbuilt, or a raw tool exists but is not a governed, tenant-safe capability)
  | "not_for_tier"    // not available to this account type
  | "unavailable";    // provider/account evidence is missing, so Paige must not claim it

export type CapabilityActionKind = "read" | "draft" | "create" | "update" | "configure" | "external_effect";

/** The composed, server-resolved signals for one capability. The gatherer assembles these. */
export interface CapabilitySignal {
  key: string;
  label: string;
  actionKind: CapabilityActionKind;
  /** Spine maturity of the capability's seam. */
  maturity: "LIVE" | "PARTIAL" | "UNAVAILABLE";
  /** Is this capability available to the caller's tier at all? */
  tierEligible: boolean;
  /** Does the capability require a connected provider first (integrations)? */
  requiresConnection?: boolean;
  /** Is that provider connected for this tenant? Only meaningful when requiresConnection. */
  connected?: boolean;
  /** The resolved autonomy lane for a mutating act (null/undefined for reads/drafts). */
  autonomyLane?: "auto" | "confirm" | "off" | null;
  /** True when a required evidence/contract is provably absent — an honest UNAVAILABLE. */
  evidenceMissing?: boolean;
}

export interface CapabilityStatus {
  key: string;
  label: string;
  actionKind: CapabilityActionKind;
  availability: CapabilityAvailability;
  /** Always present when availability !== "live" — never an unexplained refusal (§13). */
  reason: string | null;
}

const isMutation = (k: CapabilityActionKind): boolean => k !== "read" && k !== "draft";

/**
 * Resolve each capability to exactly one honest availability, most-restrictive-wins. The order
 * matters: a tier exclusion or missing evidence must win over a cheerful maturity/lane, so Paige
 * never claims a capability the tenant cannot actually use.
 */
export function resolveCapabilityStatus(signals: CapabilitySignal[]): CapabilityStatus[] {
  return signals.map((s) => {
    if (!s.tierEligible) {
      return mk(s, "not_for_tier", "Not available for this account type.");
    }
    if (s.evidenceMissing) {
      return mk(s, "unavailable", "Paige can't confirm this works for your workspace yet — required setup evidence is missing.");
    }
    if (s.maturity === "UNAVAILABLE") {
      // Honest in BOTH cases this reaches: a seam that is genuinely unbuilt, AND an action for which
      // a raw tool exists but no governed, tenant-safe path does (social publish, SMS send, team
      // management). "Not something you can do here yet" is true either way — it never falsely
      // asserts non-existence, and it never implies Paige can take the action (§13/§70).
      return mk(s, "planned", "Not something Paige can do here yet — there's no governed path for it.");
    }
    if (s.requiresConnection && s.connected !== true) {
      return mk(s, "needs_setup", "Needs a connection before Paige can use it.");
    }
    if (isMutation(s.actionKind)) {
      if (s.autonomyLane === "auto") return mk(s, "live", null);
      return mk(
        s,
        "needs_approval",
        s.autonomyLane === "off"
          ? "Set to manual — Paige prepares it, you run it."
          : "Paige drafts it and you approve before it runs.",
      );
    }
    // a read or draft with a shipped (LIVE or PARTIAL) seam is reachable now
    return mk(s, "live", null);
  });
}

function mk(s: CapabilitySignal, availability: CapabilityAvailability, reason: string | null): CapabilityStatus {
  return { key: s.key, label: s.label, actionKind: s.actionKind, availability, reason };
}
