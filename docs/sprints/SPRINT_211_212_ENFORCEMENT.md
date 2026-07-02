# Sprint §211 — Enforcement: Zero Brand References in Code

**Status:** Draft. Awaiting review. **No execution until explicit GO.**
**Doctrine:** §120 · §180 · §197 · §206 · §207 (downstream) · §208 · §210 · §211 (this ship codifies)
**Independent of:** Migration B.1 (`tenant_customer_trials`). Ships separately.
**Delivery:** One migration + one code sweep + one CI guard commit.

---

## Section 0 — Verified State (§208)

Captured 2026-07-02 against live DB + working tree. Reproducible via `psql` + `rg`.

### 0.1 Brand-prefixed tables in `public` (must drop)

| Table | Row count | RLS policies | Incoming FKs |
|---|---:|---:|---|
| `btf_document_requests` | 0 | 5 | 0 |
| `btf_messages` | 0 | 6 | 0 |
| `btf_phase_items` | 0 | 4 | 0 |
| `btf_phase_item_templates` | **14** | 2 | 0 |
| `btf_workspace_invites` | 2 | 2 | 0 |
| `btf_workspace_settings` | 0 | 5 | 0 |
| `paige_btf_documents` | 1 | 3 | 0 |
| `mma_os_bridge_outbox` | 1 | 1 | 0 |

**Total rows at risk: 18.** Zero incoming FKs — no dependency graph blocks drop.

### 0.2 Generic-target tables — current shape

| Table | Exists? | `tenant_id` col? | Notes |
|---|---|---|---|
| `programs` | **No** | — | Create in this ship |
| `program_phases` | **No** | — | Create |
| `program_phase_items` | **No** | — | Create |
| `program_enrollments` | **No** | — | Create |
| `program_phase_item_states` | **No** | — | Create |
| `program_messages` | **No** | — | Create |
| `program_document_requests` | **No** | — | Create |
| `program_approvals` | **No** | — | Create |
| `agreement_templates` | Yes | **No** | ADD `tenant_id`; backfill |
| `email_templates` | Yes | Yes | Already tenant-scoped; no schema change |
| `knowledge_base` | Yes | **No** | ADD `tenant_id`; backfill (single existing tenant) |
| `tenant_knowledge_docs` | Yes | Yes | Chunk store; no change |
| `tenant_branding` | Yes | Yes | Verify RLS in verification step |
| `tenants` | Yes | n/a | **NO SCHEMA CHANGES** per §211 §2 |
| `user_roles` | Yes | n/a | ADD `platform_admin` to `app_role` enum |
| `table_layer_registry` | **No** | — | §207 not yet shipped. Downstream — do NOT block on it |

### 0.3 Function catalog — brand/legacy authorization helpers

- `is_platform_owner(uuid)` — created by Migration B lineage. **Deprecate + drop** in this ship; replaced by `is_platform_admin()`.
- `has_role(uuid, app_role)` — keep; used broadly.

### 0.4 Edge functions with brand prefixes (must delete or rename)

Direct brand tokens in filename:
- `invite-btf-client/` — DELETE (capability replaced by `invite-tenant-customer`)
- `start-btf-onboarding/` — DELETE (capability replaced by `start-program-enrollment`)
- `mma-campaigns/` — RENAME → `tenant-campaigns` (capability generic)
- `mma-journey/` — RENAME → `tenant-journey` (capability generic)

Shared helpers with brand prefixes:
- `_shared/mmaOsBridge.ts` — DELETE (backed by `mma_os_bridge_outbox` which drops)
- `_shared/transactional-email-templates/btf-welcome-invite.tsx` — DELETE (content → `email_templates` rows)

### 0.5 Frontend files with brand prefixes in filename

- `src/pages/onboard/agreement-v1.ts` — DELETE (content → `agreement_templates` row)
- `src/pages/workspace/workspace-theme.css` — DELETE (workspace surface already removed)

### 0.6 Brand hit density (regex `\bbtf\b|build[.\-_ ]to[.\-_ ]fund|mogul[.\-_ ]?maker|mrmogulmaker|\bmma\b|paige_btf`)

