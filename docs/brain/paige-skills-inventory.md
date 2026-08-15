# Paige Skills Inventory (v1) — what Paige DOES at professional level

The Paige Skills Inventory documents what Paige DOES at professional level — the atomic capabilities that
make her the AI-COO for client-based service businesses (coaches, consultants, agencies, thought leaders,
advisors). It complements the GOAT Anchor Registry (§14 — whose thinking anchors her methodology). **This is
what she executes; that is what she reasons from.** The inventory is investor-facing IP disclosure alongside
the GOAT registry; both together document the intelligence layer as an acquirable, defensible asset.

**IP posture (unchanged from §14):** skill mechanics live in `paige_skills` rows as mechanic-descriptive text
(no branded framework names, no anchor person names hardwired). Attribution lives in the GOAT registry only.
Paige's conversational chat may pay occasional taste-level homage; hardwired defaults never.

**Seeding strategy (per §62 draft):** platform baseline skills for each category are pulled from existing OSS
skill repos (Anthropic Skills registry + community aggregators + owner-curated local skills) and distilled
mechanic-descriptive per §14 IP-clean rule. Tenants additionally load their own GitHub-repo skills via the
tenant-loadable-skills surface (sequenced as a follow-up wave after S2 baseline seeding completes). Sourcing
lineage recorded in migration commit bodies only, never in `paige_skills` rows.

**Sequencing gate (owner ruling, 2026-08-11):** ALL 12 categories must be seeded before Task #126 (Paige
web-browser install) begins. The professional-skills library is the operating instinct that drives Paige's
browsing intelligence — the library comes first, the browser comes after.

---

## 1. Vision & Strategy
- Vision interpretation — unpack owner's vague language into concrete definition
- Vision creation — help owner articulate what they actually want if they can't
- Vision → roadmap translation — decompose vision into 12-month / 90-day / weekly milestones
- Vision → daily actions — surface today's 3 moves that serve the vision
- Where-you-are diagnostic — business-state intake (revenue, team, client count, offer, gaps)
- Gap analysis — current state vs vision, prioritized deltas
- Scaling roadmap — the pathway from N to 10N with checkpoints
- Quarterly OKR-style planning — outcome + key results + weekly rituals
- Risk identification — surface what could derail the plan

## 2. Client Delivery
- Client onboarding — kickoff sequence, intake forms, expectation-setting
- Kickoff call agenda — first-meeting template + agenda
- Milestone tracking per client — where each client is in the journey
- Deliverable drafting — whatever the tenant's offer delivers (assessments, plans, reports)
- Progress check-in cadence — weekly/biweekly/monthly rhythm per client
- Wrap-up / graduation sequence — end-of-engagement flow
- Reactivation sequence — bringing lapsed clients back

## 3. Sales & Growth
- Lead triage — score inbound leads by fit and urgency
- Outreach drafting — cold email / LinkedIn / DM personalized to prospect
- Follow-up sequences — nurture cadence for warm/cold prospects
- Pipeline management — deal-stage movement, stale-deal detection
- Forecast — weighted revenue projection
- Competitive intelligence — battlecard-style comparison
- Discovery call prep — pre-call brief with account research
- Discovery call summary — post-call notes + next steps
- Proposal drafting — matches tenant's offer + prospect's needs
- Objection handling library — how to respond to common price/timing/authority objections

## 4. Marketing & Content
- Content strategy — what to post, when, why (per audience/goal)
- Brand voice enforcement — check any draft against tenant's brand
- Blog post drafting
- Social post drafting (per-platform native — LinkedIn / X / IG / TikTok / YouTube)
- Email newsletter drafting
- Ad copy drafting (per-platform)
- Landing page copy
- Campaign planning — multi-touch multi-channel plan for a launch
- Email sequence design — nurture / launch / re-engagement / win-back
- SEO audit — surface content gaps + keyword opportunities
- Performance report — what worked, what didn't, what to change

## 5. Document Creation (per Studio scope §19)
- Offer letter (hire, contractor, engagement)
- Proposal (SOW-style, client-scoped)
- Contract (basic templates — not legal advice; escalate for real terms)
- Welcome email (client / new hire / list)
- Follow-up email
- Meeting recap
- Meeting agenda
- One-pager (offer, service, credentials)
- Case study (client outcome writeup)
- Ebook / guide / playbook
- Checklist / worksheet
- Sales letter / long-form DR copy
- SOP / process document
- Onboarding packet
- Offboarding / termination document
- Invoice / statement of work
- Reminder / dunning notice
- Testimonial interview outline
- Board deck / investor update
- Landing page draft
- Funnel step drafts (each page in a multi-step funnel)

