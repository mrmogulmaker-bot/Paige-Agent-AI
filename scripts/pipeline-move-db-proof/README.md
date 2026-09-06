# Isolated Pipeline move SQL proof

Run `node scripts/pipeline-move-db-proof.mjs` on Windows with PostgreSQL 16 installed at `C:/Program Files/PostgreSQL/16/bin`.

The runner initializes its own disposable cluster on a random loopback port. It ignores PG environment variables and DATABASE_URL, uses no deployed database or production account, applies the actual migration twice, executes real PostgreSQL roles, captures commands and results, and stops its cluster in `finally`. Generated clusters are retained under `outputs/pipeline-move-db-proof/run-*` for inspection; the runner does not delete directories.

This is actual migration runtime proof against **synthetic dependencies**. `current_user_tenant_id`, `is_tenant_admin`, `resolve_tool_autonomy`, the version trigger, and Rail are explicitly simplified fixture contracts. It does not prove the real resolver, canonical Chat approval provenance, full migration history, Rail schema compatibility, browser flow, or production deployment.

The fixture distinguishes current resolved workspace, explicit profile selection, and additional admin memberships. Negative controls first prove the unchanged migration denies the request, then remove precisely one guard and assert that the same denial oracle fails. No mutated migration is written to source.

Every run writes `proof.json` and `commands.json`; `latest-proof.json` points to the latest outcome, including failures. Red runs are retained rather than replaced by a success narrative. Runtime schema fingerprint currently covers public columns only; it is not a full database ledger or complete schema equivalence assertion.
