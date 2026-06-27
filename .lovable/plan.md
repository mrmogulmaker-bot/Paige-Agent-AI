# Phase 7 Plan — Sections 3 & 4

Sections 1 + 2 (notification drawer + duplicate bell removal) ship directly in build mode. Plan below covers the two larger asks.

Header bell audit confirmed: `AdminLayout.tsx` lines 136-138 render both `AdminBridgeBell` and the legacy `NotificationBell` (member-facing credit alerts / dispute updates). Legacy bell will be removed from the admin header in Section 2; it remains in the member dashboard chrome where it belongs.

---

## SECTION 3 — Data Visualization for Phase 3 Correction Tables

### 3.1 New routes

Per-client (added as tabs inside `ContactDetail.tsx`, no new top-level routes):
- `business-credit` tab → `BusinessCreditTab.tsx`
- `owner-credit` tab → `OwnerCreditTab.tsx` (read-only, no dispute UI)
- `banking` tab → `BankingTab.tsx`
- `cash-flow` tab → `CashFlowTab.tsx`

Master cross-client views (top-level admin routes, registered in `Admin.tsx`):
- `/admin/business-credit` → `BusinessCreditOverview.tsx`
- `/admin/owner-credit` → `OwnerCreditOverview.tsx`
- `/admin/banking` → `BankingOverview.tsx` (current `BankingAdmin.tsx` will be refactored)
- `/admin/cash-flow` → `CashFlowOverview.tsx`

Nav entry under existing "More" dropdown: a new group **"Financial Intel"** with the four overviews.

### 3.2 Shared building blocks

- `src/lib/financial/queries.ts` — typed wrappers around the 5 tables (latest-per-client, time-series, joins to `clients`).
- `src/components/financial/ScoreBadge.tsx`, `ScoreTrendArrow.tsx`, `Sparkline.tsx` (recharts `<LineChart>` mini), `RunwayPill.tsx`.
- `useLatestPerClient(table, clientId?)` hook — DISTINCT ON (client_id) ORDER BY captured_at DESC.

### 3.3 Per-client tab specs

| Tab | Source tables | Key UI |
|---|---|---|
| Business credit | `paige_business_credit_profiles` | Bureau score grid (D&B Paydex / Intelliscore / Equifax Business), trade-line count, 90d sparkline, "Last pulled" + Refresh (calls existing `nav-sync` fn) |
| Owner credit | `paige_owner_credit_snapshots` | TU/EQ/EX score cards, factors list, alerts table; banner "Read-only — disputes managed in member dashboard per Doctrine §84" |
| Banking | `paige_bank_connections`, `paige_bank_transactions` | Institution cards (status pill), accounts table, last 25 txns w/ filter, Refresh button (invokes `plaid-sync`) |
| Cash flow | `paige_cash_flow_snapshots` | KPI cards: runway days, deposits/withdrawals 30d, avg balance; composite Funding Readiness gauge (0–100) computed client-side from BC + OC + CF snapshots |

### 3.4 Master overview specs

Each is a sortable `Table` with: client name (link to ContactDetail), key metric, last-updated timestamp, trend arrow, action menu. Default sort: most-stale-first so Antonio can spot data gaps. Filters: tier (from `tier_state`), assigned coach, score band. CSV export button.

### 3.5 RAG / Knowledge-base wiring

Paige already uses `rag_documents` + `match_rag_documents()` (pgvector). Plan:

1. Migration adds `document_type` values `'business_credit_snapshot'`, `'owner_credit_snapshot'`, `'banking_snapshot'`, `'cash_flow_snapshot'`, `'client_financial_brief'`.
2. New edge function `embed-client-financials`:
   - Triggered by `pg_net` on INSERT into each of the 5 tables (DB trigger → http_post).
   - Builds a deterministic markdown brief per row (e.g. "Client Acme Inc — Paydex 78, Intelliscore 72, pulled 2026-06-25, ↑ from 71"), embeds via Lovable AI Gateway (`text-embedding-3-small`), upserts into `rag_documents` with `metadata = { client_id, source_table, source_row_id, captured_at }`.
   - Idempotent upsert keyed on `(source_table, source_row_id)` so re-embeds replace not duplicate.
3. Nightly cron edge function `rebuild-client-financial-brief` composes ONE rolled-up "capital readiness assessment" doc per client (joins newest row from all 5 tables + recent deals/tasks) so questions like "what's [client]'s capital readiness?" hit a single high-signal chunk.
4. `paige-ai-chat` system prompt gains tool hint: when the question mentions funding-ready / business credit / banking / runway, call `match_rag_documents` with `_document_types` filtered to the new types.
5. RLS: new rag rows are admin/coach-visible only — extend existing `rag_documents` policies to gate financial-typed docs to those roles.

### 3.6 Open questions / assumptions

- Assumption: Antonio wants composite Funding Readiness computed client-side from existing snapshot columns; no new score table.
- Assumption: existing `nav-sync` and `plaid-sync` edge functions exist (or will) for Refresh buttons — if not, buttons render disabled with "Connect Nav/Plaid" CTA.
- Assumption: "READ-ONLY" on owner-credit means no write/dispute actions in admin, but admins can still view the SmartCredit raw data.

### 3.7 Build order

