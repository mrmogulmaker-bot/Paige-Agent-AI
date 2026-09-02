# PAIGE Spine foundation

This foundation is a governed seam across the existing Solo product. It does not create a second Rail, event bus, memory store, approval store, or PAIGE workspace.

## Canonical contract

`supabase/functions/_shared/paige-spine/registry.ts` is the canonical capability registry. A domain-owned declaration must name:

- one stable capability key and domain owner;
- the existing human surface;
- exact server-side evidence, action, and outcome symbols;
- evidence audience, freshness, and retention;
- action classification, idempotency, risk policy, and approval authority;
- Chat and Mind binding maturity;
- either `NONE` or an approved Spine Change Request identifier for shared primitives.

The registry fails closed. Any mutating or external-effect capability must declare `chat-canonical` approval authority, idempotency, and a risk policy key. A declaration alone does not make a capability live.

## First vertical slice

`pipeline.deal_stage_evidence` reads existing successful Pipeline deal-stage outcomes from `paige_client_events`. The adapter is SECURITY INVOKER, resolves tenant scope from the authenticated caller, addresses the client by its immutable public-safe `account_number`, and emits only the fixed Spine signal fields. Raw Rail title, summary, payload, user identifiers, internal deal identifiers, and stage content remain behind the boundary.

This slice is `PARTIAL`: evidence is registered, but Chat and Mind bindings are `UNAVAILABLE`. It intentionally registers no Pipeline mutation. Pipeline currently has domain-held move-approval semantics; a Chat-owned reconciliation is required before any mutation can join the Spine.

## Domain self-service

A domain owner may add its own declaration and safe adapter without modifying another domain when all of these remain true:

1. the human surface and durable source already exist;
2. tenant context is server-resolved and the adapter is protected by source RLS;
3. only reviewed fixed fields cross the boundary;
4. no shared registry schema, resolver semantics, approval authority, or Chat routing rule changes;
5. the domain adds focused registry, SQL contract, real-role isolation, and regression tests;
6. maturity stays truthful until authenticated end-to-end proof exists.

## Spine Change Request

A Spine Change Request is required before changing a shared primitive: registry schema, resolver result semantics, safe signal fields, lifecycle vocabulary, approval authority, Chat adapter contract, or retention interpretation.

The request must include: requested change; affected domains and flows; collision packet with current exact heads; tenant and sensitivity analysis; compatibility and migration plan; tests and rollback; Chat-owner review for any action/approval change; and owner Gate 1 approval. Implementation and release remain separate authority gates.
