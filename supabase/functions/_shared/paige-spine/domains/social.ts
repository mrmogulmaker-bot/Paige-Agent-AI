import type { SpineCapability } from "../contracts.ts";

/**
 * Social Presence — which accounts a workspace has RECORDED that it posts from, and which it has
 * not. Status plus the declared handle, for the six networks the platform names.
 *
 * WHY THE HANDLE ITSELF IS RETURNED, where business_context.readiness withholds its raw values.
 * That is a difference in kind, not a relaxation of the same rule. A social handle is a PUBLIC
 * identifier the business publishes on purpose, and PAIGE cannot reference an account in a draft
 * without it — "your Instagram" is not a usable sentence. A business phone or primary email is not
 * that, and stays withheld there. The audience gate is identical in both.
 *
 * EVIDENCE CLASS. A live, stateless read over the workspace's own current record
 * (public.get_social_presence_evidence), exactly like business_context.readiness and team.authority
 * — NOT a Rail signal. That is deliberate and worth stating so a later session does not read it as
 * an omission: record_rail_event writes paige_client_events, which is CONTACT-scoped, and a
 * business's own account list names no contact. So there is no signal to resolve, and this
 * capability buys none of the Rail's properties — no history, no citation, no attribution, no
 * freshness boundary. The rows are simply current as of the call, and the Chat renderer says so.
 *
 * WHAT IT CAN NEVER SAY. A recorded handle is a §38 CAPTURE, never a connection: no OAuth, no
 * token, no provider API call. So nothing here reports a follower count, reach, engagement, a
 * publishing queue, a schedule, or where anything went live, and the renderer forbids PAIGE from
 * implying any of them. The write seam is public.record_social_handles; PAIGE reaches it through
 * paige-mcp (`record_social_accounts`), never by hand-wiring a tool into the Chat handler.
 */
export const SOCIAL_PRESENCE = {
  key: "social.presence",
  domain: "social",
  owner: "solo-campaigns",
  humanSurface: "/solo/:account/growth/social",
  evidence: {
    signalKinds: ["social.account_status"],
    adapter: "public.get_social_presence_evidence",
    audience: "owner_internal",
    freshness: "live read of the workspace's own current record on every call; there is no cached snapshot",
    staleAfterDays: 1,
    projectionWindowDays: 1,
    sourceSystem: "solo_campaigns",
    sourceActorTypes: ["person", "agent"],
    classification: "operational",
    lifecycle: "current",
    safeSummary: "Whether a social account is on record for this workspace, and the handle if so.",
    referencePrefix: "social:",
    factValues: {
      network: ["instagram", "facebook", "linkedin", "youtube", "tiktok", "x"],
      status: ["on_record", "not_recorded", "unavailable"],
    },
  },
  action: {
    classification: "read",
    executor: "public.get_social_presence_evidence",
    idempotency: "read-only resolver; no rows are written",
    riskPolicyKey: "read_only",
    approvalAuthority: "none",
  },
  outcome: {
    kinds: ["current"],
    projector: "public.get_social_presence_evidence",
    railVisibility: "owner_internal",
  },
  // PARTIAL, not LIVE: paige-ai-chat injects a live per-turn presence block into every tenant turn's
  // system context (socialPresenceChatEvidence.ts), so no tool call is needed for PAIGE to know
  // which accounts exist whenever a coach asks. Covered by focused unit tests; no authenticated
  // end-to-end drive yet, and LIVE requires that drive.
  chatBinding: "PARTIAL",
  mindBinding: "PARTIAL",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;
