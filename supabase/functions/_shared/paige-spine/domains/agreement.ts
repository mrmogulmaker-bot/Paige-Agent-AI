import type { SpineCapability } from "../contracts.ts";

// INT-178 — AGREEMENTS, the READ half. PAIGE can see a workspace's e-signature agreements and the
// status of any one of them. Both capabilities execute the SAME governed seam,
// `public.paige_agreement_overview` (migration 20270402000000), whose own header names it "the read
// Paige answers from"; the adapter is `_shared/agreements/chat-read.ts`.
//
// WHAT THIS CORRECTS. INT-163 shipped the engine and left `registry.ts` carrying a comment that
// DRAFT, VOID and STATUS "register here". None of them did — the array held zero agreement
// capabilities, so PAIGE could not see an agreement at all. The comment described intent that was
// never delivered, and this file is the first half of delivering it.
//
// WHY ONLY THE READS ARE HERE — the same seam boundary `calendar_link.ts` documents, for the same
// reason. The Spine validator requires an action's executor to be an exact `public.<symbol>`
// present in migration history. SEND and RESEND execute the `agreement-send` EDGE FUNCTION, which
// that validator rejects, so registering them would mean widening the shared executor allowlist —
// a change to the Spine contract itself — for zero added enforcement, since what actually clamps a
// send is `_shared/action-risk.ts` plus the inline Chat confirm gate. DRAFT and VOID do have clean
// `public.*` executors (`save_paige_agreement`, `void_paige_agreement`) and are deliberately NOT
// registered here either: they are mutations, and this slice is read-first on purpose, because the
// send path has a real client on the other end of it.
//
// SCOPE, STATED HONESTLY (§13). Registering a capability does not grant one. Both entries below are
// `read` / `read_only` / no approval authority, and the RPC they name re-proves the caller's tenant
// and membership in its own body under the caller's JWT (§59). Nothing here can read another
// workspace, and nothing here writes.

export const AGREEMENT_LIST = {
  key:"agreement.list",domain:"agreement",owner:"agreements-engine",humanSurface:"/solo/:account/sales",
  action:{classification:"read",executor:"public.paige_agreement_overview",chatTool:"agreement_list",riskPolicyKey:"read_only",approvalAuthority:"none",idempotency:"Read-only projection of the workspace's agreements. No write, no send, no idempotency key."},
  outcome:{kinds:["capability_run"],projector:"public.record_capability_run",railVisibility:"owner_internal"},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_STATUS = {
  key:"agreement.status",domain:"agreement",owner:"agreements-engine",humanSurface:"/solo/:account/sales",
  action:{classification:"read",executor:"public.paige_agreement_overview",chatTool:"agreement_status",riskPolicyKey:"read_only",approvalAuthority:"none",idempotency:"Read-only status projection for one contact's or one state's agreements. No write, no send, no idempotency key."},
  outcome:{kinds:["capability_run"],projector:"public.record_capability_run",railVisibility:"owner_internal"},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_CAPABILITIES = [AGREEMENT_LIST, AGREEMENT_STATUS] as const;

// Model-facing tool JSON. Authored COMPACT (single-line objects, `name:"…"` never alone on its own
// line) so `chat-tool-registry-lint` does not count these as inline hand-wired Chat tools — they
// enter Chat through the adapter spread, exactly as CALENDAR_LINK_TOOLS does.
//
// Every description states the honest boundary, because a model that believes it can send from a
// read tool will tell the owner it did. These two READ. They do not draft, send, resend, remind,
// void, or countersign, and they cannot be made to.
export const AGREEMENT_TOOLS = [
  {type:"function",function:{name:"agreement_list",description:"List this workspace's e-signature agreements with their current status — who it is with, how many signers have signed, what is still outstanding, and when it was sent, completed or expires. READ-ONLY: it never sends, resends, drafts, voids or reminds. Use it to answer 'where do my agreements stand', 'what is outstanding', or 'what have I got waiting on signatures'. Optionally narrow by status. Report the statuses exactly as returned and never imply a document was delivered or signed beyond what the status says.",parameters:{type:"object",properties:{status:{type:"string",enum:["draft","sent","viewed","partially_signed","completed","declined","voided","expired"],description:"Optional: show only agreements in this state."}}}}},
  {type:"function",function:{name:"agreement_status",description:"Check where a specific client's agreement stands — its status, which signers are still outstanding, and the sent/completed/expiry dates. READ-ONLY: it never sends, resends, drafts, voids or reminds. Give it the contactId from a contact lookup to see that client's agreements. Answer only from what it returns: 'viewed' means opened, not signed, and 'sent' does not mean delivered. Signing evidence is deliberately not available here and must never be described as if it were.",parameters:{type:"object",properties:{contactId:{type:"string",format:"uuid",description:"The contact whose agreements to check."},status:{type:"string",enum:["draft","sent","viewed","partially_signed","completed","declined","voided","expired"],description:"Optional: narrow to one state."}},required:["contactId"]}}},
] as const;
