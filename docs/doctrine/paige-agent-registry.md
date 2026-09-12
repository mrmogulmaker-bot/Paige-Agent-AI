# The PAIGE Agent Registry — canonical record, roster reconciliation, and the Solo org chart

**Status:** DESIGN — awaiting owner approval. No production change is proposed by this document.
**Owner:** Antonio Cook. **Drafted:** 2026-09-04, against `origin/main` `a4ef76e`.
**Companions:** `paige-agent-lifecycle-and-autonomy.md` (how an agent lives) ·
`solo-agent-placement-map.md` (where each role appears) ·
`../handoff/solo-orchestrator-compatibility-packet.md` (what the in-flight Orchestrator needs now) ·
`../design-references/prototypes/solo-business-game-plan.html` (the interactive review surface).
**Doctrine anchors:** §7 · §8 · §9 · §10 · §12 · §14 · §16 · §18 · §36 · §51 · §56 · §57 · §58 · §60 · §61 · §67 · §68.

---

## 0. Why this document exists

PAIGE is one public-facing COO. A Solo owner talks to PAIGE; PAIGE delegates to accountable
specialists and reports back with ownership, evidence, action and next step. Nothing in that
sentence is controversial. What *is* broken is that the platform currently holds **five parallel,
mutually contradictory answers** to "who are the specialists and what does each own," and two of
those answers are shipping to users right now.

This document settles the roster, defines the one reusable record every agent carries, and draws
the Solo org chart — so that the coming implementation across Command Center, Clients, Campaigns,
Sales, Conversations, Setup, Integrations, Trust Compass and the PAIGE experience builds against
one definition instead of re-deriving a different one per surface.

**It changes no code.** Everything below is a specification to be approved, then built.

---

## 1. What is actually true today (verified, not remembered)

Every row was checked against the repository at `a4ef76e`. Where a widely-read document is wrong,
that is recorded rather than quietly corrected — §13, and §58 for anything that would disappear.

### 1.1 The registry table

| Claim | Reality | Evidence |
|---|---|---|
| `paige_agents` exists | **No. It has never existed.** Zero hits across all 951 migration files. | `grep -rn "paige_agents" supabase/migrations/` → 0 |
| The roster doc says otherwise | `paige-c-suite-roster.md` L33 reads, in the present tense, *"Every named agent is discoverable at `paige_agents.name = 'VERA'`"*, and L325 opens a full `CREATE TABLE paige_agents (…)` that was never run. | `docs/doctrine/paige-c-suite-roster.md` |
| The real registry | **`public.paige_subagents`** — 29 columns after five `ALTER`s (counted on prod, not from the migrations). Globally-unique `slug`; `tenant_id` (NULL = platform default); `department` FK → `paige_departments(slug)`; `config` jsonb carrying `job_kind`; `system_prompt`; `enabled` + `auto_disabled_reason`; `role`/`goal`/`backstory`/`version`; `runtime` check `('local','langgraph')`; `triggers`, `input_schema`, `output_schema`, `requires_role`, `display_order`. | `supabase/migrations/20260629235541_*.sql` + 4 later ALTERs |
| Tenant scoping | Real. RLS policy **`paige_subagents_tenant_read`** exists; `tenant_id IS NULL` means platform default. | migration + `src/solo/data/useSoloSubagents.ts` |
| Seeded rows | **36 distinct slugs are `INSERT`ed across five migrations, but prod holds 24** — the seeds are not the registry. (`problem-reverse-engineer` is a *rename* of `problem_reverse_engineer`, not a seed; counting it inflates the enumeration.) Department tagging on prod uses **only the two legacy desks** — 6 `owner_ops`, 4 `client_experience`, **14 NULL**. **Zero** agents are tagged to any of the nine §16 blueprint departments, which exist as rows and hold nothing. | migration seeds + prod count, ref `xygzykjyynhzqytbqnzu` |
| The action bus | `paige_action_kinds` — 33 slugs, `default_from_department` / `default_to_department` FKs, `draft_subagent_slug` FK → `paige_subagents(slug)`, and `default_autonomy_lane`. | `supabase/migrations/*action_bus.sql` |
| The autonomy lane | **`text` + `CHECK`, not a Postgres enum** — `('auto','confirm','off')` — and the same constraint is replicated independently on five tables. | migrations |
| Generated types are stale | `src/integrations/supabase/types.ts` lists **25** fields for `paige_subagents` and **omits `role`, `goal`, `backstory`, `version`** — all four of which are applied on prod and read at runtime by `paige-orchestrator`. | `types.ts` L12627–12653 (25 fields + the 4 omitted = 29, which independently corroborates the prod count) vs `supabase/functions/paige-orchestrator/index.ts` L321, L364–368 |