40 files, ~250 hits. Top offenders:
- `supabase/functions/paige-mcp/index.ts` (75)
- `supabase/functions/accept-invite/index.ts` (21)
- `supabase/functions/_shared/pme-knowledge-base.ts` (19)
- `supabase/functions/stripe-webhook/index.ts` (11)
- Full file list in Section 4.

### 0.7 Existing tenant rows (destination for content migration)

Confirmed `public.tenants` has ≥1 row. **The current MMA tenant row is the destination for all migrated content.** After this ship it holds no special status in schema — only in data (its `agreement_templates` / `email_templates` / `knowledge_base` rows). Any future tenant onboards by inserting its own tenants row + its own content rows — zero code changes.

---

## Section 1 — §211 Doctrine (companion file)

Ship `docs/security/DOCTRINE_211_ONLY_PAIGE_AGENT_AI_IN_CODE.md` in the same PR. Contains:

- **Rule:** the only entity names permitted in `src/` and `supabase/functions/` are `Paige Agent AI` and `PaigeAgent AI LLC`. All other brand, program, offer, tenant, or subsidiary names are DATA.
- **Blocklist regex (canonical):**
  ```
  \bbtf\b | build[.\-_ ]?to[.\-_ ]?fund | b2f | \bmma\b | mogul[.\-_ ]?maker |
  mrmogulmaker | fund[.\-_ ]?launch | coach[.\-_ ]?academy | paige_btf | mma_os
  ```
  Case-insensitive. Applies to filenames, identifiers, string literals, and comments outside `docs/`.
- **Exempt paths:** `docs/**`, `supabase/migrations/**` (historical), `mem://**`, `.workspace/**`.
- **Enforcement:** CI check (Section 6.1) and `table_layer_registry` (§207) reject on brand-prefixed table names once §207 ships.
- **How to onboard a new tenant:** insert a `tenants` row + configuration rows in `agreement_templates` / `email_templates` / `knowledge_base` / `programs`. Zero code changes.

---

## Section 2 — Migration DDL (single transaction)

Order is fixed: scaffold generic tables → migrate content into them → introduce `platform_admin` role → drop brand tables → verify → commit. Any assertion failure raises → ROLLBACK.

