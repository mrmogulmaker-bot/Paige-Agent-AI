# Glossary — §-anchors, tiers, VP roster, waves, jargon

Fast lookup for the vocabulary a new session trips over. Where two sources disagree, the conflict is
called out (don't silently pick one).

---

## CLAUDE.md §-anchor map (§1–§39 + §51)

Root doctrine in `CLAUDE.md`. **Note the numbers are NOT in file order** (sections were pasted as
ruled). One-line each:

| § | Title | § | Title |
|---|---|---|---|
| 1 | Always hire a team; never a single point of failure (the hard gate) | 21 | ONE session per project; no artifact-type tabs |
| 2 | Content rule — client service businesses, never consumer finance default | 22 | Vibe Studio benchmarked vs best-in-class (motion/3D) |
| 3 | Voice (mogul-founder; never "AI-powered"/"seamless") | 23 | Color is emotional; light ≠ dark |
| 4 | Shipping (merge-on-verified; ship live; RED-LINE index) | 24 | Operational efficiency — automate the repeat |
| 5 | Compliance/standards officer (+ post-deploy scan) | 25 | Design taste — see it before you ship it |
| 6 | Brand consistency is one continuous system (gold+indigo) | 26 | Paige learns — compound AI (prompt-forge + memory) |
| 7 | North star — Paige is the intelligent two-way client portal | 27 | "Facelift" is a defined checklist operation |
| 8 | Paige runs a team — two departments + action bus | 28 | Approved is FROZEN |
| 9 | Separate platform (Super Admin) from tenant — "who is this for?" | 29 | Take the bold swing — real graphics tech |
| 10 | Everything stays Paige-governable (callable seam) | 30 | Changing direction = strip-then-rebuild |
| 11 | World-class is the floor (primitive layer; banner exception) | 31 | Never shortchange the request; use the REAL assets |
| 12 | Organize what you create — "where does this belong?" | 32 | A green build is NOT a working render |
| 13 | Build like the best engineers; honest reporting | 33 | The design agent has EYES (screenshot critique) |
| 14 | Paige herself never works solo | 34 | Paige owns her intelligence; only LLM API is external |
| 15 | Paige is the innovative assistant — probe & propose | 35 | Paige is the operating system (OS north star) |
| 16 | Paige runs a $100M org — 10-department model | 36 | Intuitiveness is the moat |
| 17 | The $1B Growth Map (revenue + governance) | 37 | Producer inventory — audit ALL callers |
| 18 | Check for redundancy before you build (one home) | 38 | Money boundary — Paige holds its own rails only |
| 19 | The Studio is the whole campaign, one session | 39 | The peer-gate — independent adversarial diff read |
| 20 | Dispatching a team is a CHAT act, never a surface | 51 | Per-tier availability + gating railing (six tiers) |

**Security-doctrine §-anchors (long-form in `docs/security/`):** §190–192 (Phase-B codification),
§194 (monitoring not repair), §197 (billing-layer taxonomy L1–L4), §198 (legacy deprecation +
cutover addendum), §200 (platform independence), §201 (public language), §202 (multi-entity
contacts), §203 (lane-separation runtime), §205 (metering safety net), §208 (shape-delta),
§210 (L2/L3 scope boundaries), §211 (zero brand refs in code), §213 (migration shape discipline;
§213.c retro DO-block).

**Forward-referenced / not-yet-numbered in CLAUDE.md** (owner-ruled, paste pending — do not assume a
final number): §40 (revenue-stage roadmap), §41 (entity-type legal adherence), §45 (operator-identity
seam / n8n PII guard), §46 (doctrine-persistence discipline — the "write it in CLAUDE.md" rule that
§BRAIN builds on), §49 (unified comms substrate — `docs/doctrine/paige-unified-comms-substrate…`),
§55 (agency-curation visibility), §200-class bug tracking, §254 (worktree isolation). These appear in
commit messages/docs but may not exist as numbered CLAUDE.md sections yet — verify before citing as
canonical.

**§BRAIN** — the Second Brain read/update discipline (this directory). Proposed section added to
`CLAUDE.md` this task, **pending owner ruling on exact wording** (Cowork #26).

---

## Tier vocabulary (the §51 Canonical Six) — and the public↔internal naming debt (#67)

The §51 tier matrix (`docs/doctrine/tier-matrix.md`) — the source of truth for every §37/§51 check:

| # | Tier | Scope |
|---|---|---|
| 1 | **God / Super Admin** | Platform operator (us). Owns/sees everything. |
| 2 | **Agency** | Parent tenant owning sub-accounts. Own book + its children. |
| 3 | **Standalone Tenant** | Coach/consultant with no agency parent. Own book only. |
| 4 | **Sub-account** | Child tenant under an Agency. Own book only; isolated from parent aggregate. |
| 5 | **Client** | End-consumer under a Tenant. Own portal only. |
| 6 | **Anonymous** | Unauthenticated public. Public surfaces only. |

**`account_type` enum (internal, in `tenants`):** live prod values today are `standalone` (×10) and
`agency` (×1) — ✅ verified MCP this pass. Note there is **no `sub_account` value in prod today**:
the legacy sub-accounts still carry `account_type='standalone'` **with a non-null `parent_tenant_id`**
(the §51 invariant keys on "child ⇒ NOT agency/enterprise", not on one exact label; normalizing legacy
`standalone` children to `sub_account` is the separate taxonomy-lock task #43).

**Public plan nouns ↔ internal tier (the #67 naming debt):** the **public/marketplace** subscription
tiers are **Solo / Agency** (live Stripe catalog, ✅ verified) — historically also written
**Solo / Academy / Enterprise** (the middle noun churned: #381 set it to *Academy* killing
*Practice/Studio* per §3.b; #395 reversed PLAN academy→*Agency*). DB `platform_subscription_plans`
holds `solo`/`agency`/`enterprise`. **Do not assume public noun == internal `account_type` == Stripe
lookup_key** — they are three registers that have drifted (§18 debt #67). Treat **live Stripe + DB +
`tier-matrix.md`** as truth over any older doc's tier names.

---

## VP roster (Paige's named C-suite) — ⚠ shipped remits conflict with the roster doctrine

**PAIGE** is the orchestrator/CEO; six VPs are her team (§8/§14/§16). Two sources define them and they
**disagree on remits** — an owner-owed reconciliation:

| VP | Roster doctrine (`docs/doctrine/paige-c-suite-roster.md`) | Shipped code (`src/components/ui/page/PaigeAttribution.tsx` `VP_ROSTER`) |
|---|---|---|
| **VERA** | VP Trust & Verification (KYC, consent, §39 integrity, A2P/Stripe/DocuSign) | "Quality & standards" |
| **NEXUS** | VP Growth (Marketing + Sales) | "Marketing & growth" |
| **CURA** | VP Client Success (fulfillment, portal, at-risk) | "Client success" |
| **MENTOR** | VP Operations (Technology/Automation + Ops/PMO) | **"Curriculum & delivery"** ⚠ |
| **MERIT** | VP Finance & People (Money Spine, hiring, contracts) | **"Sales & revenue"** ⚠ |
| **ZION** | VP Strategy & Vision (revenue-stage, scenario modeling) | **"Operations & automation"** ⚠ |

**⚠ Conflict:** MENTOR, MERIT, ZION (and VERA) carry materially different remits in shipped UI vs the
roster doctrine — MENTOR/MERIT/ZION are effectively rotated. `PaigeAttribution.tsx` is the single UI
source of truth today (callers never hardcode a remit); the roster doc is the org-design intent.
**Owner-owed:** reconcile the two before the roster is used as a marketing/org-chart pitch (§16). Both
are cited so a future session doesn't silently "fix" one to match the other without a ruling. (✅ both
read from source this pass.)

---

## Owner Trilogy — the three pillars

`docs/strategy/owner-trilogy-2026-07-26.md` + `docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md`:
Paige as an **AI COO** for the three operator archetypes — **coach · consultant · agency**. Associated
"Twin" capabilities referenced in the roster: **Twin-A** (browser-agent, MENTOR), **Twin-B**
(team-member twin, MERIT), **Twin-C** (business scenario "what-if" twin, ZION). Business Vault L1 =
obligation/renewal tracking (MERIT). See `docs/strategy/twin-capabilities-landscape-2026-07-26.md`.

---

## Wave / slice vocabulary

- **Waves (W1–W9)** — the top-level build phases in `docs/doctrine/canonical-build-order.md`. Current
  active work is **Wave 4-4a** (Agent UI Placement → L8 Memory Fabric → chat compaction/durable
  tasking; PRs #405–#407). **Wave 5** sequencing is Phase-1-finish-then-Phase-2-redo
  (`wave5-phase1-phase2-sequencing.md`).
- **Slices (S1–S3 / "Slice 0/1/1c")** — shippable sub-units of a wave (§4 slice-to-ship). "Slice 1c"
  is the IA-restructure slice (`docs/assessments/IA-SLICE-1C-BLUEPRINT.md`,
  `docs/audits/platform-ia-slice-1c-handoff.md`). "#277 Slice 0–4" = the marketplace tier/curation
  substrate series (PRs #382, #391, #392, #400, #380, #381).
- **Lanes** — parallel workstreams; **Lane B** = the Money Spine (§38 billing); **Lane C** =
  HTML→PDF rendering (`docs/doc-render-decision.md`). "Crew 0" = the substrate-proof crew that opens a
  wave (e.g. Wave 3 Crew 0, PR #376).

## Intelligence-layer vocabulary (§34)

Paige's 7 internal "departments" (own-your-moat, `docs/PAIGE-INTELLIGENCE-GROUNDING-REPORT.md`):
**L1** Observability (`paige_llm_trace`) · **L2** Quality/Evals · **L3** Prompt Engineering
(`paige_prompt_template`) · **L4** Reasoning (`docs/L4-REASONING-GROUNDING.md`) · **L5** Talent
(`paige_subagents`) · **L6** Learning (voyage-3 memory, §26) · **L7** Transparency / God-view
dashboard (`docs/L7-SLICE-1-GROUNDING.md`). **L8** = the owner Memory Fabric (`paige_owner_memory`,
PR #406). Build order was L1 → L4 → L2 → L5.

## Other recurring jargon

- **Action bus (§8)** — the VP-to-VP / Owner-Ops↔Client-Experience hand-off mechanism;
  `paige_action_kinds` registry, `autonomy_lane` enum.
- **`autonomy_lane`** — 🟢 `auto` (AI-performed) · 🟡 `confirm` (AI-drafted, human-approved) ·
  🔴 `off` (human-only, AI-briefed). The §16 governance tiers.
- **Playbook / Blueprint** — the per-tenant vertical configuration (persona, journey, templates);
  "Blueprints" = the one-click vertical install layer (`docs/doctrine/paige-practice-blueprints…`).
- **Vibe Studio** — the tenant creative surface (Campaigns tab): pages, funnels, forms, images, in one
  session (§19/§21/§22). `ProjectNavigator` = the project rail.
- **Command Mark** — the console/operator brand mark (a slash and orb on a rimmed plate),
  owner-approved 2026-08-22. Source of truth for the mark, wordmark, palette and motion sequence:
  `../brand/paige-brand-identity.md`. **Rollout scope is tenant + operator surfaces only**, and the
  port has NOT happened yet — `PaigeSymbol territory="command"` still renders `PaigeMark` today
  (`src/components/brand/PaigeSymbol.tsx`). The brand doc's "builds into `PaigeSymbol.tsx`" states
  the intended destination, not shipped state; do not read the Command Mark as already live on a
  surface without checking what that surface actually renders.
- **PaigeMark** — the orbital orb + ring + spark + halo mark. **Current, not retired**, in three
  places at once: it is the marketing site's mark
  (`../design-references/cd-packs/super-admin-shell-v3/design-system-port.md` §3), it is what
  `PaigeSymbol territory="command"` renders today, and an owner ruling on 2026-09-06 made it the
  correct mark on Solo → Campaigns → Growth → Social — "stay to that one and that one only"
  (`../evidence/ui-delivery/campaigns-social-header-compaction.md`). `PaigeMark.tsx` stays as the
  backward-compat path; the brand doc says do not rip it out.
  **Open owner ruling** (`../brand/paige-brand-identity.md` §2, required before Stage 3): swapping
  what `territory="command"` renders changes the mark on every surface already rendering it,
  including the §28 approved-frozen marketing landing page. Whether the freeze holds the orb there,
  or the landing page adopts the Command Mark in the same rollout, is undecided — do not resolve it
  by editing code.
  ("Illuminated Precision" is a superseded label; do not reintroduce it.) `PaigeScene` = the landing
  3D hero (three.js), a separate thing.
- **MMA / PME** — Mogul Maker Academy / Project Mogul Enterprise: the owner's **tenant** vertical
  (funding-coaching) — a *tenant's* config, **never** a platform default (§2/§9).
- **`db-live` / `edge-live` tags** — git tags the CI pipelines move to the last commit whose
  migrations / edge functions are persisted on prod (§24/§32). Drift = `git diff <tag>..HEAD`.
- **`/edge-drift`** — command reporting edge functions ahead of prod.
- **Systems Check** — the operator health/readiness surface (VERA ops-side + MENTOR).
- **Route + URL Taxonomy (§65)** — the mental-model naming layer: one route per account type, named
  for WHO is there. Locked matrix (`docs/doctrine/route-and-url-taxonomy.md` §2a): Operator `/operator`
  · Agency `/agency/{account}` · Enterprise `/enterprise/{account}` · Solo `/solo/{account}` ·
  Sub-account `/business/{account}` · Client `/portal/:tenantSlug`. The name READS; session-derived
  scope + `getTierFeatureSet()` ENFORCE (the address is never the grant, §9/§60).
- **`/admin` overload** — the naming-debt bug §65 fixes: one route (`/admin`) meant four surfaces
  (Solo, Sub-account, Agency, God), so the router/human couldn't tell whose surface it was → agency
  owner "lands on the same page." One route per mental model is the fix.
- **`account_number` (address-not-grant)** — net-new per-account stable, PERMANENT numeric URL segment
  (`/business/3855`), assigned at creation; distinct from the initials-only `account_number_prefix`
  (MMA/ADL/…). Lets a human find THEIR account; authority stays session-derived (§9/§51).
- **offset/scrambled `account_number`** — the §65 R0 permanent per-account URL address (`/agency/3855/…`).
  Owner-locked 2026-08-17: a random unused 7-digit number in [1000000,9999999] assigned at creation by
  `assign_tenant_account_number` (migration `20260916000000`). Random (not sequential) so a raw grep of
  URLs in the wild reveals neither the tenant count nor signup order. Permanent — survives tier promotion,
  vanity edits, redirects. Address not a grant (§9): RLS still gates every read.
- **actor-namespacing (act-as URLs)** — owner-locked 2026-08-17: an impersonated view encodes the ACTOR in
  the URL, not the target's bare root — `/operator/act-as/{n}/{branch}` and `/agency/{n}/sub/{subN}/{branch}`.
  So §51 impersonation audit + Paige's §32.c "am I acting or being" self-awareness read straight off the
  address; a bare `/business/{n}/…` for an impersonated view would erase the actor from the trail.
- **`TIER_BRANCHES` registry** (`src/lib/routing/tierBranches.ts`) — the §65 config-as-data route-tree
  spine: per-tier ordered branch set (slug·key·label·group) + root prefix. One home (§18) the router, the
  nav rail, and Paige all read. Encodes §11c (sub_account inherits the SOLO tree) + §3/§61 (enterprise =
  agency baseline superset). Adding a branch is a data row, not per-tier code.
- **`url_segment` (vanity URL)** — the account-holder-editable name/company URL segment (owner ruling
  2026-08-17): born numeric (`account_number`), self-serve editable from Setup to a vanity name; the
  route resolver accepts EITHER. Uniqueness + reserved-word denylist + format validation + old→new 301
  grace (§58) + the permanent number always still resolves. §10-callable (Paige can rename it too).

---

*Add a term the moment it costs a session a lookup. When two sources conflict, record both and flag it
owner-owed — don't paper over the disagreement.*

## Spine · Rail (recorded 2026-09-01, owner-ruled)

- **Rail** — the durable record of what happened: signals, approvals, actions, results,
  follow-ups. Paige's receipt and history. **One part of the Spine, not a synonym for it.**
- **Spine** — the whole shared pathway connecting a domain to Paige: safe evidence → approval →
  domain-owned action → Rail outcome.
- **The approval step of the Spine** is owned by the Chat build and specified in
  `docs/doctrine/one-approval-gate.md`. A feature agent adds gated actions freely; changing how
  approval is PROVEN goes to the Chat build first.
- The full Spine contract is being grounded by a separate audit; when it lands it is the
  authority on everything except the approval step, which stays where it is.

## "Trust Compass" names TWO things (recorded 2026-09-01 — verified against prod)

- **`trust_effective_rung()`** — the PLATFORM trust rung (§68), read by `resolve_automation_autonomy`.
  Real and clamping. ~~*Its migration is not applied to production yet.*~~ **CORRECTED 2026-09-02
  (§58): it EXISTS on production, with `resolve_tool_autonomy(uuid,text)` — read-only catalog query,
  2026-09-02. Runtime enforcement is a separate question and stays `UNVERIFIED`; see
  `../doctrine/autonomy-architecture.md` "Existence is not reachability".**
- **The Solo Compass dial** — `TRUST` in `src/solo/compass.tsx`, an in-memory object seeded from a
  fixture. Enforces nothing; dragging it is lost on reload; no server code reads it.

Say which one you mean. Approval authority today is the action-risk policy plus the confirm gate.
