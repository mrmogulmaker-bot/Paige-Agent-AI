# Contact import database proof

Run only against an isolated local PostgreSQL database. `bootstrap.sql` supplies minimal prerequisite tables/helpers; this proves the exact new migration's SQL and real-role behavior, **not** compatibility with every production trigger or the deployed migration ledger.

Apply in order with `psql -v ON_ERROR_STOP=1`: `bootstrap.sql`, `supabase/migrations/20261201000600_solo_contact_import.sql`, `authorization.sql`. Then set `IMPORT_PROOF_DB` to that disposable database name and run `node tests/import/concurrency.mjs`. The concurrency test uses loopback port 57432 and leaves contained proof records in its disposable database, so use a fresh database for each full run.

Verified locally on PostgreSQL 16: table/RPC browser denial, owner/active-workspace binding, foreign preview denial, source-bound selected values, source snapshot immutability, canonical-gate-only commit surface, preview age, atomic failure, duplicate receipt replay, preserved stronger existing fields, no imported grant override, suppression preservation, safe aggregate/list projections, two-connection workspace switch, and simultaneous commit retry.

Remaining integration proof: current full schema/triggers, tenant role helpers, actual authenticated UI/PAIGE canonical gate, persisted migration and Rail/Spine projection. The migration does not prove those by itself.