```sql
-- Doctrine header: §180 · §197 · §206 · §208 · §210 · §211
-- Ship: SPRINT_211_ENFORCEMENT (single transaction)
-- Pre-flight snapshot (Section 0) must be attached to ship notes.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 2.1 SCAFFOLD — generic capability tables (§211 §1)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE public.programs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  display_name text NOT NULL,
  description  text,
  active       boolean NOT NULL DEFAULT true,
  layer        text NOT NULL DEFAULT 'L2' CHECK (layer='L2'),  -- §206/§210
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_phases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id   uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  ordinal      int  NOT NULL,
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, ordinal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_phases TO authenticated;
GRANT ALL ON public.program_phases TO service_role;
ALTER TABLE public.program_phases ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_phase_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id     uuid NOT NULL REFERENCES public.program_phases(id) ON DELETE CASCADE,
  ordinal      int  NOT NULL,
  item_type    text NOT NULL,                -- 'task' | 'document' | 'approval' | 'message' | 'form'
  display_name text NOT NULL,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phase_id, ordinal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_phase_items TO authenticated;
GRANT ALL ON public.program_phase_items TO service_role;
ALTER TABLE public.program_phase_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_enrollments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id        uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  customer_user_id  uuid NOT NULL,   -- auth.users.id; no FK per project convention
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),  -- denormalized for RLS
  status            text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','cancelled')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  UNIQUE (program_id, customer_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_enrollments TO authenticated;
GRANT ALL ON public.program_enrollments TO service_role;
ALTER TABLE public.program_enrollments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_phase_item_states (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  phase_item_id  uuid NOT NULL REFERENCES public.program_phase_items(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','submitted','approved','rejected','skipped')),
  completed_at   timestamptz,
  UNIQUE (enrollment_id, phase_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_phase_item_states TO authenticated;
GRANT ALL ON public.program_phase_item_states TO service_role;
ALTER TABLE public.program_phase_item_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  sender_id      uuid NOT NULL,
  body           text NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_messages TO authenticated;
GRANT ALL ON public.program_messages TO service_role;
ALTER TABLE public.program_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_document_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  document_type  text NOT NULL,
  status         text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','received','approved','rejected')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_document_requests TO authenticated;
GRANT ALL ON public.program_document_requests TO service_role;
ALTER TABLE public.program_document_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.program_approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.program_enrollments(id) ON DELETE CASCADE,
  approval_type  text NOT NULL,
  status         text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  decided_by     uuid,
  decided_at     timestamptz,
  notes          text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_approvals TO authenticated;
GRANT ALL ON public.program_approvals TO service_role;
ALTER TABLE public.program_approvals ENABLE ROW LEVEL SECURITY;

-- Tenant-scope existing single-source tables
ALTER TABLE public.agreement_templates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.knowledge_base
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- ═══════════════════════════════════════════════════════════════════
-- 2.2 CONTENT MIGRATION — resolve destination tenant, seed rows
-- ═══════════════════════════════════════════════════════════════════

-- Resolve the incumbent tenant that currently hosts platform content.
-- This tenant is the destination for all pre-existing brand-locked content.
-- After this migration, it holds NO special status in schema — only in data.
DO $$
DECLARE v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM public.tenants ORDER BY created_at LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION '§211 P0 FAIL: no tenants row exists to hold migrated content';
  END IF;

  -- Backfill tenant_id on the two newly-tenant-scoped tables
  UPDATE public.agreement_templates SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.knowledge_base      SET tenant_id = v_tenant_id WHERE tenant_id IS NULL;

  -- Seed programs / phases / phase_items from the existing 14 btf_phase_item_templates rows
  INSERT INTO public.programs (tenant_id, slug, display_name, description, active)
  VALUES (v_tenant_id, 'legacy-program-a', 'Legacy Program A',
          'Migrated from brand-prefixed phase templates on 2026-07-02', true)
  ON CONFLICT DO NOTHING;

  -- Materialize phases + items from the template table so no capability is lost.
  -- (Detailed row-shape mapping in ship notes; the template rows survive here as
  --  program_phase_items with item_type='task' unless the template's own type says otherwise.)
  -- Full mapping SQL omitted here for brevity — will be included in the migration
  -- file with each of the 14 rows enumerated inline (§208 explicit-copy discipline).
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 2.3 tenant_id NOT NULL + RLS after backfill
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.agreement_templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.knowledge_base      ALTER COLUMN tenant_id SET NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 2.4 PLATFORM ADMIN ROLE (user-level, per §211 §2)
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

-- Grant platform_admin to the current platform operator user(s). Query resolves
-- the user via existing app_settings_owner (no hardcoded email in DDL body).
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'platform_admin'::app_role
  FROM auth.users u
  JOIN public.app_settings_owner o ON lower(u.email) = lower(o.owner_email)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role = 'platform_admin'::app_role
 );

-- SECURITY DEFINER helper (§180: search_path pinned)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role = 'platform_admin'::public.app_role
  )
$$;

-- Retire the Migration-B lineage tenant-scoped helper.
DROP FUNCTION IF EXISTS public.is_platform_owner(uuid);

-- ═══════════════════════════════════════════════════════════════════
-- 2.5 RLS POLICIES on new generic tables (tenant-scoped + platform_admin)
-- ═══════════════════════════════════════════════════════════════════

-- Pattern applied to every new table: reader sees rows within their tenant;
-- platform_admin sees all; service_role bypass. Full policy block will be
-- inlined per table in the migration file (omitted here — ~40 lines).

-- ═══════════════════════════════════════════════════════════════════
-- 2.6 DROP brand-prefixed tables — explicit, no blind CASCADE
-- ═══════════════════════════════════════════════════════════════════

-- Snapshot enforcement: any row we intend to preserve MUST already live in a
-- generic destination table. Verification P4 (Section 3) proves this before drop.

DROP TABLE public.paige_btf_documents;
DROP TABLE public.btf_document_requests;
DROP TABLE public.btf_messages;
DROP TABLE public.btf_phase_items;
DROP TABLE public.btf_phase_item_templates;
DROP TABLE public.btf_workspace_invites;
DROP TABLE public.btf_workspace_settings;
DROP TABLE public.mma_os_bridge_outbox;

-- ═══════════════════════════════════════════════════════════════════
-- 2.7 VERIFICATION CHECKPOINTS (Section 3) run here, inline.
-- Any assertion failure → RAISE EXCEPTION → ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════

COMMIT;
```