**No named agent exists in the backend — proven two ways, because one way is not enough.**
The roster doc promises functions like `vera_consent_check()` and `zion_scenario_model()` (L33). A
word-boundary search alone **cannot** disprove those: underscore is a word character, so
`\bvera\b` does not match `vera_consent_check`. Both forms were therefore run against
`supabase/`:

| Search | Hits |
|---|---|
| `\b(zion\|nexus\|merit\|cura\|mentor\|vera\|oathen\|scribe\|mason)\b` | **0** |
| `\b(zion\|nexus\|merit\|cura\|mentor\|vera\|oathen\|scribe\|mason)_[a-z]` (catches `vera_consent_check`) | **0** |
| `paige_agents` | **0** |
| `paige_subagents` | 29 files |

**Consequence for this design:** the registry **extends `paige_subagents`**. It does not build the
`paige_agents` table the roster doc sketches. `paige_subagents.slug` is already the FK target for
`paige_action_kinds.draft_subagent_slug` and `paige_actions.assigned_subagent_slug`; a second agent
table would fork the taxonomy the action bus already depends on (§18, §12).

### 1.2 The five rosters, and which one users are reading

| Source | ZION | NEXUS | MERIT | CURA | MENTOR | VERA | Others |
|---|---|---|---|---|---|---|---|
| **A.** `paige-c-suite-roster.md` L21–27 (doctrine) | Strategy & Vision | Growth: **Marketing + Sales** | **Finance & People** | Client Success **+ Curriculum** | **Operations** (n8n, infra) | Trust & Verification | — |
| **B.** `PaigeAttribution.tsx` `VP_ROSTER` (**shipped**) | **Operations & automation** | Marketing & growth | **Sales & revenue** | Client success | **Curriculum & delivery** | Quality & standards | — |
| **C.** `vpDepartments.ts` `DEPT_VP` (**shipped, compile-locked**) | `technology_automation`, `operations_pmo` | `marketing` | `sales`, `finance` | `client_experience` | `product_curriculum` | `legal_compliance` | PAIGE holds `executive_office`, `people_talent`, `owner_ops` |
| **D.** `src/prototype/TenantRedesign.tsx` (**routed at `/tenant-redesign`**) | Operations | — | — | — | — | — | KAVYN · MIRAEL · VAYRON · METHRA · OATHEN, each labelled *"provisional"* |
| **E.** `paige-ia.js` (CD pack, operator scope) | *"Fleet half of the sweep"* | named only | — | — | — | — | OATHEN, MASON, SCRIBE |

**A sixth rendering exists, and it is this design's own.** The prototype
(`../design-references/prototypes/solo-business-game-plan.html`) renders OATHEN with the remit
*"Owner approvals"* — which differs from the CD pack's *"Holds findings that need your word"* and
from `TenantRedesign.tsx`'s *"Standards · provisional"*. That is the **proposed** roster, not a
sixth pre-existing one, but it is a sixth set of words about the same names and is counted here so
nobody discovers it later and calls it drift.

**A three-way rotation sits between doctrine and code.** Doctrine A says ZION=Strategy,
MENTOR=Operations, MERIT=Finance&People. Shipped code B/C says ZION=Operations, MENTOR=Curriculum,
MERIT=Sales. `docs/brain/glossary.md` L99–100 already names this: *"MENTOR/MERIT/ZION are
effectively rotated."*

**This is not dormant doctrine — it is live and user-facing.** `PaigeTeamDirectory` is routed at
three tiers (`App.tsx` L284, `AgencyLayout.tsx` L298, `Admin.tsx` L852) with nav entries, and
`PaigeDepartmentStatus` renders VP attribution on **both** home screens
(`OperatorCommandCenter.tsx` L618, `PracticeOverview.tsx` L276). A tenant today reads:

