# Flow by Flow — installation + binding adapter

**Status:** installed 2026-08-25 at owner direction ("add these skills and use them for our coding
moving forward … install the ones that are relevant to our Paige Agent AI dev").

**What was installed.** Both halves of the Flow by Flow system, v2.0.1, MIT (Benjamin Macaulay,
Chasebig Limited), byte-for-byte from the uploaded package:

| Skill | Repo path | Role |
|---|---|---|
| `flow-by-flow` | `.claude/skills/flow-by-flow/` | Orchestrator — affected-flow discovery, mode/depth/risk selection, build order, proof separation |
| `flow-prototype` | `.claude/skills/flow-prototype/` | UI/UX approval surface — one throwaway, read-only, state-complete interactive model of a flow |

Markdown only. No scripts, no executables, no dependencies, no network calls, no production access.
Verified against the source tree with `diff -r` before commit.

**Why repo-level and not personal.** Claude Code sessions here run in ephemeral remote containers —
a `~/.claude/skills/` install evaporates when the container is reclaimed. Committing under
`.claude/skills/` (with the `.gitignore` exception that already exists for `.claude/commands/`) is
what makes "use them moving forward" actually durable across sessions and teammates. Codex installed
the same two skills personally on 2026-08-25; the repo's Codex convention directory is
`.agents/skills/` if a repo-level Codex copy is ever wanted — keep both copies on the same version if
so, because Gate 5 checks exactly that.

---

## Authority order — CLAUDE.md wins, and the skill agrees

`flow-by-flow/references/orchestration.md` §1 resolves conflicts as:

> current user instruction > safety and authority > **repository constitution** > approved decisions >
> proven runtime and code > current design assets > stale prose > builder judgment

`CLAUDE.md` **is** this repository's constitution. Where the skill and doctrine differ, doctrine wins —
by the skill's own rule, not by an override. The five adaptations below are the places that actually
differ, resolved once so no future session has to re-litigate them.

---

## 1. §00 — `flow-prototype` is NOT a design-decision path for Claude Code

`flow-by-flow` rule 5 and `orchestration.md` §5 require a `flow-prototype` approval surface before any
major UI/UX change, and tell the builder to "design interaction architecture before styling … choose
page, inline, popover, modal, drawer, or sheet."

**For Claude Code that is void on contact with §00.** CC has zero input on design — not a proposal,
not a prototype, not a ranked set of interaction options. The seat that decides interaction shape is
Claude Design's, and the frontend implementation lane is Codex's (owner ruling 2026-08-24: Codex =
Frontend Lead, CC = Backend Lead; "Claude Code must not independently redesign or restyle Codex-owned
frontend files").

So the approval gate resolves, for CC, as:

- **The committed CD pack IS the approved interaction model.** `docs/design-references/cd-packs/` +
  `docs/design-references/PACK-FIRST.md`. It is delivered code, not a specification to interpret.
- **A gap in the pack is a question for CD, never a prototype CC builds to answer it.** §00's word-gate
  fires first: before writing "not in the pack," search four spellings against the `.dc.html`, the
  PORT-SPEC and the siblings, and read the region of markup.
- **CC never invokes `flow-prototype` to decide, propose, or rank UI.** The one thing CC may raise is
  incompatibility in either direction — the design cannot be wired as drawn, or the backend must change
  for it to work — stated precisely, then stopped.
- **`flow-prototype` stays installed and stays valid for the frontend lane** (Claude Design / Codex),
  which is where an approval surface has an approver and an owner. It is also legitimately usable by CC
  as a *reading* reference for what a complete state map contains (entry · loading · empty · validation ·
  permission · offline · error · retry · cancellation · interruption · expiry · success · exits) when CC
  is asked to enumerate the **backend states** a surface needs served. Enumerating states the backend
  must supply is engineering. Deciding how they look is not.

`flow-by-flow`'s "halt before production UI if no approver is reachable" is preserved verbatim for CC,
with the approver named: **Claude Design, via the owner.** Questions-forbidden is not approval, and
post-hoc approval is not approval.

## 2. Durable artifacts — we already have their homes (§18, one home per capability)

The skill names `PROJECT_BIBLE.md`, `templates/foundation-pack.md`, `verification/commands.json`,
`BUILD_VERIFICATION.json`, and `BUILD_STATE.json`. **Do not create any of them here.** This is a mature
repository whose equivalents already exist and are the §0/§BRAIN sources of truth:

| Skill artifact | Our existing home |
|---|---|
| `PROJECT_BIBLE.md` | `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` (§0) + `CLAUDE.md` + `docs/brain/README.md` (§BRAIN.1) |
| Foundation pack | Not applicable — no new-application foundation is being laid. `docs/doctrine/canonical-build-order.md` holds sequencing |
| Design system / tokens | `docs/brain/design-system.md` + the CD packs. **Read-only for CC** (§00) |
| Architecture truth | `docs/architecture/`, `docs/brain/codebase-map.md`, `docs/doctrine/tier-matrix.md` |
| Build/verification manifests | `package.json` scripts (`ci:tsc`, `lint:views`, `lint:definer-fns`, `lint:tier-features`, `lint:skeleton`, `test`, `build`), `.github/workflows/`, `scripts/live-drive/`, `scripts/workflow-readiness/`, `/edge-drift` |
| Build-state truth | Git + PR state + the task ledger — reconstructed from repository truth, never hand-narrated (the skill's Gate 4 principle, which we keep) |

`foundation.md` and `templates/foundation-pack.md` are therefore **dormant routes** for this repo. They
apply only if we ever stand up a genuinely new application.

## 3. Verification — the skill's gates map onto §32/§39, they do not replace them

Keep the skill's discipline (separate automated proof, static proof, runtime proof, and unverified
claims; report `PASS` / `FAIL` / `UNVERIFIED` with a reason). Map its gates onto ours:

- **Gate 3 (build evidence)** → our CI gate set above, run for real, with the actual transcript pasted.
  A green typecheck is not a working render (§32).
- **Gate 2 (execution / persistence)** → §32.a: a migration is not done until `schema_migrations` on prod
  has advanced *and* the created object is queried live. A `BEGIN … ROLLBACK` proof is the pre-merge
  smoke test, never the persistence proof.
- **Runtime proof on auth-gated surfaces** → §32.c, with its capability rule: drive the deployed surface
  if this session holds a browser tool (`scripts/live-drive/live-drive.mjs`), otherwise name the live
  check as **owed to the next capable session**. Never imply a drive that did not happen.
- **Independent review** → §39 peer-gate: a second, distinct pass reads the *real pushed diff*
  adversarially, hunting the defect the author's own assertions structurally could not test. The skill's
  `references/review.md` is a useful checklist *inside* that seat; it is not a substitute for it.
- **§58 anti-regression** and **§66 tier-matrix-in-the-same-commit** ride on every pass, unchanged.

## 4. Depth and agents — §1 crew, bounded by the harness

The skill's depth table sets agent counts as **ceilings**, and already provides the honest degrade:
where independent agents are unavailable, run the perspectives sequentially and label the result
`self-reviewed, lower assurance`. That is the correct behaviour here whenever the session or the owner
has constrained agent/workflow use, and it is §13-compatible. §1's crew requirement is satisfied by the
crew actually convened, reported honestly — never by claiming a crew that did not run.

## 5. The tier gate fires *before* the flow contract

`flow-by-flow`'s flow contract has a single "permission behavior" line. Ours is bigger and it is
mandatory. Before naming the flow:

- **§56** — open `docs/doctrine/tier-matrix.md`, name which account type(s) this is for, and decide on
  purpose whether the capability belongs on each and renders regardless of empty/default state.
- **§60/§61** — every feature-render decision derives from `getTierFeatureSet()` / `hasFeature()`, never
  an inline `account_type ===` compare.
- **§37/§51** — any contract change walks the producer inventory *per tier*, and the consumer inventory
  for any response change.
- **§9/§59** — tenant scope is enforced in the function body, never by the EXECUTE grant.

## 6. Stop conditions — ours are stricter, and they stack

The skill stops for missing authority, credentials, spending, legal acceptance, production release,
payment activation, DNS changes, and destructive real-data actions. Add, standing:

- **No merge, deploy, activation, flag flip, or autonomy widening without explicit owner authorization**
  for the specific action.
- **No credential inspection, creation, borrowing, rotation, or disclosure.** Secrets are referenced by
  NAME only, never by value, anywhere — chat, PR, CI output, ledger, or docs (§34).
- **No unauthorized working-tree mutation during read-only work** — fresh clone or worktree; inspect
  status and diffs before any recovery; report an accidental mutation rather than resetting over it
  (owner process correction, task #234).
- **§28/§58** — an owner-approved design is frozen, and a shipped owner-approved capability is never
  silently removed.

---

## What this actually buys us

The parts worth keeping, stated plainly so the skill is used for its strengths rather than as paperwork:

- **Affected-flow discovery before code.** "Which user flows are affected?" is the question that would
  have caught the #201 sub-account seam and the #99 empty-book availability bug before they shipped.
- **Regression impact mapping as a named deliverable**, which pairs exactly with §37's producer/consumer
  inventories.
- **Proof separated by kind** — automated / static / runtime / unverified — which is §13 honesty given a
  concrete reporting shape.
- **Proportionality.** Quick work stays quick: state the affected flow, the exact change, the preserved
  behaviour, and the verification. No planning artifacts, no dispatched agents, no foundation pack for a
  micro task. Applying Deep-depth ceremony to a one-line correction is a misuse of the skill, not a
  virtue.
