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

### Cowork research discipline (owner-locked 2026-08-09, HARD RULE — mechanical, not aspirational)

**Cowork's sandbox is a mount of the owner's local filesystem — often on a stale branch behind main.** Every claim Cowork makes about a file, table, function, or component MUST be grounded in a GitHub API result against `ref: main` (or a named branch), NOT in a sandbox grep. Historical §13 misses (`_shared/tts-router.ts`, `paige_owner_memory`, `ContactCommsPanel.tsx` path, `ClientsConversations.tsx` line count, `Admin.tsx:322` mount claim) all traced to sandbox grep on stale branches — every one was CC-caught when they ran the same check against fresh-cloned main.

**The mechanical rule (Cowork binds to this — CC and Codex apply the same principle to their own environments):**

- **Reads:** Cowork uses `mcp__github__search_code` + `mcp__github__get_file_contents` with `ref: "main"` (or a named branch). NEVER sandbox `Grep`/`Glob`/`Read` for asserting platform code state.
- **Writes:** Cowork uses `mcp__github__push_files` or `create_or_update_file` to push directly to GitHub — BUT the current MCP token is read-only (verified 2026-08-09 with a `create_or_update_file` returning `403 Resource not accessible by integration`). Cowork writes therefore MUST hand off to CC or Codex, who have real write access. Cowork producing a paste with the exact content + target file + insertion point is the correct handoff pattern.
- **Sandbox tools (`Read`/`Grep`/`Glob`/`Write`/`Edit`):** reserved for the outputs folder (Cowork's paste files for the owner). NEVER for asserting platform code state.
- **Every claim cites its source:** file path + branch/ref + line number (or migration version + PR #). Format examples: `docs/foo.md@main:L42` or `migration 20260810120000 (PR #406)` or `src/pages/foo.tsx@main SHA:abc123`. Missing citation = missing claim; retract or add the citation before shipping.
- **When CC's code check contradicts Cowork:** CC wins automatically. No arguing "but my grep said." Log the §13 correction in Section 10 with the CC-verified reality, mark Cowork's original claim as REVERSED.

**Why this exists (this doc's own §13 misses #8, #10, #11, #12):** Cowork keeps drifting to sandbox tools because they're faster (no API roundtrip, no rate limits). But when the sandbox is on a stale branch, "faster" produces WRONG answers that Cowork writes into this master doc as ground truth. Fresh-clone CC catches every miss. The fix is not aspiration — it's mechanical tool discipline codified here so every session sees it and Cowork cannot drift without producing a visible citation failure the owner can call out.

**Owner self-check (how to catch a Cowork drift instantly):** if Cowork asserts a file path, table name, or line number without a `ref: main` citation next to it, that's the failure signal. Ask "what SHA?" — if Cowork can't answer with a real commit hash, the claim is provisional and CC's next code check is authoritative.

### Communications — SHIPPED (CC-verified on main, 2026-08-09)

The rich two-way client inbox is fully shipped and mounted (this REPLACES an earlier Cowork entry with wrong paths — see §13 corrections #10/#11):
- **Rich inbox UI:** `src/pages/admin/ClientsConversations.tsx` — a full **1,927-line** three-column Conversations surface (the UI in the owner's screenshot), mounted at `/admin/clients-hub/conversations` via **`Admin.tsx:396-398`** (`<Route path="conversations">` → `ConversationsTabsLayout` → `ClientsConversations`). **No routing gap, no placeholder.**
- **Conversation components:** live under **`src/pages/admin/conversations/`** (`ComposeThreadDialog`, `ConversationsSubPages`, `ConversationsSettings`, `inbox-shared.ts`) — NOT `src/components/admin/contacts/`. `ContactCommsPanel.tsx` does not exist.
- **Notification-log surface (separate):** `src/pages/admin/CommunicationsAdmin.tsx` (272 lines) reads `communication_log`/`communication_preferences` — a DIFFERENT surface from the inbox; do not conflate.
- **Backend:** `public.messages` (jsonb substrate) + `public.threads` (aggregate) + `send-message` edge fn; `usePaigeThreads.ts` hook.
- **Operator (God) SMS:** `paige-operator-sms-send` edge fn (from PR #408) — see the Fleet Comms 500 gap in Section 5.
- Doctrine: §7 intelligent portal · §36 draft-first/one-click · §49 unified inline-single-conversation.

### Agent Presence primitive family — SHIPPED (CC-verified on main SHA `580b13f4`, byte sizes byte-matched 2026-08-09)

The ⌘K launcher + right-side Paige presence rail chrome is a reusable primitive family, live on the Fleet Console (owner screenshot 2026-08-09). This entry closes a Cowork completeness gap — the Agent UI Placement spec defined this surface but Section 4 hadn't marked it shipped. (Verified by CC against `origin/main`: all 7 files exist and every byte size matches; folded as its own docs PR since the miss #21 PR (#417) had already merged.)

- **Primitive family** — `src/components/ui/paige/` (CC `git cat-file -s` sizes):
  - `AgentPresence.tsx` (3,631 B) — the presence primitive
  - `AgentPresenceContext.tsx` (7,715 B) — React context; resolves persona by `account_type` (super_admin → Paige Operator · agency → Paige Agency · tenant → Paige)
  - `AgentRail.tsx` (12,530 B) — the right-side presence rail (persona pill + empty state "Your Paige team is on call" + account-type-aware description + "Ask from anywhere ⌘K" trigger)
  - `CommandLauncher.tsx` (5,612 B) — the ⌘K modal (persona-aware placeholder)
  - `persona.ts` (3,535 B) — persona resolution logic
  - `index.ts` (1,630 B) — barrel export
  - `AgentPresence.test.tsx` (10,522 B) — test coverage
- **Doctrine hooks:** §7 intelligent portal · §14 Paige-runs-a-team ("your Paige team is on call") · §20 dispatch-in-chat (⌘K opens a Paige chat surface anywhere) · §36 intuitiveness moat (5-minute discoverability via ⌘K) · §11 primitive-layer discipline · §9 tenant/operator seam (persona swaps clean per `account_type`).
- **Intelligence layer NOT live (§13 baked into the copy):** the placeholder literally reads *"{persona}'s live conversation connects here soon — your message isn't sent yet."* The chrome is shipped; the send/receive/reasoning wiring is Wave 4 MVP-hub work — the correct shipped-chrome / not-yet-intelligence pattern (§32).
- **Spec:** `docs/product/agent-ui-placement-spec.md` (§5a persona surface + ⌘K launcher + right-rail placement).
- **Evidence:** owner screenshot 2026-08-09 of `paigeagent.ai/admin/platform/tenants` (rail + ⌘K modal); CC file/size verification against `origin/main`.

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

### Merged 2026-08-09 (this batch)

- ✅ **#412 — Tenant revenue classification + $0-ARR honesty** (PR #412, merged 2026-08-09). `tenant_revenue_classification` (paid/promotional/internal_test, operator-only) + topology corrections + hard-delete-cascade of 2 retired tenants (Paige Operations + Claude Studio Dev) + Platform Defaults relocation + Part-5 tenant-switcher nesting + `operator_dashboard_metrics` reconciliation to real revenue + `paige-mcp` revenue-class splits. **§32.a persisted-apply GREEN on prod** — `schema_migrations` advanced, 11→9 tenants, 4 PME sub-accounts, 0 paid-class → Fleet Console reconciled to the honest **$0 ARR**.
- ✅ **#413 — Master project reference + §0 session-start rule** (PR #413, merged 2026-08-09). THIS doc, established as the single source of truth; `CLAUDE.md §0` (read the master doc at session start / major builds / "do we have X?" checks).
- ✅ **#410 — Second Brain** (`docs/brain/`, PR #410, merged 2026-08-09) + §BRAIN discipline (proposed). README index + `config-registry.md` + `decision-log.md` + `lessons-learned.md` + `glossary.md` + `codebase-map.md` — a verified, read-before-work knowledge base so sessions stop re-diagnosing documented systems.

### Merged 2026-08-10 (this batch)

- ✅ **#31 — Revenue Integrity Chain** (PR #415, merged 2026-08-09/10) + CSV always-export polish (PR #421). Fail-closed `enforce_revenue_integrity_chain` trigger + `operator_revenue_integrity_audit()` RPC + Fleet Console audit UI. **§32.a persisted-apply + live-prod block-test GREEN** — Wave 8 revenue launch-gate cleared. Current prod: promotional 8 / internal_test 1 / **paid 0** ($0 ARR, honest).
- ✅ **§52 — Paige operator runtime-context substrate (Phase 1, Super-Admin)** (PR #424, merged 2026-08-10). Fix for the 2026-08-09 §36 catastrophic miss (Super-Admin Paige asked the founder who he was). Migration `20260816120000` (relax `paige_owner_memory.tenant_id`→NULLABLE for the tenant-less God account + `is_platform_owner()` own_* policy branches + 7 PII-free operator seed rows) · `_shared/owner-context.ts` composer (service-role read by verified user_id, real platform-state queries with honest fallbacks, compiled doctrine/master constants, by-name greeting from runtime auth metadata not the repo) · `paige-ai-chat/index.ts` injection at `aiMessages[2]`, dual-gated on tenant-less persona AND `is_platform_operator()`. **§32.a persisted-apply GREEN on prod.** `CLAUDE.md §52`. **OWED: owner §32.c live-drive** (`/admin/playbook` → Paige greets by name, never asks identity). Phase 2 (agency/tenant/sub/client personas + cross-persona identity link) = separate slice.
- ✅ **§53 — operator role tiers + grant lockdown** (PR #424, merged 2026-08-10). Migration `20260816130000`: `is_platform_operator()` = super_admin OR platform_admin (NEW; `is_platform_owner()` FROZEN super_admin-only) + structural `user_roles` `trg_enforce_protected_role_grant` trigger locking super_admin/platform_admin grants to an existing super_admin or a trusted service context. **Closed a real §9 escalation** (`grant_tenant_member_role` let a tenant admin mint `platform_admin`). §32.b proven; §32.a GREEN on prod. `CLAUDE.md §53`. Fast-follows: #89 `/admin/team` tier-leak, #90 taxonomy-doc, deferred anon/authenticated DML REVOKE.
- ✅ **Systems Check MVP — Layer 1** (Owner Trilogy Pillar 1, task #80, PR #423, merged 2026-08-10). Migration `20260816000000`: 4 tables (`paige_systems_check_registry`/`_run`/`_finding`/`_baseline`, all FORCE RLS) + the 10 MVP-locked checks seeded (owner rulings: #3 capture-only, #4 external-detect-only, #10 Stripe-native read). **§32.b + §51 proven; §32.a GREEN on prod** (4 tables + 10-check seed persisted). Runner edge fns + orchestrator + surface = later layers.
- ✅ **Systems Check MVP — Layer 2 (the Runner)** (Owner Trilogy Pillar 1, task #80, PR #427, merged 2026-08-10). Runner core `_shared/systems-check-runner.ts` + 10 runner modules + 3 flavor edge fns (`systems-check-run-{onboarding,scheduled,change}`) + migration `20260816140000` (§38 processor-agnostic capture cols `tenants.payment_processor_declared`/`payment_methods_declared`; registry #10 flipped off the Stripe-native read; `systems.remediate` action-kind) + `20260816150000` (daily scheduled cron). **§32.a GREEN on prod** (both migrations persisted). **§32.c CONFIRMED headless-drive 2026-08-10** — Mogul Maker Academy (`d8a0a880…`) scan via the scheduled fn's internal single-tenant path (same core/runners/writes/filing): run row `check_count=10`, **1 pass / 5 fail / 1 skip / 3 error**, a `systems.remediate` action filed for every fail at `autonomy_lane='confirm'` routed to the owning §16 dept (finance/sales/marketing/tech), payment remediation copy §38-clean. **Two fast-follows the drive surfaced (§13):** (a) PR #429 — `service_role` had no grant on the 4 `paige_systems_check_*` tables + `tenant_workflows`/`tenant_mcp_connections`/`tenant_email_identities` (runtime `permission denied` the §32.b rollback proofs couldn't catch — they run as owner, not service_role; grants applied + proven, migration `20260816160000`); (b) task #95 — 3 runner column-name bugs (`tenant_email_identities.id`, `tenants.website` don't exist) still `error` fail-loud, runner-code fix pending. Runner is **fail-loud + honest** (real error class recorded, never a fabricated pass). Surface (L3) + operator-scope catalog = task #93.

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

- 🔥 **PR #415 — Revenue integrity chain** (task #31, Wave 8 launch gate). Fail-closed trigger (`enforce_revenue_integrity_chain`) + operator audit RPC (`operator_revenue_integrity_audit`) + Fleet Console audit UI. §30-diagnosed (handoff schema wrong on every gate → real tables), §37 producer inventory clean, §39 peer-gate + §5 compliance BOTH passed (2 §39 defects + 1 §5 blocker fixed), §32.b proven against the verbatim file. **Draft PR, owner §32.c-gated.** See Section 10.
- 🔥 **Second Brain now LIVE on main** (`docs/brain/`, PR #410 merged 2026-08-09). §BRAIN.1/.2/.3 discipline binds: read `docs/brain/README.md` at session start; answer "do we have X?" from the brain; update the relevant brain file in the same commit as a change.
- 🔥 **Wave 2.5 tail** per canonical-build-order.

*(PR #412 revenue classification + $0-ARR and PR #413 master doc + §0 both merged 2026-08-09 — moved to Section 4 SHIPPED.)*

### MVP-blocking gaps (all-open)

- ❌ **Fleet Comms operator SMS `paige-operator-sms-send` returns 500 (CC-root-caused 2026-08-09, fix specified, awaiting owner go).** Owner's §32.c live-drive send to a test recipient failed "Edge Function returned a non-2xx status code." CC diagnosis by elimination + code trace: it's HTTP **500 = `authz_check_failed`** (`index.ts:45`) — `caller.rpc("is_platform_owner")` errored. NOT needs_config (returns 200; **MG SID IS set — owner does not need to re-paste**), NOT the upsert (verified OK via rolled-back service-role txn), NOT a Twilio rejection (`twilioRequest` never throws → returns 200 'failed'). Leading cause: `is_platform_owner`/`is_super_admin` each have TWO overloads (`()` + `(_user_id uuid)`), and a PostgREST `.rpc()` against overloaded functions hits **PGRST203** — the #408 fn is the first DIRECT rpc caller (others use it inside RLS/definer). Fix (2 parts): (1) call the owner-check overload-safely + log `ownerErr.message`; (2) add an outer try/catch returning a structured 500 (§32 loud-failure). Same class as §51 #130.
- ❌ **Twilio phone-number SEARCH tools** inside the Communications console (Task #27) — the ONE narrow remaining Twilio piece. ISV + purchase already exist per Section 4.
- ❌ **A2P 10DLC carrier submit** — UI exists, backend stubbed; no `messaging_service_sid` table.
- ❌ **SMS-in-signup** — phone capture not in signup migrations (task #23).
- ❌ **`delete_tenant` RPC + MCP tool** — task #30 scope (§10 Paige-callable).
- ❌ **Stripe Connect direct-charge posture verify + BYO tenant processor lane** — Money Spine B-Connect deferred but needed for full §38 posture.
- ✅ **`signup_intake` table EXISTS** (was a false gap — CC live-prod check, task #31 §30 diagnose; §10 correction reverses Cowork miss #3). Per-user pre-provisioning intake (`user_id, account_type, agreement_slug, agreement_version, terms_accepted_at, plan_slug, billing_period, consumed_at`); tenant-level agreement acceptance lands in `legal_acceptances` + `profiles.terms_accepted_at` via `provision_tenant`. Not a gap.

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
- **2026-08-09 · Cowork miss #10 (stale-branch grep class, CC-caught):** Cowork's sandbox on branch `chore/doctrine-preservation-2026-08-01` (behind main) claimed `src/components/admin/contacts/ContactCommsPanel.tsx` exists at that path. CC's fresh-clone check on main: file does NOT exist at that path — real conversation components live under `src/pages/admin/conversations/`. Cowork's Grep hit was a stale-branch artifact. Root cause: sandbox drift. **Fix:** Section 4 "Cowork research discipline" rule now binds — API-only reads with `ref: main`.
- **2026-08-09 · Cowork miss #11 (stale-branch grep class, CC-caught):** Cowork's sandbox claimed `src/pages/admin/ClientsConversations.tsx` is a 20-line placeholder and `Admin.tsx:322` mounts it as a route. CC's fresh-clone check on main: `ClientsConversations.tsx` is a full 1,927-line component (the rich three-column Conversations UI from the owner's screenshot), and it's mounted at `Admin.tsx:396-398`, not `:322-323`. Cowork also conflated `CommunicationsAdmin.tsx` (notification-log surface) with `ClientsConversations.tsx` (rich inbox) — different surfaces. Same root cause as #10 — Cowork reading a stale-branch snapshot. **Fix:** same as #10 — Section 4 discipline block. Also flags that Cowork's earlier "route mount is a placeholder" and "routing gap" notes in the Communications entry were WRONG — the real Communications architecture is fully shipped per CC's verified check; the Communications SHIPPED entry in Section 4 is the CC-verified rewrite.
- **2026-08-09 · Cowork miss #12 (fabricated-progress class, second occurrence):** Cowork attempted to push the Cowork research discipline codification directly to the master doc via `create_or_update_file` — GitHub API returned `403 Resource not accessible by integration`. Cowork's MCP token is READ-only, not write. Same pattern as miss #8 (implying commit before push). **Reality:** the codification text sat in Cowork's sandbox until CC folded it into a real commit (this one). **Lesson (now folded into Section 4 discipline block):** Cowork writes go through paste-to-CC/Codex, never direct API push. Cowork's own "I pushed it" claims are provisional until CC-verified.
- **2026-08-09 · Cowork miss #3 (REVERSED by CC's live-prod check, task #31 §30 diagnose):** miss #3 above claimed `signup_intake` table does NOT exist. **Reality:** `signup_intake` DOES exist on prod (CC queried it directly — columns `user_id, account_type, agreement_slug, agreement_version, terms_accepted_at, plan_slug, billing_period, consumed_at, …`). It is the pre-provisioning per-user signup intake (no `tenant_id`); the tenant-level agreement acceptance lands in `legal_acceptances` (+ `profiles.terms_accepted_at`) via `provision_tenant`. Miss #3 was itself wrong — do not cite. CC's code check is authoritative.
- **2026-08-09 · Task #31 §30 diagnose — handoff schema corrections (CC live-prod check, PR #415, owner §32.c-gated):** the revenue-integrity handoff assumed a schema that prod disagrees with on EVERY gate. Corrected + bound to the real tables in migration `20260815120000`: (a) the paid discriminator is `tenant_revenue_classification.revenue_class` (a dedicated operator-only table, #29), NOT a `tenants.revenue_class` column (which doesn't exist and would break §51); (b) GATE 1 agreement = `legal_acceptances` filtered to the tier SUBSCRIBER slugs `saas-standalone`/`saas-agency`/`saas-enterprise` — NOT `signed_agreements` (no such table) and NOT `paige_signed_agreements` (that's CLIENT-scoped, tenant↔client, §38 tenant-side), and NOT any ambient privacy/terms/esign acceptance (§39 caught the slug-agnostic no-op); (c) GATE 2 payment = `platform_subscriptions` `status='active'` + non-null `stripe_subscription_id` — NOT a `stripe_payments` table (none) and NOT Stripe status `'succeeded'` (that's a PaymentIntent status; a subscription is `active`/`past_due`/`canceled`/…); (d) enforcement is a CONSTRAINT TRIGGER, NOT the handoff's `CHECK (… EXISTS(…))` — Postgres CHECK constraints cannot contain subqueries (invalid SQL); (e) GATE 3 atomicity ALREADY holds — `provision_tenant` is one `SECURITY DEFINER` function. Verified: `promotional 8 / internal_test 1 / paid 0`; the 3 live `active` platform_subscriptions are all comped (NULL `stripe_subscription_id`), which is why `status` alone can't be the gate.
- **2026-08-09 · Task #31 §5/§32 self-catch (CC honest log):** CC's own first `BEGIN..ROLLBACK` proof went GREEN while the ACTUAL migration did NOT apply — the proof tested a re-typed trigger body, not the file. The §5 compliance officer, running the real file in an ephemeral PG, caught a malformed `RAISE` (one `%`/`%%` placeholder vs three args → "too many parameters specified for RAISE") that aborts the whole migration on CREATE and would brick provisioning on first fire. **Lesson (§32/§13):** a `BEGIN..ROLLBACK` proof must exercise the REAL committed SQL, byte-for-byte, not a paraphrase — a green proof of a paraphrase is a false green. Fixed + re-proven against the verbatim file (COMPILE PASS + reject/accept/edit paths).
- **2026-08-09 · Cowork miss #21 (trademark-exposure class, owner-caught):** the internal codename "Jarvis Initiative" (and its "JARVIS" analog references — Marvel/Disney's distinctive Iron-Man AI character) had leaked past the internal-only boundary the strategy doc itself set. GitHub `search_code` against `main` confirmed ZERO code hits (rule held on the code side) but **14 hits across 4 doc files** — `docs/product/BRD-MVP-2026-08-08.md` (8), `docs/product/agent-ui-placement-spec.md` (2), `docs/product/interactive-analytics-ui-spec.md` (2), `docs/strategy/owner-trilogy-2026-07-26.md` (2 + the analog mapping table). Repo is public. (Cowork's original count was "8 hits"; CC's fresh-clone grep found 14 — logged as the real number, §13.) **Fix:** all 14 references purged in one docs-only PR (#417) — reframed to "Systems Check MVP" / "the operator-AI-COO archetype", and the Iron-Man analog mapping table deleted outright. **Prevent-recurrence:** new **§50 Trademark hygiene** doctrine added to `CLAUDE.md` — a mechanical case-insensitive grep on every §5/§39 pass. Owner-caught this class of leak; doctrine now catches it going forward. **§32.b grep proof (honest, meta-exempt):** post-purge, `git grep -ri "jarvis" -- 'docs/**' 'CLAUDE.md' 'src/**' 'supabase/**'` returns **live-use hits: 0 · code hits: 0 (src/**, supabase/** clean) · meta-exempt hits: 2** — this very corrections-log entry (a §13 audit trail MUST name what it reversed) and the `CLAUDE.md` §50 prohibition list (a doctrine list MUST name the marks it prohibits, exactly like §25 CHEESY-TELLS names the tells). Both are self-referential purge/prohibition surfaces, not product-name association — an IP bot finding *"we prohibit JARVIS"* / *"we purged Jarvis Initiative on this date"* is the OPPOSITE of the exposure. §50 carves out these two surfaces explicitly so future §5/§39 grep passes `grep -v` them instead of false-positiving.
- **2026-08-09 · §36 CATASTROPHIC MISS (owner-caught live; the anchoring case for §52) — now FIXED:** on Antonio's live Super-Admin Paige chat (`/admin/playbook`), Paige asked the FOUNDER *what his role was*, asked him for the platform's North Star / BRD / System Architecture (all shipped, owner-locked material), and claimed *"no memory persistence layer wired into this session"* — factually wrong (`paige_owner_memory` ships in migration `20260810120000` / PR #406; the runtime just never read it). For an AI COO that is a category-defining §36 failure. **Root cause (§30 diagnosis):** the chat system prompt is assembled inline in `paige-ai-chat/index.ts` with NO owner-identity/platform-context read; the Super-Admin surface (`PaigePlatformDesk.tsx`) even self-documented the gap ("no dedicated platform persona yet … owed server-side follow-up"). Two further §30 catches the handoff's Layer-1 assumptions missed: (a) `paige_owner_memory` is a memory-ROW table (`memory_type`+`content`), not a YAML blob; (b) the God account (`admin@paigeagent.ai`, `ba352c23`) is TENANT-LESS (`active_tenant_id` NULL, no membership) → the own-read RLS could never match → read via service-role + a migration relaxing `tenant_id NOT NULL`. **Fix:** §52 runtime context-loading substrate (PR #424, §32.a GREEN on prod) — Paige now opens every operator session already briefed (identity from `paige_owner_memory`, live platform state, compiled doctrine/master excerpts, by-name greeting from runtime auth metadata not the repo). **§13 honesty correction baked into the fix:** an edge function CANNOT read the repo (`CLAUDE.md`/master doc) at runtime, so "read from repo at compose time" was a lie — the doctrine index + master excerpt ship as COMPILED CONSTANTS versioned with the code. New `CLAUDE.md §52` makes any operator surface that asks the operator to establish who he is a §52/§36 violation. **OWED:** the owner's §32.c live-drive is the blocking proof (Paige greets Antonio by name, never asks identity). **✅ §32.c CONFIRMED live (2026-08-10):** Antonio's `/admin/playbook` session — Paige replies by name; a follow-up (PR #426) made the OPENING bubble lead with his name too. Both merged + live.
- **2026-08-09 · Cowork miss #28 (§38 doctrine drift, owner-caught pre-build):** the original Systems Check paste **and** the CC Systems Check L2 Runner paste both recommended a **"Stripe-native read"** for check #10 (payment methods) and a Stripe-specific check for #9 (payment processors). Owner correctly flagged this **violates §38** (tenant-BYO-processor; Paige is never merchant of record for tenant→client, and never assumes WHICH tool a tenant uses for anything Paige doesn't own). **Corrected PRE-BUILD:** both checks are **processor-agnostic capture-first** — the tenant declares which processor (`tenants.payment_processor_declared`: stripe/paypal/square/bank_merchant/quickbooks_payments/manual/not_yet) and which methods (`tenants.payment_methods_declared[]`); the runner reads the declared field, never a processor API. Per-processor deep-verify (a connected Stripe account's live methods, a PayPal API, etc.) lives as a **post-MVP Playbook slice** (§35 Marketplace Check Spec DSL). The correction landed in the L2 Runner PR: the migration also flips the L1 seed row #10 off `stripe_payment_methods_read`/`external_vendor` onto `payment_methods_declared`/`native_seam`, and rewrites the #9/#10 remediation copy to processor-agnostic language (the drafted fix was still saying "Stripe" — §39 F1). **Prevent-recurrence:** a new **§38 bullet** in `CLAUDE.md` makes processor/vendor-agnostic the rule for **every** tenant-side check/surface (not just the money leg): assumption-baking is a §38 violation regardless of build-cost, checked by the §5 compliance officer in both the read path and the drafted-remediation copy.

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
