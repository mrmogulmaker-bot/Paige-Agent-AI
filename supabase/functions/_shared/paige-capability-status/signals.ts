// Capability SIGNAL construction (Main Paige Operational Chat · P3b) — PURE.
//
// Piece 3a is the decision core (CapabilitySignal[] → one honest availability each). This is the
// layer above it: it turns the facts the edge dispatch resolves server-side — the caller's tier
// (getActorTier), the ceiling-clamped autonomy lanes (resolve_tool_autonomy), the Spine maturity
// (getSpineCapability) and the real per-tenant connection state — into the signals the core grades.
// It is side-effect-free and imports ONLY types (erased at transpile) so it is unit-testable through
// the port; the async resolution lives in the edge fn, never here.
//
// WHY THIS IS THE MANIFEST (§13/§36/§70, the P0 "what can you do here?" grounding): Paige's tool
// list and persona make her SOUND like she can post to social, send texts, run workflows, and manage
// a team the moment she is asked. Most of those are NOT governed, executable paths for a fresh
// tenant. This manifest is the single honest answer — it declares WHICH capability families exist
// and their shape, and the edge dispatch feeds each one its REAL maturity (from the Spine registry)
// and connection/lane state. An over-claimed ACTION family whose governed seam is not registered
// (social publishing, sending an SMS, managing the team) resolves through a `null` maturity →
// UNAVAILABLE → "planned" — the anti-over-claim, so Paige says it is not something she can do here
// yet (honest whether the seam is unbuilt OR a raw tool exists without a governed, tenant-safe path —
// she never implies she can do it, and never falsely claims it doesn't exist). Only capabilities that
// GENUINELY ship are modeled LIVE, and no maturity is
// hardcoded here except the two documented CRM reads/writes that have no crm.* registry row
// (§947/§13 — never a hoped-for capability, never a fabricated maturity). Adding a capability is
// adding a signal here — the decision core does not change (§18).

import type { CapabilitySignal } from "./resolver.ts";
import type { Tier } from "../actorTier.ts";

type Maturity = "LIVE" | "PARTIAL" | "UNAVAILABLE";
type Lane = "auto" | "confirm" | "off";

/**
 * The server-resolved facts for this caller+tenant. The edge dispatch resolves each one from the
 * verified JWT (never the body): the tier via getActorTier, each lane via resolve_tool_autonomy
 * (ceiling-clamped), each maturity via getSpineCapability(key)?.maturity ?? null (a `null` means the
 * registry has NO governed seam for that capability → the core reports it "planned"), and the n8n
 * connection via the live readiness read. Nothing here is taken from the model.
 */
export interface CapabilityFacts {
  /** The caller's server-resolved tier (getActorTier). A sealed client seat gets nothing. */
  callerTier: Tier;

  // ── Ceiling-clamped autonomy lanes (resolve_tool_autonomy) for the mutating verbs we model ──
  /** resolve_tool_autonomy("crm_create_contact"). */
  contactCreateLane: Lane;
  /** resolve_tool_autonomy("campaign_brief_create"). */
  campaignCreateLane: Lane;
  /** resolve_tool_autonomy("n8n_run_workflow") — moot until n8n is connected, carried for correctness. */
  workflowsLane: Lane;

  // ── Real Spine maturities (getSpineCapability(key)?.maturity ?? null). null ⇒ UNAVAILABLE ⇒ planned ──
  /** integrations.list (read surface). */
  integrationsListMaturity: Maturity | null;
  /** pipeline.deal_stage_evidence (read of deal stages — NOT deal management). */
  pipelineEvidenceMaturity: Maturity | null;
  /** comms.messages_read (inbox read). */
  commsReadMaturity: Maturity | null;
  /** comms.send — no governed tenant send path is registered, so this resolves null ⇒ planned. */
  commsSendMaturity: Maturity | null;
  /** social.presence (read of the accounts the workspace has recorded). */
  socialPresenceMaturity: Maturity | null;
  /** social.publish — no governed publish path is registered, so this resolves null ⇒ planned. */
  socialPublishMaturity: Maturity | null;
  /** team.authority (read of the roster and roles). */
  teamAuthorityMaturity: Maturity | null;
  /** team.manage — no governed member-management path is registered, so this resolves null ⇒ planned. */
  teamManageMaturity: Maturity | null;
  /** campaign.list (read). */
  campaignListMaturity: Maturity | null;
  /** campaign.create (mutate — drafting a campaign brief). */
  campaignCreateMaturity: Maturity | null;
  /** integrations.n8n_run_workflow (external effect — running an automation). */
  workflowsMaturity: Maturity | null;

  // ── Real per-tenant connection facts ──
  /** Is the tenant's own n8n instance connected? (loadN8nReadinessForChat → status === "available"). */
  workflowsConnected: boolean;
}

// A sealed client seat (actorTier CLIENT_SEAT_ALLOW) can neither see/create contacts nor reach any
// of these tenant-operator surfaces, so "eligible" = the caller is any non-client tier. This mirrors
// the chat's SHIPPED runtime gate for these tools, which is a ROLE gate (admin/coach/super_admin),
// not a tier-feature gate — there is no server-importable getTierFeatureSet (it is frontend-only).
// The finer Agency-CRM question is the open owner decision (task #124 — tierFeatures currently
// grants Agency the CRM cluster), so Agency is modeled eligible to MATCH current shipped behavior;
// that is flagged here, not silently faked (§13).
const eligibleForTenantBook = (tier: Tier): boolean => tier !== "client";

