# PAIGE Spine to Chat handoff

## Collision grounding

- Foundation base: `origin/main` at `83ab5120e664512e1f14371764014a4535df1250` when implementation began.
- Active Chat/Spine head inspected: `origin/codex/paige-knowledge-active-tenant-isolation-v2` advanced during reconciliation and was preserved at `b4fb9f1d52ba34755439d3572e79e0b86128942c`.
- Their merge base was the foundation base. The active Chat branch owns the Chat handler, tool baseline, direct guard, action-risk policy, and one-approval guard. The integration branch starts from that exact active Chat head and layers the reviewed Foundation commits above it, preserving the newer handler, team, action-risk, and authorization repairs.

## Canonical seam

- Registry: `supabase/functions/_shared/paige-spine/registry.ts`
- Resolver: `supabase/functions/_shared/paige-spine/resolveEvidence.ts`
- First capability: `pipeline.deal_stage_evidence`
- Server adapter: `public.get_pipeline_spine_evidence`
- Human surface: `/solo/:account/growth/pipeline`
- Durable source/outcome: existing `paige_client_events`; direct authenticated table access stays revoked
- Client selector: immutable public-safe `clients.account_number`

## Completed bounded Chat-owner reconciliation

The combined branch now:

1. repoints `scripts/ci/chat-tool-registry-lint.mjs` from its inline no-growth baseline to the canonical registry and removes its stale “no Spine registry exists” claim;
2. keeps its direct Chat guard, canonical action-risk policy, and one-approval guard as the enforcement boundary;
3. adds a read-only Chat adapter that calls `resolveSpineEvidence` with an explicit client reference and an opaque account-scope generation check;
4. relies on the existing UI request fence to clear prior evidence on account switch and discard any in-flight response whose scope is no longer current;
5. exposes only the validated resolver result and preserves generic unavailable responses;
6. keeps Pipeline mutation unregistered until Pipeline's domain-held approval record is reconciled with Chat's canonical action-risk plus confirmation gate;
7. adds structural and focused runtime coverage for safe rendering, generic unavailable behavior, caller-scoped resolution, and account-switch discard. Authenticated owner, ordinary-member, retry/error, abandonment, and cross-tenant preview proof remain required before `LIVE`.

## Future-agent extension process

Ordinary domain additions follow the domain self-service lane in `docs/architecture/paige-spine-foundation.md`; shared registry/resolver/approval semantics use the Spine Change Request lane. Each agent must leave the required exact-head, collision, evidence, and authority handoff packet.

## Truthful status

- Registry and hardened safe evidence lens: implemented with focused and targeted local runtime proof.
- Pipeline evidence capability: `PARTIAL`.
- Chat binding: `PARTIAL`; the read-only adapter and fail-closed contract are implemented and structurally/focused-runtime verified, but authenticated preview proof remains `UNVERIFIED`.
- Mind binding: `UNAVAILABLE`.
- Pipeline mutation through the Spine: `UNAVAILABLE`.
- Combined-head semantic CI: local verification is recorded on the combined branch; GitHub draft checks remain `UNVERIFIED` until publication.
- Clean full Supabase-history replay: `UNVERIFIED` on the implementation host because its Supabase Docker runtime is absent; the draft workflow now requires it.
- Provider, authenticated preview, production, merge, and deployment proof: not claimed by this handoff. Deployment is owner-authorized, but the canonical workflow is main-triggered, so merge remains a separate owner gate after a green draft.
