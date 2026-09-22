import type { SpineCapability } from "../contracts.ts";

// INT-163 — PAIGE-native agreements (e-signature). Paige drafts an agreement, reports its state,
// and — only after the owner confirms — sends, resends or voids one.
//
// THE SPLIT, AND WHY IT IS NOT ARBITRARY. The Spine manifest's validator requires every registered
// executor to be a Postgres symbol (`/^public\.[a-z][a-z0-9_]*$/`, registry.ts). So:
//
//   • DRAFT, ADD_SIGNER, VOID and STATUS register here — each is a clean `public.*` RPC.
//   • SEND and RESEND do NOT. Their executor is an edge function (agreement-send), which the
//     validator rejects, and widening that allowlist would change the shared Spine contract for no
//     added enforcement. They are governed by `_shared/action-risk.ts` (classified `high`) plus the
//     inline confirm gate in paige-ai-chat — which is what actually forces the approval card.
//     `calendar_link_send` made exactly this call for exactly this reason; this follows it.
//
// WHAT PAIGE MAY NEVER DO HERE. She cannot sign on anyone's behalf, cannot alter a sent document,
// and cannot reach the signer's token — it exists only as a hash. Sending is an external act with
// legal weight, so it is never autonomous: `high` means the rendered approval card, whose
// fingerprint travels in the request body where the model cannot write it.

