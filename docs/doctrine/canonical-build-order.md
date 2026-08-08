# Paige Agent AI — Canonical Build Order

**Status:** Owner-locked 2026-08-04, updated 2026-08-08. Supersedes ad-hoc sequencing chatter. Both Cowork and Claude Code reference this doc as the single source of truth for "what wave are we on / what fires next / what blocks what." This repo copy at `docs/doctrine/canonical-build-order.md` is the source of truth; Cowork's local disk copy is the backup mirror.

**Update discipline:** whenever a wave completes or sequencing changes, ship a doc commit that updates the change log and marks completed waves ✅. Never let it drift. It is a **living** doc (no date suffix) — always current, never a snapshot.

---

## The 9-wave main pipeline

### WAVE 1 — SHIPPED ✅
Fired 2026-08-04.

- **§10 merge-base CI fix** (PR #360 → merged 9bf4e9c1) ✅
- **Task #243** — `<PaigeAttribution>` byline primitive (PR #361 → merged 1860c825) ✅
- **Task #240** — Phase 2 Integrations cluster (n8n + Zapier + MCP; OAuth deferred per owner) — status: check current state
- **Task #93** — Doctrine paste slice (§39/§40/§41/§242 + pending amendments) — subsumed by §47 + §48 amendments landed 2026-08-08; remaining §3.b paste tracked as #40, in current queue

### WAVE 2 — SHIPPED ✅ (except #247 tail)
- **Task #244** — "About Your Paige Team" canonical page (PR #366 → merged 968b7d7e) ✅
- **Task #245** — Command Center VP attribution + ambient 10-department status blocks (PR #367 → merged 52d7ad5a) ✅
- **Task #246** — Agent-to-agent addressability (PR #368 → merged 084eee80) ✅
- **Task #247** — Custom Specialists section (PR #369) — 🔄 verify current status; slotted into Wave 2.5 tail

### WAVE 2.5 — Launch-blocker cluster + verification infrastructure (INSERTED 2026-08-08, currently firing)

Purpose: pre-launch cleanup + systemic §32 tooling. Fires between the shipped Wave 2 and the Wave 3 Practice Blueprints work.

- **Academy → Agency tier reversal** (PR #395 → merged) ✅ — owner-locked tier taxonomy Solo/Agency/Enterprise; Academy retired as tier name
- **Bug A — btf-onboarding bucket** (launch-blocker; PR #396 → merged) ✅ — signed-agreement PDF uploads persist again; §32.b-proven, §39 peer-gate caught + fixed a replay-only defect
- **Bug B — 3 logo leakers** (launch-blocker; PR #397 → merged) ✅ — broker invite / portal chatbot / coach→client email now resolve tenant brand; also threads tenant brand through shared email renderer
- **BRD + System Architecture** (PR #394 → merged) ✅ — MVP requirements + canonical architecture locked
- **Voice work** ✅ — Ivanna voice on ConvAI + Direct-TTS separation; ELEVENLABS_VOICE_ID env var wired
- **Doctrine amendments** ✅ — §47 (MCP-migrations commit-same-beat), §48 (Cowork rate-limit scope discipline)
- **Playwright dev-dep + live-drive helper** (PR #398) — 🔄 near merge, one CodeQL re-scan away; systemic §32 tooling — collapses most of the original Wave 7
- **Owed live-drive backfills** — 2 tight PRs after #398 merges (Bug A signed-agreement download path, Bug B widgets + coaching-reminder email)
- **Per-sub-account curation** — deferred Slice 1 follow-up
- **Sub-account MCP §9 gap fix** — security, launch-blocker adjacent; recon-first + owner risk-profile gate
- **§3.b "Practice" doctrine paste** — task #40, formal amendment locking "Practice" as prohibited pre-HIPAA/SOC-2
- **Wave 2 #247 Custom Specialists tail** — merge when clear

### WAVE 3 — Practice Blueprints v2 (per #196)
- Task #164 · Task #181 · Task #185

### WAVE 4 — MVP hub (Owner Trilogy + BRD-promoted items + Cowork-locked specs)

Owner ruled 2026-08-08 (BRD) — several items previously scheduled for later waves are now MUST-HAVE MVP. Wave 4 becomes the MVP integration hub.

**Original Wave 4 (Owner Trilogy pillar builds, per #196):**
- Task #80 (Systems Check)
- Task #81 (Vault L1)
- Twin Direction A
- Task #203 (Live Competitive Analysis)
- Task #100 (Live Newswire)
- Task #97 (Integrity substrate)

**BRD-promoted MVP items (owner ruling 2026-08-08):**
- **L8 Memory Fabric** (was Wave 5) — MOVED INTO MVP — Task #138 + Task #206
- **Interactive Analytics UI** (was Wave S2) — MOVED INTO MVP — per `docs/product/interactive-analytics-ui-spec.md`
- **Playwright web browsing** for Paige + her agents (was Wave 7) — MOVED INTO MVP — largely landing via Wave 2.5 PR #398
- **Promotional account type** — NEW MVP capability — per `docs/product/promo-account-type-spec.md`; unified Invites surface in Super Admin (promo / paid-full / paid-discounted toggle)
- **Paige AI Chat — conversation compaction** (per BRD line 174) — rolling-summary + full-transcript both persist; §2 credit-flavored summarizer prompt cleaned
- **Paige AI Chat — persistent history** (per BRD line 175) — user+tenant keyed (not session), verified across all chat surfaces including client portal (§9/§51)
- **Paige AI Chat — persistent tasking** (per BRD line 176) — Paige creates durable task rows auto-linked to source conversation, not chat mentions that evaporate

**Cowork-locked specs ready for build (2026-08-08):**
- **Agent UI Placement** — per `docs/product/agent-ui-placement-spec.md`; right-rail + ⌘K launcher + Customer Portal floating avatar + Super Admin Paige Operator persona + agency scope switcher + impersonation banner/audit (11 downstream items)
- **Customer Portal MVP** — per `docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md`; 7 pillars × 5 stakeholders matrix, §38 money boundary load-bearing on pillar 4 (7 downstream items)
- **Interactive Analytics UI build** — per the spec above; 5 surface variations (Super Admin best / Agency roll-up + drill / Solo / sub-account / client Journey)
- **Promotional account type build** — per the spec above; migration + Super Admin unified Invites surface + expiry cron + notifications + anti-abuse guard

**Wave 4 sequencing note:** the Trilogy pillar builds + the Cowork-locked specs interlock. Sensible order — build the shared primitives first (Agent UI Placement right-rail + Analytics surface primitive), then layer pillar-specific + spec-specific surfaces. Concrete slice order to be filed by Claude Code before Wave 4 fires.

### WAVE S3 — Super Admin uplift, runs alongside Wave 4
See Wave S section below.

### WAVE 5 — RESERVED (L8 Memory Fabric moved to Wave 4 MVP per BRD 2026-08-08)

Kept as reserved slot for future post-MVP work. Backlinks preserved.

### WAVE 6 — Paige Quality Wave (per #196, unchanged)
- Task #189 — Multi-topic-per-reply capability
- Task #190 — TTS latency (streaming/pre-warm)
- Task #220 — LLM provider failover (§34 URGENT)
- Task #180 — LLM stack efficiency sweep (Anthropic prompt caching + Batch API + Groq/Cerebras benchmark)

### WAVE 7 — Playwright post-deploy verification (LARGELY COMPLETED)
Task #179 dev-dep + helper is Wave 2.5 PR #398. Remaining Wave 7 work: retroactive live-drive tests for existing features + CI integration of the helper.

### WAVE 8 — BETA LAUNCH prep (per #196, unchanged)
- Task #135 — Codex full-codebase pre-launch quality sweep
- Task #74 — Old logo/brand mark sweep across /legal/*
- Task #194 — Stripe wire-up Phase A (landing copy + feature gating + Enterprise CTA)
- Task #195 — Stripe wire-up Phase B (webhook handlers + tenant billing UI + downgrade/cancellation)
- Task #129 — Tenant lifecycle & wind-down doctrine + build (REQUIRED before first paying customer)
- Task #192 — stripe_annual_price_id column
- All P1 hotfixes cleared

### WAVE 9 — SOC 2 (per #196, unchanged)
- Task #136 — SOC 2 certification program (Vanta/Drata/Secureframe + policies + evidence collection)

---

## Wave S — Super Admin uplift (RUNS ALONGSIDE WAVES 1-9)

Owner-approved 2026-08-04. Parent task: **Task #45 Paige on Paige**. Runs in parallel because tri-scope primitives (§242) already serve operator-scope, and Task #83 (Super Admin Restructure) already shipped the foundation.

### Wave S1 — SHIPPED ✅
- **Task #163** — Founder Inbox tile removed (d3da54a9); §213.e residual sweep PR #362 ✅
- **Task #226** — Super Admin Team/Roles surface — status: check current state (queued)
- **Task #248** — Fleet management + tenant provisioning surface — status: queued

### Wave S2 — Fires alongside Wave 2 (uses Wave 1's primitives)
- Super Admin variant of "About Your Paige Team" (`/admin/paige-team` route on same #244 build)
- Super Admin Command Center — operator-scope status blocks (extends #245)
- Note: Interactive Analytics was previously Wave S2 — now MOVED TO MVP (Wave 4) per BRD 2026-08-08

### Wave S3 — Fires alongside Wave 4 (Owner Trilogy pillar BUILDS)
- Operator-scope Systems Check (Paige monitoring PAIGE's own infrastructure)
- Operator-scope Business Vault (Paige Agent AI corporate obligations per Task #173)
- Operator-scope Competitive Intelligence + Newswire (GHL/Viktor.com monitoring)
- Operator-scope Twin Capabilities Direction A (browser agents that operate the platform)
- **Paige Operator persona** (per Agent UI Placement spec §5a) — distinct Paige identity for Super Admin with fleet queries, break-glass two-key gate in-chat, tenant provisioning
- **Super Admin unified Invites surface** (per Promo spec §6.a) — issuance of promo / paid-full / paid-discounted from one place

---

## Wave S critical constraints

1. **Shared tri-scope primitives — NO forks.** Every Wave S build grep-checks per §18 before starting: if tenant-scope equivalent exists, EXTEND it, don't fork. If not, the Wave S task may need to BUILD the shared primitive first.
2. **Same discipline as Wave 1-9.** Right-sized §1 crew, §32 dual-leg + §39 peer-gate on §9-adjacent code, §11/§25 design pass, §37 producer inventory, §9 tenant/operator isolation checks, §213 "every account of a type runs identical code."
3. **1-3 concurrent crews max.** Per §14 right-sizing. Not "permanent Super Admin team" — per-task crews, same shape as Wave 1-9.

---

## Ambient interleaved (fires alongside every wave)

- §46 Cowork operating rhythm — pipeline flows paste-by-paste, no morning drop-offs
- §32 post-deploy scans — every ship, no exceptions (now systemically enabled by Wave 2.5 PR #398 Playwright helper)
- §32.b SET ROLE authenticated repros — every RLS/§9-adjacent code path
- §37 producer inventory — on every contract-changing endpoint (8 caller classes each)
- §39 peer-gate independent of author — every RLS + high-blast-radius work
- §47 MCP-migrations commit SQL to repo same-beat — non-negotiable, Slice 0 fork does not recur
- §48 Cowork rate-limit scope discipline — Chrome-driven merges bounded to the specific button
- Design crew (§1/§5/§11/§25) — mandatory on every design-touching task
- §9 tenant isolation checks — every count/attribution surface
- §213 "every account of a type runs identical code" — every new build

---

## The one-line pipeline

| Wave | Fires | Contents | Status |
|---|---|---|---|
| **W1** | 2026-08-04 | §10 CI fix + #243 + #240 + #93 doctrine paste | ✅ SHIPPED |
| **S1** | 2026-08-04 | #163 + #226 + #248 | ✅ (163) / 🔄 (226, 248) |
| **W2** | 2026-08-06 | #244 + #245 + #246 → #247 | ✅ (244/245/246) / 🔄 (247 in W2.5 tail) |
| **W2.5** | 2026-08-08 (now) | Launch-blocker cluster + Playwright + queue | 🔥 firing |
| **S2** | With W2 | Super Admin variants of #244/#245 | 🔄 queued |
| **W3** | After W2.5 | Practice Blueprints v2 (#164, #181, #185) | ⏸️ queued |
| **W4** | After W3 | MVP hub — Trilogy pillars + BRD-promoted MVP items + 4 Cowork specs | ⏸️ queued (largest wave) |
| **S3** | With W4 | Operator-scope Trilogy pillars + Paige Operator persona + Invites surface | ⏸️ queued |
| **W5** | — | RESERVED (L8 Memory moved to W4 MVP) | — |
| **W6** | After W4 | Paige Quality Wave (#189, #190, #220, #180) | ⏸️ queued |
| **W7** | After W6 | Playwright post-deploy verification (retroactive live-drives + CI wiring) | 🔄 largely landed via W2.5 |
| **W8** | After W7 | BETA LAUNCH prep (#135, #74, #194, #195, #129, #192) | ⏸️ queued |
| **W9** | After BETA | SOC 2 (#136) | ⏸️ queued |

---

## Change log

- **2026-08-04** — Initial filing. Owner-approved Wave S parallel execution. #248 filed for Wave S1 fleet/provisioning surface. #45 updated as Wave S orchestration parent. §10 CI fix merged (9bf4e9c1).
- **2026-08-04** — Filed to `docs/doctrine/canonical-build-order.md` (living doc, no date suffix, doctrine home per Task #214). Wave 1 in progress: §10 ✅ merged; #243 `<PaigeAttribution>` built + design-crew-verified → PR #361; Wave S1 #163 tile already removed (d3da54a9), §213.e residual sweep → PR #362. #240 Integrations + #93 doctrine paste + S1 #226/#248 queued next.
- **2026-08-08** — MAJOR UPDATE reflecting the BRD ruling, four Cowork-locked specs, and this session's launch-blocker cluster. Wave 1 fully shipped (#243/#361 merged 1860c825). Wave 2 shipped except #247 tail (#244/#366, #245/#367, #246/#368 all merged). NEW Wave 2.5 inserted for launch-blocker cluster + Playwright infrastructure: Bug A (#396 merged), Bug B (#397 merged), Academy→Agency reversal (#395 merged), BRD+Architecture (#394 merged), voice work shipped, doctrine §47+§48 added, Playwright PR #398 near merge, per-sub-account curation + sub-account MCP §9 gap + §3.b paste queued behind it. Wave 4 restructured as MVP hub per BRD 2026-08-08: original Trilogy pillar builds joined by BRD-promoted items (L8 Memory moved from W5, Interactive Analytics moved from S2, Playwright web-browsing moved from W7, Promotional account type NEW, Paige Chat compaction/persistence/tasking NEW) and four Cowork-locked specs (Agent UI Placement, Customer Portal MVP per Owner Trilogy Matrix, Interactive Analytics UI, Promotional account type). Wave 5 reserved (L8 moved). Wave 7 largely completed by W2.5 #398. Cowork owe-list zero.
