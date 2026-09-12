// MVP capability SIGNAL construction (Main Paige Operational Chat · P3b) — PURE.
//
// Piece 3a is the decision core (CapabilitySignal[] → one honest availability each). This is the
// layer above it: it turns the facts the edge dispatch resolves server-side — the caller's tier
// (getActorTier), the ceiling-clamped autonomy lane (resolve_tool_autonomy), and the Spine maturity
// (getSpineCapability) — into the signals the core grades. It is side-effect-free and imports ONLY
// types (erased at transpile) so it is unit-testable through the port; the async resolution lives in
// the edge fn, never here.
//
// MVP scope is the two domains the owner named: CONTACTS and CONNECTIONS. Only capabilities that
// GENUINELY ship are modeled (§947/§13 — never a hoped-for capability, never a fabricated maturity).
// Adding a capability is adding a signal here — the decision core does not change (§18).

import type { CapabilitySignal } from "./resolver.ts";
import type { Tier } from "../actorTier.ts";

/** The server-resolved facts for this caller+tenant. The edge dispatch resolves each one. */
export interface CapabilityFacts {
  /** The caller's server-resolved tier (getActorTier). A sealed client seat gets nothing. */
  callerTier: Tier;
  /** resolve_tool_autonomy("crm_create_contact") — already Trust-Compass-clamped (auto|confirm|off). */
  contactCreateLane: "auto" | "confirm" | "off";
  /** getSpineCapability("integrations.list")?.maturity — "PARTIAL" today; null when unregistered. */
  integrationsListMaturity: "LIVE" | "PARTIAL" | "UNAVAILABLE" | null;
}

// A sealed client seat (actorTier CLIENT_SEAT_ALLOW) can neither see/create contacts nor list
// connections, so for the MVP domains "eligible" = the caller is any non-client tier. This mirrors
// the chat's SHIPPED runtime gate for these tools, which is a ROLE gate (admin/coach/super_admin),
// not a tier-feature gate — there is no server-importable getTierFeatureSet (it is frontend-only).
// The finer Agency-CRM question is the open owner decision (task #124 — tierFeatures currently
// grants Agency the CRM cluster), so Agency is modeled eligible to MATCH current shipped behavior;
// that is flagged here, not silently faked (§13).
const eligibleForTenantBook = (tier: Tier): boolean => tier !== "client";

export function buildCapabilitySignals(facts: CapabilityFacts): CapabilitySignal[] {
  const tenantBook = eligibleForTenantBook(facts.callerTier);

  return [
    // See your contacts — a shipped read (crm_search_contacts). Reads ignore the autonomy lane.
    {
      key: "crm.search_contacts",
      label: "See your contacts",
      actionKind: "read",
      // The shipped, classified chat tool is the evidence: there is no crm.* Spine entry to read,
      // so a LIVE read seam is synthesized from the tool that genuinely ships (not a registry read).
      maturity: "LIVE",
      tierEligible: tenantBook,
    },
    // Add a contact — the star write. The ceiling-clamped lane decides live vs needs_approval.
    {
      key: "crm.create_contact",
      label: "Add a contact",
      actionKind: "create",
      maturity: "LIVE", // shipped + classified in action-risk; confirm-gated at runtime
      tierEligible: tenantBook,
      requiresConnection: false, // creating a contact needs no connected provider
      autonomyLane: facts.contactCreateLane,
    },
    // See your connections — the integrations read surface (Spine integrations.list, PARTIAL today).
    {
      key: "integrations.list",
      label: "See your connections",
      actionKind: "read",
      // A PARTIAL read is reachable now (the core maps PARTIAL read → live); a seam that does not
      // resolve to a registry row (null) degrades to UNAVAILABLE so Paige says "planned", never
      // claims a capability she cannot confirm (§13/§947).
      maturity: facts.integrationsListMaturity ?? "UNAVAILABLE",
      tierEligible: tenantBook,
    },
  ];
}
