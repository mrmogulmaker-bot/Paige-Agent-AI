# Connected MCP Capability Gateway — Phase S delivery package

**Owner-approved 2026-09-14.** Server/schema-first, **additive and non-destructive**. This is the
release-ready package for the owner's final merge/deploy decision. Phase C (chat-facing) stays parked
pending #1255 resolution or an explicit collision decision.

Companion docs: the review + collision decision (`docs/architecture/paige-connected-mcp-capability-gateway-review.md`
§14/§15) and the `forget_paige_workflow` compatibility decision (`docs/delivery/phase-s-forget-paige-workflow-decision.md`).

## What shipped (all additive)

| Artifact | What it is |
|---|---|
| `supabase/migrations/20270319000000_connected_mcp_gateway_registry.sql` | `mcp_providers` descriptor (DATA, not an enum; seeded `generic-remote` no-op + `n8n` + `zapier`); `mcp_connections` (**immutable `connection_id`** PK, many-per-tenant, many-per-provider, `label` mutable/`UNIQUE(tenant,provider,label)`); child tables `mcp_connection_tools` / `_approvals` / `_receipts` (namespaced by `connection_id`); an additive nullable `connection_id` on `paige_workspace_events`; dual-read RPCs; **1:1 idempotent, non-destructive backfill** from both legacy stores; owner-only RLS + service-role-only decrypt/probe, mirroring the audited `tenant_mcp_connections` seam. |
| `supabase/functions/_shared/mcp-gateway/types.ts` | Provider-agnostic types (no n8n|zapier enum). |
| `…/mcp-gateway/intake.ts` | Safe **read-only** intake (initialize + tools/list + fingerprint + health; never a mutating tools/call). |
| `…/mcp-gateway/capability-summary.ts` | Server-generated **model-safe** capability summary (names/effects/counts/labels only; never raw provider descriptions or schemas; drops non-identifier tool names). |
| `…/mcp-gateway/runner.ts` | Generic connection-parameterized runner; read/prepare always allowed; external effects execute **after owner approval** (approval is the gate, never "unavailable"); pin-drift refusal; verify-and-invoke in one session; no auto-retry. |
| `scripts/mcp-gateway-smoke.mjs` + `package.json` + `.github/workflows/ci.yml` | Headless smoke (27 assertions) wired as `smoke:mcp-gateway` in CI. |

## How the owner's requirements are met

- **Many connections per tenant, many per provider** — `mcp_connections.connection_id` is the identity; `UNIQUE(tenant_id, provider_key, label)` allows two GHL/Meta/n8n connections under one tenant.
- **No singletons / no n8n-only model** — provider is a descriptor row (no enum); a seeded `generic-remote` makes a curated descriptor optional (connect to any compatible MCP). Legacy singleton stores are read-only sources, untouched.
- **Connection-keyed everything** — tools, approvals, receipts, and (additively) workspace-Rail receipts all carry `connection_id`.
- **1:1 non-destructive backfill** — one `connection_id` per existing `tenant_mcp_connections (tenant,provider)` row and per `tenant_n8n_connections` row; approvals migrate only with a real stored pin (no fake pins; §58 never silently grants); n8n workflow approvals/marks/pin/leases/gens preserved in `provider_state`. Legacy rows are only read.
- **Historical receipts unlinked, new records carry the reference** — `paige_workspace_events.connection_id` is nullable; history stays NULL; the connection-scoped receipt writer sets it.
- **Provider authority = surface; approval = gate** — the runner imposes no allowlist/read-ceiling; it refuses an unapproved mutation as `approval_required`, never as unavailable (owner ruling §2.2).
- **`forget_paige_workflow`** — surfaced as a separate compatibility decision, **not defined/removed/hidden** here.

## Evidence, separated by class (§70.1 / §32)

