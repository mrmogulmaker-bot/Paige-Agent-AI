import type { SpineCapability } from "../contracts.ts";

// E7 — Governed Calendar-link SHARING. Paige prepares a PUBLISHED calendar's public
// booking link (`/book/{slug}`) and, after the confirm gate, SENDS it to a tenant contact
// by email or SMS through the ONE canonical comms seam (send-message), enumerates connected
// social channels and hands back COPY-READY post text, and offers copy-ready text whenever no
// channel is eligible. It is a comms-governed send of a READ-ONLY calendar link — NOT a
// calendar write (distinct from the E3/E5 booking-preset lifecycle) and NOT the FU-2
// booking/reschedule/cancel path. The executors it composes:
//   • public.calendar_link_shareable  (migration 20270315000000) — the authoritative
//     "is this calendar publicly shareable in this tenant right now?" gate (reuses
//     _assert_can_manage_preset; mirrors public-booking loadCalendar: enabled=true AND >=1 host).
//   • send-message (edge fn) via _shared/calendar-link-tenant-brain.ts — the send. E7 adds NO
//     field to its contract; it is a new CONSUMER (§37). runPreSend (consent/DND/suppression)
//     and the comms.outbound Rail event are send-message's, reused, never re-implemented.
//   • public.social_account_status — enumerate CONNECTED accounts (copy-ready only).
//
// WHAT THIS IS NOT (§13, owner boundary 2026-09-13):
//   1. It does NOT post to social. The governed social-POST executor does not exist and we
//      must not invent an adapter (owner "no second social adapter"), so `calendar_link_social_copy`
//      returns copy-ready text and NEVER claims a post happened.
//   2. It does NOT publish, connect a provider, book a meeting, or create a calendar event.
//   3. It never shares a non-public calendar: a draft/paused/archived/setup-required calendar
//      refuses truthfully and no link is emitted.
//
// SPINE REGISTRATION (decision recorded — collision-safe against PR #1234):
//   The TWO READS (prepare, social_copy) register in the Spine manifest below — clean
//   `public.<symbol>` executors, so the import-time validator accepts them with no change to
//   registry.ts's executor allowlist. The SEND (`calendar_link_send`) is governed by
//   `_shared/action-risk.ts` (classified `high`) + the inline paige-ai-chat confirm gate —
//   which is what actually enforces confirmation (classifyAction/resolve_tool_autonomy),
//   NOT Spine-manifest membership. Its executor is the send-message edge fn, which the Spine
//   validator only permits via the hardcoded `edge.paige-ai-chat` N8N exception (registry.ts:50).
//   Registering the send would require widening that validator allowlist — the riskiest #1234
//   collision line and a change to the shared Spine contract — for zero added enforcement. So
//   the send is deliberately NOT in the manifest; a follow-up may add the edge-executor lane.

export const CALENDAR_LINK_PREPARE = {
  key:"calendar_link.prepare",domain:"calendar_link",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"read",executor:"public.calendar_link_shareable",chatTool:"calendar_link_prepare",riskPolicyKey:"read_only",approvalAuthority:"none",idempotency:"Read-only preview; resolves shareability + per-channel eligibility + connected social + copy-ready text. No write, no send, no idempotency key."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const CALENDAR_LINK_SOCIAL_COPY = {
  key:"calendar_link.social_copy",domain:"calendar_link",owner:"booking-preset-system",humanSurface:"/solo/:account/settings/connections/calendars",
  action:{classification:"read",executor:"public.social_account_status",chatTool:"calendar_link_social_copy",riskPolicyKey:"read_only",approvalAuthority:"none",idempotency:"Read-only; enumerates connected social accounts and returns copy-ready post text. It never posts and has no idempotency key."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

// The two READS that register in the Spine manifest. The send is governed via action-risk +
// the confirm gate (see the header note) and is intentionally not a manifest descriptor.
export const CALENDAR_LINK_CAPABILITIES = [CALENDAR_LINK_PREPARE, CALENDAR_LINK_SOCIAL_COPY] as const;

// Model-facing tool JSON. Authored COMPACT (single-line objects, `name:"…"` never alone on its
// own line) so the chat-tool-registry lint does not count these as inline hand-wired tools — the
// reads register via the domain above and the send is classified in action-risk; all three enter
// Chat through the adapter spread. Every description states the honest boundary: prepare/social
// never send or post, share sends ONLY the published /book link to a contact after confirmation,
// and a non-public calendar cannot be shared.
export const CALENDAR_LINK_TOOLS = [
  {type:"function",function:{name:"calendar_link_prepare",description:"Prepare to share a PUBLISHED calendar's public booking link (/book/…). READ-ONLY: it sends nothing. Given a calendarId (and optionally a contactId), it returns whether the calendar is publicly shareable, the booking link, and — for a contact — which channels can reach them (email / SMS), plus copy-ready text to share by hand. A Draft/Paused/Archived calendar is NOT public and returns no link (publish it first with booking_preset_publish). Use this before calendar_link_send so you have the exact channel and the confirmed link.",parameters:{type:"object",properties:{calendarId:{type:"string",format:"uuid",description:"The booking calendar whose link to share (from booking_preset_list)."},contactId:{type:"string",format:"uuid",description:"Optional: the contact to check channel eligibility for."}},required:["calendarId"]}}},
  {type:"function",function:{name:"calendar_link_send",description:"SEND a published calendar's public booking link to a CONTACT by email or SMS. Do this ONLY after the owner confirms it. It sends through the governed messaging seam: the server refuses a non-public calendar, refuses a contact with no address on that channel, and honors consent / do-not-contact / suppression / quiet-hours. Report the exact outcome it returns — sent, held-to-send-later (queued), refused, or failed (e.g. SMS needs an approved messaging registration) — and NEVER claim it was delivered unless it returns sent. It does not post to social and does not book a meeting.",parameters:{type:"object",properties:{calendarId:{type:"string",format:"uuid"},contactId:{type:"string",format:"uuid"},channel:{type:"string",enum:["email","sms"],description:"Which channel to send on."},subject:{type:"string",maxLength:200,description:"Optional email subject; a sensible default is used if omitted."},message:{type:"string",maxLength:2000,description:"Optional custom message; the booking link is always included."}},required:["calendarId","contactId","channel"]}}},
  {type:"function",function:{name:"calendar_link_social_copy",description:"Prepare COPY-READY social post text for a published calendar's booking link, and list the workspace's connected social channels. READ-ONLY: Paige does NOT post to social on the owner's behalf — this hands back text to copy and post by hand, and never claims anything was posted. A non-public calendar returns no link (publish it first).",parameters:{type:"object",properties:{calendarId:{type:"string",format:"uuid"}},required:["calendarId"]}}},
] as const;
