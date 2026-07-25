# Paige Agent AI — Client Experience Workstream Strategy

**For:** Antonio · **Date:** 2026-07-21 · **Status:** locked as future-execution spec (sequenced post-Slice-1c + post-Money-Spine)

**Purpose:** the canonical strategy for the Client Experience workstream — the client-facing portal that turns Paige from "operator tooling for coaches" into a two-way intelligent portal per §7 doctrine. Covers config polish, composable portal architecture, client-facing Paige persona, transformation metrics primitive, and Marketplace client-side blocks. Reference doc for CX-workstream execution when Slice 1c wraps + Money Spine ships.

**Related doctrine:**
- CLAUDE.md §7 — Paige as the intelligent client portal (two-way, one brain facing both sides) — this workstream operationalizes §7
- CLAUDE.md §8 — Paige runs two departments (Owner Ops · Client Experience) — CX-3 makes the Client Experience department user-facing
- CLAUDE.md §14 — Paige orchestrates a standing team — client-facing Paige is a scoped sub-agent
- CLAUDE.md §17 — $1B Growth Map — Marketplace client-side blocks (Layer 5 revenue) materializes here
- CLAUDE.md §18 — OS north star — client-side Marketplace blocks are OS ecosystem primitives

**Related strategy docs:**
- `docs/audits/platform-ia-slice-1c-handoff.md` — parent IA restructure; CX absorbs the Client Portal sub-tab shipped in 1c-viii-c
- `docs/strategy/monetization-rollout-2026-07-21.md` — CX-5 (Marketplace client-side blocks) is Layer 5 revenue engine

---

## 0. Executive summary

The Client Portal is currently a functional-but-shallow config surface (tenant configures what clients see; fixed 3-tab menu). This workstream turns it into the **second-largest surface on the platform in terms of user-facing time** — every tenant has 1× user on operator side (them + their team); every tenant has N× users on client side (all their clients). At scale, more people spend more time in the client portal than the operator side.

**Five sub-workstream layers:**

1. **CX-1 — Config surface polish.** Kill the marketing hero banner on the tenant config page. Add logo size specs + validator. Slim `PageHeader` primitive. Small, ships anytime.
2. **CX-2 — Composable portal architecture.** Tabs beyond fixed 3, block canvas within tabs, Playbook-defaulted portal templates. Foundational build; multi-slice.
3. **CX-3 — Client-facing Paige persona.** Scoped Paige brain instance for client-facing use, configured from three entry points (Client Portal config · Paige tab · Playbook defaults). Escalation-to-human flow.
4. **CX-4 — Transformation primitive.** `client_transformation_metrics` schema, baseline capture, timeseries + trends, Paige-narrated summaries, Client 360 read-back, cohort transformation view.
5. **CX-5 — Marketplace client-side blocks.** Vertical-specific block libraries (fitness · funding · business · life · consulting · agency), Marketplace revenue-share (70/30), per-block data models, Paige-narration of block data.

**Sequencing:** CX-1 (anytime) → CX-2 → CX-3 → CX-4 → CX-5. Each unlocks the next.

**Roadmap placement:** ships AFTER Slice 1c wraps (client portal placeholder becomes real) + AFTER Money Spine (Marketplace revenue-share infrastructure needs Stripe Connect). Should ship BEFORE closed beta launches so Wave 1 founding partners (funding professionals + thought leaders) can showcase differentiated client experience on day one.

---

## 1. Design principles — non-negotiable

**1.1 The client portal is not a config surface — it's a user-facing product surface.**
Currently we've built the operator side to depth. The client side is functional but shallow. Every design decision in CX should serve the CLIENT viewing/using the portal, not just the tenant configuring it. Config surfaces exist to enable client experiences, not the reverse.

**1.2 Two-way brain, scoped per audience (§7 + §8).**
The client-facing Paige is the same brain as the operator-facing Paige, but with distinct scope, persona, and permissions. Never a separate LLM stack. Never a separate memory system. Same L1/L4/L6/§8/§16 primitives, different scope filter.

**1.3 Composable, not fixed (§18 OS pattern).**
The client portal is a canvas the tenant composes from primitives (tabs + blocks) drawn from the Marketplace ecosystem + Playbook defaults. Tenants don't customize a fixed template; they assemble their client's experience from ecosystem parts.

**1.4 §9-clean at every layer.**
Client Paige sees ONLY the client's own data, tenant-published content, tenant-configured knowledge, and tenant-enabled skills. Never other clients' data, never tenant operator surfaces, never financials, never cross-tenant. Server-derived tenant_id + client_id on every query. Same discipline as security cluster.

**1.5 Transformation-first (the pitch differentiator).**
Coaches/consultants/agencies sell transformation. The client portal is where transformation must be visible and measurable — both to the client (motivation) and back to the tenant (accountability + upsell + marketing evidence). Every design decision serves the transformation-visibility mission.

**1.6 Vertical-native by Playbook default.**
Every Playbook ships with a default portal template optimized for that vertical. Funding coach's tenants get a funding-optimized portal on day one; fitness coach's tenants get fitness-optimized; consulting practice gets consulting-optimized. Tenants customize freely from the default. No "one-size-fits-nobody" portals.

**1.7 Paige-augmented at every touchpoint.**
Every client action or view in the portal has an "ask Paige" affordance. Every data view has a Paige-narrated summary option. Every block can surface Paige-generated insight. The client always feels like they have a thoughtful assistant, not a static dashboard.

---

## 2. CX-1 — Config surface polish (small, ships anytime)

The tenant-side config surface (`/admin/clients-hub/portal`) needs three quick fixes before or during any other CX slice.

