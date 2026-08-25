# Project skills (Claude Code)

Skills committed here are discovered automatically by every Claude Code session in this repo, which
is why they live in git rather than in a session's ephemeral `~/.claude/skills/`. The `.gitignore`
carries an explicit `!.claude/skills/` exception alongside the existing one for `.claude/commands/`.

| Skill | Version | What it is |
|---|---|---|
| `flow-by-flow` | 2.0.1 (MIT) | Orchestrator for software work — affected-flow discovery, mode/depth/risk, build order, proof separated by kind |
| `flow-prototype` | 2.0.1 (MIT) | UI/UX approval surface — one throwaway, read-only, state-complete interactive model of a flow |

**Read `docs/doctrine/flow-by-flow-adapter.md` before using either.** It binds them to this
repository's constitution — most importantly that under §00 Claude Code has zero input on design, so
`flow-prototype` is never a path by which CC decides, proposes, or ranks interface work. The Claude
Design pack is the approved interaction model; a gap in it is a question for CD.
