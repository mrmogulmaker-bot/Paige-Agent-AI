# Project skills (Claude Code)

Skills committed here are discovered automatically by every Claude Code session in this repo, which is
why they live in git rather than in a session's ephemeral `~/.claude/skills/`. `.gitignore` carries an
explicit `!.claude/skills/` exception alongside the existing one for `.claude/commands/`.

| Skill | Version | What it is |
|---|---|---|
| `flow-by-flow` | 2.0.1 | Orchestrator for software work — affected-flow discovery, mode/depth/risk, build order, proof separated by kind |
| `flow-prototype` | 2.0.1 | Interactive UI/UX prototype for approval before production implementation |

**License.** Both are MIT, © 2026 Benjamin Macaulay, Chasebig Limited. The source package's root
`LICENSE.md` is reproduced verbatim in this directory as `LICENSE.md` and covers both skill folders.
The folders themselves are byte-for-byte identical to the source package.

**Read `docs/doctrine/flow-by-flow-adapter.md` before using either.** It records the install and points
at the existing `CLAUDE.md` sections that already govern the places these skills touch — most notably
§00, under which Claude Code has zero input on design, so the skill's design-deciding instructions do
not apply to Claude Code. The adapter adds no rule of its own.
