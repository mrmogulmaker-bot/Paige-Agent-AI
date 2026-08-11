// operator/operator_edge_drift.ts — OPERATOR check #3 (runner_key: operator_edge_drift).
//
// DEFERRED BY CONSTRUCTION (§13 honesty): edge-function drift is `git diff edge-live..HEAD` — it compares
// the edge-live GIT TAG (moved by .github/workflows/deploy-edge-functions.yml on deploy) against HEAD (the
// /edge-drift command). A Deno edge function CANNOT read git tags or shell out to git, so this runner NEVER
// pretends to. It returns 'skip' (needs_config) with the honest reason and points at the CI reader that IS
// the right home (a later slice). Same §32/§13 discipline as operator_migration_drift.

import type { CheckRunner } from "../../systems-check-runner.ts";

export const runnerKey = "operator_edge_drift";

export const run: CheckRunner = async (_ctx, _row) => ({
  status: "skip",
  evidence: {
    needs_config: true,
    reason: "requires_ci_git_reader",
    detail:
      "Edge-function drift compares the edge-live git tag against HEAD; a Deno edge function cannot read git. " +
      "The correct home is a CI/GitHub-Action reader (deploy-edge-functions.yml already moves the edge-live tag; " +
      "the /edge-drift command reports it). This is a later slice — the edge runner does not fabricate a git read (§13/§32).",
    verify_command: "/edge-drift  (git diff edge-live..HEAD)",
  },
  interpretation:
    "Edge-function drift can only be measured by a CI reader against the edge-live git tag — a Deno edge function cannot read git. Deferred to a GitHub-Action slice; not evaluated here.",
});
