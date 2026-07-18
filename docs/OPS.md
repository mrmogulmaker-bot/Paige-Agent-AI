# OPS — operational runbook

The things we kept re-deriving every session, written down once. Keep this current.

## Supabase project

- **Project ref / `project_id`:** `xygzykjyynhzqytbqnzu` (source of truth: `supabase/config.toml`).
- **Per-function auth:** `verify_jwt` is declared per function in `supabase/config.toml`.
  Functions not listed default to `verify_jwt = true`. The Supabase CLI reads this on
  deploy, so a CLI deploy preserves each function's auth posture automatically — do not
  pass `--no-verify-jwt` unless the function's config says `false`.

## Edge functions — how they deploy

**Edge functions do NOT deploy when code merges to `main` on their own.** That gap is now
closed by CI:

- **`.github/workflows/deploy-edge-functions.yml`** — on every push to `main` touching
  `supabase/functions/**`, deploys exactly the functions whose bundle changed and moves the
  `edge-live` git tag to the deployed commit.
- **`.github/scripts/edge-affected.py`** — resolves *which* functions a change affects. A
  function's bundle is its own directory **plus every relative import it pulls in**,
  including `_shared/*` files and the chains between them (`model-router.ts` → `claude.ts`,
  `growth-forms.ts` → `growth-blocks.ts`, …). So a one-line change to a shared file
  redeploys every function that transitively imports it — the resolver computes that set.
  Run it standalone: `echo "supabase/functions/_shared/claude.ts" | python3 .github/scripts/edge-affected.py`.

### One-time setup (required for CI deploys to work)

Add a repository secret so the workflow can authenticate:

- **Settings → Secrets and variables → Actions → New repository secret**
- Name: `SUPABASE_ACCESS_TOKEN`
- Value: a Supabase **personal access token** (Supabase dashboard → Account → Access Tokens).

Until the secret is set, the workflow fails loudly with instructions rather than silently
skipping. It never no-ops on you.

### Checking drift

Run **`/edge-drift`** to see which functions are ahead of prod (source changed on the
branch but not yet deployed). It diffs `edge-live..HEAD` — cheap, no prod fetch. On `main`
with CI healthy, drift should be zero.

### Manual deploy (fallback only)

If CI is unavailable and a function must go live now, and no Supabase CLI + access token is
present in the environment, the only channel is `mcp__Supabase__deploy_edge_function` with
**all** bundle files inlined (entrypoint + every `_shared` dependency). This is token-heavy
and error-prone — prefer CI. If you must, always re-fetch with `mcp__Supabase__get_edge_function`
afterward and diff the deployed bytes against the repo to prove fidelity.

## Frontend

Deploys via its own existing pipeline (Vercel) on merge to `main` — no action needed here.

## Task list hygiene

Completed tasks reload into context every turn — a real per-turn cost. Archive them to
`docs/DONE.md` and delete them from the live list periodically (`TaskUpdate status: deleted`)
so the working list stays lean.
