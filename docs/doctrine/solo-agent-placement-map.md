# Solo agent placement map — which role appears on which surface, and why

**Status:** DESIGN — awaiting owner approval. No production change is proposed.
**Owner:** Antonio Cook. **Drafted:** 2026-09-04, against `origin/main` `a4ef76e`.
**Extends, and never contradicts:** `docs/product/agent-ui-placement-spec.md` (LOCKED, approved
2026-08-08), which settles *where the PAIGE chat surface lives*. That spec names **zero** VPs; this
one adds the missing layer — *which named role contributes to which Solo surface*.
**Reads with:** `paige-agent-registry.md` (who the roles are) ·
`paige-agent-lifecycle-and-autonomy.md` (what each may do).

---

## 1. The rule every row obeys

> **PAIGE is the only voice. A specialist is a contributor inside her conversation, never a
> destination.**

The locked spec already rejected the alternatives, and those rejections bind here:

- **No agent-team management panel** — §20, listed under *"What was explicitly rejected."*
- **No artifact-type or specialist tabs** — §21.
- **Cross-department handoffs are visible in the transcript as messages between named sub-agents** —
  the locked spec §6.

So a specialist may appear in exactly **four** ways, and no fifth is proposed anywhere below:

| # | Appearance | Where | Shipped precedent |
|---|---|---|---|
| 1 | **Contribution row inside PAIGE's message** — expandable to scope, sources and what it hands back | The PAIGE rail, on any surface | The prototype's `.contrib` rows |
| 2 | **Attribution byline** on something it produced | The surface holding the artifact | `PaigeAttribution` (shipped, `variant="block"`) |
| 3 | **Owner column** on a plan move or a queued action | Command Center, Sales, Campaigns | The prototype's `.move .owner` |
| 4 | **A held decision**, and only OATHEN | Inline in the conversation | The prototype's `.decision` card |

---

## 2. The real Solo surface tree

Taken from `src/lib/routing/tierBranches.ts` `SOLO_BRANCHES`, not from memory. Addresses are
`/solo/:account/<branch>/<subtab>`.

| Branch | Label shown | Sub-tabs |
|---|---|---|
| `command-center` | Command Center | `systems-check` · `mind` |
| `paige` | Paige | `chat` · `knowledge` · `helpers` · `capabilities` · `trust-compass` |
| `automations` | Automations | `library` · `runs` · `build` |
| `clients` | Clients | `people` · `conversations` · `calendar` · `portal` · `pipeline` · `delivery` |
| `calendar` | Calendar | `week` · `agenda` · `tasks` · `booking-pages` · `availability` · `connections` |
| `growth` | **Campaigns** | `overview` · `catalog` · `sales` · `pipeline` · `social` · `performance` |
| `analytics` | Analytics | `brief` · `money` · `profitability` · `retention` · `market-watch` · `decisions` |
| `marketplace` | Marketplace | `today` · `browse` · `installed` · `updates` |
| `settings` | Settings | `setup` · `team` · `connections` · `integrations` · `security-data` · `vault` · `billing` |

**Only six of the ten branches carry a nav item.** `SOLO_SHELL_DESTINATIONS`
(`src/lib/routing/tenantShellRoutes.ts` L148–167) shows: **Command Center · Clients · Campaigns ·
Marketplace · Analytics · Settings**. `paige`, `trust-compass` and `automations` are addressable
routes folded in as Command Center aliases (`tenantShellRoutes.ts` L49) — so a placement row for
one of them describes a *reachable address*, not a nav destination.

> **Warning for anyone extending this map.** 23 files under `src/solo/` are **unreachable** from
> `SoloEntry` — including `setup.tsx`, `integrations.tsx`, `automations.tsx`, `knowledge.tsx`,
> `team.tsx`, `vault.tsx`, `PaigeBriefPanel.tsx` and all seven `calendar*.tsx`. Grepping `src/solo/`
> for a surface name will find owners that no route can reach. Every owner named below was checked
> against the reachable screen map in `SoloApp.tsx` L253, not by filename.

**Two facts that correct the brief's surface list, both verified:**

