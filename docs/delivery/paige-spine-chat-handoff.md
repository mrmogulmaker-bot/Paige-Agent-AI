# PAIGE Spine to Chat handoff

## Collision grounding

- Foundation base: `origin/main` at `83ab5120e664512e1f14371764014a4535df1250` when implementation began.
- Active Chat/Spine head inspected: `origin/codex/paige-knowledge-active-tenant-isolation-v2` at `6cf2386622980df97c4d55061528094680f5a95b`.
- Their merge base was the foundation base. The active Chat branch owns the Chat handler, tool baseline, direct guard, action-risk policy, and one-approval guard. This branch edits none of those files.

## Canonical seam

- Registry: `supabase/functions/_shared/paige-spine/registry.ts`
- Resolver: `supabase/functions/_shared/paige-spine/resolveEvidence.ts`
- First capability: `pipeline.deal_stage_evidence`
- Server adapter: `public.get_pipeline_spine_evidence`
- Human surface: `/solo/:account/growth/pipeline`
- Durable source/outcome: existing `paige_client_events`; direct authenticated table access stays revoked
- Client selector: immutable public-safe `clients.account_number`

## Required small Chat-owner reconciliation

After the active Chat branch and this foundation are reconciled, the Chat owner should:

1. repoint `scripts/ci/chat-tool-registry-lint.mjs` from its inline no-growth baseline to the canonical registry and remove its stale “no Spine registry exists” claim;
2. keep its direct Chat guard, canonical action-risk policy, and one-approval guard as the enforcement boundary;
3. add a read-only Chat adapter that calls `resolveSpineEvidence` with an explicit client reference and an opaque account-scope generation check;
4. clear prior evidence on account switch and discard any in-flight response whose scope is no longer current;
5. expose only the validated resolver result and preserve generic unavailable responses;
6. keep Pipeline mutation unregistered until Pipeline's domain-held approval record is reconciled with Chat's canonical action-risk plus confirmation gate;
7. add authenticated owner, ordinary-member, account-switch, retry/error, abandonment, and cross-tenant end-to-end proof.

## Truthful status

- Registry and hardened safe evidence lens: implemented with focused and targeted local runtime proof.
- Pipeline evidence capability: `PARTIAL`.
- Chat binding: `UNAVAILABLE` until the Chat owner completes and proves the adapter.
- Mind binding: `UNAVAILABLE`.
- Pipeline mutation through the Spine: `UNAVAILABLE`.
- Combined-head semantic CI: `BLOCKED` until the Chat owner completes step 1; there is no textual file conflict.
- Clean full Supabase-history replay: `UNVERIFIED` on the implementation host because its Supabase Docker runtime is absent; the draft workflow now requires it.
- Provider, authenticated preview, production, merge, and deployment proof: not claimed by this handoff.