- **Automated test (headless):** `smoke:mcp-gateway` — **27/27 PASS** against a real lifecycle-enforcing fake MCP server: intake is read-only + degrades honestly (401 → needs_attention) + SSRF-refuses a private address; capability summary carries no raw description/schema, drops the hostile tool name, and sanitizes `app`/`actionType`; runner enforces read/prepare-always, approval-required-not-unavailable, **fail-closed on undeclared effects**, executes on a matching pin, refuses a drifted pin / a no-longer-offered tool, reports provider_unavailable, records receipts without leaking the credential. **Regression:** `smoke:mcp-transport` + `smoke:mcp-registry` still **PASS** (legacy client untouched). `test:deno-ratchet` **145/0 PASS** with the new Deno modules.
- **Static / build:** `lint:migration-versions`, `lint:definer-fns`, `lint:managed-schema`, `lint:rail-grants`, `lint:mcp-governed-door`, `lint:integration-registry`, `lint:action-risk` — **all PASS**. `eslint` clean on the new files. `esbuild` bundles all three modules (imports resolve). Every legacy column the backfill references was confirmed to exist in the migrations.
- **Authenticated runtime / production:** **NONE — and none was in scope.** No provider was configured or called; the migration was not applied to prod.
- **OWED (honest):**
  - **Migration persisted-apply on prod (§32.a)** — owed to the `deploy-migrations` pipeline on merge to `main` (push → `supabase db push` → `migration list` verify → `db-live` tag). `premerge-migration-proof` applies the migration on a fresh restore of prod's **current** schema on the PR (a real apply-against-real-shape proof), and the Supabase **preview branch already applied it green** (Migrations ✅). The backfill DO block runs at apply time.
  - **§208 live current-state artifact (`\d`)** — this session lacks DB-introspection permission (Supabase MCP denied), so a live `\d` is not pasted here. Mitigation: every backfilled column was independently traced to its defining migration (compliance review), and `premerge-migration-proof` fails if any referenced column is missing/mismatched on prod's real schema. Owed as a pasted artifact if the owner wants it before merge.
  - **Automated per-tier DB isolation test** — a `BEGIN..ROLLBACK`/pgTAP proof driving the cross-tenant / service-role-only / anon-denied paths of the new RPCs. Not shipped in this PR (no local Postgres to validate a new pgTAP file; shipping an unvalidated gated test risks a false CI red). Mitigation: all six RPCs re-enforce caller scope in-body via the **audited `_mcp_resolve_tenant` seam** (itself proven by `supabase/tests/team_authority_readiness.sql` et al.) and were **adversarially confirmed** §59-correct; the static grant/DEFINER/RLS invariants are asserted by `lint:definer-fns` + `lint:managed-schema`. Recommended as a fast follow-up test wired into `paige-spine-contract.yml`.
  - **Runner/intake against a real provider** — Phase C (contacting a provider is out of Phase S scope); proven here only against the in-process fake.
