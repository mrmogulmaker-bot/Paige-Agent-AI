# The source contract an import must satisfy before Spine consumes it

**Audience:** whoever builds the Go High Level → Paige customer migration, and whoever connects
n8n for a tenant. **Author:** Spine owner. **Status:** contract definition. No importer is built
here, and Spine does not build one.

Spine does not connect n8n, hold provider credentials, run OAuth, bulk-import customers, or create
autonomous external agents. This document says only what incoming data must look like **before**
Spine will read it, and it is written now — before the migration is staged — because every
requirement below is cheaper to satisfy at import time than to retrofit afterwards.

Everything in the "measured" column was executed against production
(`xygzykjyynhzqytbqnzu`) or read from the deployed source on `main` at `c50def5b`.

---

## 0. What already exists, so nobody builds it twice

| Question | Measured answer |
|---|---|
| Is there a bulk/CSV/batch contact importer? | **No.** No `*_import_*`/`*_bulk_*` RPC touching contacts, no staging table, no CSV parse path. CSV is export-only. |
| Is there a contacts table? | **No — `public.clients` is the contacts table.** |
| Is the canonical write seam idempotent? | **Yes, on email, per tenant.** `create_contact` returns the existing id rather than creating a duplicate, and catches `unique_violation` as a backstop. |
| Does provenance schema exist? | **Yes** — `ghl_contact_id`, `mirror_source`, `last_mirrored_at`, `source`, `created_by_channel_type` (which already permits `'import'`). |
| Can the audited RPCs write that provenance? | **No.** See §3 — this is the single biggest gap. |

An importer therefore has no bulk seam to call. It must either loop the per-row RPC or a bulk seam
must be built first. That is a decision for the importer's owner, not for Spine.

---

## 1. Server-side tenant binding

`create_contact` derives tenant differently depending on who calls:

```sql
_tenant uuid := CASE WHEN auth.uid() IS NOT NULL
                     THEN public.current_user_tenant_id()   -- JWT: server-resolved, body ignored
                     ELSE p_tenant_id END;                  -- service_role: TRUSTED FROM THE BODY
```

An n8n importer runs on `service_role`, so it lands in the second branch: **the tenant it passes is
believed.** That is not a defect in `create_contact` — there is no JWT to resolve from — but it moves
the entire burden of tenant correctness onto the importer.

**Required:** the importer states, in its own design, where `p_tenant_id` comes from and how it is
verified before the first write. A tenant id that originates from a webhook body, a spreadsheet
column, or a workflow variable an operator can edit does not satisfy this.

**Also required — do not use the MCP side door.** `paige-mcp`'s `create_contact`
(`supabase/functions/paige-mcp/index.ts:1714`) does a raw `admin.from("clients").insert(row)`. It
therefore bypasses the email dedupe **and** the role gate, and it accepts a caller-supplied
`tenant_id` override. It must not be the import path.

---

## 2. Durable attribution: source, source record id, import time, freshness

Every imported row must be answerable to "where did this come from, and when". The columns exist:

| Need | Column | Note |
|---|---|---|
| Source record id | `ghl_contact_id` | see the collision warning below |
| Source system | `mirror_source` | constrained to `mma_os \| manual \| ghl_legacy \| paige_ui` — **has no import-specific value** |
| Import time / freshness | `last_mirrored_at` | |
| Channel of origin | `created_by_channel_type` | `'import'` is already a legal value |
| Free-text origin | `source` | unconstrained |

### Blocker A — the external-id unique index is global, not tenant-scoped

Measured on production:

```
clients_ghl_contact_id_uniq  UNIQUE (ghl_contact_id) WHERE ghl_contact_id IS NOT NULL
```

There is no `tenant_id` in that index. Two tenants importing from two different GHL sub-accounts
that reuse a contact id will collide **across a tenant boundary** — tenant B's import fails on a row
it cannot see, and the failure is attributable to tenant A's data. Either the importer guarantees
globally-unique external ids, or the index becomes `(tenant_id, ghl_contact_id)` before any
multi-tenant import runs. This is a schema change and belongs to the table's owner, not to Spine.

