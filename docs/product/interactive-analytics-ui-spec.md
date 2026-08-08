# Interactive Analytics UI — LOCKED SPEC

**Status:** Approved by Antonio Cook 2026-08-08 (owner ruling: "Robust interactive analytics with impressive UI — moved Wave S2 → MVP"). Details this document.
**Owner:** Product (Antonio) with Cowork.
**Build owner:** Claude Code, when Analytics surface work fires (post-launch-blockers, post-Playwright queue, per game plan).
**Doctrine anchors:** §11, §22, §25, §29, §35, §36, §7, §9, §17 in `CLAUDE.md`.
**Research grounding:** market synthesis (Section 4 below); BRD line 178.

---

## 1. Purpose

The BRD names "Robust interactive analytics with impressive UI" as a MUST-HAVE MVP capability — best-in-class §11/§25 interactive analytics surface, not a static dashboard. This spec defines what that means: what analytics each persona (coach, consultant, agency) actually wants, how agencies read data across their sub-accounts, the surface behavior across all 5 account types, the interaction patterns worth stealing from the industry's best, and where motion and 3D actually earn their pixels versus where they hurt readability.

Without this spec, "interactive analytics with impressive UI" resolves to "another orb-filled dashboard" — cheesy tell, hurts scanability, wastes the differentiator. With this spec, Analytics becomes a real MVP pillar operators can't get elsewhere.

---

## 2. What we're NOT building

- **3D charts.** Rotating pies, tilted bars, WebGL-rendered line graphs — universally rejected in the market research. They hurt read speed without adding information. Charts stay flat and precise.
- **Particle backgrounds behind data.** Cool once, unreadable at 3pm on a Tuesday. Motion belongs on chrome, not underneath the numbers.
- **A single "God" dashboard everyone shares.** Different personas read different data. The spec below is stakeholder-scoped.
- **A separate analytics application.** Analytics is a universal surface INSIDE Paige (per §35), reachable from the same shell as Command Center, Marketplace, Setup — not a bolt-on report tool.
- **Real-time-for-real-time's-sake.** A ticking counter on a metric that only matters weekly is theater. Real-time is reserved for signals where the operator's decision actually changes if the number flips (at-risk client detection, revenue events).

---

## 3. Design principles (non-negotiable)

1. **Calm KPI row up top, detail on demand.** Every analytics surface opens with a small set of at-a-glance signals. Detail lives one interaction away, never demanded until the operator asks (Stripe + Linear pattern).
2. **No chart is a dead end.** Every data point on every chart drills into the rows/events behind it (Stripe "Explore" pattern). Analytics that stops at a summary is a broken product.
3. **Filters inherit the surface's state.** If the operator has filtered their client list to "at-risk this month," Analytics on that surface shows metrics for that filtered set — not the whole roster (Linear Insights pattern). Analytics chases context, not the other way around.
4. **Motion serves scanning speed, never fights it.** Spring transitions on data updates, direction-aware hover highlights, shared-element FLIP between summary and drill-down. Motion that slows a read is a bug.
5. **Every metric ties to a next action.** If a KPI can be surfaced but doesn't inform a decision, cut it. The market research is explicit: over-built analytics dashboards get abandoned.
6. **Honest metrics only (§13).** A metric computed from an unreconciled table (like current God-dashboard MRR) is not shown as real. When the underlying pipeline is untrustworthy, the metric is labeled as such — or hidden — until it's real.
7. **Per-persona framing, not one-size-fits-all.** A coach's analytics ≠ a consultant's ≠ an agency's ≠ Super Admin's. Same primitives, different curated defaults.

---

## 4. Research grounding — what each persona actually wants

Synthesis of 2026-08-08 market research (CoachAccountable, Kajabi, Practice, PaperBell, Bonsai, HoneyBook, AgencyAnalytics, HighLevel, Databox, Cyfe, Whatagraph, plus best-in-class UI references from Stripe / Linear / Vercel).

### 4.a — Coaches want four buckets

