// FIXTURE (mind-contract-lint) — a COMPLIANT Mind projection. Not compiled (outside `src`).
// Canonical three-state union, a return-bound fail-closed projector, and honesty copy bound to
// the correct state. The guard must find zero violations here.

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

const UNAVAILABLE = "Status: UNAVAILABLE — No verified evidence is available for this turn. Do not infer activity, absence, or outcomes.";
const NO_EVIDENCE = "Status: NONE FOUND (no_evidence) — The safe projection returned nothing. Do not treat that as proof that no activity occurred.";

export function renderSampleMindEvidence(evidence) {
  if (evidence.status === "unavailable") return UNAVAILABLE;
  if (evidence.status === "no_evidence") return NO_EVIDENCE;
  return "Status: AVAILABLE";
}
