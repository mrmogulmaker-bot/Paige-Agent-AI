# Empty Pipeline deletion: isolated SQL proof

Run `node scripts/pipeline-delete-db-proof.mjs`. Requires local PostgreSQL 16 binaries
(Windows default `C:/Program Files/PostgreSQL/16/bin`). Override only the local binary
directory with `PIPELINE_PROOF_PG_BIN` when needed.

The runner creates a new disposable cluster below `outputs/pipeline-delete-db-proof`,
chooses an unused loopback port, uses synthetic identities only, and stops the exact
cluster in its cleanup path. It does not read database connection environment variables
or use an existing local service/cloud database. Controller windows are hidden.

Evidence files include `proof.json`, `commands.json`, and `postgres.log`. They record
the exact tested migration hash and extracted helper hashes, actual subprocess exit
codes, named assertions and cluster shutdown. Do not commit the database directory.

## Evidence boundary

The new migration is applied verbatim twice. The canonical `current_user_tenant_id`
and multi-owner `is_tenant_owner` functions are extracted verbatim from tracked SQL.
Calls use real `SET ROLE authenticated`/`anon` plus synthetic request subjects.
The surrounding fixture is deliberately minimal, not a full migration-history replay.
Agency/platform membership helpers are inert because this is a bounded top-level Solo
owner suite. The existing workspace reader is a fixture stub; it does not prove the
old catalogue, Chat, or production RLS. The Catalog sentinel proves this new SQL does
not mutate its unrelated local sentinel, not full Catalog behavior.

Owner, expected-workspace, and object-workspace guard mutation variants are installed
only in this disposable database. Each must make its real denial assertion fail;
the migration is reapplied afterward. Missing/ambiguous source replacements fail the
suite. Deliberately vulnerable variants never touch repository migration files.

This is automated local PostgreSQL runtime proof, not authenticated browser or
production acceptance. Browser, deployed migration ledger/function, grants and
read-only owner-surface verification require separate evidence. Production pipelines
must not be deleted as part of verification.