- **Inherited failures, NOT Phase S (the `ci / verify` red):** two checks are red on `main` independent of this PR — (1) `lint:views` (`public.paige_unclassified_inbound`, `20270115000000` / PR #1208 — my migration adds zero views), and (2) `test:knowledge-scope` + the §9 governance suite (the owner-parked **Chat/Knowledge regression #1255** — I touched neither `paige-ai-chat` nor `scripts/knowledge-scope/*`). Both reproduce on pristine `main`; `test:deno-ratchet` passes with my modules and zero `src/` files changed, so Phase S adds no new `verify` failure. Owned by the conversation-labels / Layer C lane and the Chat/Knowledge lane respectively.

## Independent review (§1/§39/§5) — outcomes & fixes applied

Two independent reviewers read the real pushed diff. The **compliance officer found NO blocker** (additive/non-destructive, §59-correct, no cross-tenant reach, honest evidence separation, correct per-tier matrix). The **adversarial verifier found one BLOCKER + one MAJOR**; both are **fixed in this PR**:

- **BLOCKER (fixed)** — the backfill could raise a `UNIQUE(tenant_id, provider_key, label)` violation for a tenant holding **both** n8n facets (OAuth + API-key) if their labels coincided, aborting the migration. Fixed with a deterministic collision-free label picker (`_mcp_gw_free_label`, dropped after backfill); no legacy connection is dropped (§58).
- **MAJOR (fixed)** — the runner auto-ran a tool with an **undeclared effect set** as a read, with no approval. Fixed to **fail closed**: undeclared effects require owner approval (`effects_undeclared`), never auto-execute.
- **MINORs (fixed)** — `mcp_providers` SELECT scoped `TO authenticated` (was anon-reachable); `app`/`actionType` sanitized before reaching the model; `visibility='owner_only'` now enforced in `get_mcp_connections_v2`; corrected a dangling doc path.
- **Evidence-gate MAJORs (compliance)** — the §208 live artifact and the automated per-tier DB test are recorded as **OWED** above with their mitigations (not silently skipped).

## Boundaries respected (Phase S stop conditions)

No provider calls · no workflow execution · no provider-permission change · **`paige-ai-chat/index.ts` untouched** · **`scripts/knowledge-scope/*` untouched** · every legacy `tenant_mcp_connections` / `tenant_n8n_connections` table, RPC, and trigger left live and unaltered · no merge, no deploy (draft PR only).

## Merge/deploy recommendation

The change is additive, non-destructive, headless-proven, and CI-gated. **Recommended:** merge once PR CI is green; on merge, `deploy-migrations` applies the migration and yields the §32.a persisted proof. **Honest note:** the new `_shared/mcp-gateway/*` modules are not imported by any deployed edge function in Phase S, so no edge function redeploys — they are proven library code awaiting Phase C wiring. The `lint:views` inherited red is a separate lane's pre-existing condition, not a Phase S regression. **The merge/deploy decision is the owner's.**

## Release closeout (2026-09-14) — MERGED + MIGRATION PERSISTED

**Owner authorized** the merge/deploy on exact head `573f8a3`, accepting the aggregate `ci / verify` red **only** on the proven basis that it is limited to the inherited `lint:views` (#1208) + owner-parked `test:knowledge-scope` (#1255) failures with **zero Phase S contribution**, under a guarded gate (stop + re-gate on any head change, new required-check failure, new review finding, or base conflict).

- **Merged:** PR [#1258](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/1258) squash-merged to `main` as **`6c745007d6ecdf982558fe9f217203c219ced49a`** (guarded merge pinned to `expectedHeadSha=573f8a3`; the gate held — head unchanged, no conflict, no new review finding, `verify` red confirmed inherited-only).
- **`verify` at merge (proven inherited-only this session):** (1) `lint:views` fails for `public.paige_unclassified_inbound` (from `20270115000000`, PR #1208) — reproduced locally; this PR adds zero views. (2) `test:knowledge-scope` = **357 passed, 1 failed** (assertion `15.9 a switched document turn makes no provider call at all` — the owner-parked #1255); this PR touches neither `paige-ai-chat` nor `scripts/knowledge-scope/*`. All 8 migration/registry lints my additive diff could trip (`managed-schema`, `definer-fns`, `migration-versions`, `rail-grants`, `write-targets`, `action-risk`, `mcp-governed-door`, `mcp-destructive-confirm`) PASS locally; `smoke:mcp-gateway` 27/27 passed in CI. `verify` goes red despite the smokes passing because every step carries `if: ${{ !cancelled() }}` (a failed step does not halt the job).
- **§32.a MIGRATION PERSISTED:** `deploy-migrations` **run #272** (`34854701050`) **success** on `6c745007` — "Push migrations to prod" (`supabase db push`, 12s) + **"Verify prod is caught up (PERSISTED, not just ran — §32)"** both green; the `supabase migration list` output records **`20270319000000`** in prod's remote column and the step printed **`✓ prod schema_migrations is caught up with the repo`**. **`db-live` moved `c81e33bb → 6c745007`**; `git diff db-live..origin/main -- supabase/migrations/**` is **empty (zero drift)**. Object existence is transitively proven (`db push` records a version only after that migration's SQL runs to completion; the "Alert on failed prod apply" step was **skipped**).
- **Edge deploy — clean NO-OP:** `deploy-edge-functions` **run #325** (`34854701116`) **success**; the affected-function set was **empty** (Setup/Deploy/Record steps skipped), so **zero functions redeployed** and `edge-live` was **not moved** — correct, because the new `_shared/mcp-gateway/*` modules are imported by no deployed function (proven library code awaiting Phase C wiring).
- **`forget_paige_workflow`:** owner decision **C** — resync fallback left unchanged in Phase S; the define/remove follow-up (Option A) is tracked as issue [#1260](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/1260), owned by the n8n/registry lane. See `docs/delivery/phase-s-forget-paige-workflow-decision.md`.
- **Still OWED (honest, unchanged by this release):** (a) the **§208 direct prod `\d`/object SELECT artifact** — this session's Supabase MCP prod SQL is **permission-denied** (confirmed again on a read this session), so the finer object-granularity confirmation is owed to a prod-SQL-capable session; the pipeline's PERSISTED-verify + `db-live` advance + zero drift is the migration-persistence proof. (b) an **automated per-tier DB isolation pgTAP** wired into `paige-spine-contract.yml`. (c) **runner/intake against a real provider** — Phase C.
- **Boundaries held through the release:** no provider calls · no workflow execution · no provider-permission change · `paige-ai-chat` untouched · `scripts/knowledge-scope/*` untouched · legacy `tenant_mcp_connections` / `tenant_n8n_connections` stores/RPCs/triggers left live and unaltered. **Phase S builds the multi-connection foundation only; it does NOT make Chat use connected MCP tools. Phase C stays PARKED pending #1255.**
