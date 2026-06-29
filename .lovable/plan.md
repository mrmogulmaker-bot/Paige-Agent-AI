## Goal
Right now Signatures, Business Credit, Owner Credit, Banking, and Cash Flow live as **five separate admin pages** AND as **five tabs inside each Contact**. That's duplicated, fragmented, and not wired to the client portal. Consolidate everything into one **Funding Readiness Lens** that is per-client, visible to both Admin and Client, and rolls up into an analytics view.

## What Lives Where Today
- Admin sidebar: 5 standalone pages (`/admin/signatures`, `/admin/business-credit`, `/admin/owner-credit`, `/admin/banking`, `/admin/banking` for cash flow)
- Contact Detail tabs: same 5 sections, but actually wired per-client
- Client portal: nothing — clients can't see their own credit, banking, signatures, or cash-flow data inside Build to Fund Workspace

## Target Architecture

```text
                     ┌────────────────────────────────────────┐
                     │   FUNDING READINESS LENS (per client)  │
                     │                                        │
                     │   • Owner Credit                       │
                     │   • Business Credit                    │
                     │   • Banking                            │
                     │   • Cash Flow                          │
                     │   • Signatures & Agreements            │
                     │   • Readiness Score (composite)        │
                     └─────┬────────────────────┬─────────────┘
                           │                    │
              ┌────────────▼─────────┐   ┌──────▼──────────────┐
              │  Admin: ContactDetail │   │ Client: /workspace/ │
              │  → "Funding Lens" tab │   │ funding-readiness   │
              └────────────┬─────────┘   └──────┬──────────────┘
                           │                    │
                           └─────────┬──────────┘
                                     │
                         ┌───────────▼────────────┐
                         │  /admin/funding-lens   │
                         │  Cross-client roll-up  │
                         │  + reportable analytics│
                         └────────────────────────┘
```

## Build Order

### 1. Collapse the admin sidebar
Replace the 5 standalone items with **one** entry: **"Funding Readiness Lens"** → `/admin/funding-lens`. The old routes redirect there (no broken bookmarks). Signatures gets folded in as a sub-tab (it really is a funding-readiness artifact).

### 2. New shared component: `<FundingReadinessLens contactId={…} mode="admin|client" />`
- Re-uses the existing `BusinessCreditTab`, `OwnerCreditTab`, `BankingTab`, `CashFlowTab` so we don't rewrite anything that already works.
- Adds a **Signatures sub-tab** (envelopes filtered to that client).
- Adds a top **Readiness Snapshot strip**: FICO range, business bureau scores, bank balance trend, runway months, # signed agreements, composite readiness score (0–100).
- `mode="client"` hides admin-only controls (coach notes, internal lender match scores) and shows education copy + privacy reminder.

### 3. Wire it into ContactDetail
Replace the 5 separate tabs on `/admin/contacts/:id` with a single **"Funding Lens"** tab that renders `<FundingReadinessLens mode="admin" />`. Existing Deals / Tasks / Notes / Files tabs stay.

### 4. Expose it in the Client Portal
- New route `/workspace/funding-readiness` rendering `<FundingReadinessLens mode="client" />` scoped to the logged-in client.
- Add "Funding Readiness" to `WorkspaceLayout` nav.
- White-labeled (no Paige branding) per BTF rules.

### 5. Cross-client analytics page `/admin/funding-lens`
Two views, toggled at the top:
- **Roster view** — table of every contact with their readiness snapshot columns (sortable, filterable by lifecycle/coach/tag, click-through to the per-client lens).
- **Analytics view** — distribution charts: FICO buckets, business credit buckets, banking health, signature completion rate, readiness-score histogram, week-over-week trend.

Backed by a new SQL view `contact_readiness_rollup` that joins the existing credit/banking/cash-flow/signature tables into one row per `contact_id`.

### 6. MCP exposure (so MMA OS Claude can read the lens)
Add three read-only tools to `paige-mcp`:
- `get_funding_readiness(contact_id)` — full snapshot
- `list_funding_readiness(filter)` — roster
- `get_readiness_analytics()` — aggregates

## What Stays Out
- No new data capture. We're consolidating views over existing tables, not changing what's collected.
- No change to the `paige_signature_envelopes`, credit, or banking schemas.
- Stripe/Plaid intake flows are untouched.

## Technical Notes
- New files: `src/components/funding-lens/FundingReadinessLens.tsx`, `SignaturesSubTab.tsx`, `ReadinessSnapshotStrip.tsx`, `RosterTable.tsx`, `AnalyticsCharts.tsx`; new pages `src/pages/admin/FundingLensHub.tsx`, `src/pages/workspace/WorkspaceFundingReadiness.tsx`.
- Edited: `AdminLayout.tsx` (sidebar collapse + redirects), `ContactDetail.tsx` (tabs), `WorkspaceLayout.tsx` + `App.tsx` (routes), `paige-mcp/index.ts` (3 tools).
- Migration: `contact_readiness_rollup` view + composite scoring SQL function; RLS so clients see only their own row, coaches see assigned, admins see all.
- Old pages (`BusinessCreditAdmin.tsx` etc.) deleted after the redirect ships — they're already replaced by the per-client tabs.

## Open Question
For the composite **Readiness Score (0–100)**, do you want me to use the existing `funding_readiness_scores` table's formula (already a 0–100 deductible model), or compute a fresh one from the rolled-up snapshot? I'd default to the existing table if it's already populated, falling back to a computed score when blank.
