# Edge functions — deploy runbook (auto-loads for any work in this tree)

This is a nested CLAUDE.md: it loads automatically whenever a session works on edge
functions, so the deploy mechanics never have to be re-derived. (Global efficiency
doctrine lives in the root `CLAUDE.md` §24.)

## Deploys are automatic — do NOT hand-marshal

**Edge functions deploy themselves on merge to `main`.** `.github/workflows/deploy-edge-functions.yml`
deploys exactly the functions whose bundle changed — following `_shared` imports transitively via
`.github/scripts/edge-affected.py` (a change to `_shared/claude.ts` redeploys every function that
imports it, directly or through `model-router.ts`) — and moves the `edge-live` git tag to the
deployed commit.

- **Write the code → merge to `main` → CI ships it.** Do **not** paste function source through the
  MCP `deploy_edge_function` tool to deploy — that hand-marshaling of ~60k chars per function is the
  exact expensive, error-prone step this pipeline exists to kill.
- Authenticated by the `SUPABASE_ACCESS_TOKEN` repo secret (set). If it were ever missing, the
  workflow fails loudly with instructions — it never silently no-ops.
- **Manual MCP deploy is a last resort only** (CI genuinely unavailable). If forced to, §13 binds:
  re-fetch with `mcp__Supabase__get_edge_function` and byte-diff the deployed content against the
  repo to prove fidelity before trusting it.

## Checking what's live

Run **`/edge-drift`** — a cheap `edge-live..HEAD` git diff that lists functions whose source is
ahead of prod. On `main` with CI healthy, drift is zero.

## Facts you'd otherwise re-derive

- **Project ref / `project_id`:** `xygzykjyynhzqytbqnzu` — source of truth is `config.toml`.
- **Per-function auth:** `verify_jwt` is declared per function in `config.toml`; functions not listed
  default to `verify_jwt = true`. The CLI (and this CI) read it on deploy, so each function's auth
  posture is preserved automatically — never pass `--no-verify-jwt` unless the function's config
  says `false`.
- **Shared code:** `_shared/*` files are bundled into every function that imports them. A shared-file
  change is a multi-function change — the resolver computes the full affected set; trust it over a
  hand-guess.

## The standing rule

If you catch yourself about to hand-run a multi-step deploy you (or a past session) already ran,
stop — that's the tax this pipeline ended. Merge and let CI ship it.
