# Installed agent skills

Crew tooling for implementation agents (Claude Code, Codex, ZCode, Cowork). These skills guide
*how agents work*; they are never vendored into product code. Per CLAUDE.md §14 (owner-locked
2026-08-11): any pattern that graduates into the product must be distilled mechanic-descriptive and
IP-clean — branded names stay in docs/bibliography only.

## Precedence

Where a generic skill's advice conflicts with Paige doctrine, **Paige doctrine wins**, in this order:

1. `CLAUDE.md` (root) + `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §3 (Runtime Harness contract)
2. `AGENTS.md` (root) — mandatory routing: Flow-by-Flow skill + `paige-ui-design` before UI work
3. This directory's skills (general engineering judgment)

Notable doctrine overrides of common agent-skill advice:
- **Memory:** generic skills may suggest persistent agent memory / transcript ingestion. Paige's
  Mind/Memory contract forbids it — durable Memory is owner-confirmed only (Master §3).
- **Autonomy:** generic skills may suggest autonomous multi-step execution. Paige requires Spine
  authority re-resolved per step; mutating actions need chat-canonical approval + LIVE binding.
- **Silent improvement:** no self-modifying prompts/skills/policies; improvement is owner-reviewed
  and versioned (Master §3, Controlled improvement).

## Inventory

| Skill | Source | License |
|---|---|---|
| `paige-ui-design` | in-house (owner design pack port) | — |
| `supabase`, `supabase-postgres-best-practices` | in-house | — |
| `agentic-harness-patterns` | `keli-wen/agentic-harness-patterns-skill` | MIT (`LICENSE-agentic-harness-patterns`) |
| `context-engineering`, `observability-and-instrumentation`, `incremental-implementation`, `test-driven-development`, `code-review-and-quality`, `planning-and-task-breakdown` | `addyosmani/agent-skills` (curated subset) | MIT (`LICENSE-addyosmani-agent-skills`) |
| `audit-ai-design-slop`, `no-ai-design-slop`, `design-first-ui-prompting`, `build-awwwards-quality-sites`, `animation-systems`, `animation-on-scroll`, `beautiful-shadows`, `beam-glow-states`, `ambient-section-particles` | `MengTo/skills` (curated subset — 90-skill catalog available on demand) | MIT (`LICENSE-mengto-skills`) |

## MANDATORY UI-design skills rule (owner, 2026-09-11)

Every visible-interface task reads `paige-ui-design` completely (the delivery standard) AND applies the design-quality skills: at minimum `no-ai-design-slop` (the bland-blocks ban) and `design-first-ui-prompting`; premium/motion surfaces add `build-awwwards-quality-sites` + the animation techniques. The bar: interactive, immersive, distinctive — never "a block with words in it." Doctrine still outranks all skills (precedence above). Context: a full website revamp (Command Mark identity) is upcoming — these skills are the standing toolkit for it.
