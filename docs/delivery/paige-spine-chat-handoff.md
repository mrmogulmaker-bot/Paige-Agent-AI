# PAIGE Spine to Chat handoff

## Collision grounding

- Foundation base: `origin/main` at `83ab5120e664512e1f14371764014a4535df1250` when implementation began.
- Active Chat/Spine head inspected: `origin/codex/paige-knowledge-active-tenant-isolation-v2` at `6cf2386622980df97c4d55061528094680f5a95b`.
- Their merge base was the foundation base. The active Chat branch owns the Chat handler, tool baseline, direct guard, and one-approval guard. This branch edits none of those files.

## Canonical seam

- Registry: `supabase/functions/_shared/paige-spine/registry.ts`
- Resolver: `supabase/functions/_shared/paige-spine/resolveEvidence.ts`
- First capability: `pipeline.deal_stage_evidence`
- Server adapter: `public.get_pipeline_spine_evidence`
- Human surface: `/solo/:account/growth/pipeline`
- Durable source/outcome: existing `paige_client_events`
- Client selector: immutable public-safe `clients.account_number`

## Required small Chat-owner reconciliation

After the active Chat branch and this foundation are reconciled, the Chat owner should:

1. repoint `scripts/ci/chat-tool-registry-lint.mjs` from its inline no-growth baseline to the canonical registry and remove its stale “no Spine registry exists” claim;
2. keep its direct Chat guard and one-approval guard as the enforcement boundary;
3. add a read-only Chat adapter that calls `resolveSpineEvidence` with server-derived account context and an explicit client reference;
4. expose only the resolver result and preserve generic unavailable responses;
5. keep Pipeline mutation unregistered until Pipeline's domain-held approval record is reconciled with Chat's canonical action-risk plus confirmation gate;
6. add authenticated owner, ordinary-member, account-switch, retry/error, and cross-tenant end-to-end proof.

## Truthful status

- Registry and safe evidence adapter: implemented in this foundation.
- Pipeline evidence capability: `PARTIAL`.
- Chat binding: `UNAVAILABLE` until the Chat owner completes and proves the adapter.
- Mind binding: `UNAVAILABLE`.
- Pipeline mutation through the Spine: `UNAVAILABLE`.
- Provider, preview, production, merge, and deployment proof: not claimed by this handoff.