> **Zion — Operations & automation — "Handles the busywork behind the scenes so nothing slips."**
> — `src/pages/PaigeTeamDirectory.tsx` L94

That sentence is precisely the reduction of ZION to an integration monitor the new controlling
definition forbids. It is shipping now.

### 1.3 Four findings that must not be lost

1. **A false provenance claim in shipped code.** `src/operator/shell/spine/faces/spineFaceContract.ts`
   L25–27 asserts: *"THE AGENT NAMES ARE OURS, NOT CD'S INVENTION. PAIGE · ZION · OATHEN · MASON
   appear in `src/lib/paige/vpDepartments.ts`."* They do not — that file contains only PAIGE, NEXUS,
   MERIT, CURA, MENTOR, ZION, VERA (`grep -c "OATHEN\|MASON"` → **0**). That false claim was the
   stated justification for importing OATHEN and MASON into an operator surface contract. Correcting
   the comment is a tracked follow-up; no registry work may cite it as evidence.
2. **Three shipped surfaces structurally refuse the roster.** `src/components/ui/paige/persona.ts`
   L11–19 declines to bind any VP because the sources *"disagree on which VP owns which
   surface/remit."* `docs/product/BRD-MVP-2026-08-08.md` L576 marks it *"OWNER INPUT REQUIRED."*
   And `src/solo/SoloPaigeWorkspace.contract.test.tsx` L150 is a **shipped CI guard** banning
   `ZION|OATHEN|MASON|KAVYN|MIRAEL|VAYRON|METHRA` from the Solo workspace as *"disputed assignments."*
3. **Only two names carry brand protection.** `docs/brand/paige-brand-identity.md` L6, owner-approved
   2026-08-22, locks **PAIGE and ZION only** — while the roster doc L29 claims all seven are
   *"load-bearing… not casually amendable."* The five names actually shipping to users have no
   brand-level protection.
4. **The architecture doc is half-wrong.** `CANONICAL-SYSTEM-ARCHITECTURE-2026-08-08.md` L485–491
   says the C-suite *"does not exist in code or prod."* Correct about the **database**; wrong about
   the **frontend**, where it is routed at three tiers. Anyone answering *"do we have this?"* from
   that doc concludes it is unbuilt while tenants are reading it.

---

## 2. The reconciliation — decisions and rationale

The owner's brief is the controlling authority where sources conflict. Each decision below records
what it supersedes, so no history is silently overwritten (§58).