Referenced from CoachAccountable's shipped analytics + CoachingPortal's guidance:
- **Compliance** — attendance, action-step completion, homework return rate
- **Performance** — goal progress, confidence ratings, milestone hits
- **Recovery / retention risk** — late replies, skipped homework, cancelled sessions, vague goal-setting (early warning, not lagging churn)
- **Renewal readiness** — renewal interest signals, testimonial-ready clients

**Coach anti-pattern (from research):** over-built dashboards coaches abandon. Small set of at-a-glance signals with per-client drill-down beats a wall of graphs every time.

### 4.b — Consultants want the standard quartet

Referenced from Bonsai + HoneyBook + Motion.io positioning:
- **Utilization %** — billable hours / capacity, per consultant + team-wide
- **Project profitability (live, not month-end)** — revenue on the project minus time cost, computed continuously
- **Retainer health** — active retainers, days-until-renewal, at-risk retainers
- **Pipeline value** — weighted pipeline by stage

### 4.c — Agencies read data in a specific pattern (critical)

The BIG finding from research on AgencyAnalytics, Databox, HighLevel — agencies don't do aggregate OR drill-down, they do **BOTH deliberately split**:

- **Roll-up dashboard** aggregates up to ~50 clients into one view for high-level trend spotting (total spend, conversions, ROAS across all clients).
- **Per-client dashboard** carries the drill-down detail with filters and dimensions.

**By agency size:**
- **5-client agency** — lives primarily in per-client dashboards; roll-up isn't worth the abstraction
- **20–50-client agency** — roll-up as ENTRY surface, click into a specific client only when a KPI flags
- **50+-client agency** — needs a THIRD layer (grouped roll-ups by vertical/team/region), because a flat 50-client roll-up collapses signal

**Universal agency drill pattern:** click a client row in the roll-up → mini-dashboard expands inline (spend, conversions, top campaign, last creative refresh) → click through to the full per-client view. Three depths, one gesture between each.

Agencies ALSO want **agency-admin metrics** — onboarding time per new client, report-generation time saved, cross-client trend spotting. Not just client KPIs; also "how healthy is my own agency operation."

### 4.d — Interactive UI patterns worth stealing

1. **Linear Insights** — analytics behind a tab, filters as the interaction. The chart IS the query editor.
2. **Stripe Dashboard "Explore"** — every chart has an Explore button that opens the chart alongside a data table; clicking a cell reveals underlying events.
3. **Vercel Dashboard** — direction-aware hover (Framer Motion `layoutId`). Hover highlight slides between items following mouse direction. Cheap technically, feels alive.
4. **Vercel Analytics** — hover-reveal breakdowns. Hovering a headline number reveals the breakdown (country, OS, device) without cluttering the resting state.
5. **Roll-up → click-to-expand mini-dashboard → full client** (AgencyAnalytics) — three depths, one gesture.
6. **"Calm KPI row up top, detail on demand"** (Stripe + Linear both do it) — headline scan first, drill down never demanded until the user asks.

### 4.e — Where 3D / motion actually earns pixels (§22 discipline)

**Honest research finding:** no best-in-class ANALYTICS UI uses heavy 3D/WebGL for the charts themselves. Production analytics UIs deliberately keep chart pixels flat and readable and spend motion elsewhere.

**Where motion + 3D belong on an analytics surface:**
- **Chrome, not data** — hero fields, sidebar ambience, loading/transition "cutscenes" between summary and drill-down
- **Celebratory moments** — when a KPI hits a threshold (revenue target hit, first 10 clients, milestone), a genuine WebGL/particle beat that fires ONCE then rests
- **Data updates** — spring transitions on chart value changes (not the chart shape itself)
- **Drill-down transitions** — shared-element FLIP between summary and detail; the chart appears to zoom into the underlying rows (Framer Motion `layoutId`)
- **Ambient sidebar particle field** — very subtle, indicates "Paige is watching this in real time"

**Rule:** motion serves scanning speed, never fights it. If a chart's data-update animation slows the read, kill it.

---

## 5. Surface-by-surface behavior (by account type)

### 5.a — Super Admin / God (the BEST version, per owner ask)

The reference implementation. Everything else layers on top of this or scopes down from it.

**Primary surface:** dedicated `Analytics` route in Super Admin console, with 3 tabs:

