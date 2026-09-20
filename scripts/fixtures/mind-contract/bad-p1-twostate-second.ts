// FIXTURE (mind-contract-lint) — the P1 evasion Codex found, now CAUGHT. A SECOND Mind projection
// whose union OMITS `no_evidence` (only `recorded | unavailable`). Before candidate-detection was
// made independent of the state set, a projection like this was filtered out and the guard reported
// success. Now it is DISCOVERED as a candidate and flagged twice: MC1 (its state set is not
// canonical) and MC4 (a second home without a Spine Change Request).

export type SecondMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly unknown[] }
  | { readonly status: "unavailable"; readonly capability: string };

export function projectSecondMindEvidence(result) {
  if (result.status !== "available") return { status: "unavailable", capability: "second" };
  const records = result.signals.map(project);
  return { status: "recorded", capability: "second", records };
}
