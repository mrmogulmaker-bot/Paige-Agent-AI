# Paige Agent AI — Master Project Reference

**The single source of truth. Read this first, every session, every day.** Cowork · Claude Code · Codex — all three agents open this doc before responding to anything substantive. It reflects the reality of the codebase (§13 honesty), not memory.

**Locked:** 2026-08-09 by Antonio Cook + Cowork · **Owner:** Antonio · **Living:** update on every merge · **Cross-refs:** every deeper doc is in Section 9.

> **Note on identifiers (§11/§34):** operator-infrastructure account SIDs (Twilio Org/Account/subaccount SIDs, etc.) are **redacted** from this in-repo doc — GitHub secret-scanning blocks them and doctrine keeps them out of artifacts. The literal values live in the owner's Twilio console + the owner handoff, never in the repository.

---

## 0. How to use this doc (the daily protocol)

### Session-start ritual (Cowork / CC / Codex — every session)

Before responding to ANY substantive request:
1. **Read Section 4** — What's SHIPPED. Never claim something isn't built without checking this first.
2. **Read Section 5** — Current focus + gaps. This is what the platform genuinely needs next.
3. **Read Section 7** — Sequential roadmap. Know what's queued so proposals fit the plan.
4. **Read Section 10** — §13 corrections log. Cowork/CC/Codex have made memory mistakes; the corrections here prevent repeats.

If the request touches a specific slice, load the canonical deep doc for it from Section 9.

### Session-end ritual (any agent that ships work)

