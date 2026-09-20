// FIXTURE (mind-contract-lint) — VIOLATES MC1. A fourth Mind state ("partial") is added to the
// union. A partial state silently lets the Mind surface claim something between "verified" and
// "unknown", which is exactly the honesty the three-state contract forbids.

export type SampleMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly unknown[] }
  | { readonly status: "partial"; readonly capability: string; readonly records: readonly unknown[] }
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
  // UNAVAILABLE: Do not infer activity, absence, or outcomes.
  // NO_EVIDENCE: Do not treat that as proof that no activity occurred.
  return "";
}
