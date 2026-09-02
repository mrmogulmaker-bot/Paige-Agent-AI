# PAIGE Spine foundation

This foundation is a governed seam across the existing Solo product. It does not create a second Rail, event bus, memory store, approval store, or PAIGE workspace.

## Canonical contract

`supabase/functions/_shared/paige-spine/registry.ts` is the canonical capability registry. A domain-owned declaration must name:

- one stable capability key and domain owner;
- the existing human surface;
- exact server-side evidence, action, and outcome symbols;
- evidence audience, freshness, safe fact keys, and projection visibility window;
- action classification, exact Chat tool, idempotency, canonical risk policy, and approval authority;
- Chat and Mind binding maturity;
- either `NONE` or an approved Spine Change Request identifier for shared primitives.

The registry fails closed at import and in CI. A mutable or external-effect capability must have a `LIVE` Chat binding, an exact Chat tool mapped to `ordinary` or `high` in Chat's canonical action-risk policy, `chat-canonical` approval authority, and idempotency. `prepare` is not an action class: consequence previews are preconditions to the separately gated action, never a second approval. A declaration alone does not make a capability live.

## First vertical slice

`pipeline.deal_stage_evidence` reads existing successful Pipeline deal-stage outcomes from `paige_client_events`. Direct authenticated Rail access stays revoked. A narrowly granted SECURITY DEFINER safe lens pins its search path, requires a live authenticated caller, resolves the active tenant on the server, checks the canonical staff role, addresses the client by its immutable public-safe `account_number`, and emits only the fixed Spine fields. Raw Rail title, summary, payload, user identifiers, internal deal identifiers, and stage content remain behind the boundary.

The `tenant_id`, signal UUID, and opaque `rail:` references in the contract are server-consumer scope/provenance evidence, not presentation copy. The 365-day value is a safe projection visibility window; source Rail retention remains independently domain-owned.

This slice is `PARTIAL`: evidence is registered and has targeted runtime proof, but Chat and Mind bindings are `UNAVAILABLE`. It intentionally registers no Pipeline mutation. Pipeline currently has domain-held move-approval semantics; a Chat-owned reconciliation is required before any mutation can join the Spine.

## Domain self-service

A domain owner may add its own declaration and safe adapter in a later immutable migration without modifying another domain when all of these remain true:

1. the human surface and durable source already exist;
2. tenant context is server-resolved and any privileged safe lens recreates the source authorization boundary explicitly;
3. only reviewed fixed fields and declared scalar fact keys cross the boundary;
4. no shared registry schema, resolver semantics, approval authority, or Chat routing rule changes;
5. the domain adds focused registry, SQL contract, real-role isolation, and regression tests;
6. maturity stays truthful until authenticated end-to-end proof exists.

## Spine Change Request

A Spine Change Request is required before changing a shared primitive: registry schema, resolver result semantics, safe signal fields, lifecycle vocabulary, approval authority, Chat adapter contract, or projection-window interpretation.

The request must include: requested change; affected domains and flows; collision packet with current exact heads; tenant and sensitivity analysis; compatibility and migration plan; tests and rollback; Chat-owner review for any action/approval change; and owner Gate 1 approval. Implementation and release remain separate authority gates.
