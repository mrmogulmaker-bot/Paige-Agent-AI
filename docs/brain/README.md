# 🧠 The Second Brain — master index & read-first orientation

**What this is.** A durable, verified index of Paige Agent AI's doctrine + platform state, so a
future session can answer *"do we have X?" / "where does Y live?" / "what did we already decide?"*
from a **document** instead of re-diagnosing a system that's already been built and documented.
This directory is the single entry point. Read this file first.

**Why it exists (§13/§30/§46).** The recurring, expensive failure is a session re-deriving a
pipeline, re-diagnosing a config, or rebuilding a surface that already exists — because the
knowledge lived only in a past chat that evaporated on context reset. The brain ends the guessing.
A hallucinated fact in here poisons every future session, so **every fact is either verified
this session (cited) or explicitly marked `⚠ unverified — confirm`.** Never assert into this
index what you have not checked.

**How to use it.**
- **Starting any substantive work?** Read this README, then jump to the domain doc(s) via the
  index below. If you're touching infra/integrations, read `config-registry.md`.
- **Asked "is X built / do we have Y?"** Answer from `codebase-map.md` (shipped routes/components/edge
  functions) + `config-registry.md` (integration wiring) + the index here + the cited source, not from
  memory. **A recorded "not built" counts** — see `decision-log.md` → "Known-unbuilt / spec-only status."
- **Need the meaning of a §-number, tier word, or VP name?** → `glossary.md`.
- **Need "what happened / what did we decide recently?"** → `decision-log.md`.
- **Hit a weird recurring bug?** → `lessons-learned.md` (symptom → root cause → rule).

**Closeout is TWO records, not one (owner-ruled 2026-09-02).** A workstream is not complete until the
relevant brain file **and** `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` are updated, whenever the work
changes product capability, platform truth, release status, architecture, owner flow, or a material
known limitation — or a collision-safe handoff names the exact section, proposed text, owner and
reason. The rule and its reporting gate live in `.claude/skills/second-brain/SKILL.md`.

**How to keep it true (see proposed CLAUDE.md §BRAIN).** Any PR that ships a feature, changes
config, or lands a ruling updates the relevant brain file **in the same commit**. A stale brain is
worse than none — it lies with authority.

