# Upstream provenance — Paige UI Delivery bundle

This folder is a **vendored, pinned, read-only** copy of a narrowly-curated slice of an upstream
skill catalog. It is frozen at one commit on purpose: an upstream change must never silently change
Paige's UI delivery rules. Nothing in this folder is edited in place — to move the pin, re-vendor
from a new commit (procedure below) in its own reviewed PR.

## Source

| Field | Value |
|---|---|
| Upstream repository | `https://github.com/PracticalSwan/agent-skills` |
| Pinned commit | `da1f686c51f64d32395e645eec5e58ba5045c744` |
| Commit date | 2026-09-05 21:51:40 +0700 |
| Commit subject | `chore: refresh skill catalog and mirrors` |
| Vendored on | 2026-09-05 |
| Retrieval | `git clone --depth 1` over HTTPS, then `git rev-parse HEAD` to record the SHA |

## License

The upstream repository is **MIT** (© 2026 Sithu Win San) — `LICENSE-UPSTREAM-MIT.txt` here. MIT
permits copy, modification, and redistribution provided the copyright and permission notice travel
with the copies, which they do (per-skill `LICENSE.txt` files are preserved where upstream shipped
them; skills without their own file are covered by the repo-root MIT copied here).

**`frontend-design` carries a tri-license provenance chain** — it is a consolidation, and all three
notices are preserved verbatim in `frontend-design/`:

- `LICENSE.txt` — MIT © 2026 Sithu Win San (the original `frontend-design` material + contrast checker).
- `LICENSE-APACHE-2.0.txt` — Apache-2.0. Art-direction concepts were adapted (and materially
  modified) from OpenAI's historical `frontend-skill` at commit
  `30444aed500c00c85294d12074f6e3ee794f808a`, path `skills/.curated/frontend-skill`.
- `LICENSE-GITHUB-MIT.txt` — MIT © GitHub, Inc. The removed `premium-frontend-ui` skill (credited to
  Utkarsh Patrikar) was *reviewed* at `github/awesome-copilot` commit
  `8ae5a99109124c22288eee0254da61741e44d12a`; upstream restates only general ideas in original
  wording and retains this notice. See `frontend-design/THIRD_PARTY_NOTICES.md`.

## Exactly what was vendored (and what was not)

Only the four skills the Paige UI Delivery Standard routes to, plus one adjacent guidelines skill —
the *narrowly relevant* slice, not the whole catalog (the catalog has ~240 skills, most unrelated).

| Skill | Files vendored | Deliberately NOT vendored |
|---|---|---|
| `frontend-design` | `SKILL.md`, `CHANGELOG.md`, all 3 license files, `THIRD_PARTY_NOTICES.md`, `references/accessibility-checklist.md`, `scripts/contrast-checker.py`, `agents/openai.yaml` | — (vendored whole; it is small) |
| `web-design-reviewer` | `SKILL.md`, `CHANGELOG.md`, `references/framework-fixes.md`, `references/visual-checklist.md`, `scripts/css-risk-audit.py` | — |
| `accessibility` | `SKILL.md`, `LICENSE.txt`, `CHANGELOG.md`, `references/A11Y-PATTERNS.md`, `references/WCAG.md` | — |
| `web-testing` | `SKILL.md`, `LICENSE.txt`, `CHANGELOG.md`, `references/playwright-selectors.md`, `references/test-patterns.md` | `examples/e2e-recipe-app-tests.md` and `scripts/test-scaffold.ps1` — the recipe-app example and the PowerShell scaffold are stack-mismatched (Paige uses vitest + the `scripts/live-drive/` Playwright helper, not PowerShell). They remain retrievable at the pin above. |
| `web-design-guidelines` | `SKILL.md`, `CHANGELOG.md` | — |

Every other skill in the upstream catalog was deliberately excluded.

## Do not edit vendored files

Treat everything under this `upstream/` folder as read-only. Paige-specific rules live in the
sibling `docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md` and the active skill
`.claude/skills/paige-ui-delivery/SKILL.md`, never as edits inside these vendored files — an edit
here would make the pin a lie and reintroduce the exact "upstream changed our rules silently" risk
this folder exists to prevent.

## Re-vendoring (moving the pin)

Moving the pin is a deliberate, reviewed act, not a routine sync:

1. `git clone --depth 1 https://github.com/PracticalSwan/agent-skills <tmp>` and
   `git -C <tmp> rev-parse HEAD` to capture the new SHA.
2. Re-read the new `LICENSE.txt` and each skill's license/`THIRD_PARTY_NOTICES.md` — confirm the
   license has not changed in a way that would forbid vendoring, and that the provenance chain is
   still fully represented.
3. Diff the new `SKILL.md` files against these; a change to a hard gate (accessibility, rendered
   verification, complete states) is a change to Paige's delivery rules and must be reviewed as
   such, not merged as a "chore."
4. Replace the files, update the SHA/date/subject in this file, and record the diff of rule-bearing
   changes in the PR description.

Verifier note: the exact SHA is the anchor. If this file's SHA and the actual vendored content ever
disagree, trust neither until re-vendored from a freshly captured pin.