- **Vibe Studio is not a Solo branch.** `tierBranches.ts` L62–66 states it plainly: *"Vibe Studio
  remains the sole creative owner and opens through its existing side action. Retired creative slugs
  resolve to a Campaigns-owned compatibility landing, never a fabricated Vibe library or asset
  route."* So Studio is addressed as a side action from Campaigns, not a placement row of its own.
- **"Campaign Overview" and "Social" are sub-tabs of `growth`**, which is *labelled* Campaigns. The
  branch slug and its label differ; both are needed to address it correctly.

---

## 3. The placement map

Every row names the file that owns the surface today, so a placement can be checked rather than
believed.

### 3.1 Command Center — `/solo/:account/command-center`

| Sub-tab | Owning file | Roles present | How they appear | Truth today |
|---|---|---|---|---|
| **`overview`** *(proposed — the Game Plan)* | none yet; the address exists and redirects | **ZION** authors the plan · **all leads** own moves · **OATHEN** holds decisions | Move rows with an owner column; contributions inside PAIGE's message | **Proposed.** `CommandCenter.tsx` L28–36 redirects `/command-center` and `/command-center/overview` → `systems-check`, because the overview has nothing to show. |
| `systems-check` | `SoloSystemsCheckWorkspace.tsx` | **ZION** (readiness reading) · **VERA** (boundary findings) | Attribution byline on a finding | Live |
| `mind` | `SoloMindWorkspace.tsx` | **SCRIBE** writes · every agent reads | `by` attribution on a Mind event | Live surface; per-agent write rules are proposed (§4.2 of the registry) |

**Why the Game Plan belongs at `overview` and not in a new tab (§18).** The address already exists
and currently redirects away *because it is empty*. Giving it the plan is extending a surface that
is already addressed, not scaffolding a fourth. It also keeps Command Center at three tabs, which
matters because `TABS` in `CommandCenter.tsx` L10–13 is a two-item array today — a third entry is a
one-line change, a fourth is a crowded strip.

### 3.2 Campaigns — `/solo/:account/growth`

| Sub-tab | Owning file | Roles | How they appear |
|---|---|---|---|
| `overview` | `src/solo/growth*.tsx` | **NEXUS** (strategy, readiness, next marketing action) | Byline + next-action row |
| `catalog` | `catalog-offers.tsx` | **MERIT** (offer, pricing, terms) · **NEXUS** (positioning) | Byline on a drafted offer |
| `sales` | `src/solo/sales*.tsx` | **MERIT** | Owner column on pipeline actions |
| `pipeline` | `src/solo/growth` pipeline view | **MERIT** | Owner column |
| `social` | `src/solo/social*.tsx` | **NEXUS** (direction, content plan) · **Paid Media Operations** (connected-platform status, approved optimisation) | Byline; the worker never appears as an author, only as a status line |
| `performance` | `src/solo/growth` performance view | **NEXUS** · **Paid Media Operations** | Byline on an interpretation, never on a raw number |
| **Vibe Studio** *(side action, not a sub-tab)* | Studio surface | **NEXUS** supplies the creative brief and strategic context; **PAIGE owns the conversation** | Brief appears as context, per §21 — Studio's session *is* PAIGE, so no rail and no specialist tab |

### 3.3 Clients — `/solo/:account/clients`

| Sub-tab | Owning file | Roles | How they appear |
|---|---|---|---|
| `people` | `src/solo/people*.tsx` | **CURA** (relationship context, health) | Byline on a synthesis |
| `conversations` | `src/solo/conversations*.tsx` | **CURA** (relationship) · **Communications Operations** (routing, drafting, records) | CURA is credited; Comms Ops appears as a channel/status line and **never speaks in its own name** |
| `portal` | portal surfaces | **CURA** | Byline |
| `delivery` | delivery surface | **MENTOR** (programs, implementation readiness) | Owner column |
| `pipeline` | clients pipeline view | **MERIT** | Owner column |
| `calendar` | clients calendar view | **CURA** · **Communications Operations** | Status line |

> **Noted, not fixed:** `pipeline` exists under **both** `clients` and `growth`. Two addresses for
> one capability is a §18 question that predates this work and is out of scope here — flagged so it
> is not mistaken for something this design introduced.

### 3.4 Setup, Knowledge, Integrations, Automations, Trust