**Brain-internal files**
| File | What it holds | When to read |
|---|---|---|
| `README.md` (this) | Master index of every doc + orientation | First, every session |
| `codebase-map.md` | Shipped surface area — routes (3 routers), component folders, edge-fn theme groups, feature gates, integration entry points | "Do we have surface/feature X **built**?" |
| `config-registry.md` | Infra/integration state — Twilio (incl. ISV/subaccount), ElevenLabs (3 voice systems), Stripe, Supabase, CI, MCP, signup, third-party (NAMES/IDs only, no secret values) | Touching any integration or deploy |
| `roles-permissions.md` | How roles actually work: the three stores, the owner→global-admin amplifier, which helper to use, live counts, what's not built | 2026-08-18 |
| `decision-log.md` | Chronological one-liners: PRs #375+, dated rulings, wave decisions | "What changed / what did we decide?" |
| `lessons-learned.md` | Recurring traps: symptom → root cause → rule | Before a class of work that's bitten us before |
| `paige-brain-wiring-standard.md` | **The two brains, and the 5-point checklist every capability must satisfy** — second-brain entry + callable seam + context feed + tool registration + tier availability. Includes the running coverage ledger (what Paige can/can't see). Names the four real layers of her runtime brain | **Shipping ANY capability** — owner-directed, 2026-08-19 |
| `cd-pack-port-playbook.md` | How to port a Claude Design pack surface to a live tier: the 7-step procedure + the 6 traps that have actually cost us. Written from the operator port so Agency/Sub-account/Solo/Enterprise don't re-learn them | Before porting any pack surface to any tier |
| `design-system.md` | Palette · gold discipline · type · depth · motion · layout · taste — and where each source lives | ANY design work, or "what is our design system?" |
| `../doctrine/one-approval-gate.md` | **How Paige proves the operator said yes — and the rule that no slice builds its own version.** How to add a gated action (classify it, stop), what is forbidden and why each shipped once, and how to rewrite a slice that built its own channel | **Before adding ANY action Paige performs on the operator's behalf**, or touching the confirm gate |
| `../doctrine/surface-cards/` | **The Solo surface cards** — one per department, ten required fields, a truth label. `README.md` carries the schema and maps the Alignment Standard's named documents to what actually exists | Before changing ANY Solo department |
| `../doctrine/solo-shell-contract.md` | **The canonical Solo shell contract** — one shell for every Solo tenant, address-vs-authority, the CSS-clip interaction policy, the four-viewport proof bar, and the map of what already enforces each rule | Before ANY Solo shell, routing, layout, page-host, responsive or PAIGE-workspace change |
| `solo-settings-scroll-and-release-playbook.md` | Shipped Solo Settings scroll/reachability contract: one real owner, visible-scroll scope, reset/focus, reproduced-shell proof, actual-`SoloApp` gaps, harness cleanup and exact-head release labels | Any Solo Settings reachability, scrolling, contextual-rail, PAIGE-fold or release-proof work |
| `solo-people-contact-upsert-playbook.md` | Solo Clients / People contact ownership, tenant-safe human + PAIGE upsert flow, form-fit guardrail, two-context viewport proof, and exact-head Gate 2 discipline | Any People contact create/edit, Clients form-fit, contact mutation, or PAIGE contact-update work |
| `glossary.md` | §-anchors, tier vocab, VP roster, wave/slice names, project jargon | Any unfamiliar term |
| `goat-anchor-registry.md` | The intellectual DNA of Paige's professional intelligence — WHOSE proven framework anchors WHICH domain (v1, 13 anchors). Branded names OK in docs; **code = mechanic-descriptive only** | Seeding a skill / authoring a methodology anchor / investor IP disclosure |
| `paige-skills-inventory.md` | What Paige DOES at professional level — the 12-category, ~100-skill inventory (v1). The S2 seeding target list; complements the GOAT registry (what she executes vs whose thinking she reasons from) | Seeding a skill / S2 wave / investor IP disclosure |
| `pipeline-identity-contract.md` | Draft Pipeline UUID/PPL identity, zero-deal duplicate catalogue, truthful provenance, and exact-reference governed archive contract | Any Pipeline catalogue, create, rename, stage-management, archive, or Paige Pipeline-tool work |
| `paige-spine-and-rail-state.md` | **Verified Spine + Rail current state, and the existence-vs-reachability rule.** One registered capability against 105 inline Chat tools; why most departments cannot be added without a Change Request; and why owner-visible Solo Rail activity is UNAVAILABLE rather than empty | "Is department X connected to PAIGE?" · before any Spine capability · before reading anything into an empty Solo activity feed |

---

## Verified platform snapshot (this session, 2026-08-09)

All figures below were checked live this session; how each was verified is in `config-registry.md`.

- **Supabase project ref:** `xygzykjyynhzqytbqnzu` (verified: `config.toml`, Supabase MCP).
- **Migrations:** **764** applied on prod = 764 `.sql` files in repo → **zero drift**; latest
  `20260813000000` (verified 2026-08-09: `supabase_migrations.schema_migrations` via MCP `count`/`max`
  = 764/`20260813000000` + repo `ls`; incl. #408 `20260812000000` + #409 `20260813000000`, §32.a-confirmed).
- **Edge functions:** **243** function directories under `supabase/functions/` excl. `_shared/`
  (verified: `ls -d */`). Count churns as functions ship — see `codebase-map.md` for the theme groups.
- **Tenants on prod:** **11** — 10 `account_type='standalone'`, 1 `'agency'` (verified: MCP query).
- **Stripe account:** `acct_1TvndiLUcYKxolNa` "Paige Agent AI" (verified: Stripe MCP).
- **Active platform plans:** DB `platform_subscription_plans` = solo · agency · enterprise (all
  `is_active`); **live Stripe active prices = Solo + Agency only** (Enterprise has no active Stripe
  price yet — see `config-registry.md`).
- **CI pipelines:** 6 — `ci`, `deploy-migrations`, `deploy-edge-functions`, `migration-lint`,
  `premerge-migration-proof`, `security-audit` (verified: `.github/workflows/`). Plus two RLS
  drift-guard npm scripts wired into `ci.yml`: **`lint:views`** (VIEW `security_invoker` drift, #116/PR #447)
  + **`lint:definer-fns`** (`SECURITY DEFINER` fn granted to anon w/o exempt escape, #117/PR #448) —
  the anon/cross-tenant-reach class is now guarded at both Postgres object types. See `config-registry.md` → CI.
- **Paige default voice:** `DEFAULT_TTS_VOICE = 0S5oIfi8zOZixuSj8K6n` (**"Ivanna"**) — owner-ruled
  2026-08-09, PR #409 (`1e726426`). ON RECORD, do not re-ask (§BRAIN.2). See `config-registry.md` → Voice.
- **Operator Communications:** live on prod — PR #408 (`2ee92903`), §32.a confirmed
  (`operator_conversations`/`operator_messages`). Inert until A2P MG SID + inbound token pasted.
- **Wave 4a:** CLOSED — 4a.1 Agent right-rail (#405) · 4a.2 L8 Memory Fabric (#406) · 4a.3 chat
  compaction/persistence/tasking (#407) · 4a.4 Analytics primitive (#411, `c40f76d3`).
- **Root law now includes** `§BRAIN` (Second Brain discipline) + a "Voice Configuration" reference
  section, both in `CLAUDE.md` as of #409/this PR.

---

## Doctrine index — the "how we build & how Paige runs" law

Root law is `CLAUDE.md` (§1–§39 + §50–§53 + §56 + `§BRAIN` + a "Voice Configuration" reference
section; see `glossary.md` for the full anchor map). The docs below are the long-form doctrine that
`CLAUDE.md` sections point to. **§56 (2026-08-10) — the pre-build tier-matrix gate:** before ANY
build, open `docs/doctrine/tier-matrix.md`, name which account type(s) the change is for, and decide
per-tier whether the feature belongs (a "every tier" capability must render regardless of
empty-book/branch/route accident). See `lessons-learned.md` #11 for the anchoring bug. **§61
Standing Tier Distribution Default (2026-08-11, PROPOSED)** (same doc, tier-matrix.md §61): don't ask
the owner "which tier?" — every new feature defaults to **God = YES · Solo = YES · Sub-account = YES ·
Agency = RESELL** (resells to sub-accounts via Marketplace, does NOT operator-use it) **· Enterprise =
YES + RESELL** (hybrid). Deviations need an owner ruling + a code comment; matching features ship noting
"§61 default: no exception". Preserved exceptions: `customer_portal_invite` (Solo+Sub+Enterprise),
`growth`/`studio` (Solo+Sub+God, Agency excluded).

| Path | One-line | When to read |
|---|---|---|
| `docs/doctrine/100M-org-blueprint.md` | Paige's canonical 10-department operating model (§16) | Building anything into the org/departments model |
| `docs/doctrine/1B-growth-map.md` | $1B ARR revenue + governance north star (§17) | Placing a revenue feature on the engine/stage map |
| `docs/doctrine/canonical-build-order.md` | The authoritative wave/slice build sequence | Deciding what to build next / where a slice sits |
| `docs/doctrine/tier-matrix.md` | The canonical six tiers + resolution/RLS per tier (§51) + the §56 pre-build gate | **BEFORE any build (§56)**; any tenant-scoped change; every §37/§51 check |
| `docs/doctrine/skills-vocabulary.md` | The 4 "skill"-adjacent concepts (paige_skills recipe · marketplace add-on · paige_subagents specialist · methodology anchor) + their tier availability | Any work touching skills/skill-runner/skill-forge/subagents/marketplace — disambiguate "skill" first |
| `docs/doctrine/compliance-checklist-template.md` | Tier-matrix compliance checklist to run per crew | Compliance pass on a tenant-scoped surface |
| `docs/doctrine/producer-inventory-template.md` | §37 × tier producer-inventory worksheet | Hardening/altering any endpoint contract |
| `docs/doctrine/money-spine-architecture.md` | Full money architecture — Paige-held vs facilitated rails (§38) | Any payment/billing surface |
| `docs/doctrine/connections-rail-contract.md` | The Page/Rail/PAIGE/Brain contract for Connections & A2P — what may reach the rail, what PAIGE may read/do, and the 4 missing shared contracts (C-1…C-4) nobody may substitute for | Any provider-setup, readiness, A2P or communications-outcome work |
| `docs/brain/comms-capability-map.md` | What A2P / numbers / voice actually exist, and the difference between code that exists, is deployed, and is reachable. The stranded-surface backlog and the resurfacing order | "do we have comms X?" · any A2P, number, or voice work |
| `.claude/skills/README.md` | What lives in `.claude/skills/` and why nothing third-party does: the MIT notice for the §69 skill can neither be fetched nor reconstructed without inventing a copyright holder, and what would unblock it. **Carries the 2026-09-01 correction** — the "half-install" an earlier revision described is NOT real; the synced bundle inlines every reference and is self-contained | Any software task here — §69 makes the skill mandatory · before vendoring or updating it |
| `.claude/skills/second-brain/SKILL.md` | **Ours.** Read the brain BEFORE work and update it BEFORE done — both bookends. Step 1 says which file answers which question; steps 3–4 record what the task taught and sweep for the claims it falsified (§0 master ref · §BRAIN.3 brain · §66 tier matrix each bind a DIFFERENT file). Loads on every fresh container | One of the FIRST steps of any task here, and again as one of the LAST |
| `docs/doctrine/paige-c-suite-roster.md` | Named-agent VP roster (VERA/NEXUS/CURA/…) | Referencing or forging a Paige VP/sub-agent |
| `docs/doctrine/paige-os-architecture.md` | Paige-as-OS architecture (§35) | OS-shaped primitive decisions |
| `docs/doctrine/paige-practice-blueprints-2026-07-29.md` | One-click vertical "Blueprint" install layer | Playbook/Blueprint/vertical-preset work |
| `docs/doctrine/paige-unified-comms-substrate-2026-07-29.md` | §49 unified comms substrate spec | Comms/messaging/channel work |
| `docs/doctrine/L8-memory-fabric-workstream.md` | L8 owner-memory fabric scope brief | Memory-layer / `paige_owner_memory` work |
| `docs/doctrine/wave5-phase1-phase2-sequencing.md` | Wave 5 phase-1-then-2 sequencing standard | Planning Wave 5 |
| `docs/paige-master-implementation-order.md` | Master implementation order | Cross-wave sequencing |
| `docs/paige-roadmap-action-bus.md` | Action-bus era feature roadmap (§8) | Action-bus / cross-team coordination work |
| `docs/paige-n8n-orchestrator-brain-doctrine.md` | Paige→n8n orchestrator authoring doctrine | Authoring n8n workflows via Paige |
| `docs/n8n/*.json` | Authored n8n workflow JSON (e.g. `paige_stage_change_dispatcher_v2.json`) — the actual workflow artifacts | "Do we have n8n workflows built?" |

## Security doctrine index (DOCTRINE_190–213 + related)

| Path | One-line | When to read |
|---|---|---|
| `docs/security/DOCTRINE_190_191_192.md` | §190/191/192 Phase-B codification | Platform-separation / billing phase-B context |
| `docs/security/DOCTRINE_194_MONITORING_ONLY.md` | §194 — credit **monitoring**, NEVER credit repair | Any credit/monitoring surface (§2 boundary) |
| `docs/security/DOCTRINE_197_BILLING_LAYER_TAXONOMY.md` | §197 — L1/L2/L3/L4 billing-layer taxonomy | Any billing/metering feature |
| `docs/security/DOCTRINE_198_LEGACY_DEPRECATION.md` | §198 — legacy data deprecation protocol | Deprecating a table/column/function |
| `docs/security/DOCTRINE_198_ADDENDUM_DEPRECATION_REQUIRES_CUTOVER.md` | §198 addendum — deprecation requires cutover | Same, when a live cutover is involved |
| `docs/security/DOCTRINE_200_PLATFORM_INDEPENDENCE.md` | §200 — platform independence from the reference tenant | Anything that could hardcode a tenant's content into platform |
| `docs/security/DOCTRINE_201_PUBLIC_LANGUAGE.md` | §201 — public-facing language discipline | Public/marketing copy sweeps |
| `docs/security/DOCTRINE_202_MULTI_ENTITY_CONTACTS.md` | §202 — multi-entity contact relationship model | Contacts / clients data model |
| `docs/security/DOCTRINE_203_LANE_SEPARATION_RUNTIME.md` | §203 — product-lane separation runtime enforcement | Coaching-generic vs funding-lane runtime seams |
| `docs/security/DOCTRINE_205_METERING_SAFETY_NET.md` | §205 — metering fire-and-forget + dead-letter reconciliation | Metering event emission |
| `docs/security/DOCTRINE_208_SHAPE_DELTA_DISCIPLINE.md` | §208 — migration shape-delta discipline | Writing a schema migration |
| `docs/security/DOCTRINE_210_L2_L3_SCOPE_BOUNDARIES.md` | §210 — L2 subscription-state vs L3 metering boundary | Billing state vs usage events |
| `docs/security/DOCTRINE_213_MIGRATION_SHAPE_DISCIPLINE.md` | §213 — migration shape discipline | Writing a schema migration |
| `docs/security/AUDIT_213c_RETRO_2026_07_03.md` | §213.c retro — DO-block snapshot isolation | Migration DO-block patterns |
| `docs/security/OPERATOR-ACCESS-MODEL.md` | Which account operates the platform (operator seam) | Operator/God-tier access questions |
| `docs/security/PLATFORM_SEPARATION_AUDIT_2026-07-02.md` | Platform-separation audit snapshot | §9 platform/tenant seam history |
| `docs/security/SECURITY_DEFINER_CATALOG.md` | Catalog of `SECURITY DEFINER` functions in `public` | Auditing/adding a DEFINER function (§39 IDOR risk) |
| `docs/security/612-clients-linking-integrity.md` | #612 clients-linking integrity (§9) | Client-linking / ownership integrity |
| `docs/security/p1c-privacy-multiowner-prescope.md` | P1c privacy + multi-owner pre-scope (research) | Multi-owner/privacy scoping |
| `docs/security/MIGRATION_B0_ROW_CLASSIFICATION_AUDIT.md` | Migration B.0 row-level layer classification | Billing-migration B lineage |
| `docs/security/MIGRATION_B0_RECONCILIATION_ADDENDUM.md` | Migration B.0 reconciliation-responses addendum | Same lineage |
| `docs/security/MIGRATION_B_SHAPE_PROPOSAL.md` | Migration B shape proposal (§208) | Same lineage |
| `docs/security/MIGRATION_B_SHAPE_PROPOSAL_PATH_B_FINAL.md` | Migration B shape proposal — Path B FINAL | Same lineage |
| `docs/sprints/SPRINT_211_212_ENFORCEMENT.md` | §211 — zero brand references in code enforcement | Brand-in-code sweeps |

## Architecture index

| Path | One-line | When to read |
|---|---|---|
| `docs/architecture/CANONICAL-SYSTEM-ARCHITECTURE-2026-08-08.md` | Canonical system architecture (newest, 2026-08-08) | First stop for "how is the system wired?" |
| `docs/architecture/platform-operator-tenant-200.md` | §200 platform-operator tenant / operator workspace | Operator-tenant model |
| `docs/architecture/tenant-domain-and-communications-spine.md` | Tenant domain + comms spine | Domain/email/comms routing |
| `docs/architecture/ECOSYSTEM_DATA_OWNERSHIP_MAP.md` | Who owns which data across the ecosystem | Data-ownership seam questions |
| `docs/architecture/ECOSYSTEM_FULL_STACK_BOUNDARIES.md` | Full-stack boundary map | Cross-boundary integration |
| `docs/architecture/MARKETPLACE-DATA-MODEL.md` | Marketplace data model | Marketplace tables/RLS |
| `docs/architecture/SPRINT_C1_TENANT_READINESS.md` | Sprint C.1 non-MMA tenant readiness gate | Tenant-readiness onboarding |

## Strategy · Audits · Assessments index

| Path | One-line | When to read |
|---|---|---|
| `docs/strategy/owner-trilogy-2026-07-26.md` | The Owner Trilogy — AI COO for coach/consultant/agency | Owner-trilogy positioning |
| `docs/strategy/twin-capabilities-landscape-2026-07-26.md` | Twin-capabilities landscape research | Digital-twin capability scoping |
| `docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md` | Systems-check + owner analytics + competitive intel | Analytics/competitive-intel work |
| `docs/strategy/business-vault-partner-landscape-2026-07-26.md` | Business Vault partner + regulatory landscape | Business-vault/partner scoping |
| `docs/strategy/agency-surface-competitive-research-2026-07-25.md` | Agency surface competitive research + proposal | Agency-surface features |
| `docs/strategy/marketplace-competitive-landscape-2026-07-22.md` | Marketplace competitive landscape | Marketplace positioning |
| `docs/strategy/monetization-rollout-2026-07-21.md` | Monetization rollout strategy | Monetization sequencing |
| `docs/strategy/client-experience-workstream-2026-07-21.md` | Client-experience workstream strategy (§7/§8) | Client-portal experience work |
| `docs/audits/money-spine-lane-b-i-discovery-2026-07-25.md` | Money Spine Lane B-i revenue-plumbing discovery | Money-spine build |
| `docs/audits/b-iv-38-connect-posture-2026-07-26.md` | B-iv §38 Connect-posture diagnostic (spike, no code) | Stripe Connect posture (§38) |
| `docs/audits/phase2b-privileged-function-audit-2026-07-25.md` | Privileged edge-function posture audit | Edge-function security posture |
| `docs/audits/phase2d-undeployed-function-disposition-2026-07-25.md` | Undeployed edge-function disposition | Dead/undeployed function cleanup |
| `docs/audits/people-model-strategy-2026-07-21.md` | People-model strategy draft | Team/People-department model |
| `docs/audits/platform-ia-slice-1c-handoff.md` | Slice 1c IA restructure handoff (revised final) | IA-restructure context |
| `docs/audits/pr-304-tenant-domain-doctrine-verification-2026-07-30.md` | PR #304 tenant-domain doctrine verification | Tenant-domain doctrine history |
| `docs/assessments/CONSOLIDATED_PLATFORM_AUDIT.md` | Consolidated platform audit | Broad platform state audit |
| `docs/assessments/DRIFT_AUDIT_2026-07-14.md` | Live-vs-repo drift audit (2026-07-14) | Drift history |
| `docs/assessments/IA-SLICE-1C-BLUEPRINT.md` | Locked target-IA blueprint (Slice 1c) | IA target state |
| `docs/portfolio/PORTFOLIO_SCOPE_BRIEFING.md` | Portfolio scope briefing (authoritative) | Portfolio-context scoping (§35) |

## Product specs index (docs/product/*)

| Path | One-line | When to read |
|---|---|---|
| `docs/product/BRD-MVP-2026-08-08.md` | Business Requirements Doc — MVP (newest) | Scope/requirements source of truth |
| `docs/product/agent-ui-placement-spec.md` | LOCKED — Paige agent UI placement (right-rail + ⌘K) | Agent-UI surface work |
| `docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md` | LOCKED — customer-portal owner-trilogy taxonomy | Portal taxonomy |
| `docs/product/interactive-analytics-ui-spec.md` | LOCKED — interactive analytics UI | Analytics UI build |
| `docs/product/paige-multichannel-comms-and-deliverable-workflow-spec.md` | LOCKED — multi-channel comms + deliverable workflow | Comms/deliverable build |
| `docs/product/promo-account-type-spec.md` | LOCKED — promotional account type | Promo-account work |

## Design references index (docs/design-references/*) — §25 visual source of truth

| Path | One-line | When to read |
|---|---|---|
| `docs/design-references/README.md` | The source-of-visual-truth overview | Any design/taste pass |
| `docs/design-references/CHEESY-TELLS.md` | Enumerated anti-pattern catalog (binds the critic, §25/§33) | Every design-critic pass |
| `docs/design-references/CSS-EFFECTS.md` | Premium CSS techniques catalog | Building premium effects |
| `docs/design-references/DESIGN-CRITIC-PROMPT.md` | Design-critic operating brief (SHIP/ITERATE/BLOCK) | Running the design critic |
| `docs/design-references/OPERATOR-COMMAND-CENTER-IA.md` | Operator Command Center surface hierarchy | Command-center IA |
| `docs/design-references/STUDIO-VISUAL-QA-HANDOFF.md` | Studio visual-QA handoff (Chrome MCP) | Studio visual QA |
| `docs/design-references/gallery/{attio,cal-com,framer-marketing,linear,notion,retool,stripe-dashboard,superhuman,vercel-dashboard}/{README,SCREENSHOTS}.md` | Per-reference taste annotations + screenshot capture lists | Comparing a surface to best-in-class |

## Comms index (docs/comms/*)

| Path | One-line | When to read |
|---|---|---|
| `docs/comms/SEND-MESSAGE-CONTRACT.md` | LOCKED `send-message` contract (C-2 + C-1.5 seam) | Touching `send-message` edge fn |
| `docs/comms/C2-SURFACE-BUILD-PLAN.md` | LOCKED Comms C-2 surface build plan | Building the C-2 comms surface |
| `docs/comms/C2-SURFACE-DECISIONS.md` | LOCKED Comms C-2 owner decisions | Same |

## Studio index (docs/studio/* + Studio state docs)

| Path | One-line | When to read |
|---|---|---|
| `docs/studio/CREATIVE-ENGINE-SPEC.md` | Owner creative-engine spec (verbatim) | Vibe Studio creative-engine work |
| `docs/studio/UPGRADE-U3-session-memory-spec.md` | Studio U3 session-memory spec (not yet built) | Studio session-memory |
| `docs/PAIGE-CREATIVE-MEMORY.md` | Studio creative-memory overview (§26) | Prompt-forge / creative memory |
| `docs/PAIGE-STUDIO-PAUSE-STATE-2026-07-19.md` | Studio pause-state snapshot | Resuming Studio work |
| `docs/VIBE-STUDIO-HANDOFF-2026-07-14.md` | Studio handoff state (2026-07-14) | Studio history |

## Grounding reports index (§34 phase-0 groundings + intelligence)

| Path | One-line | When to read |
|---|---|---|
| `docs/PAIGE-INTELLIGENCE-GROUNDING-REPORT.md` | §34 intelligence-infra grounding (7 departments + build state) | Any §34 intelligence-layer PR (cite it) |
| `docs/L4-REASONING-GROUNDING.md` | §34 L4 reasoning department grounding | Reasoning-engine work |
| `docs/L7-SLICE-1-GROUNDING.md` | L7 God-view intelligence dashboard grounding | L7 dashboard work |
| `docs/RESEARCH-VERIFIER-FDIC-NCUA-GROUNDING.md` | Research-verifier + FDIC/NCUA skills grounding | Research-verifier / lender-data skills |
| `docs/PAIGE-CALLABLE-SEAMS.md` | Inventory of Paige-callable seams (§10) | "Is this Paige-governable?" checks |
| `docs/PLATFORM-FUNCTION-INVENTORY-2026-07-19.md` | Platform function inventory — built / bar / next | Broad "what's built" reference |

## Ops & handoffs index

| Path | One-line | When to read |
|---|---|---|
| `docs/OPS.md` | Pipeline & CI runbook (automations, `/edge-drift`, deploy) | Any ops/deploy question (§24) |
| `docs/DONE.md` | Completed-task archive (§24 hygiene) | History of shipped tasks |
| `docs/doc-render-decision.md` | HTML→PDF rendering microservice decision (Lane C) | PDF/rendering pipeline |
| `docs/handoffs/money-spine-lane-b-handoff-2026-07-25.md` | Money Spine Lane B handoff | Money-spine continuation |
| `docs/delivery/paige-spine-mind-handoff.md` | First PAIGE Mind slice: the Pipeline evidence projection, the approved citation SCR, the client-scope seam, proof by class, and the collision-safe Second Brain blocks owed while PR #729 holds `decision-log.md` and `lessons-learned.md` | Any Mind, Spine, Pipeline-evidence or PAIGE-client-scope work |
| `docs/delivery/parked-follow-ups-2026-09-02-mind-slice.md` | Three verified defects parked during the Mind slice: a Rail feed reading a table the browser cannot select from, an undefined extraction function swallowed by a catch, and a possibly-unlistened `paige:open` dispatch | Picking up Rail, Chat-runtime or `paige:open` work — check here before re-diagnosing |
| `docs/tenants/mma/tenant-kb-marketing-copy.md` | MMA tenant marketing/positioning KB (tenant-scoped) | MMA-tenant copy (never a platform default, §9) |
| `docs/PULL_REQUEST_TEMPLATE.md` / `docs/PULL_REQUEST_TEMPLATE.md` | PR template | Opening a PR |

---

*Index generated 2026-08-09 from a full uncapped `find docs -name '*.md'` — **121 files, all indexed,
zero gaps** (completeness-audited this pass) — plus a codebase feature inventory (`codebase-map.md`) and
live MCP/Stripe/git recon. If you add or move a doc/route/edge-fn, add its row here (or in
`codebase-map.md`) in the same commit (§BRAIN.3).*
