# Release report — Paige UI Delivery Skills Standard (2026-09-05)

What shipped, the exact rules and files added, the checks run, and the limitations that remain.

## Outcome

Any agent that designs, redesigns, or materially changes a Paige UI now has a mandatory, curated
skill workflow with rendered + behavioral evidence, a truthful-label vocabulary, an owner guide, a
PR evidence template, and a narrowly-targeted CI guardrail. Enforcement lives in three places an
agent cannot miss: `CLAUDE.md` §71, root `AGENTS.md`, and CI `lint:ui-evidence`.

## Rules established (the five)

1. Flow-by-Flow first (already §69).
2. The `paige-ui-delivery` bundle before design/implementation on any visible interface.
3. `flow-prototype` before production for any new or materially changed flow.
4. Design around the user's real job — not generic chrome or an unusable mockup.
5. "It renders" / fixtures / a structural test is not "it works" — claims need rendered + behavioral
   evidence, labelled LIVE / PARTIAL / UNAVAILABLE / UNVERIFIED.

## Files added / changed

**Curated, pinned bundle (deliverable 1)** — vendored from `github.com/PracticalSwan/agent-skills`
at commit `da1f686c51f64d32395e645eec5e58ba5045c744` (MIT):
- `docs/paige-ui-delivery/upstream/PROVENANCE.md` — repo, exact SHA, license chain, exactly what was
  vendored and what was not, re-vendor procedure.
- `docs/paige-ui-delivery/upstream/LICENSE-UPSTREAM-MIT.txt` + per-skill license/notice files
  (frontend-design carries its MIT + Apache-2.0 + GitHub-MIT + THIRD_PARTY_NOTICES chain verbatim).
- Vendored skills (SKILL.md + relevant references + Python tools): `frontend-design`,
  `web-design-reviewer`, `accessibility`, `web-testing`, `web-design-guidelines`. Deliberately NOT
  vendored: web-testing's PowerShell scaffold and recipe-app example (stack-mismatched; retrievable
  at the pin).

**Mandatory project instructions (deliverables 2, 3)**:
- `.claude/skills/paige-ui-delivery/SKILL.md` — the active Paige-owned entrypoint skill (routing +
  Paige gates + pointers). Registered and confirmed discoverable this session.
- `AGENTS.md` (root, new) — cross-agent trigger for Codex/Claude/others.
- `CLAUDE.md` §71 — doctrine section binding the standard.
- `.claude/skills/README.md` — new row + the "why this vendor is licit where flow-by-flow's wasn't"
  rationale.
- `docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md` — the full standard: rules, routing, what counts
  as a UI change, when flow-prototype is additionally required, Solo viewport gates, forms/funnels
  and visual requirements, evidence classes, truthful labels, the §00 boundary.

**Evidence/PR template + CI guardrail (deliverable 4)**:
- `docs/PULL_REQUEST_TEMPLATE.md` — added the machine-checked **UI Delivery Evidence** block.
- `docs/paige-ui-delivery/UI-EVIDENCE-TEMPLATE.md` — the full human evidence checklist.
- `scripts/ci/ui-evidence-lint.mjs` — the guardrail (pure `evaluate()` + `--self-test`, 17 cases).
- `package.json` — `lint:ui-evidence` + `lint:ui-evidence:test`.
- `.github/workflows/ci.yml` — two steps in the `verify` job (the PR-only gate + the self-test).

**Owner guide + report (deliverables 5, 6)**:
- `docs/paige-ui-delivery/README.md` — "How Paige UI work gets designed, tested, and released."
- `docs/paige-ui-delivery/RELEASE-REPORT.md` — this file.

## Checks run

| Check | Result |
|---|---|
| `lint:ui-evidence --self-test` (17 cases) | PASS — incl. every no-op case (DB, edge-fn, docs, test, stories, `__tests__`, pure-logic `.ts`, script-only) and the mixed UI+backend case |
| `lint:ui-evidence` on this branch's real diff | NO-OP PASS — this PR touches no `src` `.tsx`/`.css`, demonstrating the narrow targeting on a real change set |
| `ci:regression` on the real diff | PASS — `docs/` is outside the shipped-surface scan, so the vendored docs do not trip §3/jargon |
| `ci:tsc` ratchet | PASS — baseline 13, current 13 (no TS changed) |
| `package.json` JSON validity | PASS |
| `.github/workflows/ci.yml` YAML validity | PASS — 75 verify steps parse |
| Vendored Python tools compile | PASS — `contrast-checker.py`, `css-risk-audit.py` |

The app test suite and production build were **not** re-run: this change touches no `src`/app code
(only docs, skills, root instructions, CI tooling, and package scripts), so `ci:tsc` clean is the
relevant proof. Stated rather than implied.

## The exact enforcement now in place

- A PR whose diff adds/modifies `src/**` `.tsx` or `.css` (excluding `*.test.*`, `*.spec.*`,
  `*.stories.*`, `__tests__/`) MUST carry, in its PR body, a `UI-Delivery-Evidence:` block with
  non-placeholder `Rendered:` and `Behavioral:` lines (an honest `UNVERIFIED: <reason>` is accepted),
  OR an explicit `UI-Delivery-Exempt: <reason>`. Otherwise CI `lint:ui-evidence` fails the PR.
- Backend-only, DB-only, edge-function-only, docs-only, test-only, and tooling-only PRs are a no-op
  pass — the gate never blocks them.
- The self-test (`lint:ui-evidence:test`) runs on every CI run and fails if the guard's own logic
  regresses.

## Limitations (honest)

1. **A required-check setting is the owner's, not code's.** These two steps live inside the existing
   `ci / verify` job. They only *block* a merge if `verify` is marked a required status check in
   branch protection (Settings → Branches) — the same caveat `ci.yml` already documents for the whole
   verify gate. If it is not required, the gate is advisory (still visible, still red).
2. **It is a guardrail, not proof.** The PR body is mutable and not in git history; the gate forces
   the evidence artifact to *exist and be reviewable*, it cannot certify the agent truly ran the
   skills or that the feature works. Real assurance is a human/adversarial review of the evidence the
   attestation points at. A checkbox is deliberately not accepted (Rule 5).
3. **The trigger keys on `.tsx`/`.css`.** A UI change expressed only through a `.ts` file (rare —
   most visible interface is `.tsx`/`.css`) would not trip the gate. This is a deliberate
   narrowness/false-positive tradeoff, not an oversight; widen the `isUiFile` set if that pattern
   ever proves common.
4. **`flow-by-flow` / `flow-prototype` remain per-account synced skills, not vendored** — their
   upstream ships no fetchable license notice, so vendoring them was correctly refused before (see
   `.claude/skills/README.md`). The standard references them by name; agents invoke them via the
   Skill tool. This is unchanged and not a regression.
5. **The standard cannot force good design** — only that the workflow runs and evidence exists. Taste
   remains Claude Design's and the owner's (§00).