| Surface | Address | Roles | How they appear |
|---|---|---|---|
| Setup | `settings/setup`, owned by the reachable `settings.tsx` L1418 | **ZION** (the answers become game-plan inputs) · **MENTOR** (delivery readiness) | Inline prompts inside the existing setup flow, never a new panel. **Note:** `PaigeBriefPanel.tsx` — which defines the `brandVoice` / `operatingPreferences` / `doNotAssume` fields the registry depends on — is one of the 23 **unreachable** files. The fields are specified; the panel is not currently mounted. |
| Knowledge | `paige/knowledge` | **SCRIBE** (intake, organisation, provenance) · **MENTOR** (readiness) | Source/provenance line per record |
| Integrations | `settings/integrations`, `settings/connections` | **ZION** (what the business needs) · **Automation Agent** (health, provider readiness) | Health rows; a block names the exact missing connection |
| Automations | `automations/*` — **but the screen is literally `null`** (`SoloApp.tsx` L182–185 redirects to `settings/integrations`) | **ZION** (which processes should exist) · **Automation Agent** (builds and maintains, never fires) | Owner column on a chain; run rows — **placed at the redirect target, not the empty branch** |
| Trust Compass | `paige/trust-compass` | **VERA** (governance, permissions, boundaries) · **OATHEN** (held approvals) | Grant + ceiling display; held items link into the conversation |
| Security & data | `settings/security-data` | **VERA** | Byline on a boundary finding |
| Team | `settings/team` | **PAIGE** (`people_talent`, per §3.3 of the registry) | Byline |
| Billing | `settings/billing` | **MERIT** | Byline |
| Marketplace | `marketplace/*` | **VERA** (what an install may do) · the sponsoring lead per listing | Grant declaration on a listing, per `P.MARKET` |
| Analytics | `analytics/*` | **ZION** (interpretation) · department lead per view | Byline on an interpretation only |

### 3.5 PAIGE — `/solo/:account/paige`

| Sub-tab | Owning file | Roles | Rule |
|---|---|---|---|
| `chat` | `SoloPaigeWorkspace.tsx` | **PAIGE always visible**; specialists contribute inside the current conversation | The one conversation. Nothing here becomes a per-specialist chat. |
| `helpers` | same | The three registry types, as role classes | Already ships exactly this: *"Current delegations—not a flat permanent roster"*, with **Ephemeral helper**, **Department specialist**, **Durable named leadership** cards |
| `capabilities` | same | Grant per capability | Reads the floor |
| `trust-compass` | same | **VERA** · **OATHEN** | Ceiling and held items |
| `knowledge` | same | **SCRIBE** | Provenance |

**The shipped Solo constraint that governs this whole column.**
`src/solo/SoloPaigeWorkspace.contract.test.tsx` L143–150 is a CI guard that **bans**
`ZION|OATHEN|MASON|KAVYN|MIRAEL|VAYRON|METHRA` from the Solo workspace and requires the role-class
wording instead. The shipped copy is already the right rule:

> *"PAIGE remains the command layer. Durable named leadership appears contextually only when
> responsibility is grounded; temporary workers stay task-scoped and revocable."*
> — `SoloPaigeWorkspace.tsx` L133

> *"Named identities are not flattened into this task view. Chat introduces one only when PAIGE
> delegates, receives a result, requests approval, or explains responsibility."*
> — `SoloPaigeWorkspace.tsx` L143

**That second sentence is the placement rule for the entire platform**, and every row above obeys
it. The guard exists because the assignments were disputed; the registry settles them, so the guard
should be **narrowed to the four retired provisional names** (KAVYN · MIRAEL · VAYRON · METHRA)
rather than removed. That is a visible, owner-approved change under §58 — it is question 4 in the
registry's open decisions, not an assumption made here.

---

## 4. What is deliberately absent

- **No specialist chat, anywhere.** Not a tab, not a drawer, not a `@mention` destination that opens
  its own thread. Direct address (*"@ZION, revise the workflow"*) resolves **inside** the one
  conversation, with PAIGE still the orchestrator.