1. **Update Section 4 checkboxes** — a capability just became SHIPPED
2. **Update Section 5 status** — a gap closed, or a new one surfaced
3. **Log §13 corrections in Section 10** if the work revealed the codebase disagreed with what someone claimed
4. **Cross-post to the brain** (`docs/brain/` once PR #410 merges)
5. **Commit** with message: `docs(master): update after <PR#/slice>`

### Cowork paste-to-CC/Codex standard

Every paste Cowork produces for CC or Codex includes the line:
> Reference `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` Sections 4 + 5 before starting; update Section 4 on merge; log any §13 corrections in Section 10.

---

## 1. Vision & MVP Definition

### What Paige is

Paige is the **AI COO** for a client-based service business — coaches, consultants, agencies, thought leaders, advisors. Not a chatbot. Not a CRM. An intelligent, tenant-authored, two-way client portal (§7) that orchestrates a team of specialist sub-agents (§8, §14) across a 10-department operating model (§16), and stays Paige-governable end-to-end so an operator or a tenant can drive it by voice or chat (§10, §20).

**Two audiences, one brain (§7 + §8):**
- **For the operator/tenant:** pipeline, follow-ups, retainers, content, campaigns, at-risk triage, daily brief
- **For each client:** hyper-personalized portal, onboarding, expert probing, answers, nurture

**The moat is intuitiveness (§36):** every capability enters through a path a non-technical owner can discover in <5 minutes. If the user has to learn how to prompt, we've regressed the category.

### What MVP means

Per `docs/doctrine/canonical-build-order.md` (owner-locked 2026-08-08):

**MVP = Wave 4 ("MVP integration hub").** Wave 4 combines:
- The 4 Owner Trilogy platform pillars (Section 2)
- The 5 Cowork-locked product specs (Section 2)
- BRD-promoted MVP items: L8 Memory Fabric (was W5) · Interactive Analytics UI (was S2) · Playwright web-browsing (was W7) · Promotional account type (NEW) · Paige chat compaction + persistent history + persistent tasking (BRD §174-176)

**GA target:** ~Month 16 per `docs/strategy/monetization-rollout-2026-07-21.md` (Phase 2 of the 5-phase rollout: Closed Beta → Public Beta → GA → Scale → Category Leadership).

**"Launch-ready" gates:**
- Track S security cluster complete (per `docs/paige-master-implementation-order.md`)
- Wave 8 = BETA LAUNCH prep (#135 Codex sweep · #74 logo scrub · #194+#195 Stripe wire-up · #129 tenant lifecycle wind-down)
- Wave 9 = SOC 2 (post-BETA)

---

## 2. Owner Trilogy — the load-bearing pillar structure

Two pillar systems working together — the platform-side differentiators + the customer-portal ownership matrix.

### Platform-side (4 pillars, owner-locked 2026-08-04)

Canonical strategy doc: **`docs/strategy/owner-trilogy-2026-07-26.md`** (715 lines, revised 2026-08-04).

**§13 correction:** the name says "Trilogy" but the current owner-locked spine has FOUR pillars, not three. Do not shorten to three from memory.

| # | Pillar | What it does | Status | Backing research |
|---|---|---|---|---|
| 1 | **Systems Check** | Automated audit of tenant's operating stack (30-check catalog) | Task #80 · spec pending | `docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md` |
| 2 | **Business Vault** (L1 → L2/L3/L4 partner stack) | Compliance obligations tracker with legal/tax/HR partner network | Task #81 (L1 first) · spec pending | `docs/strategy/business-vault-partner-landscape-2026-07-26.md` |
| 3 | **Twin Capabilities** | Direction A: browser-agent · Direction B: team-member twin · Direction C: business twin | Direction A in Wave 4 | `docs/strategy/twin-capabilities-landscape-2026-07-26.md` |
| 4 | **Owner Analytics + Competitive Intelligence (Newswire)** | Live comp analysis + competitive intelligence feed | Tasks #203 (Live Comp) + #100 (Newswire) + #97 (Integrity substrate) | `docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md` |

**Audit-trail** (sometimes mentioned): maps to **§39 Integrity Governance**, a doctrine section (drafted in `docs/doctrine/claude-md-amendment-draft-2026-07-28.md`), NOT a fifth pillar.

### Customer Portal-side (7 pillars × 5 stakeholders, LOCKED SPEC 2026-08-08)

Canonical: **`docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md`**.

**7 pillars:**
1. **Journey & Progress** — where the client is in the tenant's program
2. **Communications** — messages between client and tenant, Paige-mediated
3. **Documents & Deliverables** — signed agreements, session recaps, coach-produced work
4. **Payments & Billing** — **§38 CRITICAL:** tenant BYO-processor; Paige is never merchant of record for tenant→client transactions
5. **Sessions & Calendar** — booked sessions, kickoffs, reminders, reschedules
6. **Profile & Consent** — client's own PII, communication preferences, data-sharing consents
7. **Support & Help** — how the client reaches the tenant, Paige, or platform support

**5 stakeholders × rights matrix:** Client · Tenant/Coach · Sub-account · Agency · God/Super Admin, with **OWN · CONFIG · WRITE · READ · —** per pillar cell. See the LOCKED SPEC for the full matrix.

---

## 3. Supporting doctrine (§ index)

### Live in `CLAUDE.md` (root — loaded every session)

§§1-48 currently active. Load-bearing for daily work: §1 crew · §2 audience (coaching/consulting/agency, no finance defaults) · §3 voice · §4 shipping · §5 compliance officer · §7 intelligent portal · §8 Paige's team · §9 tenant/operator seam · §10 Paige-governable · §11 world-class floor · §13 honest engineering · §14 Paige's own team · §16 10-department model · §17 $1B growth map · §18 no fragmentation · §22 studio cinematic bar · §25 taste · §27 facelift · §30 diagnose-then-strip · §32 dual-leg verification · §32.a persisted-apply · §32.b RLS SET ROLE · §32.c live-drive · §34 own the moat · §35 OS north star · §36 intuitiveness moat · §37 producer inventory (8 caller classes) · §38 money boundary · §39 peer-gate · §44 ASK don't assume · §46 Cowork rhythm · §47 MCP migrations commit-same-beat · §48 rate-limit scope discipline.

### Proposed in `docs/doctrine/claude-md-amendment-draft-2026-07-28.md` (owner sign-off pending, Task #93)

§§40 Revenue-Stage Awareness · §41 Entity-Type Awareness · §42 Paige C-Suite · §43 Surface-is-a-Tool · §45 Sellability · §49 Unified Comms.

### Security cluster (`docs/security/DOCTRINE_*.md`)

§190/191/192 Phase B Codification (encryption) · §194 Credit Monitoring NEVER Repair · §197 Billing Layer Taxonomy L1-L4 · §198 Legacy Deprecation Protocol + Addendum · §200 Platform Independence from Reference Tenant · §201 Public Language Discipline · §202 Multi-Entity Contact Model · §203 Product Lane Separation Runtime · §205 Metering Safety Net · §208 Shape Delta Discipline · §210 L2/L3 Scope Boundaries · §211/§212 Enforcement · §213 Migration Shape Discipline · §213.c retro.

### Paige-strategic doctrine (`docs/doctrine/paige-*.md`)

`100M-org-blueprint.md` (§16 canonical) · `1B-growth-map.md` (§17 canonical) · `paige-os-architecture.md` (§35 derived) · `money-spine-architecture.md` (§38 derived) · `paige-c-suite-roster.md` (proposed §42) · `paige-corporate-structure-2026-08-01.md` (Wyoming LLC → Delaware C-Corp + QSBS + Core Connect holdco + TX domicile) · `paige-memory-fabric-l8-2026-07-28.md` (L8 owner-flagged, promoted into MVP) · `paige-unified-comms-substrate-2026-07-29.md` (§49) · `paige-voice-layer-2026-07-28.md` · `paige-chat-universal-control-surface-2026-07-28.md` · `paige-practice-blueprints-2026-07-29.md` (deferred past W4 per owner ruling 2026-08-08) · `tenant-lifecycle-winddown-2026-07-28.md` (Task #129) · `paige-n8n-orchestrator-brain-doctrine.md` (Task #118 template library).

---

## 4. What's SHIPPED (stop asking about these)

**§13 discipline:** every ✅ here has file/migration/PR evidence in the audit at `outputs/systems-inventory-2026-08-09` (Cowork's inventory work of 2026-08-09). If you're about to say "we don't have X," check this section first. **CC's code check is authoritative** — if your grep disagrees with this section, log a §13 correction in Section 10 and update Section 4 in the same PR.

### Third-party integrations WIRED + CONFIGURED

- ✅ **Twilio — ISV/reseller architecture LIVE at Twilio's side; number-search UI is the only remaining gap.**
  - **Organization:** Paige Agent AI LLC · Org SID `<redacted — owner's Twilio console>` · verified domain paigeagent.ai · 1 managed user (Antonio Cook, info@paigeagent.ai) · 1 billing group
  - **Master account:** `<redacted — owner's Twilio console>` (owned by Antonio Cook, created 04/21/2026, Active)
  - **Subaccounts (5 active, provisioned manually via Twilio console, naming convention `Paige – <Tenant Name>`; SIDs in owner's console):**
    - Paige – Antonio Daniel LLC
    - Paige – Claude Studio Dev ⚠ tenant being deleted in #29 — subaccount will orphan at Twilio (owner cleanup at Twilio console)
    - Paige – First Sterling Capital
    - Paige – Mogul Maker Academy
    - Paige – Project Mogul Enterprise Inc
  - **Envs currently in code (NAMES only):** `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_PHONE_NUMBER` · `TWILIO_FROM` — MASTER account creds.
  - **Purchase capability EXISTS** — that's how subaccounts have numbers assigned today.
  - **Only remaining gap:** phone-number SEARCH tools inside the Communications console (vanity 800 · pattern-matched · premium registry search). Task #27 scope.
- ✅ **Stripe** — live-mode webhook + checkout + Marketplace + Connect wiring started. Functions: `stripe-webhook`, `create-checkout`, `create-trial-checkout`, `customer-portal`, `check-subscription`, `marketplace-checkout-session`, `tenant-checkout-session`, `tenant-stripe-connect`. B-iv storefront webhook merged (PR `9f9b6cf7`). B-ii-a marketplace paid install merged (PR `c95a7e16`). Data: `platform_subscriptions` table.
- ✅ **ElevenLabs** — TTS + ConvAI. **Voice = Ivanna.** ConvAI agent `agent_1601k7zn6bs7e72bt6485bp99v4a`, model `eleven_turbo_v2_5`. Code in BOTH `_shared/tts-router.ts` (in-app chat voice path — per CC code check) AND `_shared/elevenlabs.ts` (ElevenLabs client). See Section 10 for the precise voice-env attribution (`ELEVENLABS_VOICE_ID` drives Studio VO, not the in-app chat voice).
- ✅ **Supabase** — Postgres + RLS + edge functions + auth. Prod ref `xygzykjyynhzqytbqnzu`. 231+ edge functions. 688+ migrations. RLS helpers: `is_platform_owner()` (operator scope), `current_user_tenant_id()` (tenant scope).
- ✅ **Vercel** — deploy target. `vercel.json` at repo root.
- ✅ **LLM providers via `_shared/model-router.ts`** — text tier: Anthropic + Featherless. Capability tier: OpenAI + Gemini + Groq + Ideogram + Replicate + Meshy + ElevenLabs.
- ✅ **Voyage embeddings** — `_shared/voyage.ts`. Model `voyage-3` @ 1024 dims.
- ✅ **Meta** (FB + IG), **Google** (Calendar OAuth + Drive), **Zoom**, **QuickBooks**, **Plaid** (+ Paige-Plaid variants), **DocuSign**, **Cal.com**, **Resend**, **iSoftpull · SmartCredit · Nav · Apollo · Firecrawl · PostHog · Sentry · Zapier MCP · n8n · Telegram · VAPID web push · Browserbase · D&B · LexisNexis · OpenCorporates · FRED · TransUnion Business**
- ❌ **HubSpot · Vapi · Microsoft/Outlook OAuth** — NOT wired

### Platform capabilities SHIPPED

- ✅ **Slice 1c IA restructure — COMPLETE (2026-07-25)**, 8-item nav shipped.
- ✅ **8-item top nav:** Paige · Command Center · Marketplace · Clients · Team · Growth · Analytics · Setup
- ✅ **Marketplace** (Slice 1c-xii, task #440). PR #213.
- ✅ **Analytics primitive** (Slice 1c-x). Migration `20260722203249_analytics_rpc_operator_gate_1c_x_0.sql`. PR #202.
- ✅ **Signup completion gate** — migrations `20260714013653` + `20260714015706`.
- ✅ **Action bus** (§8) — `20260711024632_action_bus.sql` + drainer on */2 cron.
- ✅ **§16 10-department org model** — `paige_departments` via `20260713120000_org_blueprint_departments.sql`.
- ✅ **§34 Intelligence spine** (partial): `paige_prompt_template` · `paige_prompt_memory` · `paige_llm_trace` · `paige_eval` · `paige_subagents_talent` · `paige_action_bus_drainer` · `paige_action_worker_cron` · `studio_visual_critique_log`. Prompt-forge at `_shared/prompt-forge.ts`; visual-critique gate at `_shared/visual-critique-gate.ts`.
- ✅ **`paige_owner_memory` table** — migration `20260810120000`, shipped in PR #406. L6/L8 memory table, distinct from `paige_prompt_memory`.
- ✅ **Voice = Ivanna** (ConvAI agent live post 2026-08-08 hotfix; in-app chat voice via `_shared/tts-router.ts` `DEFAULT_TTS_VOICE`)
- ✅ **Money Spine Lane B-ii-a + B-iv** merged.
- ✅ **§27 facelift sweep** (PR `a2df4436`)
- ✅ **§37 amendment** (PR #232)
- ✅ **§38 money boundary doctrine** (PR #230)
- ✅ **Chat compaction substrate** (BRD §174-176) — in `paige-ai-chat/index.ts`.

### Backend seams

- ✅ 231+ edge functions across auth/comms/paige-core/marketplace/growth/tenant-admin/integration/credit-funding/cron
- ✅ 688+ migrations
- ✅ 30 MCP tools (paige-mcp Phase 2)
- ✅ RLS enforced on 179+ migration files.

### Env vars / secrets (NAMES ONLY — values in Supabase secrets + Vercel)

Grouped:
- **Required (fail-closed):** `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `ANTHROPIC_API_KEY` · `VOYAGE_API_KEY`
- **Third-party** (Twilio · Stripe · ElevenLabs · OpenAI · Gemini · Groq · Featherless · Replicate · Ideogram · Meshy · Meta · Google · Zoom · QuickBooks · Plaid · DocuSign · Cal.com · Resend · PostHog · Sentry · Apollo · Firecrawl · FRED · D&B · Nav · LexisNexis · OpenCorporates · Array · TransUnion Business · SmartCredit · iSoftpull · Browserbase · Telegram · LangGraph · Lovable · Zapier · GitHub)
- **Paige-internal / MCP / bridge** (`PAIGE_MCP_PLATFORM_KEY` · `PAIGE_BRIDGE_API_KEY` · `PAIGE_OS_*`)
- **Studio / eval / feature-gates** (`STUDIO_VISUAL_CRITIQUE_ENABLED` · `STUDIO_CRITIQUE_COST_CAP_USD` · `STUDIO_CRITIQUE_MAX_ITERATIONS`)
- **Email identities + other** (`PLATFORM_DEFAULT_EMAIL_FROM` · `BILLING_EMAIL_FROM` · `CALENDAR_ENCRYPTION_KEY` · `SSN_ENCRYPTION_KEY` · `VAPID_*`)

### Key data model landmarks

- ✅ **`tenants`** — with `account_type` (topology: standalone/sub_account/agency/enterprise, §51-locked) · `status` (lifecycle enum) · `parent_tenant_id` · `features` (jsonb) · `brand` (jsonb) · `onboarding_state` (jsonb) · `stripe_customer_id` · `stripe_subscription_id`
- ✅ **`platform_subscriptions`** — tenant-scoped billing; test-seed caveat from migration `20260805202912`
- ✅ **`paige_action_kinds`** (§8 action bus)
- ✅ **`paige_llm_trace`** (L1)
- ✅ **`paige_owner_memory`** (L6/L8 memory — migration `20260810120000`, PR #406)
- ✅ **`paige_prompt_memory`** (§26 forge memory — migration `20260718205814`) — distinct from `paige_owner_memory`
- ✅ **`paige_departments`** (§16)
- ✅ **`paige_audit_log`** (§17)
- ✅ **`paige_subagents_talent`** (§14) + `paige_subagent_proposals` + `paige_subagent_invocations` + `paige_subagent_factory_quota`
- ✅ **`paige_prompt_template`** (§26)
- ✅ **`studio_visual_critique_log`** (§33)
- ✅ **`marketplace_installs`** (with payment_refs)
- ✅ **`tenant_workflows_registry`**, **`tenant_email_identity_registry`**, **`tenant_n8n_connections`**, **`tenant_service_agreement`**
- ✅ **`tenant_revenue_classification`** (operator-only revenue axis — #29, PR #412) — paid/promotional/internal_test, RLS `is_platform_owner()`-only + FORCE

---

## 5. Current focus + known gaps

### In-flight (as of 2026-08-09)

- 🔥 **PR #412 — Tenant revenue classification + ARR reconciliation** (task #29). Topology fix + hard-delete-cascade of Paige Operations + Claude Studio Dev + Platform Defaults relocation + Part-5 dropdown + reconciliation + MCP splits. All owner decisions ruled 2026-08-09. §39 peer-gate: 4 findings all resolved (Finding 1 backed by persisted prod COUNT). Awaiting owner §32.c live-drive → merge.
- 🔥 **PR #410 — Second Brain** (task #26). Awaiting owner review on §BRAIN wording → merge.
- 🔥 **Wave 2.5 tail** per canonical-build-order.

### MVP-blocking gaps (all-open)

- ❌ **Twilio phone-number SEARCH tools** inside the Communications console (Task #27) — the ONE narrow remaining Twilio piece. ISV + purchase already exist per Section 4.
- ❌ **A2P 10DLC carrier submit** — UI exists, backend stubbed; no `messaging_service_sid` table.
- ❌ **SMS-in-signup** — phone capture not in signup migrations (task #23).
- ❌ **`delete_tenant` RPC + MCP tool** — task #30 scope (§10 Paige-callable).
- ❌ **Stripe Connect direct-charge posture verify + BYO tenant processor lane** — Money Spine B-Connect deferred but needed for full §38 posture.
- ❌ **`signup_intake` table** — referenced but doesn't exist; align vocabulary to `signup_completion_gate`.

### Post-MVP CX workstream

Per `docs/strategy/client-experience-workstream-2026-07-21.md` — CX-1 (polish, ships anytime) → CX-2 (composable) → CX-3 (client-facing Paige) → CX-4 (transformation primitive) → CX-5 (Marketplace client blocks + Money Spine Lane B-vi).

### Critical DOC gaps (files referenced but ABSENT from `docs/`)

- ⚠ **BRD (Business Requirements Document)** — cited by 5+ docs as PR #394 merged; NOT present in `docs/`. Largest doc gap. **Owner action needed.**
- ⚠ **System Architecture doc** — same PR #394 reference; NOT present.
- ⚠ **`docs/assessments/PLATFORM_ASSESSMENT_2026-07-13.md`** — cited as ~85% valid; NOT present.

---

## 6. Task ledger (high-signal current)

| # | Task | Status | Blocked by |
|---|---|---|---|
| #21 | Signup pricing/plan selection on marketing page | pending | — |
| #22 | Super Admin Communications (S3 seam) | ✅ merged as PR #408; awaits owner secret paste + live-drive | #29 |
| #23 | Signup flow SMS integration | pending | #22 live-drive + phone capture |
| #24 | Voice fix end-to-end | ✅ closed (Ivanna live) | — |
| #25 | paige_conversations unsafe RLS | pending | — |
| #26 | Second Brain (PR #410) | in-flight | Owner §BRAIN approval |
| #27 | Twilio number-search tools in Communications | pending | — |
| #28 | Tenant-as-operator-client auto-provision + consent capture | pending | #29 |
| #29 | Promotional-account classification + ARR reconciliation (PR #412) | in-flight | Owner §32.c live-drive |
| #30 | Super Admin full CRUD on tenants + §10 seams | pending | #29 |
| CX-1 | Client Portal config polish | pending | — |
| CX-2 | Composable portal architecture | pending | CX-1 |
| CX-3 | Client-facing Paige persona | pending | CX-2 |
| CX-4 | Transformation primitive | pending | CX-3 |
| CX-5 | Marketplace client-side blocks | pending | CX-4 + Money Spine B-vi |

---

## 7. Sequential roadmap (current state → MVP live)

Per `docs/doctrine/canonical-build-order.md` (LIVING, updated 2026-08-08):

- **Wave 1** ✅ COMPLETE
- **Wave 2** ✅ COMPLETE (except #247 tail)
- **Wave 2.5** 🔥 FIRING — Playwright dev-dep, live-drive backfills, per-sub-account curation, §3.b doctrine paste, #247
- **Wave 4 = MVP HUB** 🎯 NEXT — 4 Owner Trilogy pillars + 5 Cowork-locked product specs + BRD-promoted items (L8 Memory Fabric, Interactive Analytics UI, Playwright web-browsing, Promo Account Type, Chat compaction/history/tasking)
- **Wave 3** ⏸️ DEFERRED past W6 (Practice Blueprints)
- **Wave 5** 📋 RESERVED
- **Wave 6-7** 📋 QUEUED
- **Wave 8 = BETA LAUNCH prep** — #135 Codex sweep · #74 logo scrub · #194+#195 Stripe wire-up · #129 tenant lifecycle wind-down
- **Wave 9 = SOC 2** (post-BETA)

### Immediate 72-hour queue

1. **#412 merge** (owner §32.c live-drive)
2. **#410 merge** (owner §BRAIN approval)
3. **Task #22 live-drive** (operator SMS with Twilio secret paste)
4. **#411 confirm-merged** (Wave 4a analytics primitive)
5. **Wave 4 kickoff** — MVP hub. Owner rules which pillar/BRD-item fires first.

### Money Spine sequence (per §38 amendment)

B-i ✅ → B-iv ✅ (posture verify pending) → B-ii (in flight) → B-Platform → B-Meter → B-v → B-iii → B-vi. **B-Connect deferred.**

---

## 8. Daily reference protocol (Cowork + CC + Codex)

### Session start (every session, all three agents)

1. Read this doc — Sections 0, 4, 5, 7
2. Read `CLAUDE.md` (root)
3. Read `docs/brain/README.md` once PR #410 merges
4. If task-specific: load the canonical deep doc from Section 9

### During work

- Before ANY claim about the codebase (what exists, what's wired, what's shipped): grep first, check Section 4 second, memory NEVER
- Before ANY paste that references a table/function/file: verify it exists
- **CC's code check is authoritative** — Cowork's sandbox agents can miss recently-shipped migrations or files; when CC disagrees with Section 4 or Section 10, CC's finding wins

### Session end (any agent that shipped work)

1. Update Section 4 checkboxes
2. Update Section 5 status
3. Log §13 corrections in Section 10 if surfaced
4. Cross-post to brain (once #410 merges)
5. Commit: `docs(master): update after <PR#/slice>`

---

## 9. Canonical deep docs (by topic)

### Product specs (LOCKED 2026-08-08 — `docs/product/`)

- Owner Trilogy Customer Portal Taxonomy Matrix — `customer-portal-owner-trilogy-taxonomy-matrix.md`
- Agent UI Placement — `agent-ui-placement-spec.md`
- Promotional Account Type — `promo-account-type-spec.md`
- Interactive Analytics UI — `interactive-analytics-ui-spec.md`
- Multi-Channel Comms & Deliverable Workflow — `paige-multichannel-comms-and-deliverable-workflow-spec.md`

### Strategy (`docs/strategy/`)

- Owner Trilogy — `owner-trilogy-2026-07-26.md` (canonical, revised 2026-08-04)
- Business Vault landscape — `business-vault-partner-landscape-2026-07-26.md`
- Twin Capabilities landscape — `twin-capabilities-landscape-2026-07-26.md`
- Systems Check + Analytics landscape — `systems-check-and-analytics-landscape-2026-07-26.md`
- Client Experience workstream — `client-experience-workstream-2026-07-21.md`
- Monetization rollout — `monetization-rollout-2026-07-21.md`
- CPaaS ISV provider comparison — `cpaas-isv-provider-comparison-2026-07-26.md`
- Agency surface competitive research — `agency-surface-competitive-research-2026-07-25.md`

### Doctrine (`docs/doctrine/`)

- Canonical build order — `canonical-build-order.md` (LIVING roadmap)
- $100M Org Blueprint — `100M-org-blueprint.md` (§16)
- $1B Growth Map — `1B-growth-map.md` (§17)
- OS Architecture — `paige-os-architecture.md` (§35)
- Money Spine Architecture — `money-spine-architecture.md` (§38)
- Paige C-Suite roster — `paige-c-suite-roster.md` (proposed §42)
- Corporate Structure — `paige-corporate-structure-2026-08-01.md`
- Memory Fabric L8 — `paige-memory-fabric-l8-2026-07-28.md`
- Unified Comms Substrate — `paige-unified-comms-substrate-2026-07-29.md` (§49)
- Voice Layer — `paige-voice-layer-2026-07-28.md`
- Chat Universal Control Surface — `paige-chat-universal-control-surface-2026-07-28.md`
- Practice Blueprints — `paige-practice-blueprints-2026-07-29.md`
- n8n Orchestrator Brain — `paige-n8n-orchestrator-brain-doctrine.md`
- Tenant Lifecycle Winddown — `tenant-lifecycle-winddown-2026-07-28.md`
- CLAUDE.md Amendment Draft — `claude-md-amendment-draft-2026-07-28.md` (§§40-45, §49 pending)

### Security cluster (`docs/security/`)

DOCTRINE_190/191/192, 194, 197, 198 + Addendum, 200, 201, 202, 203, 205, 208, 210, 213 + `AUDIT_213c_RETRO_2026_07_03.md`, `MIGRATION_B_SHAPE_PROPOSAL_PATH_B_FINAL.md`, `OPERATOR-ACCESS-MODEL.md`, `PLATFORM_SEPARATION_AUDIT_2026-07-02.md`, `SECURITY_DEFINER_CATALOG.md`.

### Architecture (`docs/architecture/`)

- Ecosystem Data Ownership Map — `ECOSYSTEM_DATA_OWNERSHIP_MAP.md`
- Ecosystem Full-Stack Boundaries — `ECOSYSTEM_FULL_STACK_BOUNDARIES.md`
- Marketplace Data Model — `MARKETPLACE-DATA-MODEL.md`
- Sprint C1 Tenant Readiness — `SPRINT_C1_TENANT_READINESS.md`
- Canonical System Architecture — `CANONICAL-SYSTEM-ARCHITECTURE-2026-08-08.md`

### Audits + assessments

- `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md` (living rollup)
- `docs/audits/platform-ia-slice-1c-handoff.md` (REVISED FINAL — Slice 1c complete)
- `docs/audits/money-spine-lane-b-i-discovery-2026-07-25.md`
- `docs/audits/b-iv-38-connect-posture-2026-07-26.md`
- `docs/audits/people-model-strategy-2026-07-21.md`
- `docs/audits/phase2b-privileged-function-audit-2026-07-25.md`
- `docs/audits/phase2d-undeployed-function-disposition-2026-07-25.md`
- `docs/audits/2026-08-09-tenant-classification-audit.md` (#29 — $0-ARR reality + reconciliation + §39 peer-gate)

### Grounding + inventory reports

- `docs/PAIGE-INTELLIGENCE-GROUNDING-REPORT.md`
- `docs/PAIGE-CALLABLE-SEAMS.md`
- `docs/PAIGE-CREATIVE-MEMORY.md`
- `docs/PLATFORM-FUNCTION-INVENTORY-2026-07-19.md`
- `docs/L4-REASONING-GROUNDING.md`
- `docs/L7-SLICE-1-GROUNDING.md`
- `docs/RESEARCH-VERIFIER-FDIC-NCUA-GROUNDING.md`

### Session outputs (persistent)

- `docs/OPS.md`
- `docs/DONE.md`

### Superseded (do not use as source-of-truth)

- `docs/assessments/IA-SLICE-1C-BLUEPRINT.md` → superseded by `docs/audits/platform-ia-slice-1c-handoff.md`
- `docs/roadmap/build-order-2026-08-04.md` → superseded by `docs/doctrine/canonical-build-order.md`
- `docs/paige-master-implementation-order.md` → historical reference only
- `docs/paige-roadmap-action-bus.md` → historical brief
- `docs/PAIGE-STUDIO-PAUSE-STATE-2026-07-19.md` → pause snapshot
- `docs/VIBE-STUDIO-HANDOFF-2026-07-14.md` → old handoff

---

## 10. §13 corrections log

Things Cowork/CC/Codex have claimed that the codebase disagrees with. **Never remove entries** — mark as reversed/resolved but keep the record. **CC's code check is authoritative.**

- **2026-08-09 · Cowork miss #1 (REVERSED by CC's code check):** originally claimed `_shared/tts-router.ts` does NOT exist. **Reality:** file DOES exist (in-app chat voice path, 14,557 bytes, verified this session). BOTH `_shared/tts-router.ts` AND `_shared/elevenlabs.ts` exist. This correction was itself wrong — do not cite. **Lesson:** when sandbox agent grep disagrees with CC's code check, CC wins.
- **2026-08-09 · CC voice-env precision (§13, added by CC same commit):** the in-app CHAT voice is `DEFAULT_TTS_VOICE = { provider:"elevenlabs", id:"0S5oIfi8zOZixuSj8K6n" }` (Ivanna) hardcoded in `_shared/tts-router.ts` — it does NOT read `ELEVENLABS_VOICE_ID`. The `ELEVENLABS_VOICE_ID` env drives the SEPARATE **Studio-VO** lane (`_shared/elevenlabs.ts`, Rachel fallback when unset), and the ConvAI **phone** agent is a third independent system. Do not attribute the in-app Ivanna voice to `ELEVENLABS_VOICE_ID`. Full detail in the `CLAUDE.md` "Voice Configuration" section.
- **2026-08-09 · Cowork miss #2 (REVISED with owner-supplied visual proof):** originally claimed `tenant_twilio_subaccounts` table + `provision-tenant-twilio` edge function exist. Half-reality: code artifacts genuinely don't exist in the repo (grep-verified), BUT the Twilio ISV/reseller architecture IS FULLY LIVE at Twilio's side — Organization, master account, 5 active subaccounts (SIDs in owner's console). Purchase capability EXISTS. **Only narrow gap:** phone-number SEARCH tools in Communications. Task #27 rescoped.
- **2026-08-09 · Cowork miss #2.b (owner-flagged in-flight):** first revision over-scoped to include "purchase flow" as gapped. Wrong — purchase exists. Corrected to search-tools-only.
- **2026-08-09 · Cowork miss #3:** claimed `signup_intake` table exists. Reality: does NOT exist. Signup gate is `signup_completion_gate` + `profiles.terms_accepted_at`.
- **2026-08-09 · Cowork miss #4 (REVERSED by CC's code check):** originally claimed `paige_owner_memory` table does NOT exist. **Reality:** table DOES exist — migration `20260810120000`, shipped in PR #406 (grep-verified this session). Distinct from `paige_prompt_memory`. This correction was itself wrong — do not cite. Section 5 gap on this table removed.
- **2026-08-09 · Cowork miss #5:** talked about Owner Trilogy as "3 pillars" or listed 6 pillars. Reality: owner-locked FOUR pillars per 2026-08-04 revision. Corrected in Section 2.
- **2026-08-09 · Cowork miss #6:** treated Slice 1c IA restructure as in-flight. Reality: COMPLETE (2026-07-25). Corrected in Section 4.
- **2026-08-09 · Owner-directive gap:** BRD absent from `docs/`. Owner action needed.
- **2026-08-09 · Owner-directive gap:** System Architecture doc absent. Owner action needed.
- **2026-08-09 · Cowork miss #7:** initial Glob searches for `customer-portal-owner-trilogy-taxonomy-matrix.md` returned no results due to misconfigured patterns. Reality: file exists. Lesson: verify Glob patterns hit the intended path before claiming absence.
- **2026-08-09 · Cowork miss #8 (fabricated-progress class):** implied master doc was committed to GitHub when it was only written to Cowork's sandbox working tree. Never pushed. §13 violation on precision — writing-to-tree ≠ committed ≠ pushed. CC caught it by running the commands and getting "pathspec did not match." Lesson: never assert "committed to GitHub" without a real commit SHA on the remote. (This doc's own commit — by CC on branch `docs/master-project-reference-2026-08-09` — is the real push that resolves it.)

---

## 11. What to do when THIS doc is wrong

File a §13 correction in Section 10 with:
- Date (`YYYY-MM-DD`)
- Who found it (Cowork / CC / Codex / Antonio)
- What was claimed (in this doc or a past paste)
- What the codebase actually shows (with file path or migration version cited)
- Fix status (documented / code fix filed / owner action needed)

**Never remove — mark reversed/superseded and add the new entry.** The corrections log IS the durability primitive. **CC's code check is authoritative** — when Cowork's sandbox agent disagrees with CC's live-code finding, CC wins and the correction gets logged here.

---

## 12. Cross-agent handoff standard

Every Cowork paste to CC or Codex includes:

> **Reference this doc first:** `docs/PAIGE-MASTER-PROJECT-REFERENCE.md`. Read Sections 4 (SHIPPED) + 5 (Current focus + gaps) before starting. Update Section 4 checkboxes on merge. Log any §13 corrections in Section 10.

CC and Codex confirm read at start of every session.

---

**End of master reference. This doc supersedes memory. Update it, don't outgrow it.**