1. **Fleet** — cross-tenant rollup at platform scope
2. **Revenue** — MRR/ARR/churn/expansion, gated on honest data (§13: if reconciliation pipeline is untrustworthy, the metric shows a "reconciling…" state, not a fake number)
3. **Operations** — Paige's own operating metrics (model-router spend, cost per tenant, at-risk-tenant flags, break-glass access count, promo usage)

**Fleet tab structure (the marquee):**
- Calm KPI row: total tenants active / new-this-week / churned-this-week / active promo count / at-risk tenant count
- Below: a **fleet map** — every tenant as a card with a health micro-chart (7-day activity sparkline + at-risk flag if lit). Grouped by tier (Solo / Agency / Enterprise) or by health (green/yellow/red).
- Click any tenant card → mini-dashboard expands inline (Section 5.a interaction pattern) with that tenant's key metrics
- Click through → operator enters "Viewing as [tenant name]" impersonation mode (per Agent UI Placement spec §5b) to see their full analytics

**Where the WebGL / motion earns its pixels here:**
- **Hero moment on Fleet tab load** — a cinematic "waking up the platform" beat (2-3s), spring-choreographed KPI row filling in, subtle particle field in sidebar. Fires ONCE per session then rests.
- **At-risk tenant flag** — a soft pulse animation on the card (motion-safe fallback: static red dot)
- **Drill-down transition** — the tenant card expands via shared-element FLIP into the mini-dashboard
- **Celebratory beat** — when the fleet hits milestones (100 tenants, 1000 clients across fleet, $100k MRR crossed), a real cinematic beat plays; audio optional (muted by default)

**Interaction patterns:**
- ⌘K launcher (from Agent UI Placement spec) supports Analytics queries directly: "show me tenants with churn risk this week" opens the Fleet tab pre-filtered
- Filters inherit URL state (shareable "top-10-Agency-tenants-by-MRR" links)
- Every chart has an Explore button (Stripe pattern) → drops into a data table with the events behind the aggregate

### 5.b — Agency (multi-sub-account owner)

Same primitives as Super Admin Fleet, scoped to the agency's sub-accounts only.

**Primary surface:** Analytics route in the agency's main app, with 2 tabs:

1. **Agency roll-up** — cross-sub-account rollup (bounded by RLS to sub-accounts under this agency — §9 non-negotiable)
2. **Per-sub-account** — filter/select a sub-account, see that sub-account's full analytics (as if operating as them per Agent UI Placement §5b impersonation flow)

