// FIXTURE (mind-contract-lint) — VIOLATES MC3. The union and the projector are correct, but the
// absence render blocks were stripped of their honesty guardrail copy: the UNAVAILABLE and
// NONE-FOUND branches emit only a status word and caution the reader about nothing. A rendered orb
// built on this could read silence as real activity.
// (This comment is deliberately worded to avoid the guardrail phrases the guard scans for.)

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
  if (evidence.status === "unavailable") return "Status: UNAVAILABLE";
  if (evidence.status === "no_evidence") return "Status: NONE FOUND";
  return "Status: AVAILABLE";
}
