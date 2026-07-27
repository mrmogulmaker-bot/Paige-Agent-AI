# Operator Command Center — Surface Hierarchy Spec

**Owner:** IA / UX-strategy (Slice 1a — OPERATOR tier). **Status:** buildable spec — the Build phase implements exactly this.
**Route:** `/admin` index for `godMode` (`isPlatformStaff && activeTenantId === null`). Today that index HARD-REDIRECTS platform staff to Fleet (`src/pages/Admin.tsx:299`). This spec replaces the redirect with a real operator home.
**Composition parent:** rebuilds the *proven* `PracticeOverview.tsx` pattern (PageShell wide → plain PageHeader → lead act → StatRow context → attention rail → drill list) on a CLEAN component (§30/§31 — new home, do NOT bolt onto the Fleet redirect). Reuses `@/components/ui/page` + `@/components/ui/chart` (`ChartContainer`/`ChartTooltipContent`, `--chart-1..6`). No fourth chart style.

The question this surface answers in <5s: **"What on my platform needs me right now, how much money is at stake, and where do I reach Paige to act on it?"**

---

## 0. The one design decision that makes this SUPERIOR (the mandate)

Tenants currently look better than the operator. This surface out-classes `PracticeOverview` by being **denser, money-led, and drillable** — it opens on real fleet WORK (tenants bleeding revenue) the way the tenant page opens on drafts-to-approve, but with a platform-scale revenue frame the tenant page never carries. Same design family (§6): identical primitives, identical gold budget, identical plain header. Different altitude: the operator sees a *portfolio*, not a *practice*.

---

## 1. THE LEAD ELEMENT (what the operator sees first, above the fold)

**`SectionCard` "Tenants needing you" — the at-risk drill list, rendered as `DataTableShell`.**
Source: `operator_at_risk_tenants(14)` → real per-tenant rows `{ name, tier, mrr_cents, reason, last_active }`, ordered MRR-desc (biggest money first). Each row carries the **one gold act on the page**: a `Button variant="gold"` **"Reach out"** (deep-links to the tenant / opens the Paige outreach draft). Row cells: business name (link to `/admin/platform/tenants/:id`), tier `StatePill` (neutral), MRR (`tabular-nums`), reason badge (`--warning` for dunning/suspended, `--muted` for silence), last-active relative time.

This LEADS because it is the only section that is both real per-item work AND directly actionable — it is the operator's `DraftsAwaitingPanel` equivalent. The card header shows the count + total MRR-at-risk (`operator_dashboard_metrics.dunning.mrr_cents` for the dunning slice, and the row-sum for the rest) so the headline dollar figure sits with the work.

**Honest empty (§13):** when the RPC returns zero rows → crafted `EmptyState` (tone `brand`, `ShieldCheck` glyph): **"Every tenant is healthy."** / "No dunning, no suspensions, no established tenant gone quiet. Paige is watching the fleet and will surface a business here the moment one needs you." NEVER a fabricated row, NEVER a placeholder zero.

> Gold appears ONLY on the "Reach out" act here (and on a live "on" `StatePill` if used). Never on a KPI, a chart series, a resting border, or a tier pill (§11).

---

## 2. FULL TOP-TO-BOTTOM SECTION ORDER

Each section is present-guarded (§13): it renders only when its RPC key is present; a key with no basis today gets a reserved EmptyState (§5), never a fabricated value. Every number gates on `is_platform_admin()` server-side.

