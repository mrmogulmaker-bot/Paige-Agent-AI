// FIXTURE (mind-contract-lint, PR-A2) — a valid SECOND Mind projection that DOES carry a Spine
// Change Request marker. Used to prove the canonical-home-exists check: when this marked
// replacement is the ONLY projection present and the canonical path is absent, MC4 still fires
// (a marked SCR may ADD a second projection, never REPLACE the one canonical home). On its own it
// is well-formed (passes MC1/MC2/MC3), so the only violation is the missing canonical home.
// mind-projection-scr: SCR-approved

export type SecondaryMindEvidence =
  | { readonly status: "recorded"; readonly capability: string; readonly records: readonly unknown[] }
  | { readonly status: "no_evidence"; readonly capability: string }
  | { readonly status: "unavailable"; readonly capability: string };

export function projectSecondaryMindEvidence(result) {
  if (result.status !== "available") return { status: "unavailable", capability: "secondary" };
  if (!result.signals.length) return { status: "no_evidence", capability: "secondary" };
  const records = result.signals.map(project);
  if (records.some((record) => record === null)) return { status: "unavailable", capability: "secondary" };
  return { status: "recorded", capability: "secondary", records };
}

const UNAVAILABLE = "Status: UNAVAILABLE — No verified evidence is available for this turn. Do not infer activity, absence, or outcomes.";
const NO_EVIDENCE = "Status: NONE FOUND (no_evidence) — The safe projection returned nothing. Do not treat that as proof that no activity occurred.";

export function renderSecondaryMindEvidence(evidence) {
  if (evidence.status === "unavailable") return UNAVAILABLE;
  if (evidence.status === "no_evidence") return NO_EVIDENCE;
  return "Status: AVAILABLE";
}
