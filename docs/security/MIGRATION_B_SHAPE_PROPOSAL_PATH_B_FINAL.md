# Migration B — Shape Proposal (Path B, FINAL)

**Ship:** Migration B (`user_subscriptions` → `tenant_customer_trials`)
**Path:** B (Rename-in-place + reclassify + code sweep + view retirement)
**Doctrine header:** §197 (Billing Layer Taxonomy) · §198 (Legacy Deprecation) · §198 Addendum Category B (Naming-Layer Deprecation) · §206 (Row-Level Discriminator) · §208 (Shape Delta Discipline) · §210 (L2/L3 Scope Boundaries)
**Phasing:** B.1 (schema + backfill + read-only compat view) → B.2 (code sweep) → B.3 (view retirement, Antonio §66 trigger)
**Status:** Draft. Section-by-section review required before Phase B.1 ships.

---

## Section 1 — Verified Current State (§208)

Reproduced from `MIGRATION_B_SHAPE_PROPOSAL.md` §1 + B.0 audit; unchanged since last review.

**`public.user_subscriptions` (`\d` shape, verified live):**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL | — |
| `plan_slug` | text | NOT NULL | `'free'` |
| `status` | text | NOT NULL | `'trial'` |
| `stripe_customer_id` | text | NULL | — |
| `stripe_subscription_id` | text | NULL | — |
| `trial_ends_at` | timestamptz | NULL | — |
| `current_period_end` | timestamptz | NULL | — |
| `cancel_at_period_end` | boolean | NOT NULL | `false` |
| `created_at` | timestamptz | NOT NULL | `now()` |

- **Row count:** 19 · all `plan_slug='free'`, `status='trial'`, `stripe_subscription_id IS NULL`.
- **RLS:** ENABLED · 3 policies scoped to `auth.uid() = user_id` + service-role bypass.
- **Triggers:** `handle_new_user` (auth-schema BEFORE INSERT ... calls `insert into public.user_subscriptions ...`).
- **Realtime:** `SubscriptionContext.tsx` subscribes to `postgres_changes` on this table.

**`public.consumer_subscriptions` (target for L4-misrouted writes, verified):** 0 rows; `plan_id NOT NULL REFERENCES consumer_subscription_plans(id)`; `status CHECK ∈ ('active','past_due','cancelled')` — **no `'trial'` state** (deliberate — L4 catalog has no free tier).

**Cross-layer impact:** 0 rows in `consumer_subscriptions`, `platform_metered_events`, or `platform_subscriptions` reference `user_subscriptions.id`.

**Delta table (current → Phase B.1 target `public.tenant_customer_trials`):**

| Change | Column / Object | Notes |
|---|---|---|
| RENAME TABLE | `user_subscriptions` → `tenant_customer_trials` | preserves OID, indexes, policies, triggers |
| ADD COLUMN | `layer text NOT NULL DEFAULT 'L2' CHECK (layer='L2')` | §197 + §210 pinned |
| ADD COLUMN | `subject_role text NOT NULL` + CHECK (`end_customer`/`tenant_member`/`consumer_user`/`platform_admin`) | §210 canonical enum |
| ADD COLUMN | `tenant_id uuid NOT NULL REFERENCES public.tenants(id)` | backfilled pre-constraint |
| RENAME POLICY | scoped policies retained under new table name (Postgres auto) | verified during self-test |
| CREATE VIEW | `public.user_subscriptions` selecting original 10 columns from `tenant_customer_trials` | read-only, no INSTEAD OF |
| UPDATE FUNCTION BODY | `public.handle_new_user()` → insert into `tenant_customer_trials` with new columns | trigger follows by OID, body references by name |

No column is dropped or retyped in B.1. All additive.

---

## Section 2 — Path Justification (§198 Addendum Category B)

