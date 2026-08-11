# Skills Vocabulary — the four "skill"-adjacent concepts (living doc)

> **Why this exists (owner-ruled 2026-08-11, MEDIUM vocab reconciliation).** The word
> "skill" means at least four different things across the platform, and the confusion has
> cost real time. Rather than rename shipped tables/surfaces (a §58 anti-regression risk
> with no user-facing value), we **disambiguate in one place** (this doc) + inline comments
> at the confusion sites. When you read or write "skill" anywhere, map it to one of the four
> below first. `CLAUDE.md` §BRAIN.2 binds: answer "what is a skill here?" from this doc, not memory.

## The four concepts

| Concept | Table / home | What it is | Who authors it | Forge |
|---|---|---|---|---|
| **1. Skill** (executable recipe) | `public.paige_skills` | A methodology-anchored, tier-gated, autonomy-governed **playbook Paige RUNS** (draft a doc, verify a business, build a game plan). The Skills Wave subject. | Platform (defaults) or a tenant (per §9) | `skill-forge` edge fn |
| **2. Marketplace add-on** (capability pack) | `public.marketplace_items` | An **installable capability pack** a tenant switches ON (a domain brain, a tool bundle, a preset). Layers ON TOP of the tier baseline (§2 opt-in). This is what an **agency RESELLS** to its sub-accounts (§61). | Platform / third-party / tenant | Marketplace registry |
| **3. Sub-agent / Specialist** | `public.paige_subagents` | A **member of Paige's team** (§14) — a named specialist agent (research, design, verify…) Paige delegates to (`delegate_to_subagent`). §34 L5 "Talent". | Platform (defaults) or forged per-tenant | `subagent-forge` edge fn |
| **4. Methodology** | prose (per-department) + `paige_skills.methodology_anchor` | The **GOAT-anchored framework** a skill/department is built on (e.g. "Minto — Pyramid Principle", "GROW coaching model"). Not a table of its own; it's the *anchor* a Skill (concept 1) declares via `methodology_anchor`, and department-level framework prose (§16). | Doctrine / platform | — |

## The quick test
- *"Paige RUNS it as a recipe"* → **Skill** (`paige_skills`, concept 1).
- *"A tenant INSTALLS/RESELLS it as a pack"* → **Marketplace add-on** (`marketplace_items`, concept 2).
- *"Paige DELEGATES to it as a teammate"* → **Sub-agent / Specialist** (`paige_subagents`, concept 3).
- *"It's the FRAMEWORK a skill is anchored to"* → **Methodology** (`methodology_anchor`, concept 4).

## Tier availability (§61 Standing Tier Distribution Default)
- **Skills (concept 1) — self-use** default: **god · solo · sub_account · enterprise = YES; agency = NO self-use.**
  Encoded as the `skills` Feature in `src/lib/tier/tierFeatures.ts` (self-use gate only).
- **Agency "resell" (§61)** is **concept 2's** territory — an agency resells the skill *library* to its
  sub-accounts via the **Marketplace**, NOT by self-using the `skills` Feature. This is why the binary
  `TIER_FEATURE_BASELINE` Set carries self-use only (a Set is one bit; "resell" lives at the Marketplace
  layer, consistent with the file's baseline-vs-opt-in split). Enterprise = yes+resell (self-use via the
  Solo union + resell in the Marketplace layer).
- Each `paige_skills` row also records its intended distribution in `tier_availability` jsonb
  (`{god,solo,sub_account,agency,enterprise}` = `yes|resell|yes+resell|no`) — a per-skill doc of the same rule.

## How a Skill (concept 1) actually RUNS — the S1b interpreter

`skill-runner` (the edge fn that executes a `paige_skills` recipe) dispatches two ways:
- **Bespoke handlers** — the 4 shipped skills (`verify_business_sos`, `research_to_concept_brief`,
  `build_game_plan`, `draft_and_email_document`) keep their hand-written `switch(slug)` branches.
- **The generic steps-interpreter** (`_shared/skill-interpreter.ts`, pure logic in
  `_shared/skill-interpreter-core.ts`) — runs **every other slug** (everything Paige forges from here on).
  It is **additive** (§58): the 4 bespoke slugs are byte-identical, untouched, unless a caller passes
  `force_interpreter` (Slice-3 diff tooling only — **never exposed in the `paige-mcp` `run_skill` schema**).

The interpreter reads the skill ROW and drives a doctrine-clean run:
- **Modality/tier (§17):** always the `text` modality; `external_send`-risk skills draft at the `frontier`
  tier, everything else at `open-flexible`.
- **Generation (§26):** routes through the EXISTING `forge()` seam — `methodology_anchor` leads the brief,
  the descriptive `steps` become the plan, `cheesy-tells`/brand-tokens bind. `is_platform_default` is set
  from `scoping==='platform'` so the §2 finance re-scan engages for platform skills. `remember:false` (a
  skill draft is not a landed design artifact).
- **Autonomy (§16):** `resolveExecutionMode(autonomy_lane, risk_level)` → `execute` (🟢 auto) / `approval`
  (🟡 confirm — files a `paige_pending_approvals` draft) / `brief` (🔴 off). A **structural risk floor**
  means `external_send`/`mutating` risk can **never** resolve to `execute` even if mis-laned — the
  interpreter has **no external-send call site at all**, so a send only ever happens later from the
  approved-send seam.
- **Tier (§60/§61):** `tierAllowsSkill(tier_availability, caller_tier)` self-run belt — `yes`/`yes+resell`
  allow, `resell` (marketplace-only) and `no` deny. The UI (`hasFeature('skills')`) is the primary gate;
  this is defense-in-depth (a null `caller_tier` allows through).
- **Tenant (§9/§59):** the contact's tenant (server-derived) is authoritative; a body `tenant_id` is only
  honored for a no-contact skill; a mismatch is rejected as an IDOR attempt.

**§58 automation:** `scripts/skills-s58-harness.mjs` (+ `tests/fixtures/skills-s58-baseline/`) captures a
per-skill baseline (`--capture`) and diffs bespoke-vs-interpreter (`--diff`) — the automated parity proof
that must be byte-identical before the interpreter may replace a bespoke handler (Fork-2: additive first).

## Do NOT
- Do **not** rename `paige_skills`, `paige_subagents`, `marketplace_items`, `skill-runner`, `skill-forge`,
  `subagent-forge` — MEDIUM vocab means docs + comments only (§58 anti-regression, owner-ruled 2026-08-11).
- Do **not** conflate `skill-forge` (authors concept 1) with `subagent-forge` (authors concept 3) — they
  write different tables for different purposes.

## Cross-references
`CLAUDE.md` §14 (Paige's team → concept 3) · §16 (10-department methodology → concept 4) · §34 L5 (Talent →
concept 3) · §35 (dogfooding) · §60/§61 (tier gate → concept 1 self-use, concept 2 resell) ·
`docs/doctrine/tier-matrix.md` §61 · `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4 (Skills Wave).
