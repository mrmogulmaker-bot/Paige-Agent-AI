// FIXTURE (mind-contract-lint) — VIOLATES MC3 by SWAPPING the honesty copy across states. Both
// guardrail phrases are still present in the file (module-wide search would pass), but the
// UNAVAILABLE branch now carries the NO_EVIDENCE line and vice-versa — so an unresolved result is
// described as merely having no evidence. The state-bound MC3 check catches the swap.
// (This comment avoids the guardrail phrases so only the render constants carry them.)

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

const UNAVAILABLE = "Status: UNAVAILABLE — Do not treat that as proof that no activity occurred.";
const NO_EVIDENCE = "Status: NONE FOUND (no_evidence) — Do not infer activity, absence, or outcomes.";

export function renderSampleMindEvidence(evidence) {
  if (evidence.status === "unavailable") return UNAVAILABLE;
  if (evidence.status === "no_evidence") return NO_EVIDENCE;
  return "Status: AVAILABLE";
}
