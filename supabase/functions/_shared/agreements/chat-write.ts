/**
 * INT-178 — the governed DRAFT path, the first WRITE PAIGE may make to an agreement.
 *
 * THE BOUNDARY, AND IT IS THE WHOLE POINT. This drafts. It does not send, resend, void, remind or
 * countersign, and it mints no signing link. Nothing it writes is visible to anyone outside the
 * workspace. The outward-facing keys stay unbuilt until each earns its own slice, for the reason
 * `domains/agreement.ts` gave when the READ half shipped first: the send path has a real client on
 * the other end of it.
 *
 * ONE SEAM, NOT A SECOND SYSTEM (§18). Everything below composes `public.save_paige_agreement`
 * (migration 20270401000000). This module owns no table and writes to none directly; it does not
 * re-implement a single rule the RPC already enforces, and it deliberately does not pre-check any
 * of them — a client-side copy of a server rule is a second policy that drifts.
 *
 * WHY THE CALLER'S CLIENT, NOT THE SERVICE ROLE. Same reasoning the read carries, and it matters
 * more here because this writes. `save_paige_agreement` is SECURITY DEFINER, so §59 requires it to
 * re-prove caller scope in its own body — and it does, through `auth.uid()`: authentication, the
 * expected-tenant comparison, owner-or-admin, and the client's membership of the workspace. Every
 * one of those reads NULL under the service role, so a service-role client would not make this
 * permissive, it would make it unauthenticated and refuse everything. The caller's JWT is both the
 * safe choice and the only working one.
 *
 * NOT IDEMPOTENT ON CREATE, AND THAT IS STATED RATHER THAN HIDDEN. With no `agreementId` the RPC
 * INSERTS: a blind retry mints a SECOND draft and a second counterparty signer, because the seed
 * trigger fires per insert. Nothing here dedupes it. The Chat confirmation fingerprint is the
 * execute-once guard, and it is the only one — which is why the capability's idempotency sentence
 * says so in the words an operator would read.
 *
 * ERRORS ARE MAPPED BY CODE, NEVER ECHOED. The RPC's refusals are authored for a human, but they
 * are raised on STANDARD SQLSTATEs (42501 / 23514 / 40001) rather than the reserved `PA###` class
 * this platform uses to mean "a person wrote this sentence for another person". So they are mapped,
 * not forwarded: raw database text must not reach a model or a transcript. The underlying message
 * goes to `console.error`, where an operator can read it and the model cannot.
 */

/** The RPC port. Deliberately structural so vitest can drive this without a Supabase client. */
export type AgreementWriteRpcPort = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

/** Why a draft did not happen. Each maps to exactly one caller-safe sentence below. */
export type AgreementWriteFailure =
  | "no_workspace"
  | "bad_contact_id"
  | "bad_agreement_id"
  | "empty_title"
  | "empty_body"
  | "refused"
  | "already_sent"
  | "conflict"
  | "unavailable"
  | "no_readback";

