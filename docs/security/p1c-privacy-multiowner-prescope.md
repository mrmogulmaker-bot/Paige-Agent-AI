# P1c Privacy + Multi-Owner — Pre-Scope (research only)

**Status:** Pre-scope / research artifact. **No migration, RLS, or DDL was authored** — RLS/migration
authoring is HALTED until #612 lands (per the P1c wave plan). This document is the safely-doable-now
research so the Slice A/B migration authoring is fast and correct when it starts.

**Scope of the corrected framework (#610 / #218):**
- **DEFAULT:** Agency has FULL read+write into its sub-accounts. Visibility is the service.
- **OWNER-CONTROLLED PRIVACY (Phase 1):** `is_private_from_agency boolean` on privacy-scoped rows
  (client / thread / doc / asset / contact) **OR** any of the row's tags ∈ `tenants.agency_hidden_tags text[]`.
  Predicate is OR.
- **MULTI-OWNER:** `is_owner boolean` on `tenant_members` (multiple rows may carry it), migrating away from
  the single `tenants.owner_user_id` column. Any owner can flip privacy / invite / approve / remove owners;
  last-write-wins; audit-logged.
- **§215 UNCHANGED:** agency owner NOT auto-added to sub-account roster; "Provided by ACME AGENCY" is
  branding, not a seat; a sub-account owner CAN invite specific agency STAFF into named roles.

**Evidence base:** live prod queries against ref `xygzykjyynhzqytbqnzu` (2026-08-03) + repo grep of
`src/`, `supabase/functions/`, `supabase/migrations/`. All counts below are real query results (§13).

---

## HEADLINE COUNTS

| Metric | Value | Source |
|---|---|---|
| `tenants.owner_user_id` **readers** (tenant-ownership, all classes) | **11** (5 SQL fns, 3 edge fns / ~6 call sites, 3 frontend files) | queries + grep below |
| ...of those that **assume exactly ONE owner** (`.single()`/`LIMIT 1`/`=` equality → single principal) | **9** | §1 flags |
| `tenants.owner_user_id` **writers** | **3** (`provision_tenant`, `provision_tenant_as`, `paige-mcp master_provision_tenant`) | §1 |
| Tenants total / with `owner_user_id` set / **missing owner `tenant_members` row (#594 gap)** | **8 / 5 / 0** | backfill query |
| Sub-accounts on prod (`parent_tenant_id NOT NULL`) | **1** | backfill query |
| `is_private_from_agency` columns existing anywhere | **0** | schema query |
| `tenants.agency_hidden_tags` exists? | **NO** (column absent) | schema query |
| `tenant_members.is_owner` exists? | **NO** (9 columns, none is `is_owner`) | schema query |
| Privacy-list tables **lacking a `tags` column** | **3 of 5** (`paige_chat_threads`, `client_files`, plus `documents` lacks `tenant_id`) | §3 |
| Distinct row-ownership `owner_user_id` columns on OTHER tables (out of multi-owner scope) | **4+** (`businesses`, `deals`, `clients`, `plans`) | §1 note |

> **Naming-collision flag (read first):** the frontend already ships a boolean literally named
> **`is_owner`** (`useTeamRoster.ts:28`, `MembersAdmin.tsx:62`, `ManageRolesDialog.tsx`, `MemberProfileDrawer.tsx`,
> `MembersRolesPanel.tsx`). It is **NOT** tenant ownership — it is derived from `is_platform_owner()` (God) OR
> the `super_admin` role (`useTeamRoster.ts:94`: `!!(ownerCheck && u.id === currentUserId) || roles.includes("super_admin")`).
> Slice A's new `tenant_members.is_owner` means "an owner of THIS tenant" — a different concept. The migration
> author and the UI wiring must not conflate the two. Recommend the RPC/roster expose the new column under an
> unambiguous name if it will co-exist in the same payload.

---

## 1. `owner_user_id` PRODUCER INVENTORY (§37 — the load-bearing part)

**Critical distinction up front.** `owner_user_id` is an overloaded column name. It exists as:
- **(TENANT OWNERSHIP)** `tenants.owner_user_id` — the single-owner column Slice A migrates away from. **This is the multi-owner surface.**
- **(ROW OWNERSHIP)** `businesses.owner_user_id`, `deals.owner_user_id`, `clients.owner_user_id`, `plans.owner_user_id`,
  `studio_sessions.owner_user_id`, `studio_artifact_versions` (via session) — per-row authorship, **unrelated to tenant ownership and OUT of Slice A scope.** They are enumerated here only to prove they were audited and consciously excluded.

Below, every reader/writer is tagged **[TENANT]** (in scope for is_owner-awareness) or **[ROW]** (out of scope).

### (a) RLS policies — `pg_policies` where qual/with_check references `owner_user_id`

Query returned **19 policies**. **All 19 reference ROW-ownership columns, NOT `tenants.owner_user_id`.** None of the
current RLS policies read tenant ownership via `owner_user_id`; tenant-owner authorization is funneled through
SQL helpers (`is_tenant_owner`, `has_tenant_role`, `can_manage_tenant_brand`) instead — which is where Slice A's
change concentrates. Breakdown (all **[ROW]**, no change under Slice A):
- `businesses` — 6 policies (`= owner_user_id`/`auth.uid()=owner_user_id` on select/insert/update/delete + `tenant_isolation` ALL).
- `deals` — 3 (`owner_user_id = auth.uid()` coach select/insert/update).
- `deal_activities` — 1 (via `deals.owner_user_id`).
- `clients` — 1 (`lead_owner_user_id`, a distinct column).
- `business_verification_runs` / `business_verifications` — 2 (via `businesses.owner_user_id`).
- `plans` — 1 (`owner_user_id = auth.uid()`).
- `studio_sessions` / `studio_artifact_versions` — 2 (`s.owner_user_id = auth.uid()`).

> **Implication:** Slice A does not have to rewrite existing RLS to preserve current behavior — the tenant-owner
> reads live in the helper functions in (b). But the **P1c agency-visibility read path added later** WILL add new
> RLS that must be is_owner-aware AND privacy-predicate-aware from the start (§3).

### (b) SQL functions / RPCs — `pg_get_functiondef` referencing `owner_user_id`

43 functions match `owner_user_id`; **8 reference `tenants` ownership**. The load-bearing ones for Slice A:

| Function | Class | What it assumes about `tenants.owner_user_id` | Slice A action |
|---|---|---|---|
| `is_tenant_owner(_user_id, _tenant_id)` | **[TENANT] reader** | Owner iff `tenants.owner_user_id = _user_id` **OR** `tenant_members.role='owner' AND status='active'`. Already dual-path. | **Add `OR tenant_members.is_owner=true`** (or switch role-owner → is_owner). This is the single most important function — most auth flows resolve through it. **Not single-owner-broken** (uses EXISTS, not LIMIT 1), but must learn the new bit. |
| `has_tenant_role(_user_id,_tenant_id,'owner')` | **[TENANT] reader** | Same dual-path as above for the `'owner'` role. | Same: teach it `is_owner`. |
| `can_manage_tenant_brand(_tenant_id)` | **[TENANT] reader** | Walks parent chain; owner iff `t.owner_user_id = auth.uid()` OR member role in ('owner','admin'). | Add `is_owner` to the member branch. Not single-owner-broken (EXISTS). |
| `is_signup_complete(_uid)` | **[TENANT] reader** | "Complete" iff `EXISTS(tenants WHERE owner_user_id=_uid)` OR active member OR ... | Fine as-is (EXISTS over owner col); optionally also accept `is_owner`. Low risk. |
| `get_user_primary_tenant(_user_id)` | **[TENANT] reader — SINGLE-OWNER RANK** | UNION: ranked `tenant_members` **plus** `tenants WHERE owner_user_id=_user_id` as rank-1 'owner', then `LIMIT 1`. | **FLAG:** the `owner_user_id` UNION arm becomes redundant/duplicative once owners are `tenant_members.is_owner` rows; leaving both risks double-count (harmless with LIMIT 1 but messy). Prefer collapsing to the members table + is_owner. |
| `provision_tenant(...)` | **[TENANT] writer + reader** | Reads `WHERE owner_user_id=_uid AND parent_tenant_id IS NULL ... LIMIT 1` (idempotency); **writes** `owner_user_id=_uid`; **also inserts** `tenant_members(role='owner')`. | **FLAG (single-owner):** idempotency `LIMIT 1` keyed on owner col. Under Slice A must also set `is_owner=true` on the owner member row it already inserts. Keep writing `owner_user_id` during transition (dual-write) unless the column is dropped. |
| `provision_tenant_as(_owner,...)` | **[TENANT] writer + reader** | Same idempotent `owner_user_id=_owner ... LIMIT 1` lookup; writes `owner_user_id`; upserts owner `tenant_members` `ON CONFLICT (tenant_id,user_id) DO NOTHING`. | Same as `provision_tenant`: set `is_owner=true` on the member upsert; dual-write column during transition. |
| `run_starter_provisioning(_tenant_id,...)` | **[TENANT] reader (indirect)** | Passes `_t.owner_user_id` into `create_pipeline_with_stages(...)` and `create_calendar(...)` as the created-by/owner of those child rows. | If `owner_user_id` is later NULLed/dropped, this passes NULL. **Must resolve the owner via `is_owner` member** instead of `_t.owner_user_id`. Currently relies on the column being populated. |

Also relevant (writer of the sub-account with **deliberately NULL** owner):
- `create_subaccount(...)` — **[TENANT] writer**, but inserts the child with `owner_user_id = NULL` and **no members**
  by design (§215/#212 — agency owner is not on the child roster). Auth-gates via `is_tenant_owner(_uid,_parent)`.
  Under multi-owner this stays NULL-until-invited; the accept-invite path (P1b) is what mints the first
  `is_owner` member. **No single-owner bug, but it is the entry point for the "first owner" invariant.**
- `guard_tenant_owner_only_columns()` — **[TENANT] trigger fn** (BEFORE UPDATE on `tenants`). Blocks any non-platform-owner
  from changing `owner_user_id`, `parent_tenant_id`, billing cols. **Implication:** once ownership moves to
  `tenant_members.is_owner`, flipping owner status happens on `tenant_members` (NOT guarded by this trigger) — so the
  new "any owner can remove another owner" write path needs its **own** authorization + audit, and this guard should be
  reviewed (it will keep freezing the legacy `owner_user_id` column, which is fine if we dual-write via SECURITY DEFINER
  fns / platform owner only).

**[ROW] functions referencing `owner_user_id` (audited, OUT of scope):** `accept_tenant_invite`, `assign_contact`,
`auto_stub_business_from_contact`, `can_access_contact`, `change_user_role`, `create_and_attach_conversation`,
`create_calendar`, `create_session_artifact`, `create_studio_session`, `delete_studio_session`,
`ensure_studio_session_for_artifact`, `get_business_hierarchy`, `get_tenant_people`, `link_session_artifact`,
`list_artifact_versions`, `list_studio_sessions`, `paige_studio_thread_ensure`, `plan_create`, `plan_list`,
`provision_tenant_default_calendar`, `rename_session_artifact_ref`, `rename_studio_session`,
`reorder_session_artifacts`, `restore_artifact_version`, `revoke_tenant_member_role`, `save_artifact_version`,
`set_studio_session_*` (5), `sync_assignment_to_client_denorm`, `touch_studio_session`,
`trigger_business_credit_sync`, `unlink_session_artifact` — all operate on `businesses`/`deals`/`studio_*`/`plans`
row-ownership, not tenant ownership.

### (c) Triggers

- `guard_tenant_owner_only_columns()` (covered in (b)) is the only tenant-ownership-relevant trigger. The
  `information_schema.triggers` scan for `owner_user_id` in the action statement returned **0** (trigger bodies
  aren't in `action_statement`), so no OTHER trigger textually reads the column at the statement level.

### (d) `pg_cron` / `pg_net` jobs

- `cron.job` WHERE command ILIKE `%owner_user_id%` → **0 rows.** No scheduled job reads or writes tenant ownership.

### (e) Edge functions (`supabase/functions`) — 21 files match; tenant-ownership call sites:

| File:line | Class | Assumption | Slice A action |
|---|---|---|---|
| `handle-inbound-email/index.ts:280-283` | **[TENANT] reader** | `.from("tenants").select("owner_user_id").eq("id",tenantId).maybeSingle()` → `createdBy = owner_user_id`. **Single-owner** (picks the one owner as the created_by attribution). | Resolve created-by via an `is_owner` member (deterministic pick, e.g. earliest) or a `get_tenant_owner(tenant_id)` helper. |
| `platform-subscription-checkout/index.ts:280` | **[TENANT] reader** | `.eq("owner_user_id", actorUserId).is("parent_tenant_id", null)` — finds the actor's top-level tenant. **Single-owner** (user→tenant by owner col). | Route through `get_user_primary_tenant` or an is_owner-aware lookup; keep working while column is dual-written. |
| `paige-mcp/index.ts:1584-1585` | **[TENANT] reader** | `.from("tenants").select("owner_user_id").eq("id",tenant_id)` → `createdBy`. **Single-owner.** | Same as handle-inbound-email. |
| `paige-mcp/index.ts:4365-4366` (`operatorOwner` helper) | **[TENANT] reader** | `.select("owner_user_id").eq("id",tenantId)` → operator owner. **Single-owner.** | is_owner-aware resolution. |
| `paige-mcp/index.ts:3658` (`admin_list_tenants`) | **[TENANT] reader (display)** | Selects `owner_user_id` in the master-admin tenant list. | Display could show multiple owners; low risk, but should read from members if column is dropped. |
| `paige-mcp/index.ts:3671-3709` (`master_provision_tenant`) | **[TENANT] writer** | Master-admin sets `owner_user_id` on insert + records legal acceptances for that one owner. | Also create an `is_owner` member; dual-write. |

**[ROW] edge-function references (audited, OUT of scope):** `send-funding-report`, `extract-business-credit-report`,
`subagent-data-consistency`, `subagent-fundability`, `subagent-funding-path`, `sync-business-credit-bureaus`,
`ingest-rag-outcome`, `voice-command-processor`, `export-clients-csv`, `paige-ai-chat` (all `businesses.owner_user_id`);
`rebuild-client-financial-brief`, `embed-client-financials` (`clients.owner_user_id`); `subagent-sales-pipeline`,
`paige-write-back`, `paige-mcp` deals selects (`deals.owner_user_id`); `handle-inbound-webhook` (inserts
`owner_user_id` on a generic entity); `paige-mcp` `me_list_businesses`/`me_update_business`/`create_task` (business/task).

### (f) Frontend (`src/`) — 39 files match; tenant-ownership readers:

| File:line | Class | Assumption | Slice A action |
|---|---|---|---|
| `src/pages/Welcome.tsx:48` | **[TENANT] reader** | `.from("tenants").select("id").eq("owner_user_id",userId).limit(1).maybeSingle()` — "does this user own a tenant / which." **Single-owner (LIMIT 1).** | Route through an is_owner-aware RPC (`get_user_primary_tenant`) or accept dual-write column during transition. |
| `src/pages/Onboarding.tsx:55` | **[TENANT] reader** | Same `eq("owner_user_id",uid).limit(1).maybeSingle()`. **Single-owner.** | Same. |
| `src/lib/auth/resolveLandingRoute.ts:78` | **[TENANT] reader** | Same `eq("owner_user_id",userId).limit(1).maybeSingle()` for landing routing. **Single-owner.** | Same — landing route resolution must survive an owner who owns via `is_owner` not the column. |
| `src/lib/roleViews/commandCenterRegistry.ts:183` | comment only | Documents an `owner_user_id === userId` check (1c-ix). | Update comment when the check moves to is_owner. |
| `useTeamRoster.ts` / `MembersAdmin.tsx` / `ManageRolesDialog.tsx` / `MemberProfileDrawer.tsx` / `MembersRolesPanel.tsx` | **[UI] `is_owner` (collision)** | Frontend `is_owner` = platform-owner/super_admin, NOT tenant ownership (see naming-collision flag). | Do NOT repurpose these; the new column needs an unambiguous surface. |

**[ROW] frontend references (audited, OUT of scope):** the remaining ~34 files (`ContactDetail`, `PracticeOverview`,
`ContactsAdmin`, `PipelineAdmin`, `DealDrawer`, `NewDealDialog`, funding/business hooks, `BusinessContext`, studio, etc.)
all read `businesses.owner_user_id` / `deals.owner_user_id` / `clients.*owner_user_id` — business/deal row ownership.

### (g) Migrations that set/backfill `owner_user_id`

272 occurrences across 81 migration files (grep count). The **tenant-ownership** setters are the provisioning
lineage: `provision_tenant_and_subaccount` (2 versions), `harden_tenant_provisioning` (2), `tenant_account_types`,
`signup_platform_feed`, `subaccount_owner_invite`, `subaccount_inheritance`, `p1_subaccount_owner_leak_fix`
(2026-08-03), `businesses_tenant_isolation_forward`, `tier_rail_phaseA`. **These are historical DDL — not re-run;**
Slice A adds a NEW migration, it does not edit these. They are listed so the author knows the provisioning
functions were last touched by `p1_subaccount_owner_leak_fix` (the current §215 behavior) and any redefinition must
preserve that leak fix.

### (h) Tests / scripts

- No `scripts/` or `tests/` file surfaced a `tenants.owner_user_id` read in the grep (the matches were all product
  code). Slice A should add per-tier smoke coverage (§51) for the new `is_owner` path — none exists today.

---

## 2. SLICE A SCHEMA PRE-SCOPE — `is_owner` on `tenant_members`

### Live `tenant_members` columns (confirmed, 9 cols — no `is_owner`)

`id uuid PK` · `tenant_id uuid NOT NULL` · `user_id uuid NOT NULL` · `role tenant_role NOT NULL DEFAULT 'member'` ·
`status text NOT NULL DEFAULT 'active'` · `invited_at timestamptz` · `joined_at timestamptz DEFAULT now()` ·
`created_at timestamptz NOT NULL DEFAULT now()` · `updated_at timestamptz NOT NULL DEFAULT now()`.

Unique constraints present: `tenant_members_pkey`, `tenant_members_tenant_id_user_id_key`,
`tenant_members_tenant_user_unique` (i.e. `(tenant_id, user_id)` is unique — provisioning already relies on
`ON CONFLICT (tenant_id, user_id)`).

### Proposed column (describe only — do NOT author)

- `ALTER TABLE tenant_members ADD COLUMN is_owner boolean NOT NULL DEFAULT false;`
- Multiple rows per tenant may be `true` (multi-owner). No single-owner unique constraint on it.
- Consider a **partial index** `(tenant_id) WHERE is_owner` for the "list owners of tenant" read the new
  auth/removal paths need.
- The existing `role tenant_role` enum already has an `'owner'` value (used by `is_tenant_owner`/`has_tenant_role`).
  **Decision the author must make (open question):** is `is_owner` a *new bit orthogonal to role*, or does it
  *replace* `role='owner'`? Cleanest is to treat `is_owner=true` as the source of truth and backfill it from BOTH
  `tenants.owner_user_id` AND existing `role='owner'` members, then teach the helpers to read `is_owner`.

### Backfill plan (describe only)

For every tenant whose `owner_user_id` is set, ensure an `is_owner=true` member row exists:
```
-- conceptual, NOT to be run here
UPDATE tenant_members m SET is_owner = true
  FROM tenants t
 WHERE t.owner_user_id = m.user_id AND t.id = m.tenant_id;
-- plus: any tenant whose owner_user_id has NO member row must get one inserted (the #594 invariant)
INSERT INTO tenant_members (tenant_id, user_id, role, status, is_owner, joined_at)
 SELECT t.id, t.owner_user_id, 'owner', 'active', true, now()
   FROM tenants t
  WHERE t.owner_user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tenant_members m WHERE m.tenant_id=t.id AND m.user_id=t.owner_user_id);
-- plus: existing role='owner' members should also get is_owner=true
UPDATE tenant_members SET is_owner = true WHERE role = 'owner' AND status = 'active';
```

### #594 invariant gap — measured on prod

**The gap is currently ZERO.** Query result:
- `total_tenants = 8`
- `tenants_with_owner_col (owner_user_id NOT NULL) = 5`
- **`owner_missing_member_row = 0`** — every tenant with an `owner_user_id` already HAS a matching
  `tenant_members` row for that user.
- `owner_missing_active_member_row = 0` — and all are `status='active'`.
- `sub_accounts (parent_tenant_id NOT NULL) = 1`.

So the INSERT arm of the backfill will touch **0 rows today** on prod — the backfill is safe and near-noop for
existing data, but must still be written defensively (the invariant could drift before #612 clears, and the
3 tenants with NULL `owner_user_id` — likely the 1 sub-account + operator/seed rows — are correctly skipped).

### Last-write-wins + audit implications

- "Any owner can flip privacy / invite / approve / remove other owners; last-write-wins" means the write path for
  toggling `is_owner` (and the privacy flags) must be a **SECURITY DEFINER RPC** that (a) checks the caller is
  itself an `is_owner` member of that tenant, (b) writes the bit, (c) writes an audit row. Raw table UPDATE via RLS
  is riskier (an owner removing another owner is a destructive act §4/§17 "never-silent"). Recommend a dedicated
  `set_tenant_owner(tenant_id, target_user_id, is_owner bool)` RPC + audit into the existing audit log
  (`paige_audit_log` per §17) rather than a broad RLS UPDATE policy.
- Guard against **removing the last owner** (an owner-count floor of 1) — the RPC must reject a flip that would
  leave a tenant ownerless.
- `guard_tenant_owner_only_columns()` still freezes the legacy `tenants.owner_user_id`; the new RPC operates on
  `tenant_members.is_owner`, sidestepping it — confirm that's intentional and that legacy column dual-writes (if
  any) go through platform-owner/SECURITY DEFINER paths only.

---

## 3. SLICE B SCHEMA PRE-SCOPE — privacy flags

### The owner's 5 privacy-scoped concepts → REAL tables on this schema

| Owner term | Real table(s) | `tenant_id`? | `tags text[]`? | `is_private_from_agency`? | Notes |
|---|---|---|---|---|---|
| **client** | `clients` | ✅ | ✅ `_text` | ❌ (add) | Clean target: both scoping and tagging present. |
| **contact** | **= `clients`** (no `contacts` table exists — `to_regclass('public.contacts')` = NULL) | ✅ | ✅ | ❌ (add) | "contact" and "client" are the same table here. One flag on `clients` covers both. |
| **thread** | `paige_chat_threads` | ✅ | ❌ **no tags** | ❌ (add) | Has `tenant_id` but NO `tags` column → tag-based hiding needs a tags column added OR thread privacy is flag-only. |
| **doc** | `documents` **and/or** `client_files` | `documents`: ❌ **no tenant_id**; `client_files`: ✅ | `documents`: ✅ `tags`; `client_files`: ❌ | ❌ (add) | **Two candidate tables, each missing a different half.** `documents` (cols: id, user_id, business_id, document_type, file_name, file_path, ..., tags, client_id) has tags but is scoped by `user_id`/`business_id`/`client_id`, **no `tenant_id`**. `client_files` (id, contact_id, tenant_id, uploaded_by_user_id, storage_path, ..., visibility) has tenant_id + a `visibility` column but no tags. Author must decide WHICH is "the doc" for agency privacy (likely `client_files`, which is tenant-scoped and already has a `visibility` enum that may be extendable). |
| **asset** | `studio_artifact_versions` (+ `studio_sessions`) | ✅ | ❌ **no tags** | ❌ (add) | Studio artifacts are the "assets/marketing assets." `studio_artifact_versions` has `tenant_id`, `kind`, `title`, `snapshot` but no tags; privacy likely belongs on the session or the version lineage. No `media_assets`/`assets`/`studio_artifacts` table exists (checked). |

**`is_private_from_agency` exists on ZERO tables today** (confirmed: `count = 0`). All flags are net-new.

**Tables missing a `tags` column (so `agency_hidden_tags` OR-arm can't apply without adding tags):**
`paige_chat_threads`, `client_files`, `studio_artifact_versions` (3 of the 5 concepts). `clients`/`documents` have
tags. → **Open question for the author (see §4): for the tag-less tables, is privacy flag-only (Phase 1), or do we
add `tags text[]` to them too?** The owner's spec is "is_private_from_agency=true OR any of row's tags ∈ hidden_tags"
— on a table with no tags column, the OR degenerates to the flag alone (correct, just less capable).

### `tenants.agency_hidden_tags` — does NOT exist

`tenants` currently has `owner_user_id`, `parent_tenant_id` (+ brand/features/billing cols) but **no
`agency_hidden_tags`**. Slice B adds `ALTER TABLE tenants ADD COLUMN agency_hidden_tags text[] NOT NULL DEFAULT
'{}'`. It lives on the **sub-account tenant record** (the tenant whose rows are being hidden from its parent agency).

### Predicate-helper shape (describe only — do NOT author)

A `STABLE` SQL helper that, given a row's flag + tags + the row's tenant, returns whether it is hidden from the
agency. Conceptual signature (NOT to be created now):
```
-- conceptual only
CREATE FUNCTION is_row_hidden_from_agency(_is_private boolean, _row_tags text[], _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT _is_private = true
      OR EXISTS (
           SELECT 1 FROM tenants t
            WHERE t.id = _tenant_id
              AND COALESCE(_row_tags, '{}') && COALESCE(t.agency_hidden_tags, '{}')  -- array overlap = OR over tags
         );
$$;
```
- `&&` (array overlap) implements "any of the row's tags is in the tenant's hidden set."
- `COALESCE` both sides so NULL tags / NULL hidden set = not hidden (fail-open toward visibility, which matches the
  DEFAULT = full agency visibility).
- **This helper only MATTERS on the agency-visibility READ path**, which the later P1c RLS work adds. **Slice B is
  schema + helper only** — adding the flag columns, the `agency_hidden_tags` column, and (optionally) the helper.
  It changes NO existing behavior until the agency-read RLS is wired (a later slice), because nothing reads these
  columns yet. That is the §32-safe way to land the schema ahead of the read path.

---

## 4. OPEN QUESTIONS / RISKS for the migration author

1. **`is_owner` vs `role='owner'` — source of truth.** Does the new bit replace the enum value or sit orthogonal
   to it? Recommend: `is_owner` becomes truth; backfill from `owner_user_id` **and** `role='owner'`; helpers
   (`is_tenant_owner`, `has_tenant_role`, `can_manage_tenant_brand`, `get_user_primary_tenant`) read `is_owner`.
   Decide before writing so the helpers and backfill agree.

2. **`documents` has no `tenant_id`; `client_files` has no `tags`.** "doc" maps ambiguously to two tables, each
   missing a different half of the privacy predicate. The author must pick the canonical "doc" table (likely
   `client_files`, which is tenant-scoped and already has a `visibility` column that may subsume or conflict with
   `is_private_from_agency`) and decide whether the OTHER table gets the flag at all. **`documents` being
   tenant-unscoped is a latent §9 concern independent of this work.**

3. **Tag-less privacy tables (`paige_chat_threads`, `client_files`, `studio_artifact_versions`).** Phase-1 privacy
   on these is **flag-only** unless a `tags text[]` column is added. Confirm with owner whether tag-based hiding is
   required for threads/docs/assets in Phase 1, or flag-only is acceptable (the OR predicate degrades gracefully).

4. **`client_files.visibility` already exists.** There is an existing `visibility` column on `client_files` — the
   author must reconcile `is_private_from_agency` with it (is agency-privacy a new axis, or a `visibility` enum
   value?). Do not ship two overlapping privacy mechanisms on one table (§18 one home).

5. **Owner_user_id readers that can't cleanly go multi-owner:** the "created_by attribution" readers
   (`handle-inbound-email:283`, `paige-mcp:1585`, `paige-mcp:4366`) pick THE owner as a single user id. With
   multiple owners there is no single answer — needs a deterministic rule (earliest `is_owner` member, or a
   designated `primary_owner`). Consider whether Slice A needs a `primary_owner_user_id` concept, or a
   `get_tenant_owner(tenant_id)` helper with a defined tie-break, so these attribution sites stay correct.

6. **#594 backfill gap = 0 today, but write it defensively.** No prod rows need the INSERT arm now, but the
   invariant can drift before #612 clears and the migration must still enforce it (owner-with-no-member-row →
   insert; and the "never leave a tenant ownerless" floor on the removal RPC).

7. **Legacy `owner_user_id` lifecycle.** Slice A must decide: **dual-write** the column (keep it populated for the
   11 legacy readers until they're all migrated) or **drop** it (requires migrating ALL readers in §1 first,
   including 3 frontend files + 6 edge call sites + `run_starter_provisioning`'s use of `_t.owner_user_id` to seed
   child rows). Dropping without migrating `run_starter_provisioning` would pass NULL into pipeline/calendar
   creation. Recommend dual-write first, drop in a later slice after §37 producer inventory re-confirms zero
   readers.

8. **`guard_tenant_owner_only_columns()` interaction.** Flipping `is_owner` on `tenant_members` bypasses this
   trigger (it guards `tenants` columns). Ensure the multi-owner write RPC has its own owner-check + audit + last-
   owner floor, and that any legacy `owner_user_id` dual-write is confined to SECURITY DEFINER / platform-owner.

9. **Naming collision (frontend `is_owner`).** The shipped frontend `is_owner` means platform-owner/super_admin.
   The new tenant-member `is_owner` must surface under a distinct key in any RPC/roster payload to avoid a silent
   semantic clash (§37 consumer-contract concern for whichever roster RPC exposes it).

10. **Per-tier (§51) coverage is absent.** No test/script reads tenant ownership today. The is_owner path and the
    privacy predicate must be smoke-tested across God / Agency / Standalone / Sub-account / Client / Anonymous —
    especially the sub-account tier (the agency-visibility default + the private-from-agency override are a
    sub-account-vs-parent seam, exactly the §51 bug class).

---

*Prepared as pre-scope input for P1c Slice A/B migration authoring. Migration/RLS/DDL authoring remains HALTED
until #612 lands. Every count and file:line above is from a live prod query or repo grep on 2026-08-03 (§13).*