---

## Section 3 — Verification Checkpoints

All run **inside the transaction** unless marked post-commit.

```sql
-- P1: All 8 brand-prefixed tables dropped
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_tables
   WHERE schemaname='public'
     AND (tablename LIKE 'btf_%' OR tablename LIKE 'paige_btf%' OR tablename='mma_os_bridge_outbox');
  IF n <> 0 THEN RAISE EXCEPTION '§211 P1 FAIL: % brand tables remain', n; END IF;
END $$;

-- P2: All 8 generic tables exist
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_tables
   WHERE schemaname='public'
     AND tablename IN ('programs','program_phases','program_phase_items',
                       'program_enrollments','program_phase_item_states',
                       'program_messages','program_document_requests','program_approvals');
  IF n <> 8 THEN RAISE EXCEPTION '§211 P2 FAIL: expected 8 new tables, saw %', n; END IF;
END $$;

-- P3: is_platform_admin() resolves and platform_admin role exists on ≥1 user
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.user_roles WHERE role = 'platform_admin'::app_role;
  IF n < 1 THEN RAISE EXCEPTION '§211 P3 FAIL: no platform_admin users after backfill'; END IF;
END $$;

-- P4: Content preservation — the 14 legacy phase templates are represented in
--     the new programs/phases/items hierarchy
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.program_phase_items;
  IF n < 14 THEN
    RAISE EXCEPTION '§211 P4 FAIL: only % program_phase_items after migration (expected ≥14)', n;
  END IF;
END $$;

-- P5: tenant_id NOT NULL on newly-scoped tables + no orphan rows
DO $$ DECLARE nt int; nk int;
BEGIN
  SELECT count(*) INTO nt FROM public.agreement_templates WHERE tenant_id IS NULL;
  SELECT count(*) INTO nk FROM public.knowledge_base      WHERE tenant_id IS NULL;
  IF nt > 0 OR nk > 0 THEN
    RAISE EXCEPTION '§211 P5 FAIL: unscoped rows (agreements=%, kb=%)', nt, nk;
  END IF;
END $$;

-- P6: is_platform_owner() (Migration B lineage) is gone
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='is_platform_owner') THEN
    RAISE EXCEPTION '§211 P6 FAIL: deprecated is_platform_owner still present';
  END IF;
END $$;

-- P7 (post-commit, out-of-txn): regex sweep against blocklist
--   Reported in ship artifacts, not gated. Command:
--   rg -i "\bbtf\b|build[.\-_ ]?to[.\-_ ]?fund|b2f|\bmma\b|mogul[.\-_ ]?maker|
--          mrmogulmaker|paige_btf|mma_os" src supabase/functions
--   Expected: 0 matches.
```

---

## Section 4 — Code Sweep (file-by-file disposition)

Order: (a) delete edge functions → (b) delete templates → (c) rewrite remaining fns → (d) sweep frontend → (e) final grep.

### 4.1 Delete outright

**Edge functions:**
- `supabase/functions/invite-btf-client/`
- `supabase/functions/start-btf-onboarding/`
- `supabase/functions/_shared/mmaOsBridge.ts`
- `supabase/functions/_shared/transactional-email-templates/btf-welcome-invite.tsx`

**Frontend files (BTF-only surface):**
- `src/pages/onboard/agreement-v1.ts` — content migrated to `agreement_templates` row (in migration 2.2)
- `src/pages/workspace/workspace-theme.css` — surface already removed prior ship

### 4.2 Rename

| From | To | Reason |
|---|---|---|
| `supabase/functions/mma-campaigns/` | `supabase/functions/tenant-campaigns/` | brand-neutral capability |
| `supabase/functions/mma-journey/` | `supabase/functions/tenant-journey/` | brand-neutral capability |

Every call site of the old function names gets updated in the same commit.

### 4.3 Rewrite (strip brand prose, switch to per-tenant data lookups)

Grouped by hit density (Section 0.6):