| # | Decision | Supersedes | Rationale |
|---|---|---|---|
| **D1** | **ZION = Business Twin and strategy lead.** Business plan, game plan, positioning, priorities, operating structure, setup sequence, re-planning. | Shipped B/C ("Operations & automation") and pack E ("fleet sweep"). **Restores** doctrine A. | The owner's brief is explicit: *"Do not reduce ZION to an integration monitor."* ZION is one of only two brand-locked names, so the identity is durable and worth getting right. |
| **D2** | **Automation Agent sits BENEATH ZION** as a generic technical worker — n8n, integrations, workflow health, data-flow execution, scheduled operational work. | The shipped assignment of `technology_automation` + `operations_pmo` to ZION *as her identity*. | The work does not move; its **altitude** does. Automation becomes a capability ZION directs, not ZION's remit. |
| **D3** | **MERIT = sales and commercial operations.** Offers, pricing, offer letters, pipeline, agreements, retainers, commercial follow-up. | Doctrine A ("Finance & People"). **Confirms** shipped B/C on the sales half. | Matches what users already read, so no user-visible regression. `finance` and `people_talent` are re-homed explicitly in §3.3 — `DEPT_VP` requires every slug to name exactly one owner. |
| **D4** | **NEXUS = marketing and growth**, with **Paid Media Operations** beneath it. | Doctrine A ("Marketing **+ Sales**"). **Confirms** shipped B/C. | Sales and marketing were assigned to two different agents depending on which source was read. This ends the ambiguity in favour of the shipped position. |
| **D5** | **MENTOR = delivery, programs, knowledge readiness, implementation, curriculum.** | Doctrine A ("VP Operations"). **Confirms** shipped B/C. | The doctrine and code positions were fully disjoint. The owner's brief matches the code. |
| **D6** | **CURA = client success and relationship operations.** Onboarding, client health, retention, support, service follow-through. | Doctrine A's addition of Product/Curriculum to CURA. | Curriculum consolidates under MENTOR (D5) so one department has one owner. |
| **D7** | **VERA = governance, trust, permissions, safety, data boundaries.** | Shipped B/C ("Quality & standards" — reviewing outbound work product). **Restores and widens** doctrine A. | VERA is the cross-cutting boundary, not an output proofreader. This makes her the natural owner of the §67/§68 clamp. |
| **D8** | **OATHEN = owner approvals and consequential exceptions.** Net-new to the roster. Holds; never acts. | Nothing — OATHEN was in no roster. | The owner's brief is explicit that OATHEN must **not** become a replacement for strategic or departmental leadership. It owns the gate, not a department. |
| **D9** | **SCRIBE = knowledge intake, organisation, provenance, grounded business memory.** Net-new. | Nothing — SCRIBE existed in exactly one line repo-wide. | The MENTOR/SCRIBE boundary was undrawn anywhere: **MENTOR owns knowledge *readiness for delivery*; SCRIBE owns knowledge *intake, provenance and organisation*.** SCRIBE writes into Mind; MENTOR consumes from it. |
| **D10** | **Communications Operations is a SHARED service**, owned by no single department. | The compile-locked `Record<DeptSlug, VP>` single-owner model in `vpDepartments.ts` L18–20. | **This is the one genuine backend incompatibility** in the brief — see §5. |
| **D11** | **MASON is not adopted.** The Automation Agent stays generic and unnamed. | The pack's `MASON` and the false provenance comment (§1.3.1). | **Weigh this one knowing what CD actually drew.** MASON is not a stray roster row: `PAIGE Super Admin Shell v3.dc.html` L8448 says *"MASON is the sub-agent she hands automation work to,"* and L8453/L9002 render it **speaking in the UI** as `MASON · automations` and `MASON · setup`. So declining it declines a named actor CD gave a voice. It is declined anyway because the owner's controlling table names this role generically, and because the only claim that MASON was already *our* vocabulary is the false comment in §1.3.1. A ninth brand identity should be a deliberate ruling, not an inheritance from an incorrect code comment. Recorded, not deleted — if the owner wants MASON, it is a one-line change here. |
| **D12** | **KAVYN · MIRAEL · VAYRON · METHRA are provisional prototype aliases and are retired.** | `src/prototype/TenantRedesign.tsx` L38–42. | Their own labels say *"provisional."* They are a parallel roster for the same six functions, reachable at a real route. Retiring them removes a second live vocabulary. |

**Name durability after this document:** PAIGE and ZION are brand-locked
(`paige-brand-identity.md`). NEXUS, MERIT, CURA, MENTOR, VERA are **shipped platform identities** —
already user-visible, renaming requires a coordinated migration. OATHEN and SCRIBE are **new
platform identities**, not yet shipped, so this is the cheapest moment to change them if the owner
wants different words. Automation Agent, Paid Media Operations and Communications Operations are
**generic role labels, not brand identities** — deliberately, so they can be renamed freely.

---

## 3. The Solo organization chart

### 3.1 The chart

```text
                          ┌───────────────────────────────┐
                          │            PAIGE              │
                          │  COO · orchestrator · the one │
                          │  voice the owner talks to     │
                          └───────────────┬───────────────┘
                                          │  delegates · synthesises · reports back
      ┌───────────┬───────────┬───────────┼───────────┬───────────┬───────────┐
      │           │           │           │           │           │           │
   ┌──┴───┐   ┌───┴───┐   ┌───┴───┐   ┌───┴──┐   ┌────┴───┐   ┌───┴───┐   ┌───┴────┐
   │ ZION │   │ NEXUS │   │ MERIT │   │ CURA │   │ MENTOR │   │ VERA  │   │ OATHEN │
   │Biz   │   │Mktg & │   │Sales &│   │Client│   │Delivery│   │Govern-│   │ Owner  │
   │Twin &│   │growth │   │commer-│   │succ- │   │programs│   │ance & │   │approv- │
   │strat-│   │       │   │cial   │   │ess   │   │knowl.  │   │trust  │   │als &   │
   │egy   │   │       │   │ops    │   │      │   │readin. │   │       │   │except. │
   └──┬───┘   └───┬───┘   └───────┘   └──────┘   └────────┘   └───────┘   └────────┘
      │           │                                                   ┌────────┐
   ┌──┴──────┐ ┌──┴──────────┐                                        │ SCRIBE │
   │Automat- │ │ Paid Media  │                                        │Knowl.  │
   │ion Agent│ │ Operations  │                                        │intake &│
   │(generic)│ │ (generic)   │                                        │provenan│
   └─────────┘ └─────────────┘                                        └────────┘

   ══════════════════════ SHARED ACROSS EVERY DEPARTMENT ══════════════════════
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ Communications Operations — email · SMS · phone · inbox · routing ·      │
   │ drafting · follow-up · conversation records.                            │
   │ Owned by no department. Invoked by all. Never speaks in its own name.    │
   └──────────────────────────────────────────────────────────────────────────┘
```

