# Slice 1c Handoff — Platform IA Restructure + People Model + Analytics + Chat UX + Brain Integration (REVISED, FINAL)

**For:** Claude Code · **From:** Cowork + Owner (Antonio) locked decisions · **Date:** 2026-07-21

**Supersedes:**
- All prior drafts of `docs/audits/platform-ia-slice-1c-handoff.md`
- `docs/audits/platform-ia-restructure-decisions-2026-07-21.md` (decision packet — closed; answers locked below)
- `docs/audits/people-model-strategy-2026-07-21.md` (strategy draft — closed; model locked below)
- `docs/assessments/IA-SLICE-1C-BLUEPRINT.md` (Claude Code's blueprint — the 5 grounded blockers are absorbed into this doc; the 7-item nav is redesigned per owner review)

**Depends on:**
- Slice 1a (#182 merged 1ffe3158) — §9 operator moves + §2 Brokers gate
- Slice 1b (#183 merged 5e52dbca) — Dashboard telemetry removal, View-as rename, orb unification
- Slice 1c-i (PR #184 — awaiting merge) — Legal Documents + Usage Analytics → operator/God

**This is the ONE source of truth for Slice 1c.** Any prior guidance conflicts with this doc → this doc wins.

---

## 0. Executive summary

Three cohesive redesign moves shipped as ordered sub-slices:

1. **Nav restructure to 8 top-level items** organized by audience/purpose, not by tool. Five universal surfaces (Paige · Command Center · Marketplace · Analytics · Setup — work in any Paige-run context per §18 OS north star) + three business-Playbook-specific surfaces (Clients · Team · Growth). Paige-first, human-first, dual-audience as design law.
2. **Data model refactor** — Members & Roles team-grouped by function (Sales · Delivery · Ops · Support · Marketing · Leadership); Contacts two-axis (Lifecycle × Temperature) with auto-classification.
3. **Surface upgrades** — Paige chat UX modernization (copy/inline-mic/slash-palette), Analytics as first-class tiered surface (SMB → Enterprise), Command Center reframed as role-personalized decisions surface, Team as live ops floor.
4. **Brain Integration Requirements** per surface — explicit L1/L4/L6/§8/§10/§16 wire-ups so nothing ends up siloed.

Ratifies Claude Code's 1c-i shipped work. Absorbs their B1 catch by design (Pipeline stays under Clients, funding surfaces gated). Bigger restructure than 1c-i/1c-ii scope — split into 7 sub-slices, lowest-risk-first, each with full crew discipline and merge-on-green.

**Ship-order-of-operations gate:** all sub-slices land before Lane B (money spine). No paid customers on the current 23-item nav.

---

## 1. Design law — non-negotiable

**Dual-audience principle:** every surface serves TWO audiences simultaneously with equal weight — Paige (autonomous when she can be) AND the humans on the team (who work directly, escalate to Paige, or take over from her mid-flow). Neither is second-class. The platform's design must feel equally natural whether you're a Setter grinding 80 dials a day or an Owner who barely opens the app because Paige handles most of it.

**Practical implications this generates (enforced in every surface spec):**
- Every surface has a **"My Queue"** view for the logged-in user's personal work — default view for anyone who isn't Owner
- Every Paige draft has "Take over and edit" next to "Approve as-is" — human seizes the pen anytime
- Every human-owned thread/task has "Hand to Paige" — human hands back at any point
- Every automation is inspectable + overridable
- Every dashboard shows Human vs. Paige contribution honestly (no vanity metrics)

**Paige-first, not Paige-only.** She's the first nav item and the default landing, matching §7/§14 doctrine and the pitch ("hire an AI COO"). But she orchestrates a human team — she doesn't replace them.

---

## 2. Target IA — 8 top-nav items (universal + context-specific per §18)

Per CLAUDE.md §18 (OS north star) the 8-item nav splits into **universal** surfaces (work in ANY Paige-run context — business, household, portfolio, device, search) and **context-specific** surfaces (driven by the active Playbook — currently the business Playbook; future household/portfolio Playbooks would swap in their own equivalents).

| # | Item | Contains | Audience | OS scope |
|---|---|---|---|---|
| 1 | **Paige** | Chat · Her team (departments visible per §8) · Drafts awaiting approval · Actions · Skills · Knowledge base | AI-first, human-inspectable | Universal |
| 2 | **Command Center** | Role-personalized decisions surface: today's briefing · real-time KPI strip · at-risk alerts · quick actions | Human-first, Paige-fed | Universal |
| 3 | **Marketplace** | App Store for the Paige OS — tenant skills · third-party integrations · community Playbooks · vertical accelerators · Paige-native capability unlocks · business/context templates. First-class ecosystem destination per §18. | Discovery (any user) | Universal |
| 4 | **Clients** | External audience: People (Contacts) · Pipeline · Conversations · Client Portal · Delivery (Calendar + sessions) | Dual — humans work directly, Paige assists | Business Playbook |
| 5 | **Team** | Internal audience + LIVE OPS FLOOR: Live scoreboard · Live availability · Handoff queue · Members & Roles · Assignments · Comp (v2) | Human-first, real-time | Business Playbook |
| 6 | **Growth** | Campaigns · Landing Pages & Forms (Vibe Studio embedded) · Brand Kit · Content library · Ads/Social | Dual | Business Playbook |
| 7 | **Analytics** | Overview · Revenue · Sales team · Delivery/retention · Cohorts & LTV · **AI Insights** panel · **Human vs Paige contribution** breakout | Dual (tiered by plan) | Universal |
| 8 | **Setup** | Workspace · Integrations · Playbooks (industry presets, all vertical gating lives here) · Billing · Legal (client agreements + templates) · Security & permissions · Team management | Admin | Universal |

**Header (right side):**
- Search (Cmd-K) — global
- Notifications (bell)
- Dark mode toggle
- Profile dropdown — role toggle (View as Admin/Coach/Client) · Workspace settings · Personal settings · Help · Sign out

**Nav count = 8.** Five universal surfaces (Paige · Command Center · Marketplace · Analytics · Setup) + three business-Playbook-specific surfaces (Clients · Team · Growth). Every surface has a distinct daily job. No overflow menu. No placeholder slots. When future Playbooks ship (household, portfolio, etc.), the three context-specific slots swap; the five universal slots stay identical.

**What gets absorbed/killed from the current 23-item structure:**
- Dashboard → Command Center (reframe)
- Marketplace → **elevated to top-nav position #3 as ecosystem App Store per §18** (previously proposed as a Paige sub-tab — corrected)
- Portal Studio → Clients → Client Portal sub-tab (renamed to Client Portal)
- Vibe Studio → Growth → Landing Pages & Forms sub-tab
- Campaigns → Growth (top-level Growth container replaces separate Campaigns nav)
- Contacts (dropdown) → Clients → People sub-tab
- Pipeline → Clients → Pipeline sub-tab (funding surfaces preserved as gated sub-features)
- Calendar → Clients → Delivery sub-tab
- Planning → Team → My Queue (individual tasks) + Clients → Delivery (client-facing session planning)
- Automation dropdown → contents redistributed: Paige's Team + Actions + Skills → inside Paige (per D4 revised — see §3.1); Workflows + Integrations → Setup
- Insights → Analytics (top-level, own surface)
- `... More` overflow (11 items) → all redistributed to Setup or Super Admin

---

## 3. Surface-by-surface deep spec

### 3.1 Paige (nav item #1, default landing)

**Purpose:** the AI COO surface. Chat with her, see what she's doing, approve/edit her drafts, extend her capabilities.

**Sub-tabs (left rail inside Paige surface):**
1. **Chat** — modern conversational surface (see chat UX spec §5)
2. **Her team** — the departments visible (Owner Ops · Client Experience per §8 action bus + §16 10-department model). Real-time status of each sub-agent, action-bus queue, cross-department handoffs.
3. **Drafts awaiting you** — every action Paige has drafted that needs human approval, ranked by urgency + business impact. Batch-approve, edit-then-approve, reject-with-reason.
4. **Actions** *(renamed from "What she can do" per clarity officer)* — the runtime action queue: what Paige can currently do + what she's actively doing. NOT a capability catalog (that's Skills below).
5. **Skills** — the capability catalog Paige has been given. Includes native skills + Marketplace-added capabilities. User-friendly language ("Paige can now: draft LinkedIn posts in your voice · qualify inbound leads · schedule client sessions...")
6. **Knowledge** — what Paige knows about your business. Documents uploaded, patterns learned, memory captured (§L6).
*(Marketplace is a first-class top-nav item at position #3 per §18 OS doctrine — NOT a Paige sub-tab. Paige can still access Marketplace capabilities via slash-command, but the discovery destination lives at the OS-level top-nav. See §3.8 for the Marketplace surface spec.)*

**Two-way handoff affordances (enforced everywhere):**
- Every draft: "Approve as-is" · "Take over and edit" · "Reject with reason" (feeds L2 evals)
- Every active Paige-owned task: "Take over from here" button
- Every human-owned thread on other surfaces (Conversations, Pipeline, Delivery): "Hand to Paige" button + policy selector ("run via nurture playbook · notify me if X · run autonomously")

**Right panel (collapsible, per chat UX spec §5):**
- Paige status pill (ready/busy/blocked)
- Department readiness (Owner Ops · Client Experience — READY/HANDOFF badges)
- Active work-a-customer selector (focus Paige on one client)
- Customize Paige button

**Brain integration:**
- Chat writes to `paige_llm_trace` (L1 observability)
- Message thumbs up/down writes to L2 evals feedback
- Drafts written to action-bus (§8) queue with `autonomy_lane`
- Approvals fire `paige_action_kinds` execution
- Memory captured via `captureToMemory` (L6) on outcome
- Reasoning invokes `runReasoning` (L4) per phase
- Marketplace activations write to `tenant_skills` config + notify Paige of new capability

### 3.2 Command Center (nav item #2)

**Purpose:** the "CEO opens the app at 7am" surface. Decision-focused, not metrics-wall. Personalized by role.

**Default view = role-personalized** (based on logged-in user's assigned Members & Roles):

- **Owner view:** Revenue today · Cash collected MTD · Drafts to approve (count + top 3) · At-risk clients · Team scorecard summary · Today's calendar highlights · Anomaly alerts
- **Sales Manager view:** Team scoreboard (setter/closer live stats) · Handoff queue depth · Deals at risk · Coaching moments flagged by Paige
- **Setter view:** "You have N booked calls today, N pending confirmation" · Show rate this week · Bookings today (progress vs target) · Next call in queue · Recent Paige-drafted outreach for review
- **Closer view:** "You have N calls today, $N pipeline, close rate this month" · Next call · Deals awaiting proposal · Recent conversation summaries
- **Success Coach view:** "N clients need touch this week, N at-risk flags" · Upcoming sessions · Recent client wins to acknowledge · Retention drivers
- **Coach view:** Today's sessions · Group call attendance · Client engagement flags · Paige-drafted recaps for review
- **Ops Manager view:** Team scorecard rollup · KPI dashboard · Pending decisions · System health

**Toggle at top:** "My view · Team view · Business view" (Team view = my direct reports' rollup; Business view = whole-org overview, Owner-equivalent regardless of role)

**Not on this surface:** deep analytics (that's Analytics, §3.6). Full pipeline (that's Clients → Pipeline). Metric configuration (that's Setup).

**Brain integration:**
- Reads from `paige_llm_events` (L1) for real-time activity
- Reads from `paige_action_kinds` queue (§8) for drafts awaiting
- Reads department readiness from §16 `paige_departments`
- Reads at-risk flags from L6 memory (auto-classified stale-client alerts per §7.4 of this doc)
- Personalization driven by `user_roles` + role→view config

### 3.3 Clients (nav item #3)

**Purpose:** every external-audience thing lives here — the "people you work FOR" side of the practice.

**Sub-tabs:**
1. **People** (formerly Contacts) — the two-axis contact database. See §7 for full data model.
2. **Pipeline** — Kanban of deals. Preserves Claude Code's B1 blocker resolution: funding surfaces (Funding Journey · Portfolio · Readiness Lens · additional funding-specific views) live as **gated sub-features under Pipeline**, visible only when Funding & Capital-Raising Playbook is opted-in. B1 solved by design.
3. **Conversations** — unified inbox (multi-channel: SMS · WhatsApp · Email · IG DM · FB Messenger · portal chat). **Placeholder in Slice 1c** with on-voice empty state ("Your unified inbox — coming soon"). Real build = Communications workstream (post-1c). Paige-augmented, human-primary (see §6).
4. **Client Portal** — configure what clients see when they sign in (renamed from Portal Studio). Live preview panel.
5. **Delivery** — Calendar of sessions · appointment list · engagement tracking · Client 360 view per client (activity + deals + delivery + comms + sentiment + at-risk score). Absorbs current Calendar top-nav.

**View modes** (across all sub-tabs where relevant):
- **My Queue** (default for non-Owner) — the logged-in user's assigned people/deals/threads
- **Team View** (for Sales Manager+) — team rollup
- **All** (for Owner/Admin) — everything

**Brain integration:**
- Contact events (form fill, booked call, engagement) → fire to `paige_action_kinds` (§8)
- Contact temperature/lifecycle transitions → `captureToMemory` (L6) — "Client X went cold on Y date"
- Auto-classification jobs read from `contact_activity_log`, run through L4 reasoning primitives
- Role assignments determine `My Queue` filter via `user_roles` join
- Client 360 aggregates from L1 traces + L6 memory + `paige_action_kinds` history + `paige_llm_events`
- Pipeline stage transitions fire §8 action-bus events

### 3.4 Team (nav item #4) — LIVE OPS FLOOR

**Purpose:** where a Sales Manager LIVES during the workday. Real-time performance visibility, live handoffs, team accountability. Not admin.

**Sub-tabs:**
1. **Live Scoreboard** *(new — the marquee surface)* — real-time per-person performance leaderboards:
   - Setters: bookings today · show rate today/week · qualified rate · calls made
   - Closers: calls today · close rate today/week · cash collected today/MTD · avg deal size
   - Success Coaches: clients touched today · at-risk saves · retention rate · NPS delta
   - Coaches: sessions completed · attendance rate · client engagement score
   - Comparative rankings (leaderboard cards) + individual detail on click
   - Updates in real-time as events fire (payment, booking, session completion)
2. **Live Availability** *(new)* — floor-view of who's on shift, who's in a call, who's available for handoff. Green/amber/red dots per team member. Sales Manager sees whole floor at a glance.
3. **Handoff Queue** *(new)* — Setter marks lead qualified → shows up in first-available Closer's queue to grab. Real workflow, not manual assignment. Similar patterns for at-risk-client → Success Coach handoff.
4. **Members & Roles** — the admin part (add user, assign role, team assignments). Team-grouped structure per §7.
5. **Assignments** — DRI matrix (who owns which clients/deals/campaigns/projects)
6. **Comp tracking** *(v2 reserved — placeholder sub-tab with "Coming soon" empty state)*

**Brain integration:**
- Live scoreboard reads real-time from event streams (payment, booking, session_completed, deal_advanced, etc.)
- Handoff queue writes to §8 action bus (Setter's qualified-lead action → routes to Closer department)
- Team scorecards feed L2 evals + L1 observability for Paige's own performance tracking (which agents route to which reps successfully)
- Role assignments determine which surfaces/actions a user sees + can do
- Comp tracking (v2) reads from same event streams as scoreboard, applies commission logic

### 3.5 Growth (nav item #5)

**Purpose:** top-of-funnel + marketing engine + brand + acquisition assets.

**Sub-tabs:**
1. **Campaigns** — active campaigns, funnels, results, campaign builder
2. **Landing Pages & Forms** — Vibe Studio embedded here. Full-screen creative canvas preserved (its own visual world) but accessed via this sub-tab. Deep links resolve. "Back to Growth" replaces "Back to Paige" as the exit.
3. **Brand Kit** — single unified brand config (logo · primary/accent colors · typography · voice guidelines). Kills the two-brand-surface problem (was in Portal Studio + Campaigns). One source of truth used by Paige, Landing Pages, Portal, Emails.
4. **Content Library** — assets, snippets, templates, past campaign artifacts
5. **Ads & Social** — paid acquisition + social scheduling (integration surfaces + performance)

**Brain integration:**
- Campaigns fire events to §8 (campaign_launched, form_submitted, funnel_converted)
- Brand Kit config reads by Paige when drafting emails/pages/copy — she uses tenant brand voice automatically
- Landing page performance feeds L1 observability + Analytics revenue attribution
- Vibe Studio outputs (generated pages/forms/assets) captured to L6 memory as tenant's asset library

### 3.6 Analytics (nav item #6)

**Purpose:** deep historical + strategic view + AI-augmented insights. Tiered by plan (Solo → Practice → Studio).

**Sub-tabs:**
1. **Overview** — AI-narrative summary ("Your Q3 was up 22%, driven by X. Watch: retention dipped 4% on the Growth cohort") + top-line KPI strip
2. **Revenue** — MRR/ARR/cash collected · revenue by product/tier · refund rate · payment health
3. **Sales team** — setter/closer performance over time · handoff conversion · pipeline velocity · cash-collected-per-call
4. **Delivery** — program completion · session attendance · engagement scores · at-risk trends · client outcome tracking
5. **Cohorts & LTV** *(Studio tier)* — cohort retention curves · LTV per cohort · LTV:CAC · net revenue retention (target ≥110%) · gross revenue retention
6. **AI Insights** — anomaly cards ("MRR dropped 8% this week — investigate") · narrative summaries · suggested next questions (Amplitude Ask / Tableau Pulse pattern). Uses L4 reasoning + L6 memory.
7. **Human vs. Paige contribution** *(honest measurement — Owner locked in)* — how much of cash-collected came from Paige-drafted outreach vs. human-driven · at-risk saves attributed to Paige flag vs. human catch · drafts approved vs. taken-over vs. rejected. Measures BOTH sides so nobody feels replaced.

**Tier gating:**
- Solo: Overview + Revenue + Sales team (basic) — daily briefing pattern
- Practice: + Delivery · Sales team (full) · scheduled email digests · saved views
- Studio: + Cohorts & LTV · AI Insights · Human vs Paige · custom reports · CSV/PDF export · scheduled alerts · anomaly thresholds

**Not on this surface:** the daily "what needs my attention" — that's Command Center.

**Brain integration:**
- Read-only surface over brain state — no parallel metric-collection layer
- Reads L1 (`paige_llm_trace`, `paige_llm_events`) for activity data
- Reads §8 (`paige_action_kinds` history) for action counts + success rates
- Reads L6 (`paige_memory`) for outcome tracking
- Reads §16 (`paige_departments` metrics) for department-level performance
- AI Insights invokes L4 reasoning primitives for narrative summarization + anomaly detection + suggested questions
- Human vs Paige breakout reads `paige_action_kinds.autonomy_lane` + `paige_actions.taken_over_by_user` + `paige_actions.rejected_at`

### 3.8 Marketplace (nav item #3 — placed here in doc order for insertion time; nav order is #3)

**Purpose:** the App Store for the Paige OS. First-class ecosystem destination per §18 doctrine. Discovery + activation + installation surface for everything that extends what Paige and the platform can do. Universal surface (works in ANY Paige-run context; not business-Playbook-specific).

**Sub-tabs (top of surface):**
1. **Discover** — browse the full catalog with category filters (Skills · Integrations · Playbooks · Templates · Vertical Accelerators). Featured/trending/new sections.
2. **Installed** — what the tenant currently has active. Manage, configure, disable, uninstall.
3. **Skills** *(sub-category)* — Paige-native and community-contributed skills. One-click activate, per-skill configuration.
4. **Integrations** *(sub-category)* — Stripe · Twilio · Vapi · GHL bridge · HubSpot sync · Salesforce sync · calendar providers · email providers · social APIs · etc. Each with clear "what this connects" + credentials flow.
5. **Playbooks** *(sub-category)* — industry accelerators (Coaching default · Consulting · Agency · Funding · Real Estate future · Insurance future · Healthcare future · Legal future). Activating a Playbook loads its role additions, contact fields, pipeline stages, marketplace capabilities, and content-specific surfaces (this is where context-specific nav items get their roster).
6. **Templates** *(sub-category)* — whole business templates a tenant can deploy (setter/closer sales-team template · high-ticket coaching flywheel · agency-fulfillment SOP · etc.). Fast time-to-value for new tenants.
7. **My Requests** — tenant-submitted capability requests + community-voted "what should Paige do next" board (v2 — reserves the slot).

**Every catalog item shows:** what it does · who publishes it · price (free/paid/tiered) · install count · rating · required Playbook or Plan tier · Paige-integration surface (which of L1/L4/L6/§8/§16 it hooks into — technical transparency for enterprise buyers).

**Two-way handoff (per §1 design law):**
- Human browses Marketplace, activates capabilities directly
- Paige can propose Marketplace activations ("You've been drafting a lot of proposals lately — the Proposal Skill in the Marketplace could speed this up. Want me to activate it?"). Confirmation-gated per §15.

**Brain integration:**
- Marketplace activations write to `tenant_skills` config
- New Paige capabilities become available in her slash-palette + skill roster immediately on activation
- Integration credentials stored per-tenant, respected by Paige when making external calls
- Playbook activations fire configuration events to §8 (surface visibility recalculation)
- Uninstalls preserve historical data (don't purge) but disable active use
- Every activation/deactivation logged to `paige_audit_log` (governance per §17)

**Slice 1c scope for Marketplace:**
- Ship the top-nav placement + Discover + Installed + Skills + Integrations + Playbooks sub-tabs
- Templates + My Requests sub-tabs = v2 (reserved with placeholder empty states)
- Existing Marketplace surface content (current 4 categories) migrates to this new structure — no content re-authored, just reorganized
- Broker/Funding capabilities visible only if Funding Playbook opted-in (§2 gating preserved)

**Enterprise implication:** the Marketplace-as-ecosystem framing is what makes Studio-tier and enterprise-agency deals possible long-term. Two-sided marketplace + revenue-share on paid skills = a real business primitive, not just a config screen. The infrastructure ships now; the two-sided commercial model activates in a later wave.

---

### 3.7 Setup (nav item #8 — renumbered from prior #7)

**Purpose:** workspace configuration + admin + billing + legal + integrations + playbooks. All vertical-gating and industry-preset config lives here.

**Sub-tabs:**
1. **Workspace** — tenant name, timezone, defaults, region, branding-adjacent
2. **Integrations** — Stripe, Google Cal, Twilio, Vapi (when Voice ships), external CRMs, etc.
3. **Playbooks** *(where §2 gating lives)* — industry presets: Coaching (default) · Consulting · Agency · Funding · Real Estate (future) · etc. Enabling a Playbook unlocks its role additions, contact fields, pipeline stages, and marketplace capabilities. Broker role, Funding Goal field, Funding Journey/Portfolio/Readiness surfaces all gated here.
4. **Billing** — subscription tier, invoices, payment method, upgrade/downgrade
5. **Legal** — tenant's own client agreements (templates + signed + version history). Consolidates the two current tenant agreement editors. Schema-consolidation filed as follow-up build (#402-adjacent).
6. **Security & Permissions** — role permissions (v2 full matrix), audit log, session management, 2FA
7. **Team Management** — invite/promote/deactivate users, bulk role assignment (also accessible from Team → Members & Roles for the daily-use workflow)

**Explicitly NOT here:** operator-level content (that's Super Admin). Any surface that operates on the tenant's business data (People, Deals, etc.) lives in Clients or Team, not here.

**Brain integration:**
- Playbook enable/disable events fire to §8 (surface-visibility recalculation)
- Integration credentials stored per-tenant, respected by Paige when making external calls
- Legal templates read by Paige when drafting service agreements
- Permission changes propagate to L1 observability (audit trail)

---

## 4. Header profile dropdown (replaces bare icons)

Located top-right, next to notifications + dark mode toggle.

**Menu items (in order):**
1. **View as** (role toggle — relocated from standalone pill per Slice 1b) — Admin / Coach / Client
2. **Workspace settings** — deep-link to Setup → Workspace
3. **Personal settings** — user-scoped preferences (email notifications, timezone override, keyboard shortcuts)
4. **Help / Docs** — external link
5. **Sign out**

**State enum for View-as untouched** — same lesson as Slice 1b setLens() catch. UI location moves, `setLens()` enum stays.

---

## 5. Your Paige chat UX upgrade (folded into §3.1 Paige surface)

Modern chat pattern matching Claude Code / Claude.ai / ChatGPT / Cursor. Delete the "cheesy amateur" tells.

**Message bubbles — hover-revealed action toolbar:**
- User messages: copy · edit · timestamp
- Paige messages: copy · retry/regenerate · thumbs up/thumbs down (feeds L2 evals) · timestamp
- "Copied" toast confirmation on copy click

**Input bar — compact single row (delete the fat "Start Voice Chat" board entirely):**
- Text field (auto-grow up to 6 lines then scroll)
- Right side of input: **attach (+)** · **slash-commands hint** ("/ for commands") · **voice mic** (small icon, same size as attach) · **send** (tertiary weight until composed content exists)
- Voice mic repackages the current voice trigger (do NOT rebuild voice — that's Communications workstream)

**Slash-command palette (replaces always-visible prompt chips):**
- User types `/` → filterable palette appears above input
- Palette items: current 4 chip prompts + tenant-authored commands + Paige-native commands (`/brief` · `/draft-followup` · `/pipeline` · `/at-risk` · `/plan-day` · `/handoff-to-me`)
- Selecting a command inserts template with cursor at first blank
- Extensible per Playbook

**Right panel — collapsible:**
- Default expanded on desktop (>1200px), collapsed on mobile
- Collapse toggle in panel header
- Collapsed state: 40px sliver with icons only
- User preference persisted per session

**Model picker:** hidden by default (Paige auto-routes via §14 model router). Available in Setup → Advanced → Paige Model Routing for tenants who want to override.

**Message meta:** subtle timestamp below each message, shown on hover with action toolbar or on latest message always. Never as heavy header.

---

## 6. Conversations (Clients → Conversations sub-tab) — Placeholder in 1c, real build in Communications workstream

**In Slice 1c:** reserve the sub-tab with a proper on-voice empty state ("Your unified inbox — coming soon. All your client conversations across SMS, WhatsApp, email, and DMs will live here."). NOT `return null`. NOT raw text.

**When real build ships (post-1c Communications workstream, paired with Voice Layer):**
- Three-column layout (Intercom/GHL pattern): thread list left · active thread center · Contact Details panel right
- Filter chips at top of thread list (Unread · All · Recent · Starred)
- Channel filter rail on left (SMS · IG · Email · WhatsApp · Portal chat)
- Contact Details panel pulls from Contacts record (Owner · Tags · Fields · Deals · Lifecycle · Temperature · Recent activity · At-risk score)
- **Human-primary, Paige-augmented:** humans work the inbox by default; Paige drafts suggested replies inline (accept · edit · dismiss); human can hand a thread to Paige to run autonomously with policy
- Sub-tabs inside Conversations (mirrors GHL): Conversations · Manual Actions · Snippets · Trigger Links · Analytics · Settings

---

## 7. People data model (Members & Roles + Contacts)

### 7.1 Members & Roles — team-grouped structure

**Six teams as sections + vertical gating.** A person can hold multiple roles; team grouping derived from role assignments.

**Sales team:**
- Appointment Setter *(aka SDR)*
- Closer *(aka AE)*
- Sales Rep *(generalist for single-seat orgs)*
- Sales Manager
- Sales Director / VP Sales

**Delivery team:**
- Head Coach / Lead Coach
- Group Coach / Fulfillment Coach
- Success Coach / Account Manager
- Content / Curriculum Owner

**Operations team:**
- Admin
- Ops Manager / Integrator
- Finance / Bookkeeper

**Support team:**
- CS Rep / Support Rep
- Community Manager

**Marketing / Growth team:**
- Media Buyer / Ads Lead
- Content Lead / Editor

**Leadership & Access:**
- Owner
- Viewer *(read-only)*

**Vertical-specific (Playbook-gated in Setup):**
- Broker — Funding Playbook only

**Vocabulary policy:** coaching-industry primary (Setter · Closer · Success Coach); SaaS aliases in tooltips (SDR · AE · CSM); tenant can toggle primary vocabulary in Setup → Workspace preferences.

**Data model:**
- `user_roles` extended additively — no existing values dropped
- Team → roles mapping in config table (allows new roles per Playbook without schema change)
- Multi-role additive (junction table if not already)
- Playbook gating uses existing pattern from Slice 1a Brokers (route gate + nav filter + role picker filter)

### 7.2 Contacts — two-axis model

**Axis 1: Lifecycle Stage** (funnel progression, forward-only by default):

| Stage | Definition | Entry trigger |
|---|---|---|
| Subscriber | Opted in for content, not a lead | Newsletter form, social follow |
| Lead | Showed interest, not qualified | Ebook/webinar/discovery form, DM inbound |
| Qualified Lead | Passed qualification, sales-ready | Setter marks · intent+fit threshold · books discovery call |
| Prospect | Active sales conversation, deal exists | Closer takes call, deal past initial stage |
| Client | Closed deal, active | Deal → Closed Won (automatic) |
| Alumni | Completed engagement, not active | Program end + no re-enrollment 30d |
| Evangelist | Active advocate | Manual · high NPS + referral activity |

Plus **Disqualified flag + reason** (separate boolean, preserves Lifecycle history — not a stage).

Backward moves allowed with documented reason. Default forward-only for funnel reporting integrity.

**Axis 2: Temperature** (engagement heat, auto-classified, freely mutable):

| Temperature | Signals |
|---|---|
| Hot | Booked call · pricing/checkout visit · reply <7d · active conversation |
| Warm | Email open+click · portal login · DM reply · content download · re-engagement after 30d |
| Cold | No engagement 30+d · form fill without follow-up 60d · bounces/unsubs |

Independent of Lifecycle. A Client can be Hot (engaged) or Cold (at-risk). Manual override always allowed; auto-classifier waits 24h after manual override.

**Supporting fields:**
- **Contact Type** (multi-select) — Client · Lead · Vendor · Partner · Referral Source · Employee · Former Employee
- **Source** (Original Source, captured on entry, never changes)
- **Owner** (assigned staff)
- **Tags** (freeform)
- **Deal association** (links to Pipeline deals)

### 7.3 Auto-classification rules (Paige-run, all override-able)

**Temperature transitions:**
- → Hot: booked call · pricing/checkout visit · reply <7d · explicit intent form
- → Warm: email open + click · portal login · DM reply · content download · re-engagement after 30d
- → Cold: no engagement 30d (Warm → Cold) · form fill without follow-up 60d · bounces/unsubs

**Lifecycle transitions:**
- Subscriber → Lead: form fill beyond newsletter
- Lead → Qualified Lead: Setter marks · intent+fit signal · books discovery call
- Qualified Lead → Prospect: deal record created
- Prospect → Client: deal → Closed Won (automatic on payment)
- Client → Alumni: program end + no re-enrollment 30d
- Any → Disqualified: manual only with required reason
- Client → Evangelist: manual · high NPS + referral activity

### 7.4 Downgrade/at-risk rules with notification

- Client at Cold for 30d → flag "At Risk" → feeds Command Center "Needs You Today" for Owner + Success Coach
- Client at Cold for 60d + no meeting scheduled → flag "High Churn Risk"
- Lead at Cold for 90d → archive to "Dormant Leads" view

**Migration-day discipline:** flags fire on POST-MIGRATION transitions only, not retroactively for every existing dormant contact. No notification storm.

### 7.5 Role ↔ Stage default ownership + view mode

| Stage | Primary owner | Secondary |
|---|---|---|
| Subscriber | Marketing (Content Lead) | — |
| Lead | Appointment Setter | Ops · Media Buyer |
| Qualified Lead | Setter → Closer handoff | Success Coach observes |
| Prospect | Closer | Success Coach observes |
| Client | Success Coach / Account Manager | Head Coach + Group Coach on delivery |
| Alumni | Success Coach | Community Manager |
| Evangelist | Success Coach | Marketing (case study, referral) |

**Default views (drive My Queue filtering):**
- Setter view = Lead + Qualified Lead, sorted by Temperature (Hot first)
- Closer view = Prospect, sorted by deal age
- Success Coach view = Client, sorted by At-Risk / Cold flag
- Owner view = All
- Call Queue view = personal work queue for Setters/Closers (next 10 people to reach out to)

---

## 8. Ratification — Slice 1c-i (PR #184)

**Already shipped by Claude Code, do NOT re-scope:**
- `/admin/legal` (Legal Documents) → PlatformStaffOnly gate + moved to God console
- `/admin/observability/usage` (Usage Analytics) → operator-only + moved to God console
- Insights tenant hub collapses to plain "Reports" link (no dead one-item dropdown)
- Blueprint doc committed at `docs/assessments/IA-SLICE-1C-BLUEPRINT.md` — mark superseded by THIS doc; keep for reference

**Merge #184 as-is on green.** Its scope is correct and its work is done.

---

## 9. Absorbed catches from Claude Code's blueprint crew (§13 honesty)

**B1 (Pipeline hub anchors 4 funding surfaces):** REAL and important. Their crew caught what my audit missed. Resolution: Pipeline lives as a sub-tab under Clients, and the 4 funding surfaces (Funding Journey · Portfolio · Readiness Lens · additional) remain as Pipeline sub-features, gated behind Funding Playbook opt-in. B1 solved by design, not dodged.

**B4 (operator gate = the real §9 fix):** Already applied in 1c-i. Ratified.

**B5 (Paige hub per-child route gates):** Sub-Agents/Skills currently ungated; Actions/Chat aren't. When absorbing Sub-Agents + Actions + Skills into Paige surface sub-tabs, preserve per-child gates — do NOT apply one layout-level gate. Add to adversarial verifier trap list §11.

**Two more blockers from Claude Code's blueprint** (I don't have detail — the crew's blueprint doc has them; read it before executing §11 adversarial checks).

---

## 10. Sub-slice sequencing — 7 sub-slices, lowest-risk-first

Each sub-slice = own PR, own crew, own §32-equivalent verification, own merge-on-green. All land before Lane B money spine.

**Slice 1c-i** ✅ SHIPPED (Legal + Usage Analytics → operator)

**Slice 1c-ii** — Affiliates split (operator program → God; preserve staff's own "My Referrals" view under Team; tenant `/admin/affiliates` route → PlatformStaffOnly for the operator surface, `/admin/my-referrals` stays for tenant staff). Config-only, one-file scope.

**Slice 1c-iii** — Header profile dropdown build. Move "View as" pill into it. Move Sign out into it. Move Settings-link into it. No new backend; UI + state.

**Slice 1c-iv** — Growth container. Rename Portal Studio → Client Portal (URL alias + 301 redirect). Absorb Vibe Studio + Campaigns as sub-tabs under Growth top-nav. Preserve Vibe Studio fullscreen chrome (its own visual world, accessed via Growth). Deep links resolve.

**Slice 1c-v** — Nav restructure to 7-item target. Delete Insights top-nav (replace with Analytics per §3.6, though Analytics itself may be its own sub-slice depending on scope). Delete `... More` overflow entirely, redistribute all items. Rename `Your Paige` → `Paige` (URL stays `/admin/playbook`).

**Slice 1c-vi** — Paige surface expansion. Absorb Sub-Agents + Actions + Skills as sub-tabs inside Paige. Chat UX upgrade (copy affordance · inline mic · slash palette · collapsible right panel · retry/regenerate). PRESERVE per-child route gates per B5.

**Slice 1c-vii** — Command Center reframe. Role-personalized views. Remove any remaining engineer-telemetry tells. New "Drafts awaiting you" panel (reads from §8 action bus).

**Slice 1c-viii** — Clients container. Absorb Contacts + Pipeline + Client Portal + Calendar + Delivery as sub-tabs. People sub-tab is the CURRENT Contacts UI plus the two-axis extension (Lifecycle × Temperature, auto-classification). Pipeline preserves funding surfaces as gated sub-features. Delivery absorbs Calendar. **Prerequisite:** People data model migration must land in this slice (see §7).

**Slice 1c-ix** — Team surface. Live Scoreboard · Live Availability · Handoff Queue · Members & Roles (team-grouped) · Assignments · Comp placeholder. Absorbs Coaches surface as Members & Roles → Delivery team → Coach role filter. `/admin/coaches` → 301 to `/admin/team/members?team=delivery&role=coach`.

**Slice 1c-x** — Analytics surface. New top-nav item. Overview · Revenue · Sales team · Delivery · Cohorts & LTV (Studio tier) · AI Insights · Human vs Paige contribution. Read-only over brain state, no parallel metric layer.

**Slice 1c-xi** — Setup surface. Consolidate all admin/config: Workspace · Integrations · Playbooks · Billing · Legal · Security · Team Management. Absorbs Automation → Workflows + Integrations under Setup. All vertical-gating configuration lives here.

**Slice 1c-xii** — Marketplace **elevation** to top-nav position #3 per §18 OS doctrine. Ecosystem App Store framing: tenant skills + third-party integrations + community Playbooks + vertical accelerators + capability unlocks + templates. Full surface spec in §3.8. (Reversed direction from prior draft, which incorrectly proposed absorbing Marketplace into Paige — corrected per OS-primitive vs app-primitive distinction.)

Twelve sub-slices total (1c-i shipped, 1c-ii through 1c-xii to go). Some can execute in parallel (iii and iv don't depend on each other). Claude Code's tactical call on parallelism.

**Ship-order gating:** Slice 1c-viii (Clients container) and 1c-ix (Team surface) require the People data model migration. That migration itself is one of the biggest units of work — recommended to land it as a dedicated sub-slice (call it 1c-viii-a) BEFORE the UI slices that depend on it (1c-viii-b Clients UI, 1c-ix Team UI).

---

## 11. Standing discipline — non-negotiable, same as security cluster

- **§18 grounding** on every touched file before edit. Read current shape, understand actual usage, check downstream deps (analytics events, e2e tests, docs, i18n) BEFORE writing.
- **§1 crew** on every sub-slice: build agent + adversarial verifier + compliance officer + integrator. No solo shipping.
- **Adversarial verifier attacks actual policy/state/route**, not just visible copy. Verify invisible state (persisted preferences, enum values, route guards, RLS policies).
- **Compliance officer** checks §2 (verticals gated in Setup → Playbooks, never platform default), §9 (operator surfaces don't leak to tenants), §11 (primitive layer used, no amateur tells), consumer-clarity of every new label.
- **Local gate parity** before push: `changed-file eslint` = 0, `tsc` = 0, `build` succeeds. Absorb pre-existing anys as they surface (proper types, not disabled).
- **Living-rollup** update to `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md` §1 + §2 on every merge with shipped state + stale-audit corrections.
- **Ledger-drift-free** migration naming (`YYYYMMDDHHMMSS_slice1c_<sub>_<description>.sql` matching recorded version).
- **Merge-on-green** with self check-in armed.

---

## 12. Adversarial verifier — traps to look for

### Route + state
- **Route deep-link preservation** — every old URL 301s to new home OR keeps working. Log every redirect in living rollup.
- **Route-guard preservation** — Brokers funding-gate moves with it; Legal Documents PlatformStaffOnly gate stays; Sub-Agents/Skills preserve per-child gates (per B5).
- **State enum vs UI label** — role enum values, lifecycle_stage enum values, temperature enum values UNCHANGED even if labels change. Same lesson as Slice 1b setLens() catch.
- **`Your Paige` string refs** — nav label changes to `Paige`; URL stays `/admin/playbook`. Grep every reference; some change, some don't.
- **View-as toggle relocation** — move UI into profile dropdown; `setLens()` enum untouched.

### Data model
- **Additive migration only** on `user_roles` — do NOT drop existing values.
- **Lifecycle stage backfill** — existing Clients → `lifecycle_stage = client`; existing Pipeline leads → `lead` or `qualified_lead` based on stage.
- **Temperature initial value** — every existing contact gets computed temperature from `last_activity_at` (Cold if unknown).
- **Contact Type multi-select migration** — every existing person keeps role/type.

### Auto-classification
- **Time-decay job** — debounce, batch, respect manual overrides (24h wait).
- **Migration-day notification storm** — retroactive flags gated to post-migration transitions only.

### Analytics + telemetry
- **Rename events on renamed surfaces** — document migration in living rollup.
- **Thumbs up/down feedback wires to L2 evals** (existing pipe from Slice 1b).

### Chat UX
- Voice modal still functional after mic-icon repackage (test end-to-end voice call).
- Slash palette doesn't break in RTL languages.
- Message copy works on user + Paige messages, desktop + mobile.
- Right panel collapse persists across page reloads.

### Team live-ops
- Live Scoreboard updates in real-time on event fire (test with a live payment/booking).
- Handoff Queue routes to first-available Closer (test with multiple Closers in different availability states).
- Availability dots reflect actual state (in-call, on-shift, off).

### Analytics
- All metrics read from brain state, NO parallel collection layer created.
- Human vs Paige breakout reads `paige_action_kinds.autonomy_lane` + action fate (approved/taken-over/rejected) — verify these fields are being populated by Slice 1c-vi's chat UX before Analytics ships.

---

## 13. Compliance officer — checks to run

### §2 hygiene (verticals in Playbooks, never defaults)
- Broker role gated behind Funding Playbook (nav + route + role picker)
- Funding Goal / Revenue columns on Contacts grid gated behind Funding Playbook (or renamed to generic like "Target Value")
- Funding Journey / Portfolio / Readiness surfaces gated behind Funding Playbook (visible as Pipeline sub-features only when opted-in)
- No vertical-specific language leaks into defaults (no "credit repair," "loan officer" in Members & Roles defaults or Contacts default field set)

### §9 hygiene (operator surfaces stay operator)
- Ratify 1c-i moves (Legal + Usage Analytics stay operator)
- Slice 1c-ii Affiliates split (operator program stays operator; tenant staff's own referrals visible)
- No operator-only fields become tenant-visible during any absorption/consolidation

### §11 primitive layer
- Every new surface (Command Center, Clients, Team, Growth, Analytics, Setup) uses PageShell + PageHeader + SectionCard + StatTile from `@/components/ui/page`
- No hand-rolled shells
- Absorb pre-existing anys during whole-file eslint touches — properly typed (LucideIcon, unknown, typed callbacks), not disabled unless documented universal-generic reason
- Every rename touched consistently across nav labels · page titles · aria-labels · in-app copy · docs · analytics events

### Consumer-clarity on new labels
- "Command Center" reads correctly to a coach/consultant/agency owner (not enterprise-only jargon)
- "Team" (internal staff) vs "Clients" (external audience) legible from labels alone
- "Actions" (Paige runtime queue) vs "Skills" (capability catalog) distinction clear
- "Setter" / "Closer" / "Success Coach" as primary; "SDR / AE / CSM" as tooltip aliases
- No dead ends — every surface has action affordances OR an on-voice empty state

### Living rollup
- Update `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md` §1 status + §2 findings per sub-slice merge
- Log stale-audit corrections (grounding pass finds current state doesn't match this doc's assumptions)
- File follow-up issues for anything discovered during crew catches

---

## 14. Success criteria — must pass before merge on each sub-slice

### Universal (all sub-slices)
- [ ] Local `changed-file eslint` = 0, `tsc` = 0, `build` succeeds
- [ ] Full CI green on push (ci + Security Audit)
- [ ] Living-rollup CONSOLIDATED_PLATFORM_AUDIT §1+§2 updated on merge
- [ ] Zero regression in e2e tests on touched surfaces
- [ ] Blueprint doc references THIS doc as source of truth

### Sub-slice specific criteria — see each sub-slice §10 for details

**Common patterns that must hold everywhere:**
- All 7 target top-nav items render correctly on 1536×735 desktop and 375×667 mobile
- No horizontal overflow on 1536px viewport
- `... More` overflow menu no longer exists (after 1c-v)
- Every old URL either resolves as before or 301-redirects to new home
- Route guards preserved
- Header profile dropdown replaces bare Sign-out icon (after 1c-iii)
- Additive migrations only on `user_roles` and `contacts`
- No notification storm on migration day (auto-classification retroactive flags gated post-migration)
- Every renamed item has consistent label across nav · page title · aria-label · in-app copy
- Message copy affordance on both user and Paige messages (after 1c-vi)
- "Start Voice Chat" fat bar removed (after 1c-vi)
- Live Scoreboard updates real-time (after 1c-ix)
- Analytics surface has NO parallel metric-collection layer (after 1c-x) — every metric reads from brain state

---

## 15. Explicitly OUT of scope

Do NOT touch in Slice 1c:
- **Conversations content** — placeholder only; real inbox = Communications workstream
- **Voice Layer** — Vapi / tenant_phone_numbers; Communications workstream (paired with Conversations)
- **Vibe Studio internal chrome** — future audit; only re-wrap under Growth
- **Client-facing portal front-end** — what actual clients see when they sign in; separate audit
- **Comp tracking for Setters/Closers** — real product surface, own slice, Sales Ops workstream (Q-B deferred)
- **Full permission matrix per role** — v2; ship view-only role differences in v1 (Q-G deferred)
- **Predictive/AI lead scoring** — v2 once we have behavioral data (Q-E deferred)
- **Custom objects / extensible schema** — future
- **HubSpot/Salesforce sync integrations** — separate workstream
- **Rich message formatting / conversation branching / inline suggestions** in chat — future
- **DataMaintenancePanel split** — filed #402, deferred
- **Route/RLS gate reconciliation** — filed #403, deferred
- **Product decisions still open** — #388 coach-scope, #397 support desk, #399 paige_skills intent
- **Mobile-specific responsive fixes** — audit needed; only baseline "doesn't break on mobile" required for 1c
- **Global search (Cmd-K)** — deferred to Slice 1d (post-1c polish)
- **Two-editor Agreements schema-consolidation** — filed as follow-up build (needs migration)
- **Tenant-owned referral program build** — filed as product decision (currently Affiliates is operator-only per 1c-ii)

---

## 16. Brain Integration Requirements — enforced per surface

**Design law:** no surface ships without explicit wire-ups to the brain. This prevents the "siloed pieces" failure mode.

Per-surface integration matrix documented in §3 surface specs. Summary:

| Surface | L1 | L4 | L6 | §8 | §10 | §16 |
|---|---|---|---|---|---|---|
| Paige | writes `paige_llm_trace` on every message · L2 evals on thumbs | invokes `runReasoning` per phase | `captureToMemory` on outcomes | reads/writes `paige_action_kinds` queue | IS the callable interface | orchestrates all 10 departments |
| Command Center | reads `paige_llm_events` for activity | — | reads at-risk flags from memory | reads action queue for drafts-awaiting | callable via slash-commands in Paige | reads department readiness |
| Clients | reads L1 activity for Client 360 | invokes for auto-classification | writes contact transitions to memory · reads history | writes contact events · reads pipeline events | every action programmatically callable | Sales + Fulfillment departments own most surfaces |
| Team | reads real-time L1 event streams for scoreboard | — | writes team performance patterns | routes handoffs via action bus | callable per assignment logic | People + Ops departments |
| Growth | — | — | writes campaign patterns · reads Brand Kit | fires campaign events | callable via Paige "run campaign" commands | Marketing department |
| Analytics | READ-ONLY over all L1 data | invokes for AI Insights narrative + anomaly detection | reads memory for outcome tracking | reads action stats for Human-vs-Paige breakout | callable via slash-command queries | reads all department metrics |
| Setup | writes config changes to trace | — | writes Playbook enables/disables | fires config change events | callable for policy config | governs which departments are active per Playbook |

**Test for each sub-slice PR:** show explicit wire-up. If a surface doesn't hook into at least one brain layer, that's a §14/§16 violation — surface it in compliance officer pass.

---

## 17. Post-Slice-1c queue (post-1c workstreams)

**Slice 1d** (small polish + deferrals):
- Global search (Cmd-K)
- DataMaintenancePanel split (#402)
- Route/RLS gate reconciliation (#403)
- Two-editor Agreements schema-consolidation

**Communications workstream** (multi-slice, pair with Voice Layer):
- Conversations real build — SMS + WhatsApp + Email + IG DM + FB Messenger + portal chat + voice-call transcripts
- Voice Layer — Vapi + tenant_phone_numbers + tenant_voice_config
- Shared operator-inbox mental model + underlying primitives

**Sales Ops workstream:**
- Comp tracking — per-booked-call payouts (setter) · per-cash-collected commissions (closer) · retention/upsell commissions (success coach)
- Payout reports · commission disputes · clawback flow

**Permissions v2:**
- Full role-based permission matrix (Setter can't advance to Client, etc.)
- Row-level permissions (Setters see only assigned leads)
- Team-scoped visibility

**Lead Scoring v2:**
- Numeric Lead Score (rules-based → ML)
- Two-axis Pardot-style Score × Grade for larger tenants

**Follow-on audits:**
- Client-facing portal audit (highest customer-visibility risk)
- Mobile responsive audit
- Coach lens audit
- Super Admin surface audit
- Vibe Studio internal chrome audit

**Vertical expansions:**
- Consulting Playbook (defaults + role additions)
- Agency Playbook
- Real Estate Playbook (if scoped)
- Additional funding-vertical depth

---

## 18. Owner notification pattern

Ping owner when:
- Any grounding walk reveals a product decision needing owner call
- Any success criterion fails in a way requiring owner input
- A sub-slice is ready for merge (routine — standard cadence)
- Anything in "OUT of scope" surfaces as accidentally in-scope (stop and confirm)

Otherwise standard cadence: report at each sub-slice merge with shipped state, stale-audit corrections logged, follow-ups filed under EPIC.

---

## 19. Living-rollup update template (per sub-slice merge)

Append to `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md`:

**§1 Status line:**
```
Slice 1c-<sub> merged <squash-sha>: <what shipped in one sentence>. Stale-audit corrections: <list>.
```

**§2 cluster entry:**
```
### IA/Design cluster · Slice 1c-<sub>
- Merged: <date> · PR #<N> · Squash: <sha>
- Scope: <what shipped>
- Crew catches worth naming: <verifier + compliance findings that mattered>
- Follow-ups filed: <#NNN list>
- Stale-audit corrections: <audit vs prod reality>
- Brain integration verified: <which layers wire-in was confirmed>
```

---

## 20. Locked answers to prior discussion questions (for posterity)

- **Q-A (Vocabulary):** coaching-industry primary (Setter · Closer · Success Coach); SaaS aliases in tooltips
- **Q-B (Comp tracking):** DEFER — Sales Ops workstream
- **Q-C (Head + Group Coach split):** SHIP BOTH
- **Q-D (Not a fit):** Disqualified flag + reason (NOT a lifecycle stage)
- **Q-E (Lead Score v1):** DEFER numeric — explicit signals only
- **Q-F (Call Queue):** Contacts view mode + Command Center Setter/Closer view
- **Q-G (Permissions):** view-only role differences v1
- **Q-H (Additional CRM features):** none in v1
- **D1 (People):** three surfaces conceptually — Contacts + Members & Roles + Pipeline — organized under Clients (People + Pipeline sub-tabs) and Team (Members & Roles sub-tab) in the 7-item nav
- **D2 (Legal):** LegalAdmin → operator (shipped 1c-i); tenant Legal in Setup (1c-xi)
- **D3 (Growth):** Growth container (Campaigns + Vibe + Client Portal absorbed as sub-tabs per Client audience under Clients, Growth for lead-facing)
- **D4 (Paige's Team):** absorbed INTO Paige top-nav (per revised design + Claude Code blueprint interpretation — this is the cleaner answer given the revised 7-item structure)
- **D5 (Portal Studio):** renamed Client Portal, placed as Clients sub-tab
- **D6 (Header profile dropdown):** built (1c-iii)
- **D7 (Affiliates + Usage Analytics):** operator (grounded — 1c-i shipped Usage; 1c-ii ships Affiliates split)
- **D8 (Calendar + Planning):** absorbed into Clients → Delivery (client-facing scheduling) and Team → My Queue (personal tasks) — no "Calendar & Tasks" mashup

**Three Claude Code pencilled decisions resolved:**
- "Client Hub" vs "Client Experience" → **"Clients"** (plainer, honest)
- "What she can do" → **"Actions"** (accept — clarity officer catch was right)
- Reports into Dashboard → **Analytics as own top-nav** (not folded; deserves its own surface)

**Post-owner-review correction (CLAUDE.md §18 doctrine addition):**
- Nav elevated from 7 to **8 items** with **Marketplace at position #3** as first-class OS-level surface
- Prior draft had Marketplace tucked inside Paige as "Give Paige new powers" — CORRECTED per §18 doctrine (Marketplace is the App Store for the Paige OS, not a Paige feature; ecosystem discovery destination doesn't sit subordinate to one interaction pattern; same principle as iOS App Store, Chrome Web Store, Salesforce AppExchange)
- Slice 1c-xii **flipped direction** — was "Marketplace absorption into Paige" → now "Marketplace elevation to top-nav position #3 + ecosystem App Store framing"
- Universal-vs-context-specific principle now anchored in §18: 5 universal surfaces work in any Paige-run context; 3 context-specific surfaces come from active Playbook (business today; household/portfolio in future waves)
- §3.8 Marketplace surface spec added

---

**End of handoff. This is the single source of truth for Slice 1c. Execute in sub-slice order per §10. Same crew discipline as security cluster. Report at each merge. Every design decision from here forward passes the §18 test: "Would this scale cleanly to a household/portfolio/device context?"**