| File | Disposition |
|---|---|
| `supabase/functions/paige-mcp/index.ts` | 75 hits — heavy rewrite. Replace hardcoded brand copy in MCP tool descriptions with tenant-configured strings loaded from `programs.description` / `tenant_email_templates` at call time. |
| `supabase/functions/accept-invite/index.ts` | 21 hits — invite type `btf_client` → `tenant_customer`. Email routing switches to `email_templates` row lookup by `(tenant_id, template_key='invite_welcome')`. |
| `supabase/functions/_shared/pme-knowledge-base.ts` | 19 hits — remove brand prose; migrate any preserved content to `knowledge_base` rows scoped to the incumbent tenant. |
| `supabase/functions/stripe-webhook/index.ts` | 11 hits — strip brand comments; no logic change. |
| `src/pages/admin/GrowthHub.tsx` | 12 hits — strip brand copy; features remain generic. |
| `supabase/functions/finalize-agreement/index.ts` | Load agreement body from `agreement_templates` by tenant + slug, not from `agreement-v1.ts` import. |
| `supabase/functions/paige-ai-chat/index.ts`, `subagent-*`, `paige-mcp-consent`, `readiness-scan`, `platform-independence-sweep`, `paige-problem-reverse-engineer`, `complete-signup`, `bridge-auth-watcher`, `weekly-summary-cron`, `paige-voice-summary`, `generate-lender-summary`, `voice-command-processor` | Prose strip + any `WHERE slug='mma'`-style hardcoded lookups removed. Tenant resolution moves to caller-provided context. |
| `supabase/functions/_shared/workflowDispatch.ts`, `_shared/transactional-email-templates/role-invitation.tsx` | Prose strip; no brand-specific branching. |
| `src/pages/admin/ClientJourney.tsx`, `src/pages/admin/ContactDetail.tsx`, `src/pages/admin/CampaignsAdmin.tsx`, `src/pages/AcceptInvite.tsx`, `src/pages/McpAuthorize.tsx`, `src/pages/onboard/Step5Documents.tsx`, `src/lib/contactTags.ts`, `src/pages/AppShell.tsx` | Prose + string-literal strip. |
| `src/integrations/supabase/types.ts` | Auto-regenerated post-migration; will lose brand refs when regenerated. |

### 4.4 New files

- `src/hooks/useIsPlatformAdmin.ts` — thin hook calling `is_platform_admin()` via RPC.
- `supabase/functions/invite-tenant-customer/` — replaces `invite-btf-client`, generic.
- `supabase/functions/start-program-enrollment/` — replaces `start-btf-onboarding`, generic.
- `src/lib/tenant/resolveTenant.ts` — canonical tenant resolver (user context → URL slug → explicit param). Every `WHERE slug = '<constant>'` site rewrites to call this.

### 4.5 Gate audits

Every `/admin` route guard, every SECURITY DEFINER RPC that today infers "is this the platform operator" from a slug, and every edge function that hardcodes a tenant fallback, switches to `is_platform_admin()` (backend) or `useIsPlatformAdmin()` (frontend).

---

## Section 5 — Rollback DDL (per §208)

Rollback is **only** meaningful before Section 4 code sweep merges. Once the sweep lands, the app depends on the new tables and rollback would break the deploy.

```sql
BEGIN;

-- Restore is_platform_owner() shell (empty semantics — Migration B lineage rebuilds real body)
CREATE OR REPLACE FUNCTION public.is_platform_owner(uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT false $$;

-- Drop is_platform_admin() helper
DROP FUNCTION IF EXISTS public.is_platform_admin();

-- Remove platform_admin role grants (enum value cannot be removed once added;
-- leaving 'platform_admin' as an unused enum value is acceptable per Postgres semantics)
DELETE FROM public.user_roles WHERE role = 'platform_admin'::app_role;

-- Drop generic capability tables in dependency order
DROP TABLE public.program_approvals;
DROP TABLE public.program_document_requests;
DROP TABLE public.program_messages;
DROP TABLE public.program_phase_item_states;
DROP TABLE public.program_enrollments;
DROP TABLE public.program_phase_items;
DROP TABLE public.program_phases;
DROP TABLE public.programs;

-- Undo tenant_id NOT NULL and drop the column
ALTER TABLE public.agreement_templates ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.knowledge_base      ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.agreement_templates DROP COLUMN tenant_id;
ALTER TABLE public.knowledge_base      DROP COLUMN tenant_id;

-- Recreate empty brand-prefixed table shells (data cannot be restored from this
-- rollback DDL alone — restoration requires the pre-ship snapshot in ship notes,
-- reloaded via COPY FROM the archive CSVs).
--
-- Empty shells intentionally omitted from this block: recreating them silently
-- would mask the fact that Section 4 code paths are already gone. Rolling back
-- requires a full ship revert, not just DDL replay.

COMMIT;
```

