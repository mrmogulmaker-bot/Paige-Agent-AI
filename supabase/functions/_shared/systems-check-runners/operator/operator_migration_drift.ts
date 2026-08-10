// operator/operator_migration_drift.ts — OPERATOR check #2 (runner_key: operator_migration_drift).
//
// DEFERRED BY CONSTRUCTION (§13 honesty): migration drift is `git diff db-live..HEAD -- supabase/migrations/**`
// — it compares the db-live GIT TAG (moved by .github/workflows/deploy-migrations.yml when a migration is
// persisted on prod) against HEAD. A Deno edge function CANNOT read git tags or shell out to git, so this
// runner NEVER pretends to. It returns 'skip' (needs_config) with the honest reason and points at the CI
// reader that IS the right home for this check (a later slice — a GitHub Action posting the drift result).
//
// This is the §32/§13 discipline: an edge fn that cannot truthfully perform a check reports needs_config,
// it does not fabricate a pass. The registry row exists so the catalog is complete and the gap is visible.

import type { CheckRunner } from "../../systems-check-runner.ts";

export const runnerKey = "operator_migration_drift";

export const run: CheckRunner = async (_ctx, _row) => ({
  status: "skip",
  evidence: {
    needs_config: true,
    reason: "requires_ci_git_reader",
    detail:
      "Migration drift compares the db-live git tag against HEAD; a Deno edge function cannot read git. " +
      "The correct home is a CI/GitHub-Action reader (deploy-migrations.yml already moves the db-live tag). " +
      "This is a later slice — the edge runner does not fabricate a git read (§13/§32).",
    verify_command: "git diff db-live..HEAD -- 'supabase/migrations/**'",
  },
  interpretation:
    "Migration drift can only be measured by a CI reader against the db-live git tag — a Deno edge function cannot read git. Deferred to a GitHub-Action slice; not evaluated here.",
});
