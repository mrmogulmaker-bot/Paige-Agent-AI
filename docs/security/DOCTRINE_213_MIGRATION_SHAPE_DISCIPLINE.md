# Doctrine §213 — Migration Shape Discipline

**Status:** Active
**Codified:** Ship P.0.1.b Step 3 (post-apply retrospective)
**Related:** §66 (Antonio rules, migration writes), §208 (Shape Delta Discipline), §120 (Canonical Source-of-Truth)

---

## Context

§213 emerged from three real bugs that surfaced during Ship P.0.1.b Step 3 (L4_consumer_direct scaffolding removal). Each bug was silently invisible to the pre-mutation §208 verification pass and had to be caught mid-migration or post-apply. §213 codifies the discipline that would have caught each one up front.

---

## §213.a — DL Mirror Independence Principle

Dead-letter tables are **not** column-mirrors of their main tables. They are permissive sinks with their own schema drift history, often carrying legacy columns their main table has since dropped, or missing columns the main table has since added.

### Rule

Every migration touching a main + DL pair MUST verify the DL columns explicitly via `information_schema.columns` (or `\d`) before drafting DDL against either side. Never infer DL shape from main-table shape. Never annotate a proposed migration with "no-op on DL" without a verified query proving it.

### Applies to

- `platform_metered_events` / `platform_metered_events_dead_letter`
- Any future paired main/DL tables added under Ship P.x series

### Precedent case

Ship P.0.1.b Step 3 dropped `consumer_subscription_id` + `consumer_user_id` from `platform_metered_events` and annotated the DL side as "no-op — DL never carried these cols." That annotation was wrong. The DL mirror carried both columns (verified 0 rows, no FKs, but the columns existed). The main migration shipped clean; a follow-up migration was required to drop the DL columns. Post-apply V2 audit caught the miss because it queried both tables independently.

---

## §213.b — Explicit CHECK Drop Before Column Drop

Postgres silently CASCADEs CHECK constraint drops when the referenced column drops. This hides real constraint state from migration authors and makes constraint-lineage audits harder.

### Rule

Every migration that drops a column referenced by a CHECK MUST do one of the following:

- **(a) Preferred:** Drop the CHECK explicitly before the column, then re-add the replacement CHECK without the reference.
- **(b) Alternative:** Use `ALTER TABLE ... DROP COLUMN ... RESTRICT` to force a fail-loud error if any dependency exists, then handle the CHECK explicitly.

Preferred is (a). Explicit is better than implicit for constraint lineage. Every reviewer should be able to read the migration and see, without cross-referencing pg_catalog, which constraints changed and why.

### Anti-pattern

```sql
-- BAD: silent CASCADE hides the fact that pme_layer_matches_subject was dropped
ALTER TABLE public.platform_metered_events
  DROP COLUMN consumer_user_id;
-- ... later ...
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT pme_layer_matches_subject;  -- 42704: constraint does not exist
```

### Correct pattern

```sql
-- Step A: drop CHECKs that reference the columns
ALTER TABLE public.platform_metered_events
  DROP CONSTRAINT IF EXISTS pme_layer_matches_subject;
-- Step B: drop the columns
ALTER TABLE public.platform_metered_events
  DROP COLUMN consumer_user_id;
-- Step C: re-add CHECKs without the dropped-column references
ALTER TABLE public.platform_metered_events
  ADD CONSTRAINT pme_layer_matches_subject CHECK (...);
```

### Precedent case

Ship P.0.1.b Step 3 first attempt: DROP COLUMN preceded DROP CONSTRAINT. First column drop cascaded `pme_layer_matches_subject`; the later explicit `DROP CONSTRAINT` tripped `42704: constraint does not exist` and rolled back the whole migration. Second attempt reordered to §213.b spec and shipped clean.

---

## §213.c — DO-Block Snapshot Isolation in Migration Runners

The Supabase migration runner — and likely other Postgres migration tooling — executes `DO` blocks against a transaction snapshot that does **not** see uncommitted DDL from earlier in the same migration script. This means in-migration V-checkpoints inside `DO` blocks CANNOT validate:

- CHECK constraint bodies changed by the same migration
- Column existence changed by the same migration
- Trigger-function bodies changed by the same migration
- Any DDL-visible state that the same migration mutated

The prior discipline of stuffing all V-checkpoints inside a post-DDL `DO $$ ... $$` block gave **false confidence**. Those probes were reading pre-DDL state and could not have caught real drift.

### Rule — Split V-checkpoint discipline

Three tiers:

**1. PREFLIGHT V-checks** — stay in-migration, inside `DO` block, run BEFORE any DDL.
- Row counts against existing tables
- Existing constraint/column shape verification
- Rows-must-be-zero-before-drop invariants
- Fail-loud aborts the migration transaction before mutation.

**2. POST-MUTATION V-checks** — MOVE to a separate `psql` audit script that runs POST-APPLY, outside the migration transaction.
- Constraint body verification (`pg_get_constraintdef`)
- Column existence verification (`information_schema.columns`)
- CHECK enforcement probes (V5/V6-style fail-loud INSERT probes)
- Trigger function body verification (`pg_get_functiondef`)
- Any check against state the migration itself changed

**3. IN-MIGRATION mutation-adjacent V-checks** — can stay in the `DO` block IF they only reference tables the migration does NOT touch (e.g., verifying an unrelated seed count remained stable). Rare. Prefer moving to post-apply audit for consistency.

