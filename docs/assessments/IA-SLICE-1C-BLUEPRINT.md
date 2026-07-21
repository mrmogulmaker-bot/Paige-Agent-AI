> **SUPERSEDED (2026-07-21).** The single source of truth for Slice 1c is now
> `docs/audits/platform-ia-slice-1c-handoff.md` (REVISED, FINAL — 8-item nav with
> Marketplace elevated to position #3 per CLAUDE.md §18 OS north-star). This blueprint's
> five grounded blockers (B1–B5) are absorbed into that handoff; kept here for reference
> only. Where the two conflict, the handoff wins.

# IA Slice 1c — Locked Target-IA Blueprint

Owner-locked 2026-07-21 (decision packet → "OK"). Single source of truth for the
`/admin` nav restructure (23 surfaces → 7 top-nav). Every sub-slice verifies against
this doc — no drift. Produced + pressure-tested by the design crew (grounding ×3 →
architect + adversarial verifier + consumer-clarity officer).

## Final top-nav (7 items)

1. **Dashboard** (`/admin`) — segmented view: **Overview** · **Reports** (`AnalyticsDashboard`, folded from `/admin/analytics`; keep the `FundingGate`-wrapped `FundingMatchAccuracy`). `/admin/analytics` → redirect into the reports view.
2. **Paige** (`/admin/paige`, new layout route) — sub-tabs **Chat** (index → `PaigeWorkspace`) · **Her team** (`SubAgentsAdmin`) · **Actions** (`ActionsQueue` — renamed from "What she can do"; the label must match the surface, which is the runtime queue, not a capability catalog) · **Skills** (`SkillsHub`) · **Knowledge** (lifted from `PaigeConsole`). Per-child route gates preserved (do NOT gate at the layout level).
3. **People** (`/admin/people`, new layout route) — tabs **Clients** · **Leads** (default Kanban view, Table toggle; honors `?deal=`) · **Coaches** · **Team**. Collapses Contacts + `/admin/clients` + Members&Roles + Coaches; Pipeline → the Leads Kanban view. All read the existing `clients`/`deals`/`user_roles` tables — no schema change.
4. **Growth** (dropdown) — **Campaigns** · **Vibe Studio** · **Brand Kit** (single, unified — the one data-correctness fix; two live editors over `tenants.brand` today).
5. **Client Hub** (dropdown) — **Client Portal** (renamed from Portal Studio) · **Calendar** · **Planning**. (Label = "Client Hub", per the clarity officer: "Client Experience" over-promises with Planning inside; "Hub" is an honest grouping.)
6. **Marketplace** (`/admin/marketplace`) — unchanged.
7. **Automation** (dropdown) — **Workflows** · **Integrations** only.

Header **profile dropdown** (new, top-right): identity · **View as** (relocated lens, all 3 render states) · Workspace Settings · Personal Settings · Client Agreement · Support Tickets · Help/Docs · Sign out. Removes Settings/Client Agreement/Support Tickets from top-nav; "View as" pill + standalone Sign-out relocate here.

## Operator §9 moves (to God console, route → `PlatformStaffOnly`)

The **route gate is the fix**; the nav move is hygiene. Operator must retain reach in GOD_MORE.

- **Legal Documents** (`/admin/legal`) — **live leak**: tenant admins can author the platform's Terms/Privacy today. → SHIPPED Slice 1c-i.
- **Usage Analytics** (`/admin/observability/usage`) — unscoped platform telemetry. → SHIPPED Slice 1c-i.
- **Affiliates** (`/admin/affiliates`) — built as a global/operator program (no `tenant_id`). SPLIT, don't relocate: operator program → new God route `PlatformStaffOnly`; **preserve the tenant staff `MyReferralsPanel`** (personal referrals) on `/admin/affiliates`. → Slice 1c-ii.

Already done: Error Tracking + Security Canary (1a). Deferred: Maintenance (mixed surface, #402). Funding-gated: Brokers (1a).

## Build sequencing (lowest-risk-first; each slice = its own crew + PR + verify)

- **1c-i** `[config + 2 gate flips]` — **SHIPPED**: Legal Documents + Usage Analytics → operator (route `PlatformStaffOnly` + nav to GOD_MORE). The two live §9 leaks.
- **1c-ii** `[config, careful]` — Affiliates split (new God `PlatformStaffOnly` route for the program; keep `/admin/affiliates` = `MyReferralsPanel`).
- **1c-iii** `[net-new]` — Header profile dropdown + identity wiring; relocate View-as + Sign-out; remove Settings/Client Agreement/Support from top-nav.
- **1c-iv** `[config]` — Nav grouping re-homes: Growth + Client Hub dropdowns; Automation trim; Portal→Client Portal rename. Old routes → `<Navigate>` redirects.
- **1c-v** `[net-new]` — Reports → Dashboard second view; dissolve Insights hub; `/admin/analytics` redirect.
- **1c-vi** `[net-new]` — Paige hub container (`/admin/paige` router strip; compact, no double-header; per-child gates; Knowledge lift).
- **1c-vii** `[net-new, highest integration — LAST]` — People container (`/admin/people` tabs; Leads Kanban↔Table fusion honoring `?deal=`).
- **1c-viii** `[net-new]` — Brand Kit unification (one `/admin/brand` editor; strip brand from Client Portal, preview reads `useBrandKit` read-only).

## Blockers the crew caught (must be honored in the relevant slice)

- **B1 — Pipeline dissolving orphans 4 funding surfaces.** The Pipeline hub is the only nav home for Funding Journey / Funding Portfolio / Funding Readiness Lens (funding-gated). Do NOT delete the Pipeline hub (1c-vii) until these re-home (funding-gated sub-menu under People→Leads or a funding surface).
- **B2 — `/admin/pipeline` deep-link + `?deal=`.** Live callers (`ContactDealsSection`, `PipelineSettings`) navigate with `?deal=`. Keep mounted / redirect preserving the query; Leads Kanban must honor `?deal=`.
- **B3 — `/admin/clients` is load-bearing.** Client-file back-nav uses it; keep `/admin/clients` + `user/:userId` + `internal/:clientId` mounted or redirect with param preservation.
- **B4 — operator moves: route gate is the fix, not the nav move.** (Applied 1c-i for Legal/Usage; Affiliates must split, not wrap.)
- **B5 — Paige hub gate divergence.** Sub-Agents/Skills ungated, Actions admin+staff, Chat AdminOnly today. Keep per-child gates on the `<Outlet/>` children; do not gate at the layout level.
- **Growth href collision.** A new "Growth" group must NOT href `/admin/growth` (existing redirect → `/admin/campaigns?tab=pages`); point at `/admin/campaigns`.
- **Mobile `currentSection` title.** Items moved into the profile dropdown leave `moreNavItems`; add them to a lookup or the mobile header shows the "Admin" fallback.

## Follow-ups filed (out of the nav restructure)

- Agreements + AgreementAdmin schema-consolidation (two redundant client-agreement editors on different backends — needs canonical-schema + migration decision).
- Tenant-owned referral program (if Affiliates should become tenant-scoped).
- "Actions" tab true capability-kind catalog (`paige_action_kinds`) vs the runtime queue (§13 honest gap).
- Planning as the soft member of Client Hub — revisit if the container needs tightening.