**Kill the marketing hero banner.** The current "Your client's portal" banner eats ~150-200px vertical space on a config surface. Enterprise SaaS uses tight page headers (title + breadcrumb + primary action), not marketing heros on config pages. Replace with slim `PageHeader` primitive from `@/components/ui/page`. The saved vertical space goes to the live-preview panel, which becomes larger and more usable.

**Add logo size specs + AI-assisted validation.**
Current UI just says "Transparent PNG or SVG works best." Extend to:
- Recommended dimensions ("512×512px minimum · square works best for the nav badge")
- File size limit ("Under 2MB")
- Preview at multiple sizes (nav badge · full brand strip · favicon-scale) — three thumbnails showing how the logo renders in each context
- Optional file validator ("Your logo is 380×420 — not square; will be letterboxed in the nav badge · want me to auto-crop?")
- Optional Paige-offered auto-crop/resize ("I can generate a properly-sized version — approve?")

**Consistent primitive layer.**
Every section in the config surface uses `SectionCard` per §11 primitive layer. Live-preview panel uses standard right-rail pattern (collapsible per user preference, matching 1c-vi Paige surface pattern).

**Success criteria:** the tenant config surface reads as enterprise-quality (§11 world-class floor), not marketing-brochure. Logo-upload flow catches bad uploads gracefully with Paige-assisted correction.

---

## 3. CX-2 — Composable portal architecture (the foundational build)

The current fixed-tab model (Home · Action items · Resources) becomes a **composable canvas** where tenants assemble their client experience from primitives.

### 3.1 Tabs (top-level client navigation)

**Default tabs every tenant gets:** Home · Messages · Resources · Progress. These are baseline; the client always has these regardless of tenant configuration.

