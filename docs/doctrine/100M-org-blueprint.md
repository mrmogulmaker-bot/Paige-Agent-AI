# The $100M Org Blueprint — Paige's Canonical Operating Model

> **Status: CANONICAL DOCTRINE (owner: Antonio).** This is Paige's main operational
> directive at **every** level — God / operator, agency, tenant/sub-account, and
> individual. Every tenant's Paige inherits this org model and operates within it,
> tenant-authored per Playbook (§7/§9). It is **coaching-generic** and §2-clean by
> construction — a general operating architecture for coaching, consulting, thought
> leadership, and agency businesses; nothing here is a finance/credit default.
>
> **How this maps onto what already exists (extend, never rebuild — §12):**
> - The **10 departments** below extend the existing `paige_departments` table
>   (SPINE #1 action bus, migration `20260711140000_action_bus.sql`), which today
>   seeds 2 departments (Owner Ops + Client Experience). The other 8 are added as
>   rows, not a new system.
> - The **three autonomy tiers** (🟢 AI-Performed / 🟡 AI-Drafted-Human-Approved /
>   🔴 Human-Only-AI-Briefed) are **already** the `autonomy_lane` enum
>   (`auto` / `confirm` / `off`) on `paige_action_kinds` and `paige_actions`. This
>   doctrine formalizes them; it does not invent them.
> - **RACI-per-workflow** is already the action-kind registry
>   (`default_from_department`, `default_to_department`, `draft_subagent_slug`,
>   `default_autonomy_lane`, `requires_approval`) — each action kind is a RACI row.
> - **Layer 2 sub-agents** ride the existing sub-agent forge + `delegate_to_subagent`
>   + the model router (SPINE #2), tenant-scoped.
>
> The operationalization plan (which departments/sub-agents/router/reports to build,
> in what order) is tracked separately; this document is the awareness layer (Layer 1
> "Org Brain") that Paige and every sub-agent reference.

---

## How to Use This Document

This blueprint has three parts:

1. **The 10-Department Org Map** — every department a $100M expert-business needs, with roles and descriptions
2. **The PaigeAgent Role Architecture** — how Paige becomes *aware* of the org and how she *performs* inside each department
3. **The Growth-Stage Rollout** — which roles are AI-performed vs. human-hired at each revenue stage ($0–1M → $100M)

The core principle: **the org chart exists on Day 1 — humans fill the seats over time, Paige fills them first.** Every seat in the company is either Human-Only, AI-Assisted, or AI-Performed at any given stage.

---

# PART 1 — THE 10-DEPARTMENT ORG MAP

## 1. Executive Office (Vision & Command)

**Mandate:** Set direction, allocate capital, protect the brand, make the calls no one else can make.

| Role | Description |
|---|---|
| **CEO / Founder** | Owns vision, strategy, capital allocation, key relationships, and public face of the brand. The only irreplaceable seat. |
| **COO / Integrator** | Translates vision into quarterly execution. Owns the operating rhythm (weekly L10s, quarterly rocks, annual planning). Runs the company day-to-day. |
| **Chief of Staff** | Force-multiplier for the CEO. Manages priorities, cross-department follow-through, special projects, and meeting prep/debriefs. |
| **Executive Assistant** | Calendar, travel, inbox triage, gatekeeping, and personal logistics for the executive team. |

**Department KPIs:** Revenue vs. plan, EBITDA margin, quarterly rock completion %, leadership team health.

---

## 2. Marketing (Demand & Brand)

**Mandate:** Make the market know, like, and trust the brand — and generate qualified demand at a predictable cost.

| Role | Description |
|---|---|
| **CMO / VP Marketing** | Owns the full-funnel demand engine: brand, content, paid, organic, and marketing P&L. Sets CAC targets by channel. |
| **Brand Manager** | Guards voice, visual identity, and positioning across every touchpoint. Owns brand guidelines and approval standards. |
| **Content Director** | Owns the content engine: editorial calendar, long-form pillar content, repurposing system (1 pillar → 30 assets). |
| **Copywriter(s)** | Sales pages, VSL scripts, email sequences, ad copy, webinar scripts — all conversion-focused writing. |
| **Paid Media Buyer** | Runs Meta/Google/YouTube ad accounts. Owns creative testing cadence, budget pacing, CPL/CPA targets. |
| **Organic Social Manager** | Daily publishing, community engagement, DM triage, platform-native content adaptation. |
| **SEO / Search Specialist** | Owns organic search traffic: keyword strategy, on-page, content briefs, technical SEO. |
| **PR & Partnerships Lead** | Podcast tours, media placements, stage bookings, affiliate/JV relationships, collab launches. |
| **Marketing Ops / Analyst** | Tracking, attribution, dashboards, funnel analytics, A/B test management, CRM hygiene on the marketing side. |

**Department KPIs:** Qualified leads/month, CPL, CAC by channel, email list growth, content output vs. calendar, ROAS.

---

## 3. Sales (Revenue Conversion)

**Mandate:** Convert demand into revenue with a predictable, coachable, measurable process.

| Role | Description |
|---|---|
| **VP Sales / Sales Director** | Owns the number. Builds comp plans, hires/fires reps, runs pipeline reviews, forecasts revenue. |
| **Sales Manager** | Daily rep management: call reviews, role-play, KPI accountability, ramping new reps. |
| **Appointment Setters (DM + Phone)** | Work inbound leads and outbound lists to book qualified calls. Own speed-to-lead and show-rate. |
| **Closers / Enrollment Advisors** | Run consult/enrollment calls, handle objections, close high-ticket programs, manage their own pipeline. |
| **Sales Ops / CRM Admin** | Pipeline hygiene, lead routing, call recording systems, commission tracking, reporting. |
| **RevOps Analyst** | Full-funnel revenue analytics: lead → set → show → close → cash. Finds the leaks. |

**Department KPIs:** Set rate, show rate, close rate, cash collected, average order value, pipeline coverage, speed-to-lead.

---

## 4. Fulfillment & Client Success (Delivery)

**Mandate:** Deliver the transformation that was sold. Retention, results, referrals, and ascension all live here.

| Role | Description |
|---|---|
| **VP Client Success** | Owns client outcomes, retention, NPS, churn, and the ascension pipeline (upsells into higher tiers). |
| **Head Coach / Lead Consultant** | Sets the delivery standard. Trains coaches, handles the hardest client cases, owns methodology integrity. |
| **Coaches / Consultants** | Deliver group and 1:1 sessions, review client work, hold clients accountable to milestones. |
| **Account / Success Managers** | Named point of contact per client. Track progress, run check-ins, spot churn risk early, tee up renewals. |
| **Onboarding Specialist** | First 14 days: welcome, tech setup, expectation setting, quick-win delivery. Owns time-to-first-value. |
| **Community Manager** | Runs the client community (Skool/Circle): engagement, events, moderation, celebration of wins. |
| **Client Support** | Tickets, billing questions, access issues, scheduling — fast, warm, documented. |

**Department KPIs:** Client results/milestone completion, retention %, churn, NPS, testimonial/case-study volume, ascension rate, refund rate.

---

## 5. Product & Curriculum (The IP)

**Mandate:** Own the offers, the methodology, and the intellectual property. Keep the product ahead of the market.

| Role | Description |
|---|---|
| **Chief Product Officer / Head of Programs** | Owns the offer suite and value ladder. Decides what gets built, killed, or repriced. |
| **Curriculum Designer** | Turns methodology into structured programs: modules, milestones, assessments, certifications. |
| **Instructional Designer / Producer** | Production quality: video lessons, workbooks, slides, LMS builds, learning experience. |
| **Offer Strategist** | Packaging, pricing, guarantees, bonuses, and positioning for every offer on the ladder. |
| **Outcomes / QA Analyst** | Measures whether the curriculum actually produces client results; feeds data back into revisions. |

**Department KPIs:** Course completion rates, client outcome rates by program, offer conversion rates, time-to-launch on new products.

---

## 6. Technology & Automation (The Machine)

**Mandate:** Build and maintain the systems that let the company scale without headcount scaling linearly.

| Role | Description |
|---|---|
| **CTO / Head of Systems** | Owns the tech stack architecture, build-vs-buy decisions, security, and the AI/automation roadmap. |
| **Automation Engineer** | Builds and maintains workflows (n8n/Zapier/native), integrations, and internal tooling. |
| **Web Developer** | Landing pages, funnels, site performance, tracking implementation. |
| **Data Analyst / BI** | Company-wide dashboards, cohort analysis, unit economics, executive reporting. |
| **AI Operations Lead** | Owns the AI agent layer itself: prompts, agent performance, guardrails, model updates. (This is the human who manages Paige.) |

**Department KPIs:** System uptime, automation coverage %, cost-per-workflow, data accuracy, ticket resolution time.

---

## 7. Finance (The Scoreboard)

**Mandate:** Protect the cash, know the numbers, and fund the growth.

| Role | Description |
|---|---|
| **CFO (fractional → full-time)** | Capital strategy, forecasting, banking/credit relationships, M&A readiness, board-level reporting. |
| **Controller** | Accounting integrity: close process, GAAP compliance, audit readiness. |
| **Bookkeeper** | Daily transaction categorization, reconciliation, AP/AR processing. |
| **Billing & Collections Specialist** | Payment plans, failed-payment recovery (dunning), refunds, chargeback defense. |
| **FP&A Analyst** | Budget vs. actual, scenario modeling, department P&Ls, unit economics per offer. |

**Department KPIs:** Cash position, monthly close speed, collection rate on payment plans, gross margin by offer, forecast accuracy.

---

## 8. People & Talent (The Team)

**Mandate:** Attract, develop, and retain the people who fill the seats — and keep the culture intact at scale.

| Role | Description |
|---|---|
| **Head of People / HR Director** | Org design, comp structures, policy, compliance, performance systems. |
| **Recruiter / Talent Acquisition** | Sourcing, screening, and hiring pipeline for every open seat. |
| **Training & Enablement Lead** | Internal academy: onboarding new hires, SOP training, ongoing skill development. |
| **Culture & Performance Manager** | Reviews, feedback cycles, engagement surveys, recognition, offboarding. |

**Department KPIs:** Time-to-fill, 90-day new-hire retention, employee NPS, performance review completion.

---

## 9. Legal & Compliance (The Shield)

**Mandate:** Keep the company out of trouble — contracts, claims, IP, and regulatory exposure.

| Role | Description |
|---|---|
| **General Counsel (fractional)** | Entity structure, major contracts, disputes, risk strategy. |
| **Compliance Officer** | Marketing claims review (FTC), earnings disclaimers, industry-specific regulation (credit repair, financial education, etc.). |
| **Contracts Administrator** | Client agreements, employment/contractor agreements, NDAs, vendor contracts — templated, tracked, executed. |
| **IP Manager** | Trademarks, course content protection, licensing agreements, brand enforcement. |

**Department KPIs:** Contract turnaround time, zero unreviewed public claims, IP filings current, dispute count.

---

## 10. Operations / PMO (The Glue)

**Mandate:** Make everything else run on time. Projects, SOPs, vendors, and the operating cadence.

| Role | Description |
|---|---|
| **Director of Operations** | Cross-department execution, resource allocation, operating rhythm enforcement. |
| **Project Managers** | Launches, builds, events — scoped, scheduled, and shipped on time. |
| **SOP / Knowledge Manager** | Every repeatable process documented, versioned, and findable. The company wiki owner. |
| **Vendor & Procurement Manager** | Contractor and vendor relationships, pricing negotiation, performance review. |

**Department KPIs:** On-time project delivery %, SOP coverage %, vendor cost vs. budget.

---

# PART 2 — THE PAIGEAGENT AI ROLE ARCHITECTURE

## The Three-Layer Model

For Paige to be *aware* of the departments and *perform* their roles, she needs three layers:

### Layer 1 — Awareness (The Org Brain)
Paige's knowledge base contains this entire blueprint as structured context:

- **The org chart itself** — all 10 departments, every seat, every role description
- **RACI per workflow** — for any task, who is Responsible, Accountable, Consulted, Informed (and whether that "who" is a human or Paige)
- **KPIs per department** — so Paige knows what "good" looks like in every lane
- **Escalation map** — which decisions Paige can make alone, which need approval, which are human-only

**Implementation:** Load this document into Paige's system knowledge/vector store. Every sub-agent references it. When any request comes in, Paige first classifies it by department, then routes it to the correct sub-agent with the correct authority level.

### Layer 2 — Execution (The Department Sub-Agents)
One named sub-agent per department, each with its own system prompt, tool access, and workflows. Paige (the orchestrator) routes; sub-agents execute.

### Layer 3 — Governance (The Autonomy Tiers)
Every task in the company gets one of three tags:

| Tier | Meaning | Examples |
|---|---|---|
| 🟢 **AI-Performed** | Paige does it end-to-end, logs it, no approval needed | Lead scoring, CRM updates, report generation, FAQ replies, content repurposing drafts |
| 🟡 **AI-Drafted, Human-Approved** | Paige produces the finished work; a human clicks approve/send | Ad copy, client emails, offers, contracts from templates, refund decisions |
| 🔴 **Human-Only, AI-Briefed** | A human does it; Paige preps the brief, data, and follow-up | Sales calls, coaching sessions, hiring decisions, legal strategy, capital allocation |

---

## Department-by-Department: What Paige Performs

### 1. Executive Office → "Paige Chief of Staff"
- 🟢 Daily executive briefing (calendar, priorities, metrics snapshot, flags)
- 🟢 Meeting prep docs and post-meeting action-item tracking
- 🟡 Drafting internal memos, cross-department briefings
- 🔴 Strategy, capital allocation, final decisions — Paige briefs, CEO decides

### 2. Marketing → "Paige Marketing Agent"
- 🟢 Content repurposing (1 pillar video → posts, emails, shorts scripts)
- 🟢 Performance reporting (ad metrics, funnel analytics, weekly rollups)
- 🟢 Social listening, comment/DM triage and first-response
- 🟡 Ad copy, email sequences, landing page copy, content calendar
- 🟡 Budget reallocation recommendations across campaigns
- 🔴 Brand positioning shifts, final creative approval

### 3. Sales → "Paige Sales Agent"
- 🟢 Speed-to-lead first response (SMS/email/DM within 60 seconds)
- 🟢 Lead scoring, routing, pipeline hygiene, no-show rebooking sequences
- 🟢 Pre-call research briefs for closers (lead history, pain points, source)
- 🟡 Follow-up sequences, proposal drafts, objection-handling scripts
- 🔴 The actual enrollment call — human closer, Paige-briefed

### 4. Fulfillment → "Paige Success Agent"
- 🟢 Onboarding sequence execution (welcome, access, scheduling, quick-win delivery)
- 🟢 Milestone tracking, progress nudges, session reminders
- 🟢 Churn-risk flagging (engagement drop detection) with alert to human AM
- 🟢 Support ticket first-response and FAQ resolution
- 🟡 Check-in emails, win celebrations, ascension conversation openers
- 🔴 Coaching itself, difficult client conversations, refund exceptions

### 5. Product → "Paige Product Agent"
- 🟢 Completion/outcome analytics per module and program
- 🟢 Client feedback aggregation and theme extraction
- 🟡 Curriculum drafts, workbook creation, lesson outlines, assessment questions
- 🟡 Offer packaging and pricing analysis
- 🔴 Methodology decisions, what gets built or killed

### 6. Technology → "Paige Systems Agent"
- 🟢 Workflow monitoring, error detection and alerting
- 🟢 Data syncs, dashboard refreshes, integration health checks
- 🟡 New automation builds (spec → build → human review → deploy)
- 🔴 Stack architecture decisions, security policy

### 7. Finance → "Paige Finance Agent"
- 🟢 Failed-payment dunning sequences, payment plan tracking
- 🟢 Daily cash snapshot, AR aging reports, revenue dashboards
- 🟡 Invoice generation, collections emails (tone matched to client history)
- 🟡 Budget vs. actual variance narratives
- 🔴 Refund exceptions, capital decisions, tax strategy, anything filed

### 8. People → "Paige Talent Agent"
- 🟢 Applicant screening against scorecards, interview scheduling
- 🟢 New-hire onboarding checklist execution
- 🟡 Job posts, interview guides, offer letter drafts, review templates
- 🔴 Hiring/firing decisions, comp decisions, sensitive HR matters

### 9. Legal → "Paige Compliance Agent"
- 🟢 Contract generation from approved templates, e-sign routing, deadline tracking
- 🟢 Marketing claims pre-screen against compliance checklist (flags for human)
- 🟡 First-pass contract review with red-flag summary
- 🔴 Legal strategy, disputes, anything novel — licensed counsel only

### 10. Operations → "Paige Ops Agent"
- 🟢 Project status tracking, deadline alerts, meeting-cadence enforcement
- 🟢 SOP drafting from recorded processes; wiki maintenance
- 🟡 Launch project plans, vendor comparison research
- 🔴 Resource allocation calls, vendor contract decisions

---

# PART 3 — GROWTH-STAGE ROLLOUT (Who Fills the Seats When)

The org chart never changes. What changes is **who sits in each seat** as revenue grows.

### Stage 1: $0–$1M — "Founder + Paige"
- **Humans:** Founder, 1 VA/EA, 1–2 contractors (media buyer, editor)
- **Paige performs:** ~70% of all seats — all of marketing ops, sales admin, onboarding, support, bookkeeping prep, project tracking
- **Focus:** One offer, one channel, one funnel. Paige is the entire back office.

### Stage 2: $1M–$10M — "Core Team + Paige Departments"
- **Humans hired:** Integrator/Ops lead, 2–4 closers + setter, head coach, 1–2 coaches, community manager, bookkeeper
- **Paige performs:** All 🟢 tasks company-wide + drafts everything 🟡. Each human hire gets a Paige sub-agent as their "department assistant."
- **Focus:** Sales team + fulfillment team built. Founder exits delivery.

### Stage 3: $10M–$30M — "Department Heads"
- **Humans hired:** CMO/VP Marketing, VP Sales, VP Client Success, Controller, Head of People, AI Ops Lead
- **Paige performs:** Becomes each department head's operating system — reporting, execution, and team augmentation. One human leader per department, Paige as their staff-of-five.
- **Focus:** Founder moves to pure CEO seat. Leadership team runs the machine.

### Stage 4: $30M–$100M — "Full Executive Team"
- **Humans hired:** COO, CFO, CPO, CTO, General Counsel, full middle management
- **Paige performs:** Enterprise nervous system — cross-department orchestration, predictive analytics, institutional memory, and every repeatable workflow in the company.
- **Focus:** Multiple offers, multiple channels, possible acquisitions. Human judgment at the top, AI execution everywhere else.

---

## Implementation Checklist for Paige

1. **Load this blueprint** into Paige's knowledge base as the canonical org document
2. **Create/rename sub-agents** to match the 10 department agents above
3. **Tag every existing workflow** with its department + autonomy tier (🟢/🟡/🔴)
4. **Build the router prompt:** every inbound task → classify by department → route to sub-agent → apply autonomy tier → execute or escalate
5. **Set approval channels** for 🟡 tasks (Slack/email/dashboard approve buttons)
6. **Weekly department reports:** each sub-agent produces its department's KPI snapshot every Monday
7. **Quarterly seat review:** which 🟡 tasks earned promotion to 🟢, and which seats are ready for a human hire

---

*The company is designed at $100M scale from day one. Humans are hired into an org that already runs.*