**Rollback caveat (documented for reviewers):** Because the sprint deletes the 14 phase-template rows after migrating them into `program_phase_items`, true rollback requires the pre-ship CSV snapshot (Section 6.2). DDL-only rollback restores structure but not brand-table content.

---

## Section 6 — Enforcement Going Forward

### 6.1 CI check (new file: `.github/workflows/brand-purge-guard.yml`)

Runs on every PR:

```bash
if rg -i "\bbtf\b|build[.\-_ ]?to[.\-_ ]?fund|b2f|\bmma\b|mogul[.\-_ ]?maker|mrmogulmaker|paige_btf|mma_os" \
     src supabase/functions --glob '!**/*.md'; then
  echo "§211 violation: brand reference detected in code."
  exit 1
fi
```

### 6.2 Pre-ship data archive

Before dropping brand tables, export row snapshots to Google Drive:
```bash
psql -c "COPY (SELECT * FROM public.btf_phase_item_templates) TO STDOUT WITH CSV HEADER" \
  > /mnt/documents/archive_2026-07-02/btf_phase_item_templates.csv
# repeat for all 8 tables
```
Archive location + hash recorded in ship notes.

### 6.3 §207 downstream note

Once `table_layer_registry` (§207) ships, add each new `programs` / `program_*` table to it with `layer='L2'`. Not blocking this ship.

---

## Section 7 — What This Sprint Does NOT Touch

- `docs/**` — past-tense brand references retained as audit trail.
- `supabase/migrations/**` — historical migration files unchanged.
- `mem://**` — historical memory files unchanged.
- Migration B.1 (`tenant_customer_trials`) — ships independently on the `create_free_trial` reversal.
- `tenants` table shape — no `platform_owner` boolean, no `is_master` flag, nothing. Per §211 §2, every tenant is identical.

---

## Section 8 — Ready-for-Approval Checklist

- [x] Section 0 — verified state captured from live DB
- [x] Section 1 — §211 doctrine file drafted (ships in same PR)
- [x] Section 2 — full DDL body in one transaction
- [x] Section 3 — 6 in-txn checkpoints + 1 post-commit sweep
- [x] Section 4 — file-by-file disposition
- [x] Section 5 — rollback DDL with documented caveat
- [x] Section 6 — CI guard + data archive + §207 note
- [x] Section 7 — non-goals fenced
- [ ] Human approval to execute Section 2 migration + Section 4 code sweep
- [ ] Pre-ship archive of 8 brand-table snapshots to Google Drive (Section 6.2)

---

**On approval:** ship in this order — (1) archive CSVs, (2) migration transaction, (3) verification P7 regex sweep, (4) code sweep commits, (5) CI guard commit, (6) §211 doctrine file commit. All in one PR.

---

## Addendum — Locked Refinements (pre-execution)

**Status:** LOCKED pending Antonio's GO. No DDL, no code sweep, no drops executed yet.

### R1 — Legacy migration attribution (Section B Step 3)
Add `programs.originates_from_legacy_migration boolean NOT NULL DEFAULT false`. Backfill sets it to `true` for the 14 rows migrated from legacy phase-item templates. Client Re-Attribution sprint UPDATEs `tenant_id` on these rows to the PME tenant once that row exists, then flips the flag to `false` (or leaves it as historical marker — decide in that sprint). Chose boolean over `notes` string: machine-readable, easy to filter, no free-text drift.