### Blocker B — the audited seams cannot write any of it

`create_contact` writes a fixed column list that **excludes** `ghl_contact_id`, `mirror_source`,
`last_mirrored_at` and `tier`. `upsert_contact`'s allowlist excludes them too, and additionally
restricts `p_channel` to `'manual' | 'api'` — so it **cannot express `'import'`** even though the
table's CHECK permits it.

So today the choice is: use the audited seam and get **no provenance**, or write the columns raw and
get **no dedupe, no role gate, no audit row**. Neither is acceptable for a customer migration. One of
the two seams must be widened before the migration runs. Until then, Spine treats imported rows as
**PROVENANCE ABSENT** and will not report them as sourced.

---

## 3. Idempotency across repeated runs

Already true on email, and it is real rather than aspirational:

- `uq_clients_tenant_email` on `(tenant_id, lower(btrim(email)))`
- `create_contact` short-circuits to the existing id when the email already exists
- it catches `unique_violation` and re-resolves, closing the race

**What is NOT deduped:** phone and name have **no** unique constraint. `resolve_contact_id` matches
on last-10-digits of phone but is a lookup, not a constraint. `find_duplicate_contacts` is trigram
fuzzy matching, advisory only, and `service_role`-only.

**Required:** a re-run of the same import must not create second copies. For rows **with** an email
that is satisfied by the existing seam. For rows **without** an email — which a GHL export will
contain — the importer must supply its own idempotency key (`ghl_contact_id` is the natural one,
subject to Blocker A) and must not rely on name or phone matching to prevent duplication.

---

## 4. Visible mapping, conflict handling and an invalid-record report — before bulk commitment

A CHECK-constraint violation mid-run is the failure mode this section exists to prevent. The
constraints an import must satisfy:

- `clients_lifecycle_stage_chk` — valid set: `new_lead, qualified, nurturing, hot_lead, negotiating,
  won, client_active, client_paused, client_churned, client_funded, client_alumni`.
  **`'lead'` is not valid** and is a known trap already documented at
  `growth-process-submission/index.ts:388`.
- `clients_status_check` — `pending | active | inactive | archived`
- `clients_tier_chk`, `clients_mirror_source_chk`, `clients_onboarding_stage_check`,
  `clients_created_by_channel_type_chk`

**Required before any bulk commitment:** a dry run that reports, per source record, the target field
mapping, the rows that would be created vs matched to an existing contact, and every row that would
be rejected with the constraint that rejects it. A run that discovers this by failing partway leaves
the tenant's book in a state nobody planned.

**Also required:** `clients.tenant_id` is NOT NULL and **immutable** — trigger
`trg_client_identity_immutable` raises on any change to `id`, `tenant_id` or `account_number`. A row
imported into the wrong workspace cannot be re-homed; it can only be deleted and re-imported. This
makes §1 unrecoverable if it is got wrong, which is why §1 is first.

---

## 5. No imported customer is contacted without a separately authorized owner action

This is the requirement I want to be most precise about, because **it is currently true for SMS and
false for email**, and the difference is one line.

Every outbound message passes `runPreSend()` (`_shared/pre-send-pipeline.ts`), a pure decision
function with five locked steps: client-DND → suppression → consent → tenant auto-send DND → TCPA
quiet hours.

Step 3 is **default-deny**: a contact with no `granted` row in `paige_consent_events` is blocked. So
an imported contact created with no consent row is, by construction, un-messageable —

```ts
const CONSENT_ENFORCED_CHANNELS: ChannelType[] = ["sms"];
```

— **only over SMS.** Email is deliberately exempt (documented in the file: default-deny would have
blocked all existing email traffic against an empty consent ledger). Suppression still applies to
email; the default-deny consent gate does not.

**Consequence, stated plainly:** if a GHL migration lands 5,000 contacts today, those contacts cannot
be texted, and **can** be emailed by any existing send path. The requirement "no imported customer
receives a message without a separately authorized owner action" is therefore **not satisfied for
email** by the platform as it stands.

