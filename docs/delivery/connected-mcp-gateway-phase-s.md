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
| `scripts/mcp-gateway-smoke.mjs` + `package.json` + `.github/workflows/ci.yml` | Headless smoke (24 assertions) wired as `smoke:mcp-gateway` in CI. |

## How the owner's requirements are met

- **Many connections per tenant, many per provider** — `mcp_connections.connection_id` is the identity; `UNIQUE(tenant_id, provider_key, label)` allows two GHL/Meta/n8n connections under one tenant.
- **No singletons / no n8n-only model** — provider is a descriptor row (no enum); a seeded `generic-remote` makes a curated descriptor optional (connect to any compatible MCP). Legacy singleton stores are read-only sources, untouched.
- **Connection-keyed everything** — tools, approvals, receipts, and (additively) workspace-Rail receipts all carry `connection_id`.
- **1:1 non-destructive backfill** — one `connection_id` per existing `tenant_mcp_connections (tenant,provider)` row and per `tenant_n8n_connections` row; approvals migrate only with a real stored pin (no fake pins; §58 never silently grants); n8n workflow approvals/marks/pin/leases/gens preserved in `provider_state`. Legacy rows are only read.
- **Historical receipts unlinked, new records carry the reference** — `paige_workspace_events.connection_id` is nullable; history stays NULL; the connection-scoped receipt writer sets it.
- **Provider authority = surface; approval = gate** — the runner imposes no allowlist/read-ceiling; it refuses an unapproved mutation as `approval_required`, never as unavailable (owner ruling §2.2).
- **`forget_paige_workflow`** — surfaced as a separate compatibility decision, **not defined/removed/hidden** here.

## Evidence, separated by class (§70.1 / §32)

- **Automated test (headless):** `smoke:mcp-gateway` — **24/24 PASS** against a real lifecycle-enforcing fake MCP server: intake is read-only + degrades honestly (401 → needs_attention) + SSRF-refuses a private address; capability summary carries no raw description/schema and drops the hostile tool name; runner enforces read/prepare-always, approval-required-not-unavailable, executes on a matching pin, refuses a drifted pin / a no-longer-offered tool, reports provider_unavailable, records receipts without leaking the credential. **Regression:** `smoke:mcp-transport` + `smoke:mcp-registry` still **PASS** (legacy client untouched).
- **Static / build:** `lint:migration-versions`, `lint:definer-fns`, `lint:managed-schema`, `lint:rail-grants`, `lint:mcp-governed-door`, `lint:integration-registry`, `lint:action-risk` — **all PASS**. `eslint` clean on the new files. `esbuild` bundles all three modules (imports resolve). Every legacy column the backfill references was confirmed to exist in the migrations.
- **Authenticated runtime / production:** **NONE — and none was in scope.** No provider was configured or called; the migration was not applied to prod.
- **OWED (honest):**
  - **Migration persisted-apply on prod (§32.a)** — owed to the `deploy-migrations` pipeline on merge to `main` (push → `supabase db push` → `migration list` verify → `db-live` tag). `premerge-migration-proof` gives the pre-merge rollback proof on the PR. The backfill DO block executes at apply time; it is proven here only by static column-existence + logic review.
  - **Runner/intake against a real provider** — Phase C (contacting a provider is out of Phase S scope); proven here only against the in-process fake.
- **Inherited failure, NOT Phase S:** `lint:views` is **red on pristine `origin/main`** (`public.paige_unclassified_inbound`, from `20270115000000` / PR #1208). My migration adds zero views; the failure reproduces without my change. Owned by the conversation-labels / Layer C lane, not this workstream.

## Boundaries respected (Phase S stop conditions)

No provider calls · no workflow execution · no provider-permission change · **`paige-ai-chat/index.ts` untouched** · **`scripts/knowledge-scope/*` untouched** · every legacy `tenant_mcp_connections` / `tenant_n8n_connections` table, RPC, and trigger left live and unaltered · no merge, no deploy (draft PR only).

## Merge/deploy recommendation

The change is additive, non-destructive, headless-proven, and CI-gated. **Recommended:** merge once PR CI is green; on merge, `deploy-migrations` applies the migration and yields the §32.a persisted proof. **Honest note:** the new `_shared/mcp-gateway/*` modules are not imported by any deployed edge function in Phase S, so no edge function redeploys — they are proven library code awaiting Phase C wiring. The `lint:views` inherited red is a separate lane's pre-existing condition, not a Phase S regression. **The merge/deploy decision is the owner's.**
