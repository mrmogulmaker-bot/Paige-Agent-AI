// FIXTURE (mind-contract-lint) — VIOLATES MC5. The Chat adapter re-derives the Mind state machine
// itself: it builds the "no_evidence" branch by hand instead of rendering via the one projection.
// This is exactly how Chat and Mind drift into two different accounts of the same record (§18).

export function renderSpineEvidenceForChat(result) {
  if (result.status !== "available") return "Status: UNAVAILABLE";
  if (!result.signals.length) return { status: "no_evidence", block: "Status: NONE FOUND" }.block;
  return "Status: AVAILABLE";
}
