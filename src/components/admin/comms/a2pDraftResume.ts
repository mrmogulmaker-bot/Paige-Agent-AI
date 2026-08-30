// Has this registration left preparation, and if not, what does its editable draft look like?
//
// One predicate, two callers. The banner ("you can keep editing it") and the editor
// itself must agree, and both must agree with the server — an independent review found
// them checking 3 and 5 of the server's NINE conditions respectively, so all three could
// disagree the moment anything wrote a provider SID or advanced a per-leg status.
//
// This mirrors public.a2p_registration_is_immutable exactly. Where they drift, the server
// wins and the surface is wrong, which is the direction that produces a promise the save
// seam refuses.
import type { A2PRegistration, EditDraft } from "./A2PTab";

let sampleSeq = 0;
const newSampleId = (): string => `resumed-sample-${(sampleSeq += 1)}`;

/** The server's nine conditions, in the server's order. */
export function hasLeftPreparation(reg: A2PRegistration): boolean {
  // `?? null` on every nullable: a column the caller did not select reads as `undefined`,
  // and a bare `!== null` treats that as evidence the registration has advanced — which
  // strands the editor and hides the banner on a perfectly preparable row. Absent and
  // null both mean "no value", exactly as they do in the SQL this mirrors.
  const set = (v: string | null | undefined): boolean => (v ?? null) !== null;
  return (
    set(reg.submitted_at) ||
    set(reg.approved_at) ||
    ["submitted", "in_review", "approved", "rejected", "suspended"].includes(reg.status) ||
    set(reg.brand_sid) ||
    set(reg.campaign_sid) ||
    set(reg.messaging_service_sid) ||
    (reg.brand_status ?? "pending") !== "pending" ||
    (reg.campaign_status ?? "pending") !== "pending"
  );
}

/**
 * A persisted registration, re-opened as an editable draft.
 *
 * Nothing did this. `loadReg` set `reg` alone, and the editor mounts only from `draft` —
 * so after a refresh the saved copy was unreachable and the sole way forward was another
 * PAID model generation that overwrote it, while the banner beside it said the
 * registration could still be edited. Returning null for a row that has left preparation
 * is deliberate: that copy is locked, and offering an editor over it would promise a
 * write the save seam refuses.
 */
export function draftFromRegistration(reg: A2PRegistration | null): EditDraft | null {
  if (!reg) return null;
  if (hasLeftPreparation(reg)) return null;
  const stored = Array.isArray(reg.sample_messages)
    ? (reg.sample_messages as unknown[]).map((m) => String(m ?? "")).filter(Boolean)
    : [];
  const texts = stored.length ? stored : ["", ""];
  return {
    use_case: reg.use_case ?? "",
    campaign_description: reg.campaign_description ?? "",
    samples: texts.map((t) => ({ id: newSampleId(), text: t })),
    optin_flow: reg.optin_flow ?? "",
    optin_message: reg.optin_message ?? "",
    optout_message: reg.optout_message ?? "",
    help_message: reg.help_message ?? "",
  };
}