**Custom tabs (unlimited within tier caps):**
- Tenant adds tabs with title, icon, slug, visibility rule
- Drag-orderable
- Visibility rule (some clients see it, some don't — role-gated by segment or per-client)
- Example custom tabs: "My Workouts" (fitness) · "Funding Dashboard" (funding) · "Session Recordings" (any coach) · "Community" (group program) · "Documents" (agency deliverables) · "Certification Path" (course-based) · "Team Roster" (agency multi-user client)

**Tier caps for custom tabs:**
- Solo: 3 custom tabs
- Practice: 8 custom tabs
- Studio: unlimited
- Enterprise: unlimited + white-label tab styling

**Tab-level configuration:**
- Icon (from Lucide icon library + Marketplace-installed icon packs)
- Title
- URL slug (auto-generated from title, editable)
- Visibility (all clients · specific segments · specific individual clients · role-gated)
- Order (drag-reorderable)
- Delete (with confirmation — data preserved but tab hidden)

### 3.2 Blocks (widgets/modules rendered inside tabs)

Every tab is a canvas of blocks the tenant composes. Blocks come from three sources:

**Paige-native blocks (built by us — baseline every tenant has):**
- Welcome message (rich text + Paige greeting)
- Next session (upcoming appointment)
- Recent activity (client's own recent activity log)
- Resources list (documents the tenant has shared with them)
- Paige chat (embedded Paige conversation)
- Progress summary (auto-generated from transformation primitive CX-4)
- Message my coach (escalation-to-human affordance)
- Payment / invoicing (linked to Money Spine)
- Session recording player (linked to Communications workstream when Voice Layer ships)

**Marketplace blocks (built by ecosystem — Layer 5 revenue):**
See §5 for vertical-specific block catalogs.

**Custom blocks (tenant-built):**
- Rich text block (WYSIWYG editor)
- Embedded video (YouTube · Vimeo · Loom · direct upload)
- Custom HTML block (sanitized, for advanced tenants)
- Linked resource block (link to external doc/tool)
- Form block (custom form built in Vibe Studio)
- Call-to-action block (button + destination)

**Block-level configuration:**
- Position on canvas (drag-resizable, snap-to-grid, mobile-responsive)
- Visibility rule (per segment · per client · per client-status)
- Data source config (which client's data · which time range · which metric)
- Paige-narration toggle (on/off per block — should Paige summarize this block's contents?)
- Integration credentials (for blocks needing external API — fitness tracker, credit monitor, etc.)

### 3.3 Playbook default templates (vertical-native experience)

Every Playbook ships with a **default portal template** — pre-configured tabs + blocks that make sense for that vertical. Tenants inherit the template on Playbook activation; customize freely from there.

**Funding Playbook default:**
- **Home tab:** Welcome · Next session · Message my coach · Recent activity
- **Funding Readiness tab:** FICO Score Tracker block · Business Credit Tier block · Debt-to-Income Calculator block · Funding Readiness Scorecard block · Recommended Actions block
- **Credit Monitoring tab:** Personal Credit Alert Feed block · Business Credit Alert Feed block · Score Trend Chart block
- **Documents tab:** Uploaded documents · Templates library · Certification/PGT documents
- **Sessions tab:** Recording player · Session notes · Next session · Book new session
- **Community tab (if group program):** Feed · Members · Announcements

**Fitness Playbook default:**
- **Home tab:** Welcome · Today's workout · Streak counter · Message my coach
- **Workouts tab:** Workout log · Timer · Rep-max calculator · Workout library
- **Progress tab:** Weight trend · Body measurements · Progress photos · Achievements
- **Nutrition tab:** Meal log · Macro tracker · Nutrition targets · Recipe library
- **Community tab:** Feed · Challenges · Leaderboard

**Business Coach Playbook default:**
- **Home tab:** Welcome · Weekly scorecard · Rocks progress · Message my coach
- **Scorecard tab:** Weekly measurables · Quarterly rocks tracker · IDS log
- **Revenue tab:** Revenue thermometer · MRR tracker · Pipeline snapshot · Cash-flow projection
- **Team tab:** Org chart · Accountability matrix · Meeting rhythm · Delegation log
- **Documents tab:** SOPs · Playbooks · Meeting agendas

**Consulting Playbook default:**
- **Home tab:** Welcome · Active engagement · Next milestone · Message my consultant
- **Engagement tab:** Deliverables tracker · Timeline · Approval queue · Change requests
- **Documents tab:** Contracts · Reports · Presentations · Working files
- **Communication tab:** Meeting recordings · Meeting notes · Action items
- **Invoicing tab:** Invoices · Payments · Retainer status

**Agency Playbook default:**
- Similar to consulting but with campaign performance blocks, asset library, revision queue.

**Life Coach Playbook default:**
- Home · Goals tab · Habits tab · Journal tab · Community tab

**Every default is a starting point.** Tenant can add/remove/reorder/reconfigure freely.

### 3.4 Data model

**`tenant_client_portal_configs`** — per-tenant portal composition
- `tenant_id` (FK)
- `active_playbook_id` (drives default template)
- `custom_tabs` (jsonb — array of tab configs)
- `theme_overrides` (jsonb — brand-level customization beyond Playbook default)

**`tenant_portal_tabs`** — per-tenant custom tabs
- `id` (PK)
- `tenant_id` (FK)
- `slug` (unique per tenant)
- `title`
- `icon`
- `visibility_rule` (jsonb — segment · individual · role-gated)
- `sort_order` (int)
- `is_default_tab` (boolean — protects the baseline 4)
- `deleted_at` (soft delete)

**`tenant_portal_tab_blocks`** — blocks composed on each tab
- `id` (PK)
- `tab_id` (FK to `tenant_portal_tabs`)
- `tenant_id` (FK — denormalized for RLS)
- `block_type` (enum: paige_native · marketplace · custom)
- `block_source_id` (Marketplace listing ID if applicable)
- `position` (jsonb — x/y/width/height on canvas grid)
- `config` (jsonb — block-specific configuration)
- `visibility_rule` (jsonb)
- `paige_narration_enabled` (boolean)
- `sort_order` (int)

**`marketplace_client_blocks`** — catalog of Marketplace client-side blocks
- Same as `marketplace_skills` but scoped to client-side rendering
- Includes rendering component reference, Paige-narration prompt template, data model reference, required credentials

**RLS:** every table tenant-scoped. Client viewing portal reads through tenant's config; can never see other tenants' configs or blocks.

### 3.5 Rendering (client side)

- Portal is a React app rendered inside the tenant's branded shell
- Tenant's brand config (colors, logo, typography) applies globally
- Tabs render as top-level nav with tenant-configured icons + labels
- Each tab renders its composed blocks in tenant-configured layout
- Blocks are lazy-loaded (large blocks like video players don't block initial page load)
- Mobile-responsive by default (all Paige-native + Marketplace blocks must support mobile per §11 accessibility)
- Real-time updates where relevant (Paige chat, Progress blocks, transformation metrics — WebSocket subscriptions scoped to client)

---

## 4. CX-3 — Client-facing Paige persona

The client-facing Paige is a scoped instance of the same brain, configured for client-audience interaction. Deep integration with §8 (Client Experience department) + §14 (sub-agent orchestration).

### 4.1 Persona configuration

The tenant configures WHO client-facing Paige is:
- **Name** (default: "Paige"; tenant can customize — some coaches want her named after themselves, e.g., "Coach Antonio's Assistant")
- **Voice/tone** (default: warm, professional, supportive; tenant can adjust — casual, formal, motivational, etc.)
- **Greeting** (first message clients see — customizable)
- **Introduction template** ("Hi, I'm Paige — Coach Antonio's assistant. I'm here to help you between sessions. Feel free to ask about your progress, upcoming sessions, or anything you're working on.")
- **Boundaries** (what she will/won't discuss — "never give medical advice" for fitness coaches, "always escalate cash-flow crisis language to human coach" for funding coaches, etc.)
- **Escalation triggers** (words/phrases that immediately hand thread to human coach — "emergency" · "suicide" · "can't afford" · "quitting" depending on vertical)

### 4.2 Scope (§9-clean permissions)

**Client-facing Paige can see:**
- The current client's own profile, activity log, transformation metrics, session history
- Tenant-published content (Playbook curriculum, resources, documents shared with this client)
- Tenant-configured knowledge base entries marked "client-facing"
- Tenant-enabled skills marked "client-side available"
- Marketplace blocks activated on the tenant's portal + configured for this client

**Client-facing Paige CANNOT see:**
- Other clients' data (§9)
- Tenant financials, revenue, pipeline, deals
- Operator surfaces (Command Center, Analytics, Setup, other tenant workspaces)
- Cross-tenant anything (§9)
- Tenant's private knowledge base entries (marked "operator-only")
- Tenant's team performance data

**Enforcement:** server-side scope filter on every query. Client-facing Paige's LLM context is assembled from a pre-filtered dataset that already excludes off-limits data. Never rely on prompt-level "don't tell them X" — always exclude at the data layer.

### 4.3 Skills enabled for client side

Tenant configures which Paige skills clients can invoke. Defaults per Playbook:

**Universal client-side skills (available by default):**
- "What's on my agenda this week?"
- "When is my next session?"
- "Show me my progress"
- "I need help with [topic]"
- "Message my coach"
- "Update my [metric]"
- "Ask a question about the program"

**Playbook-specific skills (enabled by Playbook default, tenant can toggle):**
- Funding: "Check my FICO score" · "Explain my funding readiness score" · "Recommend next steps for my credit"
- Fitness: "Log my workout" · "Suggest today's workout" · "Track my nutrition"
- Business: "Update my weekly scorecard" · "How am I tracking to my quarterly rocks?"
- Consulting: "What deliverables are due?" · "Show me the latest report"

**Advanced skills (tenant explicitly enables):**
- Payment / billing management ("Update my payment method")
- Program upgrade requests ("I want to move to your VIP tier")
- Refund requests (escalates to human by default)

### 4.4 Actions enabled for client side

**Every action gated by tenant configuration:**
- Book/reschedule sessions (default: on)
- Log data (workouts, weights, mood, whatever the vertical uses)
- Submit documents/forms
- Update contact info
- Request document from coach
- Request meeting / additional session
- Provide feedback / testimonial
- Rate a session or interaction

**Not enabled by default (tenant explicitly opts in):**
- Purchase upgrades (revenue-affecting)
- Cancel subscription (revenue-affecting — should escalate to human)
- Cancel client engagement

### 4.5 Escalation-to-human flow

Client always has visible "Message my coach" affordance. When the client uses it:
- Thread routed to tenant's assigned Success Coach (from People model role assignments)
- Notification fires to Success Coach (in-app + email + SMS if configured)
- Paige remains in the thread as an assistant to the human coach
- Coach can hand thread back to Paige at any point ("Paige, handle from here per our nurture playbook")

**Auto-escalation triggers** (regardless of client explicit request):
- Escalation phrases matched (configured per tenant)
- Sentiment analysis flags distress or urgency
- Multi-turn conversation where Paige can't help ("I don't have information on that — let me connect you with your coach")
- Payment/billing issues
- Cancellation intent

### 4.6 Configuration entry points (three, per audience)

**Entry 1 — Setup → Client Portal → Client Paige** (tenant's day-to-day tuning):
- Persona name, voice, greeting
- Which skills enabled
- Basic boundaries and escalation rules
- Preview: "See what your clients see when they open Paige"

**Entry 2 — Paige top-nav → Client Paige sub-tab** (deep configuration):
- Knowledge base (what she knows about their business, filtered "client-facing" vs "operator-only")
- Advanced skill configuration
- Sub-agent forge (custom capabilities for specific client scenarios)
- Model routing (which model per task tier)
- L2 evals on client conversations (feedback loop)

**Entry 3 — Setup → Playbooks → [Playbook] → Client Paige defaults** (vertical preset):
- Every Playbook ships default client-Paige config
- Tenant inherits Playbook default; can override per Client Paige config
- "Reset to Playbook default" affordance

### 4.7 Brain integration

- Chat writes to `paige_llm_trace` (L1) with `context: "client_facing"` and `client_id` scope
- Message thumbs up/down writes to L2 evals with client-facing feedback separated from operator-facing feedback
- Drafts (if action requires tenant approval) written to `paige_action_kinds` queue with `department: "client_experience"` per §8
- Memory captured via `captureToMemory` (L6) scoped to this client
- Reasoning invokes `runReasoning` (L4) per phase
- Client-facing Paige has its own department node in §16 10-department model — the "Client Experience" department serves the client audience

---

## 5. CX-4 — Transformation primitive (the strategic layer)

The most valuable design decision in this workstream. Coaches sell transformation. The client portal is where transformation must be VISIBLE — to the client (motivation) and readable back to the tenant (accountability + upsell + marketing evidence).

### 5.1 Universal transformation model

Every client has a transformation dashboard rendered in their portal. Structure is universal across verticals; specific metrics are Playbook-defined.

**Four required components per metric:**

1. **Baseline** — where they started (captured at onboarding). Immutable historical record.
2. **Milestones** — checkpoints along the path (baseline → milestone 1 → milestone 2 → target). Tenant defines milestones per Playbook or per client.
3. **Current state** — where they are now (updated continuously from data sources).
4. **Trend line** — trajectory visualized over time (line chart · sparkline · gauge · whatever format serves the metric).

**Plus one interpretive layer:**

5. **Story arc** — Paige-generated narrative summary. Example: "Since starting with Coach Antonio 90 days ago, you've lost 18 pounds (goal: 30), improved your FICO by 45 points (goal: 100), added 200 lbs to your total lifts, and hit 4 of 6 quarterly goals. You're on track for your Q4 target."

### 5.2 Data sources for transformation metrics

Four sources feed the transformation primitive:

**Source 1: Client self-report** (via Marketplace blocks)
- Client logs weight in a fitness block → writes to `client_transformation_metrics`
- Client updates mood in a life-coach block → writes to `client_transformation_metrics`
- Client submits weekly scorecard in business-coach block → writes to `client_transformation_metrics`

**Source 2: Tenant-input** (via coach actions)
- Coach records session outcomes ("Client hit their weekly goal")
- Coach marks milestones ("Client passed certification")
- Coach adjusts baseline if reset needed

**Source 3: Integrated sensors** (Marketplace blocks connected to external APIs)
- Fitness tracker API → automated workout + heart rate data
- Banking API → automated cash-flow data for business coaches
- Credit monitoring API → automated FICO score updates
- Calendar API → automated session attendance
- Custom integrations per Marketplace block

**Source 4: Paige-observed events** (auto-generated from platform activity)
- Portal login frequency
- Session attendance rate
- Message sentiment analysis (Paige detects engagement level)
- Task completion rate
- Program milestone hits (Paige observes when they complete a curriculum module)

### 5.3 Data model

**`playbook_transformation_metric_definitions`** — per-Playbook metric catalog
- `playbook_id` (FK)
- `metric_key` (unique per Playbook — "weight_lbs" · "fico_score" · "workouts_completed" · "revenue_mrr")
- `display_name` ("Weight" · "FICO Score" · "Workouts Completed" · "Monthly Recurring Revenue")
- `unit` ("lbs" · "points" · "sessions" · "USD")
- `direction` (higher-is-better · lower-is-better · target-value)
- `default_baseline_prompt` (question Paige asks at onboarding to capture baseline)
- `default_target_prompt` (question Paige asks to set target)
- `default_milestones_pattern` (array — "25% of target" · "50% of target" · "75% of target" · "target")
- `default_data_source` (client_self_report · tenant_input · integrated_sensor · paige_observed)
- `chart_type_default` (line · sparkline · gauge · progress_bar)
- `narrative_prompt_template` (Paige-narration template — "Since baseline, you've {direction} {metric} by {amount} — {percentage_of_target}% to goal")

**`client_transformation_metrics`** — timeseries per client per metric
- `id` (PK)
- `tenant_id` (FK — server-derived, RLS-enforced)
- `client_id` (FK — server-derived)
- `metric_key` (references `playbook_transformation_metric_definitions.metric_key`)
- `metric_type` (baseline · milestone · current · target)
- `value` (numeric or jsonb depending on metric type)
- `recorded_at` (timestamptz — when the value was captured)
- `source` (enum matching data_source values)
- `source_metadata` (jsonb — audit trail; who/what recorded it)
- `narrative_snapshot` (Paige-generated at recording time — optional, for later story reconstruction)

**`client_transformation_stories`** — Paige-generated narrative snapshots
- `id` (PK)
- `tenant_id` (FK)
- `client_id` (FK)
- `generated_at`
- `time_window` ("last_30_days" · "since_baseline" · "quarterly")
- `narrative_text` (Paige-generated summary)
- `metrics_covered` (jsonb — which metrics contributed)
- `intended_audience` (client · tenant · marketing)

**RLS:** every table scoped to tenant + client. Client can only see their own metrics. Tenant can see all their clients' metrics. Cross-tenant access impossible.

### 5.4 Client-side rendering (client portal)

**Progress tab (default in every portal):**
- Hero: primary transformation metric with baseline → current → target visualization
- Secondary metrics grid (up to 6 secondary metrics)
- Trend line chart (30d · 90d · all-time toggle)
- Recent milestones (checkmarks + dates)
- Paige-generated story summary (updated weekly, editable by tenant)
- Celebration animations on milestone hits (per §11 delight discipline)

**Per-block progress surfacing:**
- Any Marketplace block that logs to transformation metrics auto-shows its own mini progress view within the block
- Fitness log block shows weekly summary
- Nutrition tracker shows macros trend
- Credit monitor shows score trend

### 5.5 Tenant-side rendering (Client 360 + cohort view)

**Client 360 view (inside Clients → People → click a client):**
- Client's full transformation dashboard (same as client sees)
- Plus: at-risk score, engagement trajectory, upsell readiness, churn risk
- Plus: coach notes and tenant-only commentary
- Plus: Paige-generated tenant-facing narrative ("This client is on-track: 78% to their Q4 revenue target · consistent portal engagement · last 3 sessions all attended")

**Cohort transformation view (inside Team → Team Scoreboard OR Analytics → Delivery):**
- Grid of all clients with primary-metric status column (green/yellow/red trending)
- Filters: by coach · by Playbook · by lifecycle stage · by segment
- Aggregate metrics: % of clients hitting monthly target · avg improvement per cohort · top-quartile vs bottom-quartile spread
- Drill into any client for full Client 360
- Auto-flagged: clients whose transformation is stalling (no metric updates in 14 days · downward trend on primary metric · 2+ missed sessions · portal login < 1× per week)

**Success Coach dashboard (in Team surface):**
- Prioritized list of clients needing proactive intervention today
- Each with reason ("Down 5% on primary metric this week" · "Hasn't logged in 12 days" · "Missed last 2 sessions")
- Suggested actions (Paige-drafted)
- One-click outreach affordance

### 5.6 Marketing value (the pitch differentiator)

Once transformation metrics ship, coaches can:
- **Showcase real transformation stories** (with client consent) for testimonials — testimonials backed by data, not just vibes
- **Auto-generate case studies** from client transformation trajectories
- **Prove ROI in sales calls** ("Look at what my last 20 clients accomplished on average")
- **Justify pricing** ("$5K program produced average of $80K revenue increase for clients — 16x ROI")

For the investor pitch: "Our tenants can PROVE the transformation their clients achieve. Every dollar a coach charges is backed by data. That's a category-defining differentiator no competitor offers."

---

## 6. CX-5 — Marketplace client-side blocks (the ecosystem play)

CX-2 (composable canvas) + CX-4 (transformation primitive) unlock CX-5: a marketplace of vertical-specific blocks that render in the client portal and feed the transformation primitive.

### 6.1 Vertical block catalogs

**For funding coaches (primary vertical — first Marketplace catalog to launch):**
- FICO Score Tracker ($9/mo) — connects to credit monitoring API, shows trend, alerts on changes
- Business Credit Tier ($9/mo) — D&B Paydex + Experian Business + Equifax Business tracking
- Debt-to-Income Calculator (free)
- Funding Readiness Scorecard ($15/mo) — proprietary scoring based on multiple signals
- Lender Comparison Matrix ($9/mo) — configurable per-tenant lender list
- Loan Payment Calculator (free)
- Amortization Visualizer (free)
- Credit Alert Feed ($15/mo) — real-time alerts from credit bureau APIs
- Business Credit Builder Progress ($9/mo) — tracks trade line reporting, credit-file thickness
- Funding History Log (free) — record of applied/approved/declined/funded

**For fitness coaches:**
- BMI Calculator (free)
- Workout Timer ($5/mo)
- Progress Photos ($9/mo — includes cloud storage)
- Nutrition Tracker ($9/mo)
- Sleep Log (free)
- Streak Counter (free)
- Body Measurement Tracker (free)
- Rep-Max Calculator (free)
- Meal Planner ($15/mo)
- Fitness Tracker Integration ($15/mo — Whoop/Oura/Apple Health/Fitbit)
- Progress Photo AI Comparison ($19/mo — AI-generated before/after comparisons)

**For business coaches:**
- Weekly Scorecard EOS-style ($9/mo)
- Quarterly Rocks Tracker ($9/mo)
- Meeting Agenda Templates ($5/mo)
- Delegation Matrix ($5/mo)
- Time Audit Log ($5/mo)
- Revenue Thermometer (free)
- KPI Dashboard ($15/mo — custom KPIs per business)
- Cash Flow Forecaster ($15/mo)
- Org Chart Visualizer ($9/mo)

**For consulting practices:**
- Deliverables Tracker ($9/mo)
- Approval Queue ($9/mo)
- Timeline Visualizer ($9/mo)
- Weekly Report Auto-gen ($15/mo)
- Asset Library ($9/mo)
- Change Request Log ($5/mo)
- Engagement ROI Calculator ($15/mo)

**For life coaches:**
- Goal Tracker (free)
- Habit Tracker ($9/mo)
- Mood Log ($5/mo)
- Journal Entries ($9/mo — includes sentiment analysis)
- Vision Board ($15/mo — image-based, AI-assisted)
- Milestone Celebrations (free)
- Meditation Timer ($5/mo)

**For agencies:**
- Deliverables Tracker ($9/mo)
- Approval Queue ($9/mo)
- Timeline Visualizer ($9/mo)
- Campaign Performance Dashboard ($15/mo)
- Asset Library ($9/mo)
- Change Request Log ($5/mo)
- Weekly Report Auto-gen ($15/mo)
- Client Satisfaction Tracker ($9/mo — NPS + CSAT collection)

### 6.2 Block architecture (developer spec)

Each Marketplace client-side block is:

**A React component** that renders inside the tenant's portal iframe/container with:
- Standard props interface: `tenant_id`, `client_id`, `block_config` (per-tenant configuration), `paige_narration_enabled`
- Standard callbacks: `onDataChange(payload)` for writing to transformation metrics; `onEscalationRequest(reason)` for flagging urgent items to tenant
- Standard styling: respects tenant brand config (colors, typography, spacing) automatically
- Mobile-responsive by default (must pass mobile viewport tests before Marketplace approval)

**Backend module** deployed as a Supabase Edge Function:
- Standard interface for external API integrations
- Standard interface for writing to `client_transformation_metrics`
- Standard interface for scheduled jobs (daily/weekly rollup calculations)
- Credentials managed via tenant-provided config (BYOK model for expensive API integrations)

**Marketplace listing** with:
- Title, description, screenshots, video demo
- Price tier (free · $5 · $9 · $15 · $19 · $29 per month)
- Which Playbooks recommend/require this block
- Required data sources (which external APIs, which credentials)
- Publisher (Paige-native · third-party ecosystem developer · community)
- Rating, install count, reviews
- Documentation link

### 6.3 Revenue mechanics (per monetization strategy Layer 5)

**70/30 revenue split** on paid client-side blocks (builder 70 · platform 30 · standard Salesforce AppExchange terms).

**Bundle pricing:** Playbooks can bundle blocks at discount. Funding Playbook = $49/mo (includes FICO Tracker + Business Credit Tier + Funding Readiness + Credit Alert Feed at bundled rate; individual purchase would be $48/mo — so Playbook bundle saves $-1/mo but includes the Playbook infrastructure + Paige knowledge base + Broker role access, so real value is much higher).

**Tenant-purchased vs client-purchased:**
- Default: tenant buys the block, provides to all their clients
- Alternative: some blocks can be client-purchased (upsell inside the portal — "Upgrade your account to unlock the Full Nutrition Tracker") — tenant gets a share
- Alternative: some blocks are free to install for the tenant but per-client-per-month usage-billed (rare, mostly for high-cost API integrations)

**Marketplace catalog by tier:**
- Solo tier: access to Marketplace, install any block, pay per block
- Practice tier: 5 blocks included at no additional cost, then pay per additional
- Studio tier: 20 blocks included, unlimited install additional
- Enterprise: unlimited included

### 6.4 Third-party developer program (Phase 4 per monetization strategy)

Long-term, opens the platform for external developers to build blocks:
- Developer onboarding + Stripe Connect Express setup
- Block SDK + testing sandbox
- Marketplace listing review process
- Revenue-share payouts via Stripe Connect
- Developer community forum + docs

Not urgent (Phase 4 per monetization). File for later.

---

## 7. Brain integration per surface (§16 department mapping)

Every client-facing surface wires to the brain per §16 10-department model:

| Surface | Owning §16 dept | Brain wire-ups |
|---|---|---|
| Portal Home / config | Client Experience | Reads tenant portal config; renders per tenant brand + Playbook defaults |
| Custom tabs + blocks | Client Experience | Read from `tenant_portal_tabs` + `tenant_portal_tab_blocks`; RLS tenant+client-scoped |
| Client-facing Paige chat | Client Experience | L1 traces `context: "client_facing"`; L4 reasoning invoked; L6 memory scoped to this client |
| Transformation dashboard | Client Experience | Reads `client_transformation_metrics`; Paige-narration via L4 |
| Marketplace client blocks | Client Experience | Each block writes to `client_transformation_metrics`; Paige-narration per block config |
| Client 360 (tenant view) | Fulfillment / Client Success | Reads all above data for a specific client; adds tenant-only overlay |
| Cohort transformation view | Fulfillment / Client Success | Aggregates `client_transformation_metrics` across all clients per tenant |
| Success Coach at-risk queue | Fulfillment / Client Success | L4 reasoning on transformation trend + engagement signals produces prioritized queue |
| Escalation-to-human | Client Experience → routes to Fulfillment | §8 action bus fires event when client requests escalation |

**Test for every CX slice:** verify explicit wire-up to the brain primitives. If any client-facing feature doesn't hook into at least one brain layer, that's a §14/§16 violation — surface in compliance officer pass.

---

## 8. §9 hygiene — non-negotiable per layer

Client-facing anything is where §9 (tenant/operator isolation) matters MOST. Client-facing bugs = customer-visible cross-tenant leaks.

**Every CX slice must verify:**
- Client-facing Paige queries filter by tenant_id AND client_id server-side
- Marketplace block data models RLS-enforced on tenant + client
- No client can see another client's data via any query path (test with synthetic cross-tenant attack per §32 pattern)
- No client can see tenant operator data
- No cross-tenant leak in Marketplace block configuration
- No cross-tenant leak in transformation metric reads
- Every insert has server-derived tenant_id (never client-supplied — same class as 1c-vi and 1c-viii-a §9 catches)

**Standing crew pattern:** every CX slice's adversarial verifier runs a "cross-tenant client attack" simulation:
- Create two synthetic clients in different tenants
- Attempt to read client B's transformation metrics as client A
- Attempt to invoke Marketplace block for tenant B while authenticated as client A
- Attempt to escalate to human coach in tenant B while in tenant A's portal
- All attempts MUST be blocked at data layer (RLS), not just UI layer

---

## 9. Sequencing + gating

**Ship order:**

- **CX-1 — Config polish** — anytime (small, independent)
- **CX-2 — Composable portal architecture** — after Slice 1c wraps (Client Portal sub-tab exists but is basic)
- **CX-3 — Client-facing Paige** — after CX-2 lands (needs composable canvas to render inside)
- **CX-4 — Transformation primitive** — after CX-3 lands (Paige uses transformation data for narration)
- **CX-5 — Marketplace client-side blocks** — after CX-4 lands + Money Spine Layer 5 lands (needs Stripe Connect for revenue-share)

**Roadmap placement:**

- Post-Slice-1c wrap (all 12 sub-slices merged)
- Post-Money-Spine ship (need Layer 5 Marketplace revenue-share infrastructure for CX-5)
- BEFORE closed beta launches (Wave 1 founding partners need differentiated client experience)

**Gating conditions for CX workstream to start:**
- Slice 1c fully merged (12 sub-slices)
- Money Spine Lane B-i through B-iii shipped (subscription + credits + wave conversion)
- Money Spine Lane B-vi (Stripe Connect for Marketplace) at least designed (can activate later for CX-5)
- Communications workstream at least scoped (CX-3 escalation-to-human depends on it)

**Estimated CX workstream size:** comparable to Slice 1c overall — 8-12 sub-slices, each with own crew + verification cycle.

---

## 10. Related workstreams

**Communications workstream** (Conversations + Voice Layer):
- Escalation-to-human in CX-3 routes through Conversations
- Voice Layer enables Paige-voice interactions in client portal ("Talk to Paige" button)
- Both workstreams share the operator-inbox mental model
- Recommend CX-3 and Communications workstream ship in overlapping time frame

**Money Spine (Lane B):**
- Layer 5 (Marketplace revenue-share) infrastructure required for CX-5
- Layer 4 (rebillable services) can pipe client-side API integrations (e.g., credit monitoring) through tenant's billing
- Enterprise tier includes unlimited Marketplace blocks (or generous allowance) — decision needed pre-Phase-3

**Vertical Playbook expansion:**
- Each new Playbook (post-Funding: Consulting, Agency, Real Estate, Insurance, Healthcare, Legal, Financial Advisory) needs its own client-portal default template + client-Paige persona defaults + transformation metric definitions + recommended Marketplace blocks
- Playbook build = ~5-10 configuration files + Playbook-specific block library + documentation

**Analytics surface (Slice 1c-x):**
- Human vs Paige contribution breakout in Analytics reads from client-facing Paige activity
- Cohort transformation analytics feeds from `client_transformation_metrics`
- CX workstream feeds data INTO Analytics; Analytics READS from CX

**§16 department dashboards:**
- Client Experience department's dashboard in Team → Team Scoreboard shows aggregate client engagement + transformation performance
- Fulfillment department's dashboard shows delivery metrics
- Both audiences (operator + client) inform Paige's own performance measurement via L2 evals

---

## 11. Locked decisions

1. **CX is a distinct workstream, ships post-Slice-1c + post-Money-Spine, before closed beta launches**
2. **Composable portal architecture** — tabs + blocks + Playbook defaults; never fixed templates
3. **Client-facing Paige is a scoped instance of same brain** — never a separate stack; §9-clean scope filter server-side
4. **Three config entry points for client-facing Paige** — Client Portal config (day-to-day) · Paige tab (deep) · Playbook (vertical defaults)
5. **Transformation primitive is universal + Playbook-defined** — universal schema, per-Playbook metric definitions
6. **Marketplace client-side blocks at 70/30 revenue split** — standard AppExchange terms
7. **Playbook default portal templates** — every Playbook ships pre-configured portal + client-Paige defaults; tenant customizes freely
8. **§9-clean at every layer** — cross-tenant client attack test required per CX slice adversarial verifier
9. **Marketing value** — transformation metrics enable data-backed testimonials, ROI proof, and category-defining pitch differentiator
10. **Third-party developer program** — Phase 4 monetization, not urgent, filed for later

---

## 12. Open questions (to answer as data arrives)

1. **Custom tab caps per tier** — 3/8/unlimited placeholders; tune based on real usage patterns from Wave 1 beta
2. **Marketplace block pricing calibration** — $5-19/mo placeholders; validate with beta cohort willingness-to-pay
3. **Bundled Playbook pricing vs individual block pricing** — Playbook bundles should be discounted or roughly equal to individual purchase; test both models
4. **Client-purchased blocks (upsell inside portal)** — worth building? Or only tenant-purchased? Wait for Wave 1 signals
5. **Fitness tracker + banking + credit monitoring API integrations** — BYOK model (tenant provides API keys) or platform-provided (we manage keys, mark up costs)? Depends on user friction tolerance
6. **Third-party developer program timing** — Phase 4 default; could accelerate if strong Marketplace demand
7. **AI-generated progress photos comparison** — is that a real product ($19/mo Fitness Playbook block) or a placeholder? Validate with beta
8. **Cross-Playbook client experiences** — can a coach who runs BOTH fitness AND funding programs have a client portal with BOTH sets of blocks? Yes probably, but permission model needs care
9. **White-label deep customization** — beyond logo + colors, do we let Studio+ tenants override CSS entirely? Design token vs full custom
10. **Client-side language localization** — English-first, but portal should be i18n-ready by CX-2; timing of actual translations depends on international expansion (Phase 4)

---

## 13. Money-Spine implications (Layer 5 detail)

The CX workstream is where Layer 5 of the monetization stack (Marketplace revenue-share) meets real product. Money Spine (Lane B) needs to be built with awareness that:

- **CX-5 will generate Marketplace transactions** — Stripe Connect Express onboarding for block builders + revenue-share transfers
- **Every Marketplace block install fires a Stripe subscription** (for paid blocks) — Lane B-vi (Marketplace revenue-share) is where this lives
- **Client-purchased blocks (if enabled) require checkout flow inside the client portal** — new Money Spine surface
- **Playbook bundle pricing** — Money Spine needs to handle "purchase Playbook → auto-activate included blocks → discount vs individual" logic
- **Enterprise unlimited-Marketplace fair-use** — Money Spine tracks block installs even for Enterprise tenants for fair-use enforcement + reporting

**Recommendation:** Money Spine (Lane B) build should include a `marketplace_transactions` table + Stripe Connect design even if the actual Marketplace revenue-share doesn't activate until CX-5 ships. Build the primitive right; activate the feature later.

---

## 14. Success criteria — how we know CX shipped correctly

**CX-1 success:**
- Tenant config surface reads as enterprise-quality (§11 world-class floor)
- Logo upload guides users to correct file specs
- Live preview larger + more usable than pre-polish

**CX-2 success:**
- Tenants can add unlimited custom tabs (within tier caps)
- Tenants can compose blocks freely on any tab
- Playbook default templates load on Playbook activation
- Real tenant tests: create 3 fully-different client portals for 3 different vertical Playbooks in <15 minutes each

**CX-3 success:**
- Client can chat with client-facing Paige and never see cross-tenant or operator data
- Tenant can configure persona + skills + boundaries in <10 minutes
- Playbook defaults produce sensible client-Paige config out of the box
- Escalation-to-human flow routes correctly to assigned Success Coach + notifies

**CX-4 success:**
- Every Playbook has ≥3 transformation metrics defined
- Client can see their transformation dashboard on Progress tab
- Tenant can see Client 360 aggregation for any client
- Cohort view shows at-risk clients ranked by intervention priority
- Paige-generated narrative story arcs read naturally (validated with real cohort data)

**CX-5 success:**
- Marketplace catalog has ≥50 blocks across ≥5 verticals at launch
- Tenants can install + configure blocks in <5 minutes
- Revenue-share transfers work correctly via Stripe Connect
- Block builders can onboard + list a new block in <2 hours (with docs)
- Every block passes §9 cross-tenant attack test before approval

---

## 15. Owner action items (before CX workstream starts)

1. **Confirm Playbook priorities** — Funding first (Antonio's vertical), then Consulting + Agency + Business Coach in wave 2, then Fitness + Life Coach in wave 3. Real Estate + Insurance + Healthcare + Legal + Financial Advisory as later vertical expansion.
2. **Recruit block builders** — reach out to fitness apps, credit monitoring services, and business coaching tools for potential Marketplace block partnerships pre-CX-5 launch.
3. **Legal review of client data flow** — client-facing Paige processes personal client data; verify privacy policy + data handling compliance (GDPR, CCPA, HIPAA where relevant) before Wave 1 beta.
4. **Vertical block prioritization** — for the initial Marketplace launch, which blocks in the Funding vertical must be first-party (Paige-native) vs. third-party (community-built)? Recommend: FICO Tracker + Business Credit Tier + Funding Readiness Scorecard as first-party (own the core client experience); everything else can be first-party or third-party.

---

## 16. Related workstreams cross-reference

- Slice 1c-viii-c (Clients container) — shipped the Client Portal sub-tab that CX-2 will extend
- Slice 1c-ix (Team live ops) — Success Coach at-risk queue in CX-4 reads from Team scoreboard data
- Slice 1c-x (Analytics full surface) — cohort transformation view lives here
- Money Spine Lane B-vi (Marketplace revenue-share) — infrastructure for CX-5
- Communications workstream — escalation-to-human in CX-3 routes through Conversations
- Voice Layer — enables voice-Paige in client portal (CX-3 optional enhancement)
- Vertical Playbook expansion — every new Playbook is a CX configuration package

---

**End of doc. Locked at 2026-07-21 as future-execution spec. Amendments require owner review + explicit update. Next revision expected post-CX-2 launch to calibrate composability caps, block pricing, and Playbook default templates from real usage.**
