# OPS — pipeline & CI runbook

The home for "how the pipeline works so it's never re-derived" (root `CLAUDE.md` §24). Edge-function
deploy mechanics live in the nested `supabase/functions/CLAUDE.md` (auto-loads for function work);
this doc covers the CI **quality gate**.

## CI workflows

| Workflow | File | Gate |
| --- | --- | --- |
| `ci` (verify) | `.github/workflows/ci.yml` | build + test + typecheck-ratchet + changed-file lint + regression lint |
| `migration-lint` | `.github/workflows/migration-lint.yml` | lints added/modified migrations for clean-rebuild safety |
| `Security Audit` | `.github/workflows/security-audit.yml` | `npm audit` prod deps, high+ |
| `deploy-edge-functions` | `.github/workflows/deploy-edge-functions.yml` | auto-deploys changed edge functions on merge to `main` |

## The `ci / verify` gate (Lane F Slice 1 — PLATFORM_ASSESSMENT Move 4)

Runs on every PR (and `push: main` for the whole-repo gates). Steps:

- **Build** (`npm run build`) + **Test** (`npm run test`, vitest) — hard gates.
- **Typecheck ratchet** (`npm run ci:tsc` → `scripts/ci/tsc-ratchet.mjs`) — runs `tsc --noEmit` and
  compares the error **multiset** to `scripts/ci/tsc-baseline.txt` (`<count>\t<signature>`, line/col
  stripped). Fails only on a **new** signature/instance; prints any baseline entry now fixed. A
  ci.yml step also fails the PR if `tsc-baseline.txt` **grows** (it may only shrink — fix the error,
  don't whitelist it).
- **Changed-file lint** — ESLint + gold-discipline on the PR's changed `src/**.{ts,tsx}` only.
- **Regression lint** (`npm run ci:regression` → `scripts/ci/regression-lint.mjs`) — scans **added
  diff lines** across shipped surfaces (`src`, `index.html`, `public`, `supabase/functions/*.ts`) for
  §3 banned phrases ("AI-powered"/"streamline"/"seamless"/"empower coaches") + "MMA OS" jargon, and
  new non-restrictive `USING/WITH CHECK (false)` policies in migrations. Added-lines-only so
  pre-existing debt (owned by the §2/§3 cleanup lanes) never blocks. Escape hatch: put
  `ci-allow-regression` on the line.

### ⚠️ Required-check setup (owner, one-time)
A workflow only **blocks** merges when it's a **required status check** in branch protection — which
can't be set from code. Mark `ci / verify` (and `lint`, `audit`) required in **Settings → Branches →
main**. Until then the gate is advisory (runs + reports, doesn't block).

### Regenerating the tsc baseline (ratchet it DOWN)
When you fix pre-existing type errors, shrink the baseline:
```
npx tsc --noEmit -p tsconfig.app.json 2>&1 \
  | grep "error TS" | sed -E 's/\(([0-9]+),([0-9]+)\)//' | sed -E 's/^[[:space:]]+//' \
  | sort | uniq -c | awk '{c=$1;$1="";sub(/^ /,"");print c"\t"$0}' > scripts/ci/tsc-baseline.txt
```
The goal is zero. Do **not** add entries to whitelist a new error — the shrink-only guard will fail the PR.

## Known follow-ups (Lane F)
- Commit a lockfile (or move CI to `bun install --frozen-lockfile`) for reproducible installs +
  cache — CI uses `npm install` today because the canonical lockfile is `bun.lockb` (task #379).
- Drive the tsc baseline to zero.
- Remaining Lane F items (secrets docs / preflight / function manifest) are separate slices.