| # | Section | Purpose | Data source (RPC key) | Primitive / card |
|---|---------|---------|------------------------|------------------|
| — | **PageHeader** (`variant="plain"`) | Identity + range control. Eyebrow "Platform" · title "Fleet at a glance" · description "Every business you run, the revenue in motion, and exactly which tenants need you today." Actions: `DateRangePicker` (drives `p_window_days`). NO hero banner — work leads (§11). | — | `PageHeader` + `DateRangePicker` |
| 1 | **Paige, Chief of Staff** (entry tile) | The operator's Paige, made MORE prominent than any tenant's. See §3. | live open-`paige_actions` count = `operator_dashboard_metrics.fleet_paige_actions` (as ambient badge, NOT a queue) | full-width `SectionCard` w/ `GlyphPlate` (Bot) + gold `Button` "Open Paige" → `/admin/playbook` |
| 2 | **Tenants needing you** (LEAD, §1) | The real fleet work + the one gold act. | `operator_at_risk_tenants(14)` rows; header $ from `dunning.mrr_cents` | `SectionCard` → `DataTableShell` (or `EmptyState`) |
| 3 | **Fleet KPIs** (dense StatPill row) | The platform's vital signs at a glance — dense pills, NOT big stat cards. | `operator_dashboard_metrics`: `mrr_cents`, `arr_cents`, `active_tenants.total`, `new_tenants`, `wau_tenants`, `trial_conversion_pct`, `arpa_cents`, `total_platform_users` | `StatRow cols={4}` of `StatPill` (each present-guarded; only pills whose key is in payload render) |
| 4 | **Fleet by tier** (composition) | Where the tenant base sits: individual / standalone / agency / enterprise split. The portfolio rollup (§4). | `operator_dashboard_metrics.active_tenants.{individual,standalone,agency,enterprise}` | `SectionCard` → tokenized **donut/bar** via `chart.tsx` `ChartContainer` (`--chart-1..4`), legend = tier + count. Each tier segment links into a Fleet filter. |
| 5 | **Revenue at risk** (money detail) | The dunning picture beneath the lead: count of businesses past-due + MRR exposed. | `operator_dashboard_metrics.dunning.{count,mrr_cents}` + `at_risk_count` | `SectionCard` → 2× `StatTile` (count, MRR) with a ghost link "Open dunning" |
| 6 | **Growth over time** (RESERVED, §5) | MRR/tenant trend — the premium chart slot. | NO real source yet (no snapshot table). Reserved. | `SectionCard` → crafted "coming soon" `EmptyState` naming the trigger (see §5). NEVER a fake series. |
| 7 | **C-Suite drafts / platform approvals** (RESERVED-thin, §5) | Operator-scope drafts awaiting approval. | `paige_pending_approvals` is tenant-RLS-scoped → operator gets `scope:"mine"` (thin/honest at best). Pre-§42 there is no C-Suite roster. | `SectionCard` → thin real list IF `scope:mine` returns rows, else reserved `EmptyState`. Labeled generically "Drafts awaiting you", NOT "C-Suite" until §42 exists. |

Sections 6 and 7 sit BELOW the fold on purpose: the operator's first screen is act (Paige) → work (at-risk) → vitals (KPIs) → shape (tier). Reserved/thin slots never compete with real work for the top of the page.

---

## 3. WHERE PAIGE SURFACES (Chief of Staff — more prominent than tenants)

The tenant page has no Paige tile — Paige lives only in the left `hubs` nav (`{ label:"Paige", href:"/admin/playbook" }`). The operator surface goes further: **Paige is section 1, a full-width `SectionCard` directly under the header**, above even the at-risk work — because the owner wants operator Paige *more* prominent.

- Card: `GlyphPlate` (Bot) + "Paige, your Chief of Staff" + one line "She's watching every business you run — tell her who to reach, what to draft, or what to check." + `Button variant="gold"` **"Open Paige"** → `/admin/playbook` (resolves to `PaigePlatformDesk` when `activeTenantId===null`).
- Ambient signal only (§20 — control lives in chat, not a panel): a neutral `StatePill` showing `fleet_paige_actions` open actions ("N in motion"). This is a KPI badge, NOT a per-item queue — do not render it as a worklist.
- **BLOCKING BUILD CAVEAT (confirm before shipping):** `/admin/playbook` is wrapped in `AdminOnly` = `RoleGate allow={["admin"]}` (`src/pages/Admin.tsx:36,382`). Platform staff whose role is NOT `"admin"` will hit the gate and the "Open Paige" CTA will dead-end. The Build phase MUST verify platform staff clear `RoleGate allow={["admin"]}`; if they do not, widen that gate to platform staff (add `isPlatformStaff` to the allow logic) so the operator Paige hub is reachable. Do not ship a gold CTA into a locked door (§32 — a green build is not a working render).

Gold is spent on "Open Paige" and "Reach out" — the two act moments. If both are on screen, that is acceptable (both are genuine acts); no other gold anywhere.

---

## 4. PORTFOLIO / SUBSIDIARY ROLLUP TREATMENT

The operator's "portfolio" is the **whole tenant fleet** (not agency sub-accounts — that is Slice B, `agency_portfolio_metrics`, reusing the chart-cards built here).