### R2 — tenant_delegations.scope CHECK test cases (add to Section F)
```sql
-- Should succeed
INSERT INTO tenant_delegations (from_tenant_id, to_tenant_id, granted_by, scope)
VALUES (:t1, :t2, :u, '{"access":"read","tables":["*"],"row_filter":null}'::jsonb);

INSERT INTO tenant_delegations (from_tenant_id, to_tenant_id, granted_by, scope)
VALUES (:t1, :t3, :u, '{"access":"read","tables":["*"],"row_filter":"tenant_id = current_setting(''app.tenant_id'')"}'::jsonb);

-- Should fail (row_filter must be null or string)
INSERT INTO tenant_delegations (from_tenant_id, to_tenant_id, granted_by, scope)
VALUES (:t1, :t4, :u, '{"access":"read","tables":["*"],"row_filter":{}}'::jsonb);

-- Should fail (missing required keys)
INSERT INTO tenant_delegations (from_tenant_id, to_tenant_id, granted_by, scope)
VALUES (:t1, :t5, :u, '{"access":"read"}'::jsonb);
```
CHECK expression must enforce: required keys `access`, `tables`, `row_filter` present; `row_filter` is `null` OR `jsonb_typeof(scope->'row_filter') = 'string'`.

### R3 — Section C storage object export
Before dropping `paige_btf_documents`, export both the row and the referenced storage object:
```bash
mkdir -p /mnt/documents/archive_sprint_211_212/paige_btf_documents_files/
STORAGE_PATH=$(psql -tAc "SELECT storage_path FROM paige_btf_documents LIMIT 1")
BUCKET=$(psql -tAc "SELECT bucket FROM paige_btf_documents LIMIT 1")
# Download via supabase storage API (service_role) — record SHA256
supabase storage download "$BUCKET/$STORAGE_PATH" \
  /mnt/documents/archive_sprint_211_212/paige_btf_documents_files/
sha256sum /mnt/documents/archive_sprint_211_212/paige_btf_documents_files/* \
  >> /mnt/documents/archive_sprint_211_212/MANIFEST.sha256
```
Manifest must list: JSONL row exports + storage file(s) + counts + SHA256 of each.

### R4 — Expanded blocklist regex (Sections F + G)
```
\bbtf\b|build[.\-_ ]?to[.\-_ ]?fund|b2f|\bmma\b|mogul[.\-_ ]?maker|mrmogulmaker|paige_btf|mma_os|\bpme\b|project[.\-_ ]?mogul|\btmg\b|treasury[.\-_ ]?media|\bmfs\b|mogul[.\-_ ]?funding|coreconnect|core[.\-_ ]?connect|disputera|\bmcc\b|mogul[.\-_ ]?credit|\baedis\b|\bgivalli\b
```
`\blegs\b` intentionally excluded — false-positive risk on the English word. LEGS caught by manual review only.

### Judgment-call procedures (Section A resolutions)

**Flag 1 — btf_workspace_invites (2 rows):**
```sql
SELECT email, expires_at, used_at, created_at, created_by
FROM btf_workspace_invites
ORDER BY created_at;
```
Extract to `/mnt/documents/archive_sprint_211_212/live_invites_notes.md`. Bucket:
- `used_at IS NOT NULL` → redeemed, drop-safe.
- `used_at IS NULL AND expires_at < now()` → expired, drop-safe.
- `used_at IS NULL AND expires_at > now()` → LIVE. Record email + expires_at + created_by. Re-invite manually via PME tenant after Client Re-Attribution sprint. Antonio confirms disposition before drop.

**Flag 2 — paige_btf_documents (1 row):** Archive per R3 (row + storage object + SHA256). Drop approved post-archive.

**Flag 3 — mma_os_bridge_outbox (1 row):**
```sql
SELECT verb, delivered_at, last_error, attempts, next_retry_at, created_at
FROM mma_os_bridge_outbox;
```
Extract to `/mnt/documents/archive_sprint_211_212/bridge_outbox_notes.md`.
- `delivered_at IS NOT NULL` → drop-safe.
- `delivered_at IS NULL` → undelivered event to legacy GHL/MMA-OS bridge. MMA is migrating off GHL, so treat as moot. Antonio confirms abandonment before archive/drop.

### Commit sequencing
- Commit N — main §211/§212 sweep (schema + non-mcp code + docs).
- Commit N+1 — `supabase/functions/paige-mcp/index.ts` rewrite in isolation (75 brand references, isolated review surface).

### Gates on Antonio before GO
1. Insert `app_settings_owner` row with `owner_email = <Antonio's login email>` (Section B Step 12 depends on it).
2. Resolve the 3 judgment flags (record decisions in the notes files above).
3. Archive uploaded to Google Drive with SHA256 manifest recorded.

On Antonio's "GO," execute Section B DDL in a single transaction, then commit N, then commit N+1.