export type AgreementWriteResult =
  | { success: true; agreementId: string; title: string; status: string; created: boolean }
  | { success: false; reason: AgreementWriteFailure; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The sentences. Each says what happened to the DOCUMENT, because that is the thing the person
 * cares about, and each says plainly whether anything was written — a draft that may or may not
 * exist is worse than one that certainly does not.
 */
const MESSAGES: Record<AgreementWriteFailure, string> = {
  no_workspace: "No workspace is active, so nothing was drafted. Open a workspace and try again.",
  bad_contact_id:
    "That is not a client I can identify, so nothing was drafted. Look the client up first, then draft against the id that lookup returns.",
  bad_agreement_id:
    "That is not an agreement I can identify, so nothing was drafted and nothing was changed. List the agreements first and use the id from that list.",
  empty_title: "An agreement needs a title before it can be saved. Nothing was drafted.",
  empty_body: "An agreement needs its text before it can be saved. Nothing was drafted.",
  refused:
    "That agreement could not be drafted — the active workspace may have changed, this account may not be an owner or admin of it, or that client may not be in it. Nothing was written.",
  already_sent:
    "That agreement has already been sent, so it can no longer be changed. Nothing was written. Draft a new agreement instead of editing this one.",
  conflict:
    "Someone else changed this agreement while it was being edited, so nothing was written. Open it again to see their version before drafting over it.",
  unavailable:
    "The agreement could not be saved just now. Nothing was written. Try again, and if it keeps failing the agreements engine may need attention.",
  no_readback:
    "The save was not confirmed, so I cannot tell you whether the draft was written. Check the agreements list before drafting again — drafting a second time could leave you with two.",
};

function fail(reason: AgreementWriteFailure): AgreementWriteResult {
  return { success: false, reason, message: MESSAGES[reason] };
}

/**
 * Map a refusal to a reason. The RPC raises several distinct sentences on ONE SQLSTATE, so the code
 * alone is not enough to tell "already sent" from an ordinary validation refusal — and that one
 * distinction is worth making, because the remedy differs (draft a NEW agreement, rather than fix
 * this one). It is matched on a stable substring of the server's own sentence and falls back to the
 * generic reason when it does not match, so a reworded refusal degrades to a safe message rather
 * than to a wrong one.
 */
function classify(error: { message?: string; code?: string }): AgreementWriteFailure {
  const said = (error.message ?? "").toLowerCase();
  if (error.code === "40001") return "conflict";
  if (error.code === "42501") return "refused";
  if (error.code === "23514") {
    if (said.includes("already been sent")) return "already_sent";
    if (said.includes("title")) return "empty_title";
    if (said.includes("body")) return "empty_body";
    return "unavailable";
  }
  return "unavailable";
}

/**
 * Draft a new agreement, or revise one that is still a draft.
 *
 * `expectedTenantId` is a BRAKE, never a steering wheel — it is the tenant the chat turn already
 * resolved server-side, and the RPC compares it to the session's own tenant and refuses when they
 * differ. Passing it cannot widen what the caller may write.
 */
export async function draftAgreement(input: {
  caller: AgreementWriteRpcPort;
  expectedTenantId: string | null | undefined;
  contactId: unknown;
  title: unknown;
  bodyMarkdown: unknown;
  agreementId?: unknown;
}): Promise<AgreementWriteResult> {
  const { caller, expectedTenantId } = input;
  if (!expectedTenantId) return fail("no_workspace");

  // Ids are validated HERE, not left to the tool schema. JSON-Schema `format: "uuid"` is advisory —
  // nothing enforces it, and a model inventing an id is ordinary rather than exceptional. Letting
  // one through makes Postgres fail the cast, which surfaces as an engine fault rather than as the
  // true answer, which is that the id was never real.
  const contactId = typeof input.contactId === "string" ? input.contactId.trim() : "";
  if (!UUID.test(contactId)) return fail("bad_contact_id");

  const hasId = input.agreementId !== undefined && input.agreementId !== null && input.agreementId !== "";
  const agreementId = hasId && typeof input.agreementId === "string" ? input.agreementId.trim() : "";
  if (hasId && !UUID.test(agreementId)) return fail("bad_agreement_id");

  // Refused here as well as by the RPC, because an empty title or body is a model mistake rather
  // than a server condition, and the round trip teaches it nothing the sentence does not.
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) return fail("empty_title");
  const bodyMarkdown = typeof input.bodyMarkdown === "string" ? input.bodyMarkdown.trim() : "";
  if (!bodyMarkdown) return fail("empty_body");

  let data: unknown;
  let error: { message?: string; code?: string } | null;
  try {
    ({ data, error } = await caller.rpc("save_paige_agreement", {
      _expected_tenant_id: expectedTenantId,
      _agreement_id: hasId ? agreementId : null,
      _contact_id: contactId,
      _title: title,
      _body_markdown: bodyMarkdown,
    }));
  } catch (thrown) {
    // A THROW is not a refusal, and must not be reported as one. PostgREST resolves its errors; a
    // throw here is transport. Either way nothing is known to have been written.
    console.error("[agreement_draft] save threw", {
      reason: thrown instanceof Error ? thrown.message : "unknown",
    });
    return fail("unavailable");
  }

  if (error) {
    // The server's own words go where an operator reads them and the model does not.
    console.error("[agreement_draft] save refused", { code: error.code, message: error.message });
    return fail(classify(error));
  }

  // A resolved call with no row is NOT a success. The write may have landed, so this must never
  // advise a retry that could duplicate it — which is exactly what the create path would do.
  const row = data as { id?: unknown; title?: unknown; status?: unknown } | null;
  if (!row || typeof row.id !== "string") {
    console.error("[agreement_draft] save returned no row");
    return fail("no_readback");
  }

  return {
    success: true,
    agreementId: row.id,
    title: typeof row.title === "string" ? row.title : title,
    status: typeof row.status === "string" ? row.status : "draft",
    // Which of the two things happened, said plainly, because "saved" reads as an edit and a
    // silently-created duplicate is the failure this tool is most likely to produce.
    created: !hasId,
  };
}
