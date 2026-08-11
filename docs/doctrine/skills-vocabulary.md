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

## Do NOT
- Do **not** rename `paige_skills`, `paige_subagents`, `marketplace_items`, `skill-runner`, `skill-forge`,
  `subagent-forge` — MEDIUM vocab means docs + comments only (§58 anti-regression, owner-ruled 2026-08-11).
- Do **not** conflate `skill-forge` (authors concept 1) with `subagent-forge` (authors concept 3) — they
  write different tables for different purposes.

## Cross-references
`CLAUDE.md` §14 (Paige's team → concept 3) · §16 (10-department methodology → concept 4) · §34 L5 (Talent →
concept 3) · §35 (dogfooding) · §60/§61 (tier gate → concept 1 self-use, concept 2 resell) ·
`docs/doctrine/tier-matrix.md` §61 · `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4 (Skills Wave).
