// FIXTURE (mind-contract-lint) — a COMPLIANT Chat adapter. Not compiled (outside `src`).
// It renders VIA the Mind projection and never constructs a Mind state literal itself, so it
// cannot drift into a second account of the same record (§18). The guard finds zero violations.

import { projectSampleMindEvidence, renderSampleMindEvidence } from "./good-projection.ts";

export function renderSpineEvidenceForChat(result) {
  return renderSampleMindEvidence(projectSampleMindEvidence(result));
}