**Reading the chart.** Depth is **altitude of decision**, not seniority theatre. A lead answers
*what should happen and why*; a generic worker beneath it answers *how it gets done*. OATHEN and
SCRIBE hang off PAIGE rather than off a department because neither owns a business function —
OATHEN owns a **gate**, SCRIBE owns a **substrate**.

### 3.2 Why OATHEN is not a department

The brief is explicit that OATHEN must not replace strategic or departmental leadership. Concretely:
OATHEN never originates work, never holds a plan, never appears as the owner of a move, and never
speaks first. It has exactly one job — hold what needs the owner's word and refuse to let it happen
quietly — and it appears only at the moment a consequential act is proposed. In the prototype it
surfaces in exactly two states (held decision, failed task with a real choice) and in no other.

### 3.3 The department map after reconciliation

`vpDepartments.ts` is `Record<DeptSlug, VP>` — compile-enforced, so **every slug must name exactly
one owner** and re-pointing one forces an explicit decision about the others. The full re-map:

| Department slug | Owner today (shipped) | Owner after this design | Change |
|---|---|---|---|
| `executive_office` | PAIGE | PAIGE | — |
| `owner_ops` | PAIGE | PAIGE | — |
| `marketing` | NEXUS | NEXUS | — |
| `sales` | MERIT | MERIT | — |
| `client_experience` | CURA | CURA | — |
| `product_curriculum` | MENTOR | MENTOR | — |
| `legal_compliance` | VERA | VERA | — |
| `technology_automation` | **ZION** | **ZION**, executed by the Automation Agent | Altitude changes, owner does not |
| `operations_pmo` | **ZION** | **ZION**, executed by the Automation Agent | Same |
| `finance` | **MERIT** | **MERIT** | Kept — commercial operations reasonably covers retainers, pricing and dunning. Flagged in §6 as an owner decision if finance should split from sales. |
| `people_talent` | **PAIGE** | **PAIGE** | Kept. A Solo owner has no HR department; re-homing it would invent one. |

**No department changes hands.** Only ZION's two desks change *how they are described*: ZION directs
them, the Automation Agent executes them. That keeps the compile-locked map valid and makes D1/D2 a
remit-and-hierarchy change rather than an ownership migration.

### 3.4 Where tenant-created practice agents attach

A tenant practice agent is a `paige_subagents` row with a **non-null `tenant_id`**. It attaches to
one or more departments through its `department` FK and a new `reports_to` (§4.2), and it is
**never** promoted into the platform roster.

| Example | Attaches under | Why |
|---|---|---|
| Publicist Desk | NEXUS | Earned media is marketing execution under a marketing lead. |
| Course Launch Agent | NEXUS **+** MENTOR | The launch is marketing; the course is delivery. Primary department NEXUS; secondary MENTOR. |
| Import Agent | ZION **+** CURA | Data movement is automation; the records it lands are client records. Primary ZION. |
| Real Estate Lead Nurture Agent | MERIT **+** CURA | Nurture toward a commercial outcome, using relationship signals. Primary MERIT. |
| Agency Account Strategist | ZION **+** NEXUS | Account strategy is planning informed by growth. Primary ZION. |

**Four rules keep tenant agents from becoming uncontrolled platform identities:**

1. **A primary department, always.** Multi-department agents declare one primary; the secondary is a
   read scope, not a second owner. This preserves the single-owner invariant.