**Format layer (per §19/Task #50 — S1d shipped):** every document skill offers Word / Google Doc / PDF /
Markdown before generating.

## 6. Analytics Interpretation
- Revenue trend read — MRR / ARR / cash-flow direction + narrative
- Pipeline health read — coverage, velocity, stale deals
- Engagement read — email open/click, content performance, social growth
- Conversion funnel diagnosis — where prospects drop, why
- Cohort analysis — retention/expansion by acquisition month
- Churn signal detection — surface at-risk clients before they leave
- Ad spend efficiency — ROAS, cost-per-lead, wasted spend detection
- Client-progress health — per-client scoring on their journey
- Weekly business review synthesis — 5-minute read of the week
- Monthly QBR draft — what happened, what changed, next 30 days
- Quarterly narrative — story-level synthesis, not just numbers

## 7. Team Management & Team Building
- Job description drafting — per role
- Interview process design — stages, scorecard, questions
- Interview questions per role
- Role definition / responsibility map — who owns what
- Org chart mapping — visualize current + target structure
- Hiring pipeline management — candidate stages, follow-ups
- New hire onboarding sequence — Day 1 / Week 1 / Month 1 / 90-day
- Performance review templates — self + manager + peer
- 1:1 meeting agenda — recurring 1:1 structure
- Compensation benchmarking — generic ranges by role/geo (not advice)
- PIP / difficult-conversation script
- Offboarding sequence
- Sub-account team building (platform-native — tenants adding their team as sub-accounts)

## 8. Financial Ops (tenant-facing, not accounting advice)
- Invoice generation + send
- Invoice follow-up / dunning
- Cash-flow snapshot — 30/60/90-day outlook
- Reconciliation prep — flag AR/AP mismatches
- Month-end close prep — checklist + narrative
- Price analysis — margin per offer, pricing scenario modeling
- Tax prep organizer — quarterly estimates, 1099s, year-end handoff to CPA

## 9. Compliance & Legal (basic — escalate for real)
- Contract review — plain-English read with flagged concerns
- NDA triage — standard / needs-review / escalate
- Policy lookup — quick answer on tenant's own policies
- Risk assessment — surface obvious flags on a proposed action
- Escalation routing — when to bring in real counsel

## 10. Operations & Process
- SOP drafting — capture how a repeatable task gets done
- Runbook drafting — for recurring operational tasks
- Process optimization — identify bottlenecks, propose fixes
- Change request — structured proposal + rollback plan
- Status report — weekly / monthly ops summary
- Vendor review — evaluate a proposed vendor
- Capacity planning — team utilization forecast
- **Verify deployed surface** — `verify_deployed_surface` skill (SEEDED, Task #126 Slice 2): drives a deployed public Paige page read-only and reports an honest render verdict (§32.c software counterpart).
- **Browse a public web page** — `browse_public_url` skill (SEEDED, Task #126 Slice 3b): opens an arbitrary public URL read-only (via the SSRF-guarded `paige-browser` `/browse-public-url`), extracts title/meta/headings/body/links, and summarizes honestly; every call writes one tenant-scoped `paige_browser_usage` audit row (§9/§17). `read_only`+`auto`, `scoping='platform'`, tier §61 default.

## 11. Agent Orchestration (§14 + §16 — Paige's meta-skill)
- Sub-agent roster knowledge — knows who exists, what each does
- Delegation — routes work to the correct specialist
- Composition — chains agents into multi-step flows
- Agent forging — recognizes when to spin up a new specialist, drafts the spec for approval
- Agent-learning loop — capture what worked / didn't, update the agent's playbook (§34 L6)
- Cross-department action-bus routing (§16) — files actions to the right department at the right autonomy tier
- Recognizes when to NOT use an agent — sometimes a direct reply is better than a delegation

## 12. Superpowers — imported capabilities from the Claude Skills ecosystem

**Document/file creation:** docx (Word — formatting, TOC, letterheads) · pptx (slide decks) · xlsx (Excel with
formulas/formatting) · pdf (create, fill, extract)

**Design/visual:** canvas-design (visual art, posters) · brand-guidelines / brandkit · algorithmic-art ·
imagegen-frontend-web / mobile · high-end-visual-design / apple-design / emil-design-eng · theme-factory

**Product/build:** web-artifacts-builder · image-to-code · mcp-builder · skill-creator

**Ops/rhythm:** morning (daily briefing pattern) · schedule (recurring task setup) · learn (conceptual
explanation) · doc-coauthoring

**Meta:** memory-management · task-management

---

## Amendments log
- **v1 (2026-08-11):** initial 12-category structure filed, owner-approved as launch pad. Sequencing gate:
  all categories seeded before Task #126 browser install. §62 two-tier sourcing (PROPOSED): baselines pulled
  from OSS + tenant-loadable custom skills.

## Sequencing recommendation (S2 seeding order — owner may reorder)
1. Vision & Strategy — foundational
2. Document Creation — Studio §19 high-visible-value
3. Client Delivery — direct AI-COO value
4. Sales & Growth — revenue-generating
5. Marketing & Content — top-of-funnel
6. Analytics Interpretation — requires accrued tenant data
7. Team Management & Building — later-stage tenant need
8. Financial Ops — later-stage tenant need
9. Compliance & Legal — defensive
10. Operations & Process — scaling-stage
11. Agent Orchestration — meta / Paige-on-Paige
12. Superpowers — imported from Claude Skills ecosystem

## Cross-references
`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §15 (this inventory, investor-facing twin) · §14 (GOAT registry —
whose thinking anchors her) · `CLAUDE.md` §16 (10-department model) · §19 (Studio document scope) · §62
(two-tier sourcing) · `docs/doctrine/skills-vocabulary.md` (concept 1 = `paige_skills`).
