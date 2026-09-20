// FIXTURE (mind-contract-lint, PR-A2) — the export-const evasion Codex found on the hardened guard,
// now CAUGHT. A SECOND Mind projection written as an arrow-valued `export const`, REUSING the
// canonical type (no own `*MindEvidence` union). Before candidate detection recognized
// function-valued consts, `isMindProjectionCandidate` returned false and neither MC1 nor MC4 saw it.
// Now it is DISCOVERED as a candidate and, alongside the canonical home, flagged MC4 (second home,
// no SCR marker). It has no union, so MC1 does not run on it — MC4 is the catch.

import type { PipelineMindEvidence } from "./mindEvidence.ts";

export const projectOtherMindEvidence = (result): PipelineMindEvidence => {
  if (result.status !== "available") return { status: "unavailable", capability: "other" };
  return { status: "recorded", capability: "other", records: result.signals };
};
