// FIXTURE (mind-contract-lint) — VIOLATES MC4 when present ALONGSIDE the one canonical projection.
// It is itself a well-formed Mind projection (canonical states, fail-closed, honest copy), which is
// the point: standing up a SECOND Mind projection generalises Mind retrieval — a shared-primitive
// change — and must carry a Spine Change Request marker. This fixture carries none, so it is flagged.

export type SecondMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly unknown[] }
  | { readonly status: "no_evidence"; readonly capability: string }
  | { readonly status: "unavailable"; readonly capability: string };

export function projectSecondMindEvidence(result) {
  if (result.status !== "available") return { status: "unavailable", capability: "second" };
  if (!result.signals.length) return { status: "no_evidence", capability: "second" };
  const records = result.signals.map(project);
  if (records.some((record) => record === null)) return { status: "unavailable", capability: "second" };
  return { status: "recorded", capability: "second", records };
}

export function renderSecondMindEvidence(evidence) {
  // UNAVAILABLE: Do not infer activity, absence, or outcomes.
  // NO_EVIDENCE: Do not treat that as proof that no activity occurred.
  return "";
}