Selected under §198 Addendum Part 2 + §210 as **Category B — Naming-Layer Deprecation**: the 19 rows are correctly placed in the ecosystem (they are L2 subscription state), but the table name (`user_subscriptions`) misleadingly suggests L4. This is a **rename + reclassify**, not a data move.

- **Category A rejected:** 0 rows are L4_misrouted at the data layer.
- **Copy-and-drop rejected (§198 Addendum Part 2 case study):** would delete live tenant trial gate for 15 real customers and pollute L4 catalog with synthesized `free` plan.
- **In-place rename accepted:** preserves OID → preserves FKs, RLS policies, indexes, realtime channel subscription cardinality, and the on-signup trigger's OID reference.

The two write paths that carry **L4 intent** (`stripe-webhook`, `check-subscription`) are addressed in Phase B.2 by repointing to `consumer_subscriptions` — never to the renamed L2 table — via the `metadata.layer` routing helper (spec deferred to Ship P.0.1 for live wiring; mock adapter shipped in B.2).

---

## Section 3 — Copy Pattern (Phase B.1 Migration Body)

**Not a copy. In-place rename + additive columns + backfill + read-only compatibility view.**

**Precedence rule (reviewer refinement #3):** If a user exists in both `tenant_members` and `clients`, classification is `tenant_member`. Staff identity takes precedence over customer identity for internal-facing subscription state. B.0 audit found **0 overlap** in current data; documented here for future user lifecycles where overlap may occur (e.g., a tenant staffer who also signs up as an end-customer of a sibling tenant). The trigger in 3.8 enforces the same precedence at INSERT time (`tenant_member` > `end_customer` > SKIP for L4/unclassified).

Phase B.1 migration structure (single transaction):

```sql
-- Header: §197 + §198 + §198 Addendum Category B + §200 + §206 + §208 + §210
-- Ship: Migration B.1 (Naming-Layer Deprecation, founding case study)
-- Rename target: public.user_subscriptions → public.tenant_customer_trials
-- Layer identity: L2 (subscription STATE), distinguished by subject_role (§210)
-- No row copy. No write-freeze trigger (see Section 7).
-- Precedence: tenant_member > end_customer > SKIP (L4/unclassified — no L2 row).

BEGIN;

-- 3.1 Rename in place (preserves OID, indexes, RLS, triggers by OID)
ALTER TABLE public.user_subscriptions RENAME TO tenant_customer_trials;

-- 3.2 Additive columns (nullable during backfill window)
ALTER TABLE public.tenant_customer_trials
  ADD COLUMN layer        text NULL,
  ADD COLUMN subject_role text NULL,
  ADD COLUMN tenant_id    uuid NULL REFERENCES public.tenants(id);

-- 3.3 Backfill layer (uniform L2 per §210)
UPDATE public.tenant_customer_trials SET layer = 'L2';

-- 3.4 Backfill subject_role from tenant_members (staff cluster — 4 rows)
UPDATE public.tenant_customer_trials t
   SET subject_role = 'tenant_member',
       tenant_id    = tm.tenant_id
  FROM public.tenant_members tm
 WHERE tm.user_id = t.user_id
   AND t.subject_role IS NULL;

-- 3.5 Backfill subject_role from clients.linked_user_id (end-customer cluster — 15 rows)
UPDATE public.tenant_customer_trials t
   SET subject_role = 'end_customer',
       tenant_id    = c.tenant_id
  FROM public.clients c
 WHERE c.linked_user_id = t.user_id
   AND t.subject_role IS NULL;

-- 3.6 Invariant self-test (§208 belt-and-suspenders) — see Section 4
-- (assertion block; ROLLBACK on any failure)

-- 3.7 Constrain (NOT NULL + CHECK) once backfill verified
ALTER TABLE public.tenant_customer_trials
  ALTER COLUMN layer        SET NOT NULL,
  ALTER COLUMN subject_role SET NOT NULL,
  ALTER COLUMN tenant_id    SET NOT NULL,
  ADD CONSTRAINT tct_layer_pinned_l2 CHECK (layer = 'L2'),
  ADD CONSTRAINT tct_subject_role_enum CHECK (subject_role IN
    ('end_customer','tenant_member','consumer_user','platform_admin'));

-- 3.8 Update handle_new_user trigger body (references by NAME, not OID)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tenant_id uuid;
BEGIN
  -- Resolve tenant: staff via tenant_members else default MMA tenant
  SELECT tenant_id INTO v_tenant_id
    FROM public.tenant_members WHERE user_id = NEW.id LIMIT 1;
  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM public.tenants
     WHERE slug = 'mma' LIMIT 1;  -- founding tenant fallback
  END IF;

  INSERT INTO public.tenant_customer_trials
    (user_id, plan_slug, status, trial_ends_at,
     layer, subject_role, tenant_id)
  VALUES
    (NEW.id, 'free', 'trial', now() + interval '14 days',
     'L2',
     CASE WHEN EXISTS(SELECT 1 FROM public.tenant_members WHERE user_id = NEW.id)
          THEN 'tenant_member' ELSE 'end_customer' END,
     v_tenant_id);
  RETURN NEW;
END $$;

-- 3.9 Backward-compat READ-ONLY view (no INSTEAD OF triggers — writes fail loud)
CREATE VIEW public.user_subscriptions AS
  SELECT id, user_id, plan_slug, status,
         stripe_customer_id, stripe_subscription_id,
         trial_ends_at, current_period_end, cancel_at_period_end,
         created_at
    FROM public.tenant_customer_trials;

GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT SELECT ON public.user_subscriptions TO service_role;
-- Deliberately no INSERT/UPDATE/DELETE grants. Deliberately no INSTEAD OF.
-- Writes through the view will error: "cannot insert into view".
-- That fail-loud is the feature: it surfaces any unswept code site immediately.

COMMIT;
```

**Row-copy pattern:** none. **Deletion pattern:** none. **Truncate:** none. Row count invariant: pre = post = 19.

---

## Section 4 — Verification Checkpoints

All checkpoints run **inside the Phase B.1 transaction** unless flagged otherwise. Any failed assertion → `RAISE EXCEPTION` → `ROLLBACK`.

### 4.1 Pre-flight (inside txn, before mutations)

```sql
-- P1: shape matches Section 1
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='user_subscriptions'
       AND column_name='stripe_subscription_id'
  ) THEN RAISE EXCEPTION 'B.1 P1 FAIL: user_subscriptions shape drift'; END IF;
END $$;

-- P2: row count == 19 (halt if drifted since B.0)
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.user_subscriptions;
  IF n <> 19 THEN
    RAISE EXCEPTION 'B.1 P2 FAIL: expected 19 rows, saw %', n;
  END IF;
END $$;
```

### 4.2 Post-rename, pre-backfill

```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class
     WHERE relname='tenant_customer_trials' AND relnamespace='public'::regnamespace)
  THEN RAISE EXCEPTION 'B.1 P3 FAIL: rename did not land'; END IF;
END $$;
```

### 4.3 Post-backfill invariant self-test (belt-and-suspenders per §208)

```sql
DO $$ DECLARE null_tenant int; null_role int; total int;
BEGIN
  SELECT count(*) INTO null_tenant FROM public.tenant_customer_trials WHERE tenant_id IS NULL;
  SELECT count(*) INTO null_role   FROM public.tenant_customer_trials WHERE subject_role IS NULL;
  SELECT count(*) INTO total       FROM public.tenant_customer_trials;
  RAISE NOTICE 'B.1 backfill: total=% null_tenant=% null_role=%', total, null_tenant, null_role;
  IF null_tenant > 0 OR null_role > 0 OR total <> 19 THEN
    RAISE EXCEPTION 'B.1 P4 FAIL: backfill invariant breached (nulls or count drift)';
  END IF;
END $$;

-- Cluster split matches B.0 audit
DO $$ DECLARE ec int; tm int;
BEGIN
  SELECT count(*) INTO ec FROM public.tenant_customer_trials WHERE subject_role='end_customer';
  SELECT count(*) INTO tm FROM public.tenant_customer_trials WHERE subject_role='tenant_member';
  RAISE NOTICE 'B.1 clusters: end_customer=% tenant_member=%', ec, tm;
  IF ec <> 15 OR tm <> 4 THEN
    RAISE EXCEPTION 'B.1 P5 FAIL: cluster split expected (15,4), saw (%,%)', ec, tm;
  END IF;
END $$;
```

### 4.4 Post-view verification

```sql
DO $$ DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.user_subscriptions;  -- now the view
  IF v_count <> 19 THEN
    RAISE EXCEPTION 'B.1 P6 FAIL: view row count mismatch (% vs 19)', v_count;
  END IF;
END $$;

-- Prove writes through the view fail loud (documented, not asserted — Postgres default)
-- INSERT INTO public.user_subscriptions ... would raise:
--   ERROR: cannot insert into view "user_subscriptions"
--   HINT:  To enable inserting into the view, provide an INSTEAD OF INSERT trigger...
```

### 4.5 Post-commit (out of txn — reported in ship artifacts, not gated)

- `SELECT * FROM public.tenant_customer_trials ORDER BY created_at;` — screenshot in ship notes.
- `\d public.tenant_customer_trials` + `\d public.user_subscriptions` — attach to ship.
- `SELECT pg_get_functiondef('public.handle_new_user'::regproc);` — confirm body references new table.
- Realtime channel: manual smoke via `SubscriptionContext.tsx` in preview — expected to keep working against the view until Phase B.2 repoints it. **Flag:** realtime on a view is not first-class Postgres — if `postgres_changes` on the view returns 0 events during smoke, treat as pre-known and let Phase B.2's repoint to `tenant_customer_trials` resolve it. Not a B.1 blocker.

### 4.6 Splitability flag

Everything above runs cleanly inside a single transaction. **No B.1 sub-split needed.** The only out-of-txn concern is realtime replay (4.5), which is observation-only.

---

## Section 5 — Audit Trail

Insert one row into `public.ecosystem_migration_log` (created inline if absent) capturing:

- `ship_id`: `'B.1'`
- `ship_title`: `'user_subscriptions → tenant_customer_trials (Category B rename)'`
- `doctrine_refs`: `['§197','§198','§198_addendum_B','§206','§208','§210']`
- `preflight_query_hash`: SHA-256 of the B.0 classification query text (reproducibility handle)
- `row_count_pre`: 19
- `row_count_post`: 19
- `cluster_split`: `{"end_customer":15,"tenant_member":4}`
- `l4_misrouted_rows_migrated`: 0
- `compat_view_created`: `'public.user_subscriptions'`
- `write_freeze_trigger_state`: `'not_applicable_category_B'`
- `committed_at`: `now()`

If `ecosystem_migration_log` does not exist at B.1 ship time, the migration creates it (idempotent guard: `CREATE TABLE IF NOT EXISTS`), grants `INSERT` to `service_role`, `SELECT` to `authenticated`, enables RLS with an admin-only read policy.

---

## Section 6 — Deprecation Flag

**Registered artifact:** `public.tenant_customer_trials` becomes the canonical L2 subscription-state table for tenant-scoped free-tier trials.

**Registration status:**

- **B.1 does NOT register in `public.table_layer_registry`.** That registry lands with Migration C (§207) and is a downstream concern. Blocking B.1 on C would violate the phased-ship discipline.
- B.1 writes a placeholder note in `ecosystem_migration_log.notes`: `"pending §207 registration in Migration C — layer='L2', subject_roles=['end_customer','tenant_member']"`.
- When Migration C ships, its Section 3 inserts:

    ```sql
    INSERT INTO public.table_layer_registry
      (table_name, layer, subject_roles, deprecates, notes)
    VALUES ('tenant_customer_trials', 'L2',
            ARRAY['end_customer','tenant_member'],
            'user_subscriptions (renamed 2026-07-02 in Ship B.1)',
            'Founding §198 Addendum Category B case study');
    ```

**Deprecation flag on the compat view:** the view carries a `COMMENT ON VIEW public.user_subscriptions IS 'DEPRECATED 2026-07-02 (Ship B.1). Read-only compat shim during code sweep. Retire in Ship B.3 per §66 (Antonio trigger). Do not add INSTEAD OF triggers.';` — surfaces in `psql \d+` for any human inspection.

---

## Section 7 — Write-Freeze Trigger — **NOT APPLICABLE (Category B)**

Section retained (per the template) but repurposed to document *why* no write-freeze ships.

Write-freeze triggers exist to protect a **preserved** legacy table from silent writes during a code-sweep window. That is the Category A (data-layer deprecation, copy-and-freeze) pattern.

Under Category B (naming-layer deprecation, rename-and-reclassify):

- The old name `user_subscriptions` is **not preserved as a table** — it is reclaimed as a **read-only view**.
- There is no writable object at the old name during the sweep window.
- PostgreSQL's built-in "cannot insert into view" error is the fail-loud mechanism. Any code site that has not been swept will surface immediately on its next write attempt — no trigger required.
- Attempting to install a write-freeze trigger on a view is nonsensical (views have no `BEFORE INSERT` surface without an `INSTEAD OF`, and the whole point is to *not* install `INSTEAD OF`).

`stripe-webhook` and `check-subscription` writes carrying L4 intent are addressed at the **code layer** in Phase B.2 (repoint to `consumer_subscriptions` via `metadata.layer` router). Data-layer protection at the renamed L2 table is provided by the `layer='L2'` CHECK constraint from Section 3.7, which will reject any row that attempts to sneak in as L4.

**Net:** Category B pattern needs no §66 arming step. Phase B.3 is the only manual Antonio-triggered step, and it drops the view rather than arming a trigger.

---

## Section 8 — Rollback Plan (per phase)

### Phase B.1 rollback (single transaction reversal)

```sql
BEGIN;
DROP VIEW IF EXISTS public.user_subscriptions;
ALTER TABLE public.tenant_customer_trials
  DROP CONSTRAINT IF EXISTS tct_subject_role_enum,
  DROP CONSTRAINT IF EXISTS tct_layer_pinned_l2,
  DROP COLUMN IF EXISTS tenant_id,
  DROP COLUMN IF EXISTS subject_role,
  DROP COLUMN IF EXISTS layer;
ALTER TABLE public.tenant_customer_trials RENAME TO user_subscriptions;
-- Restore prior handle_new_user body from git (previous CREATE OR REPLACE FUNCTION)
COMMIT;
```

Preserves all 19 rows byte-for-byte (OID preserved throughout). Realtime channel resumes on original name.

### Phase B.2 rollback

- `git revert` the code-sweep PR.
- Re-deploy `stripe-webhook` + `check-subscription` at previous SHA.
- No DB action required — B.1 schema still stands, view still routes reads correctly.

### Phase B.3 rollback

```sql
CREATE VIEW public.user_subscriptions AS
  SELECT id, user_id, plan_slug, status,
         stripe_customer_id, stripe_subscription_id,
         trial_ends_at, current_period_end, cancel_at_period_end,
         created_at
    FROM public.tenant_customer_trials;
GRANT SELECT ON public.user_subscriptions TO authenticated, service_role;
```

---

## Section 9 — §198 Addendum Extension (Category A vs Category B)

Two categories now formally recognized under §198 Addendum. Full diff against
`docs/security/DOCTRINE_198_ADDENDUM_DEPRECATION_REQUIRES_CUTOVER.md`:

```diff
@@ Part 2 — Deprecation Requires Row-Level Layer Classification (extension, this PR)
@@
+### Deprecation Categories (2026-07-02 extension — Ship B.1)
+
+Row-level classification per §198 Addendum Part 2 resolves every deprecation into one of two categories. Every deprecation ship must declare its category in the migration header.
+
+#### Category A — Data-Layer Deprecation
+
+Rows belong in a *different* layer table than the one they currently occupy. The table itself is correctly named for its layer, but the rows are misrouted.
+
+- **Pattern:** copy rows to the correct-layer table → freeze writes on the legacy table → sweep code → drop the legacy table.
+- **Write-freeze trigger:** **REQUIRED**, installed DISABLED per §66, armed manually after code-sweep observation window.
+- **Compat view:** optional; typically none because the legacy name is being retired outright.
+
+#### Category B — Naming-Layer Deprecation (founding case study: `user_subscriptions` → `tenant_customer_trials`)
+
+Rows are already in the *correct* layer identity, but the *table name* suggests a different (usually more downstream) layer. No rows move.
+
+- **Pattern:** rename table to a name that matches its true layer → add §206 discriminator columns and backfill → replace the old name with a read-only compat VIEW → sweep code to the new name → drop the view.
+- **Write-freeze trigger:** **NOT APPLICABLE.** The old name is a view during the sweep window; PostgreSQL's built-in "cannot insert into view" error provides fail-loud coverage. No `INSTEAD OF` triggers permitted.
+- **Compat view:** REQUIRED, read-only, no INSTEAD OF triggers, GRANT SELECT only. Retired in a discrete final phase (§66 Antonio-triggered) gated on zero grep matches for the old name.
+
+**Founding Category B case study — `user_subscriptions` → `tenant_customer_trials` (2026-07-02):**
+
+Preserves the C9 audit chain-of-reasoning:
+
+1. **C9 audit finding:** 17 code-site references still writing to `user_subscriptions` after `consumer_subscriptions` shipped as the L4 canonical target. Signal read initially as "L4 legacy needing cutover".
+2. **§208 first correction:** attempted L4 copy blocked by FK misalignment — `consumer_subscriptions.plan_id` has no `'free'` plan.
+3. **§198 Addendum Part 2 second correction:** row-level classification revealed all 19 rows are `plan_slug='free'`/`status='trial'`/no Stripe artifact, and 100% link to the MMA tenant via `clients` or `tenant_members`. Zero rows are L4.
+4. **§210 third correction:** initial B.0 draft classified end-customer rows as L3 (tenant-passthrough). §210 clarified that subscription **state** is L2 regardless of delivery passthrough; only metering **events** are L3.
+5. **Final resolution:** the rows are correctly-placed L2 (distinguished by `subject_role`); the *name* was wrong. Rename to `tenant_customer_trials`, reclassify with §206 columns, code-sweep, view-retire. No row copy. No write-freeze.
+
+Category B pattern is the correct default when a deprecation candidate's row-level classification returns a **single layer** with **zero misrouted rows** and the code-drift signal is confined to **write intent** in specific paths (not the existing rows' identity). Category A applies when misrouted rows exist and must physically move.
```

---

## Ready-for-review checklist

- [x] Section 1 — verified state (§208)
- [x] Section 2 — path justification (Category B)
- [x] Section 3 — Phase B.1 migration body (rename + backfill + view)
- [x] Section 4 — verification checkpoints (all fit in one txn; realtime flagged as observation-only)
- [x] Section 5 — audit trail row in `ecosystem_migration_log`
- [x] Section 6 — deprecation flag; §207 registration deferred to Migration C
- [x] Section 7 — write-freeze N/A, repurposed to document why
- [x] Section 8 — three-phase rollback
- [x] Section 9 — §198 Addendum diff (Category A vs Category B, C9 chain preserved)
- [ ] Human section-by-section review → authorize Phase B.1 ship
