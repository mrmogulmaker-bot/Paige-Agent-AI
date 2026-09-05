# Paige Memory — the governed continuity contract

**Read before any work that stores, retrieves, corrects, or deletes something Paige is meant to
REMEMBER across turns or sessions.** Memory is one of four distinct concepts and they must not be
merged into one unbounded store:

| Concept | What it holds | Where it lives |
|---|---|---|
| **Rail** | ACTIVITY — what happened, attributable, audience-scoped | `paige_client_events` / `paige_workspace_events` (browser-denied; read via resolvers) |
| **Spine** | safe CURRENT evidence — status/provenance a model may see now | per-capability adapters → the 19-key SpineSignal (`resolveEvidence.ts`) |
| **Mind** | curated usable KNOWLEDGE | the Spine evidence projection (PARTIAL: one live capability) + `SoloMindWorkspace` |
| **Memory** | CONTINUITY — durable facts, decisions, commitments, corrections, preferences, agent lessons | **this doc** |

## The store (extend, never fork — §18)

Memory has homes already; Release C (2026-09-05, migration `20261223000000`) added the governed
CALLABLE SEAM over them, not a new table:

- **Workspace memory** → `public.paige_owner_memory`, `(tenant_id, user_id)`-scoped; operator (God)
  rows are tenant-less (`tenant_id IS NULL`, read via the `is_platform_owner()` RLS branch). The §8
  Owner-Ops sibling of `client_memory`.
- **Client memory** → `public.client_memory` (Client-Experience team; tenant derived via
  `clients.tenant_id`, RESTRICTIVE). Governance complete; **not touched by Release C.**
- **Conversation memory** → `paige_owner_memory` via `memory_type ∈ {decision, commitment,
  correction}`. **Never raw transcript** — the per-thread rolling summary stays in
  `paige_chat_threads.summary`.
- **Agent memory** → `paige_owner_memory` via `memory_type ∈ {agent_outcome, agent_lesson}`. Scoped
  task outcomes + lessons ONLY — never hidden reasoning or an unrestricted scratchpad.

`paige_owner_memory.memory_type` is OPEN VOCAB (no DB CHECK) by design (§10 config-as-data); the
governed seam enumerates the allowed types so the store cannot become a raw event dump.

## The governed seam (the §10 callable contract — migration `20261223000000`)

All three are `SECURITY DEFINER`, `search_path=public`, **anon-revoked**, `authenticated` +
`service_role` only, and resolve caller scope IN-BODY (§59/§45): a JWT caller is confined to
`auth.uid()` + `current_user_tenant_id()` and its `p_user_id`/`p_tenant_id` arguments are IGNORED; a
`service_role` caller (Paige's headless agent, which resolved scope server-side) passes them.

| Function | Purpose | Governance fields it realizes |
|---|---|---|
| `record_paige_memory(p_memory_type, p_content, p_source_thread_id?, p_metadata?, p_supersede_prior?, p_confirmation_state?, [p_user_id, p_tenant_id]*)` | governed WRITE | source (`source_thread_id` + `created_by`, which is **NULL for the service/system seam**, never the subject), scope (server-resolved `tenant_id`+`user_id`), timestamp (`created_at`), visibility (RLS + `memory_type` audience), **correction** (`p_supersede_prior` marks prior active rows of the same (scope,type) inactive), **confirmation** (`p_confirmation_state ∈ {proposed,confirmed,corrected,retired}`, default `proposed`, merged into `metadata` so an inference is never stored as truth) |
| `get_paige_memory(p_memory_types?, p_limit?, [p_user_id, p_tenant_id]*)` | governed READ — server-resolved scope + audience filter, own rows only | scope, visibility. **Returns `metadata`** so `confirmation_state`/provenance are readable. Semantic recall stays `match_paige_owner_memory`. |
| `forget_paige_memory(p_id, [p_user_id, p_tenant_id]*)` | governed DELETION — soft-delete (`is_active=false`) of the caller's OWN row, scoped to its resolved `(user, tenant)` | **deletion/retention** — a `service_role` caller passes both and CANNOT wildcard across the tenants a user belongs to |

`*` = honored only for `service_role`. Uses `IS NOT DISTINCT FROM` on `tenant_id` so a tenant-less
operator's NULL-tenant rows match (avoiding the `=`-on-NULL trap `match_paige_owner_memory` documents).

## Every memory item carries the six governance fields (+ confirmation)

source · scope · timestamp/freshness · visibility · correction path · deletion/retention — realized
as the table above maps them — PLUS a confidence/**confirmation** field (`metadata.confirmation_state`,
the Relationship Context contract Layer 2 field that keeps an inference from masquerading as truth).
A memory write that skips the seam and hand-builds a row (raw INSERT via the RLS policy) is legal but
bypasses the vocab + correction + confirmation discipline; prefer the seam.

## Proof + honest state (§13/§32)

- **Migration `20261223000000` — pre-merge `BEGIN..ROLLBACK` behavioral proof on prod
  (`xygzykjyynhzqytbqnzu`, re-run 2026-09-05 after the Codex peer-review fixes):** DDL executes;
  `record_paige_memory` is `SECURITY DEFINER` with `search_path=public`; **anon cannot EXECUTE** any
  of the three, `authenticated`/`service_role` can. Behaviorally proven end-to-end (all green,
  then rolled back): a service write stamps `confirmation_state='proposed'` by default and
  `created_by=NULL`; an explicit `confirmed` is honored and an invalid state is rejected;
  `get_paige_memory` returns `metadata` carrying `confirmation_state`; `forget_paige_memory` from a
  service caller with a MISMATCHED tenant does NOT delete (P1) while the matching tenant does; a JWT
  caller's spoofed `p_user_id`/`p_tenant_id` are ignored and `created_by` is stamped to the actor
  (§59); a JWT caller with no resolvable workspace is refused **42501**. Non-persistence confirmed
  (`memory_fns_on_prod=[]`, `proof_test_rows_persisted=0`). The **persisted-apply is CI's**
  (`deploy-migrations.yml` on merge → `migration list` verify → `db-live`); do not hand-apply (§24/§32.a).
- **DEFERRED, labeled not delivered:** the chat-runtime AUTO-WRITE of conversation/agent memory (slice
  4b) is NOT wired — this ships the seam it will call; a capable caller (Paige's MCP agent) can drive it
  now. Semantic recall of the new types via `match_paige_owner_memory` is available but unwired into chat.
- **Follow-ups (filed, not folded in):** `match_paige_memory` (CLIENT-memory recall) carries a §59
  global-role trap (latent — callers pass authorized ids; a different table/audience with its own §37
  producer set); GDPR bulk hard-delete of owner/prompt memory via `process-data-deletion` (self-serve
  `forget` ships now). `match_paige_owner_memory`'s NULL-tenant `=` filter is a documented latent trap
  for a future operator semantic-recall path.

**Cross-references:** §7 (memory is the moat) · §8 (Owner-Ops vs Client audiences) · §9/§51 (tenant
isolation) · §10 (callable seam) · §18 (one home) · §59 (in-body caller scope) · §26 (voyage-3 @1024,
the one embedding space) · `docs/doctrine/L8-memory-fabric-workstream.md` · `decision-log.md`
(Release C entry).