- The rollup is **Section 4 "Fleet by tier"**: the `active_tenants` tier split rendered as a tokenized donut/bar (`chart.tsx`, `--chart-1..4`). This is the operator-scale analog of the agency leaderboard — composition of the base, one glance.
- Total lives in the KPI row (`active_tenants.total`) so the rollup card is pure shape, not a repeated number.
- Each tier segment is a **drill seam**: click → Fleet Console filtered to that account_type. The Command Center orients; Fleet operates. No tenant-row list is duplicated here (that would fragment Fleet, §18) — the at-risk list (§1) is the only per-tenant list, and it is scoped to *work*, not browse.
- Agency/enterprise tiers in this split are the hook for Slice B: the same donut component parameterizes to `agency_portfolio_metrics.health` for the agency board. Build it reusable.

---

## 5. DELIBERATELY RESERVED / COMING-SOON SLOTS (reads as intentional, not broken)

Every reserved slot is a crafted `EmptyState` inside a real `SectionCard` with a title, an explanatory line, and the **named trigger** that will populate it. It looks designed, not empty (§11 "no bare Loading/return null"). NEVER a fabricated series/count.

| Slot | Why reserved | How it reads (EmptyState copy names the trigger) |
|------|--------------|--------------------------------------------------|
| **Growth over time** (§2 #6) | No MRR-snapshot table exists; `operator_dashboard_metrics` is point-in-time only. | `TrendingUp` glyph · "Your growth curve is being recorded." / "Paige starts plotting fleet MRR and tenant count here as daily snapshots accrue — the first weeks of history are filling in now." |
| **C-Suite drafts** (§2 #7) | `paige_pending_approvals` is tenant-RLS-scoped; operator falls to thin `scope:mine`. §42 C-Suite roster does not exist yet. | Generic label "Drafts awaiting you". If `scope:mine` empty → `PenLine` glyph · "No platform drafts waiting." / "When Paige drafts a fleet-level move for your approval, it lands here." Do NOT name a "C-Suite" that doesn't exist. |
| **Compliance** | `ComplianceAdmin` is a placeholder; `doctrine_120` is a reference registry, not a work queue. | Not its own top-level card in v1. If added: `ShieldCheck` · "Compliance signals are on the roadmap." — never a fabricated violation count. |
| **Infra / deploy alerts** | `DeployHealthAdmin` is a placeholder. | Excluded from v1. Lives in the Deploy Health hub, not the Command Center, until it has a real feed. |
| **§40 revenue-stage awareness** | Genuinely no anchor, no data. | Honest reserved stub only — no tile references it in v1. Referenced here solely to record it is NOT built. |
| **Cohort / retention** | No cohort source. | Not rendered. Future chart-card slot in the "Growth over time" family. |

The rule: a reserved slot that would sit at the top (Growth, drafts) is pushed below the fold; a reserved slot with no honest frame at all (compliance, infra, cohort) is simply omitted from v1 rather than shown as a broken shell.

---

## 6. HOW THIS READS AS SUPERIOR TO THE TENANT `PracticeOverview` (one paragraph)

`PracticeOverview` opens on *one practice's* drafts and a four-tile inbox; the Operator Command Center opens on the *whole fleet's money and risk*, and it is denser and more premium in three concrete, visible ways — while staying one design family (§6): (a) **money leads** — the first real section is a MRR-ordered at-risk tenant table with dollars-at-stake in its header, an altitude the tenant page never reaches, so the operator instantly feels they are running a portfolio, not a to-do list; (b) **dense StatPills, not big stat cards** — the tenant page uses roomy `StatTile` KPI tiles, while the operator packs eight fleet vitals (MRR, ARR, WAU, trial-conversion, ARPA, tenant count, new tenants, users) into a tight `StatPill` row, the "reads-as-expensive" density of Linear/Stripe; (c) **a real tokenized chart** — the tenant page has no chart at all, while the operator's "Fleet by tier" donut (via the hardened `chart.tsx` + `--chart-1..4`) and the reserved "Growth over time" slot give the surface genuine data-viz gravity. Yet the shared DNA is unmistakable and deliberate: same `PageShell width="wide"`, same `variant="plain"` header, same `SectionCard`/`GlyphPlate`/`StatePill`/`EmptyState` primitives, same single-gold-act discipline (here "Reach out" + "Open Paige" instead of "Approve"), same present-guarded honesty. A first-time God user lands and in <5s reads platform STATE (KPI row), what needs ATTENTION (at-risk table), how to reach PAIGE (the prominent Chief-of-Staff tile above the work), and where to DRILL (every tier segment and tenant row links into Fleet) — zero admin-CRUD feel, the tenant surface's premium bar cleared and raised.
