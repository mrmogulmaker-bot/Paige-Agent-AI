// FIXTURE (mind-contract-lint) — VIOLATES MC2. The projector is NOT fail-closed: an empty signal
// set returns "recorded" instead of "no_evidence", and an un-projectable signal is dropped rather
// than collapsing the whole turn to "unavailable". This is the partial-answer that can imply
// activity that was never verified.

export type SampleMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly unknown[] }
  | { readonly status: "no_evidence"; readonly capability: string }
  | { readonly status: "unavailable"; readonly capability: string };

export function projectSampleMindEvidence(result) {
  if (result.status !== "available") return { status: "unavailable", capability: "sample" };
  // BUG: empty -> recorded (should be no_evidence); un-projectable rows silently filtered out.
  const records = result.signals.map(project).filter((record) => record !== null);
  return { status: "recorded", capability: "sample", records };
}

export function renderSampleMindEvidence(evidence) {
  // UNAVAILABLE: Do not infer activity, absence, or outcomes.
  // NO_EVIDENCE: Do not treat that as proof that no activity occurred.
  return "";
}
