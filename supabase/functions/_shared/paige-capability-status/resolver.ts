// The tenant capability-status resolver (Main Paige Operational Chat · P3) — PURE core.
//
// "What can Paige do for THIS tenant right now?" answered truthfully (§13/§36/§70). There is no
// existing resolver; this is the ONE home (§18) that COMPOSES the already-distributed truth
// sources — Spine maturity × tier eligibility × connection state × autonomy lane × evidence
// presence — into a SINGLE honest availability per capability. It decides nothing about the UI
// (§00); it reports facts the chat renders. Side-effect-free so it is unit-testable; the async
// gatherer feeds it the real signals resolved server-side from the verified JWT (never the body).

// The COMPLETE disposition vocabulary a consequential request resolves to (the owner's 8, §family-7).
// Seven are computed per-capability below; the eighth — `no_applicable_capability` — is not a property
// of any one capability (it is the answer when a request matches NONE of them), so it is not emitted
// by resolveCapabilityStatus; it is carried here so the type is the single complete vocabulary and is
// named as an explicit resolution in the rendered directive (render.ts), closing the owner's taxonomy.
/** How Paige may act on a capability for this tenant — in the owner's own verbs. */
export type CapabilityAvailability =
  | "live"            // available now with no approval (a read, or an auto-lane write)
  | "needs_approval"  // available, but drafted for the owner to approve/run (confirm or off lane)
  | "needs_setup"     // a connection or setup step is required before Paige can do it
  | "proof_owed"      // the governed path is built but its behavior is not proven for this workspace
                      // yet AND it fails closed — Paige may attempt it but must not promise the result
  | "planned"         // no governed path here yet — not something Paige can do (whether the seam is
                      // unbuilt, or a raw tool exists but is not a governed, tenant-safe capability)
  | "not_for_tier"    // not available to this account type
  | "unavailable"     // provider/account evidence is missing, so Paige must not claim it
  | "no_applicable_capability"; // request matches no capability (a request-level resolution; see render.ts)

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
  /**
   * True when the governed path is built AND reachable for this tier/connection, but its behavior is
   * not yet proven for the workspace AND it fails closed (e.g. a renderer that degrades to
   * needs_config rather than producing output). Resolves to `proof_owed`: Paige may attempt it but
   * must not promise the result. It is NOT set for capabilities that merely lack an authenticated
   * live-drive — that is our evidence/ledger debt, not a limit the owner experiences, and marking a
   * usable capability `proof_owed` would wrongly tell the owner they cannot rely on it (§13/§70).
   */
  proofOwed?: boolean;
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
    if (s.proofOwed) {
      // Built + reachable, but the path fails closed and its behavior is not proven here yet. Paige
      // may attempt it, but must not promise the result (§13). Wins over the cheerful live/approval.
      return mk(s, "proof_owed", "Paige can try this, but it isn't proven to work here yet — she'll tell you honestly what came back.");
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
