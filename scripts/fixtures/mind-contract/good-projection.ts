// FIXTURE (mind-contract-lint) — a COMPLIANT Mind projection. Not compiled (outside `src`).
// It carries the canonical three-state union, a fail-closed projector, and honest absence copy,
// so the guard must find zero violations here.

export type SampleMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly unknown[] }
  | { readonly status: "no_evidence"; readonly capability: string }
  | { readonly status: "unavailable"; readonly capability: string };

export function projectSampleMindEvidence(result) {
  if (result.status !== "available") return { status: "unavailable", capability: "sample" };
  if (!result.signals.length) return { status: "no_evidence", capability: "sample" };
  const records = result.signals.map(project);
  if (records.some((record) => record === null)) return { status: "unavailable", capability: "sample" };
  return { status: "recorded", capability: "sample", records };
}

export function renderSampleMindEvidence(evidence) {
  // UNAVAILABLE block: "No verified evidence is available for this turn. Do not infer activity,
  // absence, or outcomes."
  // NO_EVIDENCE block: "The safe projection returned nothing. Do not treat that as proof that no
  // activity occurred."
  return "";
}