export const AGREEMENT_DRAFT = {
  key:"agreement.draft",domain:"agreement",owner:"agreements-engine",humanSurface:"/solo/:account/clients",
  action:{classification:"mutate",executor:"public.save_paige_agreement",chatTool:"agreement_draft",riskPolicyKey:"ordinary",approvalAuthority:"chat-canonical",idempotency:"Converges on the agreement id — drafting the same agreement twice updates it rather than creating a second. Editing is refused once the document has been sent, by trigger, so a draft can never rewrite what a signer already saw."},
  outcome:{kinds:["drafted","refused","failed"],projector:"public.save_paige_agreement",railVisibility:"LIVE once the canonical read-back returns the saved row; capability key agreement_draft records that a DRAFT exists — never that anything was sent, seen or signed."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_ADD_SIGNER = {
  key:"agreement.add_signer",domain:"agreement",owner:"agreements-engine",humanSurface:"/solo/:account/clients",
  action:{classification:"mutate",executor:"public.add_agreement_signer",chatTool:"agreement_add_signer",riskPolicyKey:"ordinary",approvalAuthority:"chat-canonical",idempotency:"Each signer takes the next free position. Asking the same address twice is refused by a unique index rather than silently creating a second signature slot, and adding anyone at all is refused once the agreement has left draft."},
  outcome:{kinds:["added","refused","failed"],projector:"public.paige_agreement_overview",railVisibility:"LIVE once the read-back shows the signer; capability key agreement_add_signer records that a party was named on a DRAFT — never that anything was sent."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_VOID = {
  key:"agreement.void",domain:"agreement",owner:"agreements-engine",humanSurface:"/solo/:account/clients",
  action:{classification:"mutate",executor:"public.void_paige_agreement",chatTool:"agreement_void",riskPolicyKey:"high",approvalAuthority:"chat-canonical",idempotency:"Terminal and one-way. Voiding an already-terminal agreement is refused rather than repeated, so a retry cannot withdraw something twice or reopen it."},
  outcome:{kinds:["voided","refused","failed"],projector:"public.paige_agreement_overview",railVisibility:"LIVE once the read-back shows status voided; capability key agreement_void records that the document was withdrawn and every outstanding signing link killed in the same transaction."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_STATUS = {
  key:"agreement.status",domain:"agreement",owner:"agreements-engine",humanSurface:"/solo/:account/clients",
  action:{classification:"read",executor:"public.paige_agreement_overview",chatTool:"agreement_status",riskPolicyKey:"read_only",approvalAuthority:"none",idempotency:"Read-only. Returns each agreement's state and who is still outstanding. No write, no send, no idempotency key."},
  chatBinding:"LIVE",mindBinding:"UNAVAILABLE",sharedPrimitiveChange:"NONE",maturity:"PARTIAL",
} as const satisfies SpineCapability;

export const AGREEMENT_CAPABILITIES = [AGREEMENT_DRAFT, AGREEMENT_ADD_SIGNER, AGREEMENT_VOID, AGREEMENT_STATUS] as const;

// Model-facing tool JSON. Authored COMPACT (single-line objects, `name:"…"` never alone on its own
// line) so `chat-tool-registry-lint` does not read these as hand-wired Chat tools — they enter the
// handler through the adapter spread. Every description states the honest boundary, because a
// description is the only thing standing between the model and a confident wrong claim.
export const AGREEMENT_TOOLS = [
  {type:"function",function:{name:"agreement_draft",description:"Draft an agreement with one of this workspace's clients, or edit an existing DRAFT. This SAVES a draft and sends nothing — nobody sees it until it is sent, which is a separate step the owner must approve. Supply the full body text; it becomes the document the signer reads, so write it in full rather than leaving blanks. Editing is refused once an agreement has been sent, because the signer has already seen it — draft a new one instead.",parameters:{type:"object",properties:{agreementId:{type:"string",format:"uuid",description:"Omit to create; supply to edit an existing DRAFT."},contactId:{type:"string",format:"uuid",description:"The client this agreement is with (from the workspace's own client list)."},title:{type:"string",maxLength:200},bodyMarkdown:{type:"string",description:"The full agreement text. Markdown headings and lists are rendered; write complete terms, never placeholders."},offerId:{type:"string",format:"uuid",description:"Optional: the catalog offer this agreement is about."},commercialTermsId:{type:"string",format:"uuid",description:"Optional: the recorded commercial terms this agreement formalises."}},required:["contactId","title","bodyMarkdown"]}}},
  {type:"function",function:{name:"agreement_add_signer",description:"Name another person who must sign a DRAFT agreement, or supply the counterparty when the client record has no email address on it. The client the agreement is with is added automatically when their record carries an email, so use this for a SECOND signer — a co-founder, a witness, someone signing on the business's side — or to repair a draft that has nobody to send to. It sends nothing and creates no link. Refused once the agreement has been sent, because the people bound by a document cannot change after it has been shown.",parameters:{type:"object",properties:{agreementId:{type:"string",format:"uuid",description:"The DRAFT agreement to add this person to."},fullName:{type:"string",maxLength:200,description:"The name they will sign under. It is stamped on the signed document, so use their full legal name."},email:{type:"string",description:"Where their signing link is sent."},role:{type:"string",enum:["counterparty","tenant_signatory","witness"],description:"Defaults to counterparty — the client's side. Use tenant_signatory for someone signing on this business's behalf."},signingOrder:{type:"integer",minimum:1,description:"Optional. Omit to add them after everyone already on the agreement; signers are asked strictly in this order."}},required:["agreementId","fullName","email"]}}},
  {type:"function",function:{name:"agreement_send",description:"SEND a drafted agreement to its signers for signature. Do this ONLY after the owner confirms it. This is an external act with legal weight: it emails a real person a link that lets them sign, and the document is frozen at that moment and can no longer be edited. Report the exact outcome — who it reached, who it did not, and whether the workspace has no email provider connected — and NEVER claim it was delivered unless the result says so.",parameters:{type:"object",properties:{agreementId:{type:"string",format:"uuid"}},required:["agreementId"]}}},
  {type:"function",function:{name:"agreement_resend",description:"Send the signing link again to signers who have not yet signed. Do this ONLY after the owner confirms it. It emails a real person again and issues a NEW link, which stops the previous one working — so use it when a link was lost or has expired, not as a reminder. The document itself is not re-created and cannot change.",parameters:{type:"object",properties:{agreementId:{type:"string",format:"uuid"}},required:["agreementId"]}}},
  {type:"function",function:{name:"agreement_void",description:"WITHDRAW an agreement that is already out for signature. Do this ONLY after the owner confirms it. It is final and cannot be undone: every outstanding signing link stops working immediately, and the agreement can never be reopened — a replacement has to be drafted fresh. An agreement that is already completed, declined or voided cannot be voided.",parameters:{type:"object",properties:{agreementId:{type:"string",format:"uuid"},reason:{type:"string",maxLength:500,description:"Optional note recorded on the audit trail."}},required:["agreementId"]}}},
  {type:"function",function:{name:"agreement_status",description:"Report the state of this workspace's agreements — draft, sent, viewed, partially signed, completed, declined, voided or expired — and who is still outstanding on each. READ-ONLY: it sends nothing and changes nothing. Use it before offering to resend or void, so the answer is about what is actually true rather than what was true earlier in the conversation.",parameters:{type:"object",properties:{contactId:{type:"string",format:"uuid",description:"Optional: only agreements with this client."},status:{type:"string",enum:["draft","sent","viewed","partially_signed","completed","declined","voided","expired"],description:"Optional: only agreements in this state."}}}}},
] as const;