2. **It reports to a platform lead, never to PAIGE directly.** A tenant agent with no lead above it
   is an unowned actor.
3. **It cannot exceed its lead's ceiling.** The pack states the rule already:
   *"an install can never widen what she may do"* (`paige-ia.js`, `P.MARKET`).
4. **It is never brand-named in platform chrome.** It appears with its tenant-given name inside that
   tenant's workspace only, and carries the `Solo` or `Unverified` publisher class from
   `P.MARKET.classes` if it is ever published.

---

## 4. The canonical Agent Registry record

### 4.1 What already exists and is reused unchanged

| Brief field | Existing column | Note |
|---|---|---|
| Stable ID | `paige_subagents.slug` | Globally unique; already the FK target for the action bus. |
| Display name | `name` | — |
| Mission | `goal` (+ `role`, `backstory`) | Shipped 2026-07-20; **absent from the stale `types.ts`** — regenerate before typing against it. |
| Department | `department` FK → `paige_departments(slug)` | Today 13 of 34 rows are NULL and none use the nine blueprint desks. Backfill is part of adoption. |
| Allowed tools | `config` jsonb (`job_kind`) + `triggers` | — |
| Source systems | `input_schema` | — |
| Versioned instruction | `system_prompt` + `version` | `version` is an optimistic lock **only** — it keeps no history. |
| Kill switch | `enabled` + `auto_disabled_reason` | The only pause mechanism that exists. |
| Runtime | `runtime` check `('local','langgraph')` | — |
| Required role | `requires_role[]` | — |

### 4.2 What has no home anywhere and must be added

Each row is a genuine gap — searched and not found, not assumed absent.

| Field | Why it is needed | Proposed shape |
|---|---|---|
| **`reports_to`** | **The org chart cannot be expressed at all today.** There is no `parent_agent` / `reports_to` column, so "Automation Agent beneath ZION" is unrepresentable. This is the single blocking gap. | `text` FK → `paige_subagents(slug)`, nullable (NULL = reports to PAIGE). |
| **`agent_type`** | The brief's three types have no column. | `text CHECK IN ('platform_core','tenant_practice','temporary_worker')`. Maps to the pack's `core: 1|0` and to the Solo contract's *Durable named leadership · Department specialist · Ephemeral helper*. |
| **`remit`** | The one-line description users read lives only in TypeScript. | `text`. |
| **`is_shared_service`** | Communications Operations belongs to no department (D10). | `boolean default false`. |
| **`autonomy_lane`** | Exists on `paige_skills`, **not** on `paige_subagents`. An agent's floor cannot be declared. | `text CHECK IN ('auto','confirm','off')` — reuse the existing constraint, do not invent a sixth copy. |
| **`tier_availability`** | Per-tier availability exists on `paige_skills` only. §60 requires every feature to declare its tiers through the one helper. | `text[]`, and the render gate calls `hasFeature()`, never an inline `account_type` compare. |
| **`schedule`** | "Always on" has no representation. | `jsonb` — cadence, window, and the enabling grant. Absent = event-driven only. |
| **`paused_at` / `paused_by` / `pause_reason`** | `enabled` is a boolean with no actor, time or reason — it cannot answer "who stopped this and why." | `timestamptz`, `uuid`, `text`. |
| **`instruction_history`** | `version` keeps no history, so an instruction change is unauditable. | A companion table `paige_subagent_instruction_versions`. |
| **`data_boundaries`** | No structured expression of what an agent may never read or write. | `jsonb`. |
| **`mind_contribution`** | Which Mind lobes an agent may write. The pack's shape is `{lobe, text, by, tier}`. | `text[]` over `('knowledge','skills','identity','judgment','recall')`. |
| **`tenant_id` on invocations** | **`paige_subagent_invocations` has no `tenant_id`** — run history cannot be tenant-scoped, which is a §9 gap in its own right. | `uuid` + RLS. Worth filing separately from this design. |

### 4.3 The user-facing status vocabulary

Three vocabularies already ship. **The registry adopts them rather than inventing a fourth.**

