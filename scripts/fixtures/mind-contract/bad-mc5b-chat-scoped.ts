// FIXTURE (mind-contract-lint, PR-A2) — the whole-file MC5 evasion Codex found, now CAUGHT. An
// UNUSED, non-exported helper carries the `return renderPipelineMindEvidence(...)` call, while the
// real EXPORTED entry point re-implements the states by hand (AVAILABLE/UNAVAILABLE wording, and
// note it deliberately avoids the literal "no_evidence"). A whole-file check saw the helper's render
// call and passed. Scoping MC5 to the exported entry-point BODIES flags `renderSpineEvidenceForChat`
// because its own body never returns via the projection.

import { renderPipelineMindEvidence, projectPipelineMindEvidence } from "./good-projection.ts";

function unusedRenderHelper(result) {
  return renderPipelineMindEvidence(projectPipelineMindEvidence(result));
}

export function renderSpineEvidenceForChat(result) {
  if (result.status !== "available") return "Status: UNAVAILABLE";
  if (!result.signals.length) return "Status: NONE FOUND";
  return "Status: AVAILABLE";
}
