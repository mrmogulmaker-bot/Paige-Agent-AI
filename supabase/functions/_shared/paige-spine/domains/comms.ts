import type { SpineCapability } from "../contracts.ts";

/**
 * Comms Messages Read — Paige's inbox visibility (#1104, first Stage 3 capability-
 * mandate slice). The owner's finding: platform-sent email IS canonical data
 * (public.messages, the unified inbox) but Paige had no registered read verb, so she
 * honestly reported "I can't see your direct sends." This registers the ENVELOPE read:
 * direction, channel, subject, status, contact, timestamps — bounded and live.
 *
 * Deliberately NOT included: message bodies. Envelope-only is the conservative read
 * (redaction by construction); body access is a separately-gated future capability,
 * never smuggled in with this one.
 *
 * The adapter (public.list_inbox_messages) is caller-scoped exactly like every other
 * Spine reader: the tenant is derived from current_user_tenant_id() and can never be
 * supplied from the wire (§59). No resolvable tenant → empty set, fail-closed.
 */
export const COMMS_MESSAGES_READ = {
  key: "comms.messages_read",
  domain: "comms",
  owner: "comms",
  humanSurface: "/solo/:account/clients/conversations",
  evidence: {
    signalKinds: ["comms.message_envelope"],
    adapter: "public.list_inbox_messages",
    audience: "owner_internal",
    freshness: "live read of the unified inbox on every call; no cached snapshot exists, so no returned row can be stale — created_at is the row's own time, not a freshness deadline",
    staleAfterDays: 1,
    projectionWindowDays: 1,
    sourceSystem: "unified_messages",
    sourceActorTypes: ["person", "agent"],
    classification: "operational",
    lifecycle: "current",
    safeSummary: "A message envelope's direction, channel, subject line, and delivery status.",
    referencePrefix: "comms:",
    factValues: {
      direction: ["inbound", "outbound"],
      channel: ["email", "sms", "voice"],
      status: ["sent", "queued", "failed", "scheduled"],
    },
  },
  action: {
    classification: "read",
    executor: "public.list_inbox_messages",
    idempotency: "read-only envelope projection; no rows are written",
    riskPolicyKey: "read_only",
    approvalAuthority: "none",
    chatTool: "inbox_list",
  },
  outcome: {
    kinds: ["current"],
    projector: "public.list_inbox_messages",
    railVisibility: "owner_internal",
  },
  chatBinding: "PARTIAL",
  // PARTIAL, not LIVE: the chat tool is wired (inbox_list) and calls the caller-scoped
  // RPC, but no authenticated end-to-end drive has been recorded yet. LIVE requires
  // that proof — an owner asking Paige what was sent and her answering from the inbox.
  mindBinding: "UNAVAILABLE",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;