| Axis | Values | Source | Answers |
|---|---|---|---|
| **Grant** | `Ask first` · `Autonomous` · `Observe` · `Draft only` | `paige-ia.js` `P.AGENTS[].grant` | What may this agent do without me? |
| **State** | `Ready` · `Idle` · `Queued` · `Working` · `Blocked` · `Holding` · `Failed` · `Not started` | `paige-ia.js` `P.AGENTS[].state`, extended by the states the prototype must actually show | What is it doing right now? |
| **Truth** | `live` · `partial` · `unavailable` · `proposed` | `SoloPaigeWorkspace.tsx` `TruthPill` | How much of this is real? |

Grant and Truth are ported verbatim. **State is the only extension**, and only because the shipped
set has no word for blocked, holding or failed — states the product demonstrably reaches. Any
further addition should go back to Claude Design rather than be invented at a call site.

### 4.4 The three agent types, mapped to what already ships

| Registry `agent_type` | Solo contract wording (shipped) | Pack | Lifecycle |
|---|---|---|---|
| `platform_core` | **Durable named leadership** | `core: 1` | Ships to every tenant. Never created or deleted by a tenant. Roster change = doctrine amendment. |
| `tenant_practice` | **Department specialist** | `core: 1`, publisher class `Solo` | Created by a tenant, `tenant_id` non-null, reports to a platform lead, clamped by that lead's ceiling. |
| `temporary_worker` | **Ephemeral helper** | `core: 0` — *"Spun up for a single job. Retires when the job closes."* | Task-scoped and revocable. Must carry scope, delegator, start, end condition, approval state and revocation — the shipped card already demands exactly these six. |

---

## 5. The one thing the design cannot do as drawn (§00 incompatibility)

Per §00 there is exactly one class of thing Claude Code brings to the owner about the frontend: a
concrete backend impossibility. There is **one**, and it is real rather than difficult.

**Communications Operations cannot be represented in the shipped department seam.**

`src/lib/paige/vpDepartments.ts` L18–20 states the invariant — *"Each department maps to exactly ONE
VP so a department's work has an unambiguous owner"* — and enforces it at compile time via
`Record<DeptSlug, VP>` (L73–85). There is no `communications` slug among the eleven, and a service
owned by **every** department cannot be expressed by a map whose type requires exactly one owner per
key.

This is not a preference. Either:

- **(a)** Communications Operations is modelled as a **shared service outside the department map** —
  the `is_shared_service` flag in §4.2, invoked by any department, owning none. It never appears as
  a department, and `DEPT_VP` is untouched. *(Recommended: it changes no shipped type and matches how
  the brief describes it — "a shared service across departments.")*
- **(b)** A `communications` department slug is added and assigned to exactly one VP — which
  contradicts the brief's "shared across departments."

**(a) is what §4.2 specifies.** Flagged here because it is the one place where the drawn design and
the shipped backend genuinely disagree, and per §00 that is the owner's round table, not CC's call.

---

## 6. Open decisions for the owner

Only questions that change the build, each with a recommendation. Everything else is decided above.

1. **Does `finance` stay with MERIT?** §3.3 keeps it, on the reading that commercial operations
   covers pricing, retainers and dunning. *Recommendation: keep it.* Splitting finance out means a
   ninth lead, and a Solo owner does not have a finance department.
2. **MASON, or a generic Automation Agent?** D11 keeps it generic. *Recommendation: keep it generic
   until you want a ninth brand identity* — the name is cheap to add later and expensive to remove.
3. **OATHEN and SCRIBE as final names.** Neither has shipped, so this is the free moment to change
   them. *Recommendation: keep them* — both read as identities rather than job titles, which is the
   pattern PAIGE and ZION set.
4. **Do the named specialists become visible on Solo?** They are currently banned by a shipped CI
   guard (`SoloPaigeWorkspace.contract.test.tsx` L150) precisely because the assignments were
   disputed. This document settles the dispute, so the guard can be narrowed to the four retired
   provisional names. *Recommendation: yes — but it is an explicit, visible change (§58), which is
   why it is a question and not an assumption.*

---

## 7. What this document does NOT do

- It changes no production code, schema, route or tenant record.
- It does not implement the registry. §4.2 is a specification, not a migration.
- It does not decide anything about how any surface **looks** (§00) — the prototype ports existing
  tokens and exists to review information architecture and flow.
- It does not block the in-flight Solo Orchestrator workstream. That handoff is deliberately narrow:
  `../handoff/solo-orchestrator-compatibility-packet.md`.