**Roll-up structure (per research):**
- Calm KPI row: total active clients across sub-accounts / new-this-week / at-risk-across-fleet / cross-sub-account MRR (if agency owns the billing) / avg session completion rate
- Below: sub-account cards, each with a health micro-chart. Sortable by revenue, client count, at-risk count, activity.
- **Groupable when >20 sub-accounts** — group by vertical (coaching / consulting / marketing), by team, or by region. Ships when an agency crosses 20 sub-accounts (auto-suggested in the UI, opt-in).
- Click sub-account card → mini-dashboard expands (last 7 days' key metrics)
- Click through → operator enters "Viewing as [sub-account name]" impersonation

**Agency-admin metrics tab (secondary):**
- Onboarding time per new sub-account (how fast agency admin can set up a new client)
- Report generation time saved (compared to prior tools)
- Cross-sub-account trend spotting (e.g., "3 sub-accounts all seeing engagement dip this week — pattern?")
- Sub-account health-check compliance (which sub-accounts have completed their Jarvis 10 checks per BRD §6.2)

**Agency chat-scope switcher (from Agent UI Placement §5a) works IN Analytics too** — agency-view shows roll-up, switching to a sub-account narrows analytics to that scope.

### 5.c — Solo tenant / sub-account (functionally identical)

**Primary surface:** Analytics route in the tenant's main app, with 3 tabs (or 4 for consultants):

1. **Business** — the tenant's own operating metrics
2. **Clients** — per-client analytics (curated per persona; see 5.c.i–iii below)
3. **Growth** — pipeline, conversion, revenue trends
4. **Team** (only if the tenant has team members) — team utilization + performance

**Business tab KPIs (universal):**
- Active clients, at-risk count, new-this-month, churned-this-month
- MRR from retainers + one-time revenue this month
- Time saved by Paige actions (drafts approved, tasks auto-completed)
- Systems Check status (Jarvis 10-check completion)

**Clients tab — persona-specific curation:**

#### 5.c.i — Coach persona defaults

Curated tabs within Clients:
- **Compliance** — attendance % / homework return rate / action-step completion, per client + roster-wide
- **Performance** — goal progress, milestone hits, confidence rating trends
- **At-risk** — late-reply flag / skipped-session flag / engagement dip flag, prioritized list
- **Renewal readiness** — clients approaching renewal, testimonial-ready clients

Each client's row is a mini-sparkline of their journey; click expands to their full client detail.

#### 5.c.ii — Consultant persona defaults

Curated tabs within Clients:
- **Utilization** — billable hours vs capacity per week
- **Project profitability** — revenue on each active engagement minus time cost, LIVE (not month-end)
- **Retainer health** — active retainers, days-until-renewal, at-risk retainers
- **Pipeline** — weighted pipeline by stage

#### 5.c.iii — Agency (as a sub-account, when the agency is running a specific client's account) persona defaults

Curated tabs within Clients:
- **Campaign performance** — spend / conversions / ROAS per active campaign
- **Creative refresh cadence** — how fresh is the ad creative
- **Client-facing report readiness** — what's ready to send to the client, what needs attention
- **Client health** — engagement + billing health

### 5.d — Client (Customer Portal)

Analytics ≠ dashboards for the client. Clients see **their own journey progress**, not aggregated business metrics.

**Primary surface:** the Client Portal's Journey pillar (per Customer Portal Owner Trilogy Matrix, pillar 1) IS the client's analytics — progress bars, milestone completion, upcoming sessions, personal wins. No dashboard chrome, no KPI row. Editorial narrative-driven view: "You've completed 8 of 12 modules. Next up: [module]."

Clients do NOT see:
- Their coach's business metrics
- Cross-client comparisons
- Any aggregate metrics
- Anything from the tenant's Business/Growth/Team tabs

### 5.e — Marketing / landing site

**No analytics surface.** Marketing site sells; it doesn't dashboard. (Same rule as §11 banner discipline — marketing site's job is conversion.)

---

## 6. Interaction patterns (universal across surfaces)

Every Paige analytics surface implements these patterns consistently:

1. **Calm KPI row up top** — 4-6 headline numbers, large type, minimal chrome. Scannable in 2 seconds.
2. **Hover-reveal breakdowns** — hover any headline number → breakdown (by segment, by time, by dimension) fades in. Doesn't require a click.
3. **Every chart has an Explore button** — opens the chart alongside a data table with the underlying events. Click any table row → drills to the specific record.
4. **Filters inherit URL state** — shareable links carry filter state. Operators send "check this" links to each other.
5. **Filters chase context** — analytics on a filtered client list shows metrics for that filtered set (Linear pattern).
6. **⌘K launcher supports analytics queries** — "show me clients trending at-risk" opens the right surface pre-filtered.
7. **Time-range picker in a consistent position** — top-right, keyboard-accessible (`T` shortcut). Default: last 30 days.
8. **Direction-aware hover** — highlight slides between items following mouse direction (Framer Motion `layoutId`).
9. **Drill-down transition = shared-element FLIP** — summary card expands into detail view via spring animation, not modal pop.
10. **Comparison mode** — every metric has a "vs previous period" comparison (percent change + directional arrow) visible on hover or in the Explore view.

---

## 7. Motion + 3D discipline (§22 applied to analytics)

**Where motion + 3D EARN their pixels on analytics surfaces:**

- **Hero moment on tab load** (Fleet on Super Admin especially) — cinematic 2-3s intro with spring-choreographed KPI filling in + subtle particle field. Fires ONCE per session then rests.
- **Ambient sidebar** — very subtle particle field or slow-drift shader gradient. Communicates "Paige is watching in real time." Motion-safe fallback: static gradient.
- **Data update spring transitions** — chart values ease-in to new numbers over ~300ms.
- **Drill-down FLIP** — shared-element transition between summary and detail.
- **Celebratory beats** — genuine cinematic moment (WebGL) fires ONCE when a milestone hits (fleet 100 tenants, tenant $100k MRR, client 100 milestones). Never plays on every load.