### Tradeoff

- **Lost:** the "ROLLBACK on bad post-state" atomicity net inside the migration transaction.
- **Gained:** V-checkpoints that actually validate what they claim to validate.

### Compensating discipline

Post-apply audit script runs automatically as part of the ship-verify cycle. Any V-check failure = immediate remediation migration drafted + fired same session. §66 preserved: Antonio rules on the remediation, migration tool writes.

### Precedent case

Ship P.0.1.b Step 3 second attempt included in-migration V1–V6 inside a post-DDL `DO` block. V2 fired `L4 columns still present (2)` — a false positive: the columns had been dropped, but the `information_schema.columns` query inside the `DO` block was reading a snapshot that didn't see the drop. The whole migration rolled back. Third attempt moved V1–V6 to a post-apply `psql` script; the migration shipped clean and the audit confirmed all six checks green (including the actual §213.a DL-column miss, which the post-apply V2 correctly caught).

---

## §213.d — Preflight Guard Column Uniqueness

A single `DO` block reads one transaction snapshot at its start. If a preflight guard adds a column and a later guard in the same block re-checks that same column, the second guard reads the pre-mutation snapshot and lies about the column's existence.

### Rule

Every preflight guard / `ALTER` pair within a single `DO` block MUST target a **distinct column**. Same-column re-checks inside one `DO` block trip snapshot isolation (see §213.c) and produce false-positive verification.

### Anti-pattern

```sql
-- BAD: second guard reads pre-mutation snapshot; "EXISTS" is always false
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'T' AND column_name = 'X'
  ) THEN
    ALTER TABLE public.T ADD COLUMN X INTEGER;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'T' AND column_name = 'X'
  ) THEN
    ALTER TABLE public.T ALTER COLUMN X SET NOT NULL;
  END IF;
END $$;
```

### Correct pattern

Split into separate `DO` blocks or separate migrations:

```sql
-- Migration N: add the column
DO $$ BEGIN
  IF NOT EXISTS (... column X ...) THEN
    ALTER TABLE public.T ADD COLUMN X INTEGER;
  END IF;
END $$;

-- Migration N+1: alter the now-verifiably-present column
ALTER TABLE public.T ALTER COLUMN X SET NOT NULL;
```

### Precedent case

The §213.c retro-audit of 332 migrations found zero violations because every preflight-guard migration touched a distinct column per guard/ALTER pair. The residual risk — a future edit adding a same-column re-check — is what §213.d closes. If that pattern had existed, it would have produced a silent false negative: the second guard would have seen `X` as missing, skipped the `ALTER`, and left the column in an unintended state.

---

## §213.e — Framework-Level Scope (No Single-Account Tunneling)

**Owner-standing-ruled 2026-08-04** (during the #227 sub-account roster hotfix).

### Directive (verbatim, owner)

> "if we are making a change on the agency level or if we are making a change on the sub-account level, we need to make sure that this affects every single one. This is not a single account fix. Remember that."

### Rule

Any data migration or behavior change scoped to an **agency-tier** or **sub-account-tier** concern MUST be framework-level: written with **generic predicates over the tier** (e.g. `WHERE parent_tenant_id IS NOT NULL`, `user_id = parent.owner_user_id`), with **zero references to any specific tenant id / name / email**, and correct for **every** current AND future account of that tier the moment it exists — no manual re-run, no per-account patch. A change that only fixes the account(s) that happen to exist today is a §213.e violation even if it makes the reported symptom go away.

### The small-blast-radius TRAP

A low live count (e.g. "only 1 sub-account exists platform-wide") is **not** license to tunnel on that one account — it is the exact condition that *invites* tunneling and hides the generic bug. When the sampled population is 1 (or small), the generalization CANNOT be proven from live data, so the §32 pre-merge proof MUST seed **synthetic multi-account fixtures** (multiple agencies × multiple sub-accounts, Enterprise-as-parent, multi-level nesting, and a legitimately-invited edge case that must SURVIVE the change) to prove the framework behavior. "It worked on the one real account" is not verification (§13).

### Applies to

- Every migration/behavior touching `tenants` (agency/sub-account rows), `tenant_members`, per-tenant rosters, per-tenant display grouping, agency↔sub-account attribution, and any tier-scoped RLS/RPC.
- The adversarial verifier on any such change carries a mandatory question: *"Does this cover ALL current + future accounts of this tier, or does it tunnel on the ones that exist today?"*

### Precedent case — #227 (2026-08-04)

The #227 hotfix targets a §215 violation (agency owner auto-injected into a sub-account roster). Ground-truth found **exactly one** sub-account in prod (Antonio Daniel LLC). The trap was to write a one-row cleanup for that tenant. §213.e forces the fix to be a generic set-based migration over `parent_tenant_id IS NOT NULL` + `user_id = parent.owner_user_id`, a standing display guardrail on every sub-account view, and a §32 proof over synthetic multi-agency/multi-sub-account fixtures — so the invariant holds the instant a second sub-account (or a test tenant) is provisioned, with no re-run.

---

## Companion doctrines

- **§66** — Antonio rules, migration writes. §213 preserves this: post-apply audits surface issues; Antonio confirms remediation migration content before ship.
- **§208** — Shape Delta Discipline. §213.a extends §208 explicitly to DL mirrors.
- **§120** — Canonical Source-of-Truth. §213.c prevents the migration script itself from becoming a false source of truth about post-apply state.