- **No agent-team management panel** — the locked spec rejected it explicitly.
- **No agent roster tile on a working surface.** The roster lives in `paige/helpers`; a working
  surface shows only the specialist that actually contributed to what is on screen.
- **No fabricated presence.** An agent appears on a surface only when it has done something there.
  Absence renders as absence — the shipped `TruthPill` vocabulary (`live` · `partial` ·
  `unavailable` · `proposed`) carries it.

---

## 5. Tier scope (§56 / §61)

This map is written for **Solo**. Per the §61 standing default the placement generalises as:
**Super Admin YES** (operator scope, where the same roles run Paige Agent AI Inc.) · **Solo YES** ·
**Sub-account YES** (identical to Solo — the only base difference is billing, per §60) ·
**Agency RESELL** (an agency manages sub-accounts, not a direct client book, so it does not receive
the operator-use placement) · **Enterprise YES + RESELL**.

No exception is claimed. §61 default: no exception.

---

## 6. What does not exist today — searched, not assumed

Every line was established by a real search, and several correct assumptions the brief's surface
list invites. Absence is stated with what was looked for.

| Thing | Status | How it was established |
|---|---|---|
| **A Solo surface that owns a named-agent roster** | **None.** `PaigeTeamDirectory` — the canonical "About Your Paige Team" page — is mounted for tenant `/admin`, agency and operator scopes but is **not reachable from `/solo/*`**. There is no `paige-team` entry in `SOLO_BRANCHES`. | Import BFS from `src/solo/SoloEntry.tsx` |
| **A Game Plan surface** | **None in `src/`.** `build_game_plan` is a `paige_skills` recipe keyed on `contact_id` — a **per-client** roadmap, a different object from the owner's own plan. | `grep -rn "game plan"` across `src/`, `docs/`, `supabase/` |
| **"PAIGE at Work"** | **Does not exist in any form.** Zero hits for `paige at work`, `paige-at-work`, `paigeatwork` across `src/` and `docs/`. | Three spellings, both trees |
| **SCRIBE** | **Does not exist anywhere** — not in `VP_ROSTER`, not in `vpDepartments.ts`, not in any migration, not in any doc except one line of the CD pack. Its territory is currently split across Setup › Knowledge, the PAIGE Knowledge tab and `tenant_knowledge_docs`, none of which names an owner. | Repo-wide grep |
| **OATHEN** | Exists only in the `/tenant-redesign` prototype and one **inaccurate** code comment. Explicitly banned from `SoloPaigeWorkspace.tsx` by the contract test. | Repo-wide grep |
| **A Communications department** | **None.** `DeptSlug` enumerates 11 slugs and none is communications. Comms sits under Settings › Connections with no department or agent owner. | `vpDepartments.ts` L39–50 |
| **Department → agent drill-down** | **None.** The Systems Check Departments panel renders department names and then prints the literal string *"Status totals unavailable here"* for every row. | `SoloSystemsCheckWorkspace.tsx` L496–501 |
| **Any wired Solo → agent seam** | **None.** Both Solo-side adapters — `useSoloPaigeTeam.ts` (real `paige_departments` + open `paige_actions` counts) and `useSoloSubagents.ts` (VP_ROSTER + tenant specialists) — have **zero importers**, and `useSoloSubagents` is on the contract-test ban list. | Import search |

**The build consequence, stated plainly.** `VP_ROSTER` is compile-locked into `vpDepartments.ts`
L60–86 as `Record<VP, DeptSlug[]>` and `Record<DeptSlug, VP>`. **Adding OATHEN or SCRIBE, or
re-remitting ZION, is a TypeScript error there — by design.** That is the seam working as intended:
it forces an explicit ownership decision rather than allowing silent drift. The registry's §3.3
department table is what satisfies it.

## 7. Verification status of this map

Every claim here is a **source read** plus one green unit-test run
(`npx vitest run src/lib/routing/tierBranches.test.ts` → 41 passed, asserting 10 branches and 44
sub-tabs). **No authenticated production drive of any Solo surface was performed** — this session
holds no credentials for the live platform, and `docs/doctrine/solo-shell-contract.md` L101 records
the same limitation. The browser-driven live check is **owed to the next capable session** (§32.c).
Nothing in this document should be read as observed live behaviour.