**Where they DON'T:**
- On the chart pixels themselves. Charts stay flat, precise, readable.
- Behind data. Particle backgrounds behind numbers are anti-patterns.
- On every load. Cinematic beats are rare, earned, and skippable.
- Scroll-jacked reveals. Analytics is a work surface, not marketing.
- Real-time counters on metrics that don't matter real-time (theater).

**Motion-safe binding — every animation writes its own reduced-motion fallback per §22.** If OS-level reduced motion is on, particles pause, hero cutscene skips to end state, data-update transitions become instant cuts.

---

## 8. Data model + backend requirements

Analytics surfaces are computed on top of existing Paige data, plus a small dedicated analytics-aggregation layer.

**Existing tables** (no change to schema): tenants, sub_accounts, clients, deals, retainers, sessions, appointments, tasks, communications_log, marketplace_installs, platform_subscriptions, promo_accounts.

**New analytics primitives needed:**
- **`analytics_aggregates`** — pre-computed rollups (daily/weekly/monthly) per tenant + per sub-account + per agency + fleet-wide. Refreshed by `pg_cron` job. Reduces read cost on high-volume metric queries.
- **`analytics_events`** — high-volume event stream (each Paige action, each session completion, each retainer renewal). Time-series indexed. Powers Explore drill-down.
- **`analytics_saved_views`** — filter/time-range/segment combinations users have saved for quick reload.

