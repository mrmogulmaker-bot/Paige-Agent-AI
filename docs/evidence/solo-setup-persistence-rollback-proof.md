# Solo Setup persistence — rollback-only production-schema proof

**Candidate migration:** `20261046000000_solo_setup_persistence_repair.sql`
**Probe:** `supabase/tests/solo_setup_persistence_rollback_probe.sql`
**Executed:** 2026-09-03 against Supabase project `xygzykjyynhzqytbqnzu`

The exact migration body and checked-in probe were executed inside one explicit transaction, with
the migration's outer transaction removed and a final `ROLLBACK`. The database returned no probe
exception (the final harmless result was `set_config = anon`). A separate post-transaction query returned:

```text
owners_absent = true
representatives_absent = true
private_context_absent = true
rollback_ledger_absent = true
```

The probe exercises Owner read/save/canonical readback; alphanumeric non-U.S. identifier Vault
preservation and masked browser readback; absence of plaintext from tenant brand, audit, and Setup
readback; absence of protected legal/contact/Team-reference keys from the shared PAIGE brand
projection; required and stale-version
conflicts; Admin operational save; Admin legal/provenance refusal; Member read-only/write refusal;
cross-tenant ownership write refusal; anonymous read/write refusal; and the active-Team
representative rule. Every temporary membership, profile selection, brief, legal record, Vault
secret, owner record, and audit row was rolled back.

The final proof also covers public-name/address/phone first use without creating an empty legal
profile, legal-name-only durable creation/readback,
retaining a Vault secret without relabelling its identifier, refusing identifier changes without a
replacement number, refusing silent deletion of connection-sourced ownership, accepting an
explicit override-and-delete tombstone, a resolved platform nonmember read denial when that fixture
exists, actual `SET LOCAL ROLE authenticated` / `anon` RPC privilege checks, denial of direct
authenticated legal-profile update/delete, and denial of sensitive legal/Vault-reference reads.
It also proves inactive Admin safe-column reads are denied and the legacy direct brief-save
function cannot be executed by browser-authenticated callers.

This is real database-contract proof, not authenticated browser proof. Owner save/reload/reopen and
account-switch proof remains owed on the deployed exact application head before Setup is labelled
`LIVE`.
