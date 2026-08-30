// The one place a stored registration becomes an editable draft.
//
// Lifted out of A2PTab so it can be exercised directly and so the component file
// exports only a component. The rule it encodes is small but load-bearing: a row
// that has left preparation returns null, because offering an editor over locked
// copy would promise a write the save seam refuses.
import type { A2PRegistration, EditDraft } from "./A2PTab";

let sampleSeq = 0;
const newSampleId = (): string => `resumed-sample-${(sampleSeq += 1)}`;

/**
 * A persisted registration, re-opened as an editable draft.
 *
 * Nothing did this. `loadReg` set `reg` alone, and the editor mounts only from
 * `draft` — so after a refresh the saved copy was unreachable and the sole way
 * forward was another PAID model generation that overwrote it, while the banner
 * beside it said the registration could still be edited. Returning null for a row
 * that has left preparation is deliberate: that copy is locked, and offering an
 * editor over it would promise a write the save seam refuses.
 */
export function draftFromRegistration(reg: A2PRegistration | null): EditDraft | null {
  if (!reg) return null;
  if (reg.submitted_at || reg.brand_sid || reg.campaign_sid) return null;
  if (reg.status === "approved" || reg.status === "rejected") return null;
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