**RLS discipline:**
- Solo tenant sees only their own data
- Sub-account sees only their own data (never sibling sub-accounts under the same agency)
- Agency sees rollup of their sub-accounts only (never other agencies' sub-accounts)
- Super Admin sees fleet-wide (with break-glass audit trail per §17 for cross-tenant PII drills)

**Honest computation floor (§13):**
- Any metric computed from an unreconciled source table (like current MRR from the 3-stores/2-webhooks unreconciled state per BRD line 531) shows "Reconciling…" state, NOT a made-up number
- Once reconciliation ships, the metric goes live with a small "verified" badge

---

## 9. Owed downstream work

1. **Analytics surface primitive** — shared `@/components/analytics/` folder. Calm KPI row primitive, chart wrapper with Explore button, mini-dashboard expansion primitive, filter bar with URL-state sync, time-range picker with keyboard shortcut. Foundation everything else builds on.
2. **`analytics_aggregates` + `analytics_events` migrations** — with pg_cron refresh job. §47 commit-same-beat.
3. **Super Admin Fleet tab** — the marquee surface, first build. Motion cutscene + fleet map + tenant cards + drill-down FLIP.
4. **Super Admin Revenue + Operations tabs** — after Fleet lands.
5. **Agency Analytics — roll-up + per-sub-account tabs** — reuses the primitive, scopes by RLS.
6. **Solo/Sub-account Analytics** — Business + Clients (persona-curated) + Growth + Team tabs. Curation defaults switchable by tenant persona choice (coach/consultant/agency-sub).
7. **Client Portal Journey pillar** — client-facing analytics (per Owner Trilogy Matrix pillar 1). Editorial narrative, not dashboard chrome.
8. **⌘K launcher analytics integration** — "show me [X]" queries pre-filter analytics surfaces.
9. **Comparison mode** — every metric shows vs-previous-period on hover.
10. **Saved views** — power-user pattern; ships in a later slice.
11. **Motion library scoping** — Framer Motion layoutId primitives + WebGL hero cutscene reused from `PaigeScene` pattern (three.js/R3F) — do NOT rebuild.

---

## 10. Verification requirements when this ships

- **§32 dual-leg** — fidelity + behavioral. Behavioral must drive the actual surfaces on live prod: Super Admin loads Fleet → sees real fleet data; agency loads roll-up → sees only their sub-accounts (RLS proof); tenant loads Clients tab → sees only their own clients.
- **§32.b SET ROLE authenticated repros** — verify RLS across all 5 account types × all 4 tabs (Fleet/Revenue/Ops on Super Admin, Roll-up/Per-sub on agency, Business/Clients/Growth/Team on tenant, Journey on client portal). Cross-tenant reads MUST 403 in every case.
- **§37 producer inventory** on every analytics query — 8 caller classes each.
- **§39 peer-gate** independent of author on RLS + analytics_aggregates refresh logic (both are load-bearing for §9 tenant isolation).
- **§32.c post-deploy live-drive** — Playwright headless drives one script per surface × per account type combination, screenshot artifact per drive, confirm expected metrics render correctly.
- **§13 honesty audit** — every metric that reads from an unreconciled table shows "Reconciling…" not a number. Verified via SET ROLE + query inspection.
- **§25 taste review** — design critic pass against Stripe / Linear / Vercel bar. Verify calm KPI row, hover-reveals, Explore drill-down, and drill-down FLIP all feel right. Motion-safe fallbacks verified.
- **Persona defaults verification** — a coach account sees compliance/performance/at-risk/renewal tabs by default; a consultant sees utilization/profitability/retainers/pipeline; not swapped.

---

## 11. Non-goals of this spec

- **The visual design of each chart** — that's design work (Antonio + Figma AI + Claude Code translation).
- **Specific brand/tenant color theming of charts** — inherits from the design token system per §11, no per-chart override needed.
- **AI-generated insights ("Paige noticed X")** — those live in the Paige chat surface (Agent UI Placement spec), not as chart annotations. Analytics shows data; Paige interprets in conversation.
- **BI-tool-level custom query building** — Explore is drill-down, not a query builder. Advanced power-user querying is deferred post-MVP.
- **Data export to CSV / PDF report generation** — likely needed but not in v1. Ships as a follow-up when demand justifies.
- **Multi-tenant benchmarking** ("your coaching business vs the median coach on the platform") — real Owner Analytics pillar work per Owner Trilogy; not in this MVP spec.

---

## 12. Related doctrine cross-refs

- **§7** — Paige is the intelligent client portal; analytics for the client is the Journey pillar, not a dashboard.
- **§9** — Tenant/operator seam; RLS across every analytics surface non-negotiable.
- **§11** — World-class UI floor; analytics surfaces held to Stripe / Linear / Vercel bar.
- **§13** — Honest reporting; unreconciled metrics never presented as real.
- **§17** — $1B governance; Super Admin break-glass access to cross-tenant PII audited.
- **§20** — Chat is the control surface; Paige's insights live in chat, not chart annotations.
- **§22** — Cinematic bar; motion + 3D belong on chrome (hero, cutscene, celebratory beats), not chart pixels.
- **§25** — See it before you ship it; design-critic pass mandatory.
- **§29** — Bold swing; real WebGL for the hero cutscene, not CSS approximation.
- **§35** — OS north star; Analytics is one of the 5 universal surfaces.
- **§36** — Intuitiveness moat; every metric ties to a next action, non-technical operator succeeds in 5 minutes.

---

## 13. Related BRD anchors

- **BRD line 178** — "Robust interactive analytics with impressive UI — moved Wave S2 → MVP. Best-in-class §11/§25 interactive analytics surface, not a static dashboard." Owner ruling 2026-08-08.
- **BRD line 189** — Owner Trilogy Owner Analytics pillar (#100/#97), planned.
- **BRD line 511-512, 523-524, 537-538** — success metrics that this Analytics surface computes and reports.
- **BRD line 531** — instrumentation honesty caveat: live revenue metrics depend on B-Platform #56 + B-Meter #57 + reconciliation. Until those land, MRR/ARR shows "Reconciling…".
- **BRD line 574** — Analytics as one of the 5 universal surfaces per §35.

---

## 14. Open items for future owner rulings

- **Celebratory beats — which specific milestones deserve one?** Fleet 100 tenants ✓, tenant $100k MRR ✓, client 100 milestones? Others? Owner to lock the list before build.
- **Saved views scope in v1** — ship saved views day-one or defer? Recommendation: defer, but wire the schema so it's a small later PR.
- **Data export in v1** — likely enough operators will ask for CSV export that we should ship it in v1. Owner to confirm.
- **Grouped roll-ups on the Agency surface** — auto-suggest when >20 sub-accounts, or make it always-available? Recommendation: auto-suggest at 20, always-available.