Three ways to satisfy it, in the order I would prefer them:

1. **Add `"email"` to `CONSENT_ENFORCED_CHANNELS`.** One line, reversible. It is a compliance
   decision with a real consequence — it blocks existing email traffic for every contact lacking a
   consent row, not just imported ones — so it is the owner's call and not mine.
2. **Write a `paige_suppressions` row per imported contact** for `channel='email'`
   (`reason='manual'`, `source='api'`). Scoped to the import, no effect on existing contacts,
   lifted by deleting the row. Costs one write per contact.
3. **Set `clients.dnd_active = true` on import.** Blocks both channels — but it is
   **operator-overridable per send** (`override_client_dnd`), so it is a speed bump rather than a
   gate, and it conflates "we never asked this person" with "this person asked us to stop".

Option 2 is the one that satisfies the requirement without changing behaviour for anyone who was not
imported. Whichever is chosen, it must be chosen **before** the first bulk run, because after the
rows exist the window in which they are un-emailable has already closed.

One further note: `clients.do_not_contact` exists and is writable, but **`runPreSend` does not read
it** — it reads `dnd_active`. Do not rely on `do_not_contact` as a send gate.

---

## 6. What must not enter Spine, Rail, Mind, or normal Solo views

Raw provider payloads, credentials, and internal transport detail stay out. Concretely:

- **Credentials never leave the vault.** n8n base URL and API key are stored encrypted
  (`base_url_ct`, `api_key_ct`); `tenant_n8n_connections` has **no member SELECT policy** by design,
  and `get_tenant_n8n_secret` is `service_role`-only. Nothing in Spine reads it. Keep it that way.
- **No raw GHL payload column.** If the importer wants to retain the source record for support, it
  belongs in an import-owned store the tenant's normal reads do not touch — not on `clients`, whose
  columns surface in Solo views and Spine summaries.
- **Spine returns the smallest useful safe summary.** For imported data that means counts, status,
  source and freshness — never the source record, never provider ids beyond the attribution column,
  never internal transport detail.

### What connecting n8n actually grants, so the owner knows what he is turning on

`paige-n8n` is admin-JWT-gated with the tenant resolved from the caller's JWT (never the body), and
SSRF-vets the stored URL before any outbound call. Once connected, Paige can list, read, author,
edit, activate, deactivate, archive, delete and **fire** workflows on that tenant's n8n, and read
their executions. `n8n_run_workflow` is classed `high` risk — *"fires an external automation with
real effects"* — and defaults to the `confirm` autonomy lane.

That is a genuine remote-execution surface, not configuration. It is appropriate for an owner to
enable deliberately; it is not something to leave at `auto`.

---

## 7. Audit: what is recordable today, and what is not

Each contact created through `create_contact` writes one `public.audit_logs` row. There is **no
import-run concept anywhere** — no run id, no row count, no started/finished, no error manifest, no
partial-failure record.

**Required:** the importer threads a synthetic correlation id through the per-row audit payload so a
run can be reconstructed, or run-shaped structure is added first. Without one of those, "what did
that migration actually do?" is not an answerable question after the fact — which is exactly the
question that gets asked when an import goes wrong.

---

## 8. The gate, as a checklist

An import is Spine-ready when every row is yes:

- [ ] Tenant is verified server-side before the first write, and does not come from an editable field
- [ ] The MCP raw-insert path is not used
- [ ] Every row carries source system, source record id, and import time
- [ ] External ids are globally unique, or the index is tenant-scoped first
- [ ] A re-run creates nothing new — including for rows with no email
- [ ] A dry run reported mapping, matches, and every rejected row before bulk commitment
- [ ] Imported contacts cannot be emailed or texted until the owner authorizes it (§5 — pick one)
- [ ] No raw payload, credential, or transport detail on `clients` or any Spine-visible surface
- [ ] An import run is reconstructible from audit

Until then Spine reports imported data as **PARTIAL** with the reason, rather than as a live source.
It will not infer that contacts exist, that they are contactable, or that a migration succeeded.