// `null` (no registry row resolved) degrades to UNAVAILABLE so the core says "planned" — never a
// fabricated LIVE for a seam we cannot confirm ships (§13/§947).
const mat = (m: Maturity | null): Maturity => m ?? "UNAVAILABLE";

export function buildCapabilitySignals(facts: CapabilityFacts): CapabilitySignal[] {
  const tierEligible = eligibleForTenantBook(facts.callerTier);

  return [
    // ── CRM ───────────────────────────────────────────────────────────────────────────────────
    // See your contacts — a shipped read (crm_search_contacts). Reads ignore the autonomy lane.
    // There is no crm.* Spine entry to read, so a LIVE read seam is synthesized from the classified
    // chat tool that genuinely ships (the ONLY hardcoded maturity here, documented).
    { key: "crm.search_contacts", label: "See your contacts and their details", actionKind: "read", maturity: "LIVE", tierEligible },
    // Add a contact — the star write, shipped + classified in action-risk, confirm-gated at runtime.
    // The ceiling-clamped lane decides live vs needs_approval. (Also a documented LIVE synthesis.)
    { key: "crm.create_contact", label: "Add a contact", actionKind: "create", maturity: "LIVE", tierEligible, requiresConnection: false, autonomyLane: facts.contactCreateLane },

    // ── Connections ──────────────────────────────────────────────────────────────────────────
    // See your connected apps — the integrations read surface (integrations.list, PARTIAL today).
    { key: "integrations.list", label: "See your connected apps and integrations", actionKind: "read", maturity: mat(facts.integrationsListMaturity), tierEligible },

    // ── Pipeline ──────────────────────────────────────────────────────────────────────────────
    // See the pipeline and deal stages — a read of deal-stage EVIDENCE (pipeline.deal_stage_evidence).
    // NOT deal management: there is no governed "move a deal" write registered, so she does not claim one.
    { key: "pipeline.deal_stage_evidence", label: "See your pipeline and deal stages", actionKind: "read", maturity: mat(facts.pipelineEvidenceMaturity), tierEligible },

    // ── Inbox / comms ───────────────────────────────────────────────────────────────────────────
    // See your inbox — a shipped read (comms.messages_read).
    { key: "comms.messages_read", label: "See your inbox messages", actionKind: "read", maturity: mat(facts.commsReadMaturity), tierEligible },
    // Send a text/SMS — NO governed tenant send path is registered (operator SMS is a separate
    // operator-only surface). A null maturity resolves to "planned", so Paige never implies she can
    // text on the tenant's behalf (the owner P0: don't claim "can send" without the governed path).
    { key: "comms.send", label: "Send a text or SMS on your behalf", actionKind: "external_effect", maturity: mat(facts.commsSendMaturity), tierEligible },

    // ── Social ──────────────────────────────────────────────────────────────────────────────────
    // See the social accounts you've recorded — a read (social.presence). Declared capture, never a
    // connection — the label says "recorded", not "connected".
    { key: "social.presence", label: "See the social accounts you've recorded", actionKind: "read", maturity: mat(facts.socialPresenceMaturity), tierEligible },
    // Post to social — the complete tenant-safe governed publish path is NOT built (owner-ruled it
    // stays unavailable until it exists), and no social.publish capability is registered — so it
    // resolves "planned". Paige must not claim she can post.
    { key: "social.publish", label: "Post to your social accounts", actionKind: "external_effect", maturity: mat(facts.socialPublishMaturity), tierEligible },

    // ── Team ──────────────────────────────────────────────────────────────────────────────────────
    // See your team and roles — a read (team.authority).
    { key: "team.authority", label: "See your team and their roles", actionKind: "read", maturity: mat(facts.teamAuthorityMaturity), tierEligible },
    // Manage the team (add/remove members, change roles) — NO governed path is registered, so it
    // resolves "planned". Paige never claims she can manage the team.
    { key: "team.manage", label: "Add, remove, or change team members", actionKind: "update", maturity: mat(facts.teamManageMaturity), tierEligible },

    // ── Campaign briefs ────────────────────────────────────────────────────────────────────────
    // See your campaign briefs — a read (campaign.list).
    { key: "campaign.list", label: "See your campaign briefs", actionKind: "read", maturity: mat(facts.campaignListMaturity), tierEligible },
    // Draft a campaign brief — a governed mutation (campaign.create), confirm-gated by its lane.
    { key: "campaign.create", label: "Draft a campaign brief", actionKind: "create", maturity: mat(facts.campaignCreateMaturity), tierEligible, requiresConnection: false, autonomyLane: facts.campaignCreateLane },

    // ── Automation workflows (n8n) ───────────────────────────────────────────────────────────────
    // Run/manage your automation workflows — governed (integrations.n8n_run_workflow), but it
    // requires the tenant's own n8n instance connected first. Unconnected ⇒ needs_setup (the
    // connection wins over the lane in the core), so a fresh tenant is told to connect n8n, not
    // that Paige can already run their automations.
    { key: "integrations.n8n_run_workflow", label: "Run and manage your automation workflows", actionKind: "external_effect", maturity: mat(facts.workflowsMaturity), tierEligible, requiresConnection: true, connected: facts.workflowsConnected, autonomyLane: facts.workflowsLane },
  ];
}