1. Migration: rag doc-type values + RLS extension + DB triggers stub.
2. `embed-client-financials` + `rebuild-client-financial-brief` edge functions.
3. Per-client tabs (highest leverage — Antonio's daily surface).
4. Master overview pages.
5. paige-ai-chat prompt hint + smoke-test queries.

---

## SECTION 4 — Campaign Cockpit + Member Journey

### 4.1 Routes

- `/admin/campaigns` → `CampaignsList.tsx`
- `/admin/campaigns/:key` → `CampaignDetail.tsx`
- `/admin/campaigns/:key/content` → `CampaignContent.tsx`
- ContactDetail gets new tab **Journey** → `ClientJourneyTab.tsx`

Nav entry: new top-level **"Campaigns"** in the admin top bar (between Pipeline and More).

### 4.2 Bridge client (Paige → MMA OS, read-through)

New shared helper `supabase/functions/_shared/mmaOsCampaigns.ts` wrapping the 6 verbs Claude is shipping on MMA OS bridge v15:
- `list_active_campaigns`
- `get_campaign_detail(campaign_key)`
- `list_contact_enrollments(email|contact_id)`
- `enroll_contact_manual(campaign_key, email, source)`
- `exit_contact_from_campaign(campaign_key, email, reason)`
- `get_campaign_metrics(campaign_key, period)`
- plus `get_journey(email|contact_id)` mega-verb

Two thin Paige edge functions wrap them so the frontend never holds the bridge secret:
- `mma-campaigns-read` — proxies all read verbs (GET-style)
- `mma-campaigns-write` — proxies enroll/exit, requires admin role (`has_role(auth.uid(), 'admin')`)

Both write all actions to `audit_logs` and (on enroll/exit) push a `paige_admin_notifications` row via the existing bridge so the bell pings.

### 4.3 Cache layer

Claude's weekly cron mirrors campaign state. On the Paige side:
- New table `paige_campaign_cache` (campaign_key PK, snapshot jsonb, refreshed_at). Populated by edge function `refresh-campaign-cache` (cron every 15 min + manual "Refresh" button).
- New table `paige_journey_cache` (contact_id PK, snapshot jsonb, refreshed_at, ttl 1h). Lazy: populated on first journey view, refreshed by user button.
- Both tables: admin/coach read RLS; service_role write; GRANTS per house rules.

UI reads cache first, falls back to live bridge call if stale > 30 min (campaigns) / 1 h (journey).

### 4.4 Page specs

**CampaignsList** — Table: name, status pill (active/paused/killed), enrolled, completed, last fire, open-rate sparkline. Row click → detail. Top-bar "Refresh cache" button.

**CampaignDetail** — Header with Pause/Resume/Kill buttons (confirm dialog → `mma-campaigns-write`). Tabs:
- *Enrollments* — paginated table filtered by status, with per-row "Exit" action.
- *Schedule* — vertical step list (step #, channel, day offset, subject/preview, requires_approval flag).
- *Metrics* — recharts area+line: sends/day, open %, click %, completion %, churn %.

**CampaignContent** — Each step rendered as a `Card`: subject, rendered body with sample personalization (uses payload from `get_campaign_detail`), "Edit in Notion" deep link from content registry pointer.

**ClientJourneyTab (the SaaS exit asset)**
- Single vertical timeline (`<TimelineEvent>` component) merging events from `get_journey` payload:
  tier changes, campaign enrollments + sends + opens + clicks, milestones (LLC/EIN/funding), CS conversations, bookings, signatures, social comments, business-credit deltas.
- Event grouping by day; filter chips (Comms, Milestones, Money, Coaching, All).
- Action bar at top: **Enroll in campaign** (modal w/ campaign picker → `enroll_contact_manual`), **Send one-off message** (existing send-message fn), **Open conversation** (deep-link `/admin/conversations/:id`).
- "Export PDF" button → calls new `journey-export-pdf` edge function (server-rendered, for due-diligence handoff).

ContactDetail also gets the three action buttons in its header (Enroll / Send / Open) — same handlers as Journey tab.

### 4.5 Doctrine §93 enforcement

Add a top-of-file comment block to each new file: "Reads through paige-bridge → MMA OS. Per Doctrine §93, never query MMA OS Supabase directly."

### 4.6 Open questions / assumptions

- Assumption: bridge bearer auth uses existing `MMA_OS_BRIDGE_API_KEY` secret already configured in `_shared/mmaOsBridge.ts`. If MMA OS issues a separate key for the new verbs, add `MMA_OS_BRIDGE_READ_KEY` secret.
- Assumption: `get_journey` payload is large — we'll page comms events past 90 days behind a "Load older" button.
- Assumption: "Kill" is a hard archive (not delete); confirm with Claude when implementing.
- PDF export is nice-to-have — confirm priority vs cut.

### 4.7 Build order

1. Migration: `paige_campaign_cache`, `paige_journey_cache`, RLS, GRANTs.
2. Edge functions: `mma-campaigns-read`, `mma-campaigns-write`, `refresh-campaign-cache`.
3. `CampaignsList` (smallest unit of progress, validates bridge).
4. `CampaignDetail` + Content tab.
5. `ClientJourneyTab` + ContactDetail action buttons.
6. `journey-export-pdf` (optional last).

---

## Verification gates (both sections)

- TypeScript clean (`tsgo`).
- Supabase linter clean after each migration.
- Smoke-test: `match_rag_documents` returns a financial brief when asked "is Acme funding-ready?".
- Smoke-test: `mma-campaigns-read` health check returns campaign list; manual enroll writes to `audit_logs` + fires admin notification.

Awaiting approval for Sections 3 + 4; will build Sections 1 + 2 directly once we flip to build mode.
