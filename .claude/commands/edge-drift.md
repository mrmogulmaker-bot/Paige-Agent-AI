---
description: Show which Supabase edge functions are ahead of prod (repo changed but not yet deployed)
---

Report **edge-function drift** — which functions have source changes on this branch
that are not yet live in prod — so we never again ship code to `main` that isn't
actually running. Keep it cheap: this is a git diff, not a prod fetch.

Steps:

1. `git fetch --tags --quiet origin` to pick up the `edge-live` tag (the deploy CI
   moves it to the last commit whose functions are live in prod).

2. If the `edge-live` tag exists (`git rev-parse -q --verify edge-live`):
   - Diff it against the current HEAD, scoped to functions, and resolve to affected
     function names with the shared resolver:
     ```
     git diff --name-only edge-live..HEAD -- 'supabase/functions/**' \
       | python3 .github/scripts/edge-affected.py
     ```
   - If the list is empty, report: **"No drift — every changed function is deployed."**
   - If non-empty, list the function names and note they are ahead of prod. If we are
     on `main`, that means CI is mid-deploy or the secret is unset — check the
     `deploy-edge-functions` workflow run. If we are on a feature branch, that is
     expected until it merges.

3. If the `edge-live` tag does NOT exist yet (deploy CI has not recorded a baseline —
   e.g. it has not run since being added, or the `SUPABASE_ACCESS_TOKEN` secret is not
   set): say so plainly. Do NOT guess. Offer to spot-check specific functions against
   prod with `mcp__Supabase__get_edge_function` + a byte diff (token-heavy — only on
   request, for named functions).

Do not deploy anything from this command — it is read-only reporting. Deploys happen
via the `deploy-edge-functions` workflow on merge to `main`.
