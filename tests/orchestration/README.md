# Local orchestration authority proof

Run `tests/orchestration/run.ps1` from the checkout. It connects only to the disposable PostgreSQL instance at `127.0.0.1:57432`, creates a fresh database, applies the migration twice and executes the SQL plus concurrency proofs. It does not connect to Supabase or n8n.

The fixture declares minimal compatible tables, test users and stand-ins for auth, membership resolution and encryption. Passing this suite proves the real migration functions against those declared dependencies; it does not prove production JWT verification, installed schema state, provider access, rendered UI or delivered customer effects.

Coverage: tenant-owned provisioning, exact policy binding, bounded/idempotent delegation, canonical bus/run linkage, exclusive claims and credential leases, background independence from browser workspace, synchronous workspace checks, legacy-dispatch exclusion, browser authority fabrication denial, restrictive cross-tenant reads, pre-dispatch identity/generation checks, safe retries, intent-crash uncertainty, cancellation/revocation reconciliation and immutable terminal results. Parallel PostgreSQL sessions test duplicate delegation, claim contention and credential generation changes during a lock wait.
