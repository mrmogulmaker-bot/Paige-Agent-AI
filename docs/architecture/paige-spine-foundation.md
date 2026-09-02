# PAIGE Spine foundation

This foundation is a governed seam across the existing Solo product. It does not create a second Rail, event bus, memory store, approval store, or PAIGE workspace.

## Canonical contract

`supabase/functions/_shared/paige-spine/registry.ts` is the canonical capability registry. A domain-owned declaration must name:

- one stable capability key and domain owner;
- the existing human surface;
- exact server-side evidence, action, and outcome symbols;
- evidence audience, freshness, exact safe field/fact values, and projection visibility window;
- action classification, exact Chat tool, idempotency, canonical risk policy, and approval authority;
- Chat and Mind binding maturity;
- either `NONE` or an approved Spine Change Request identifier for shared primitives.

The registry fails closed at import and in CI. A mutable or external-effect capability must have a `LIVE` Chat binding, an exact Chat tool mapped to `ordinary` or `high` in Chat's canonical action-risk policy, `chat-canonical` approval authority, and idempotency. `prepare` is not an action class: consequence previews are preconditions to the separately gated action, never a second approval. A declaration alone does not make a capability live.

## First vertical slice

`pipeline.deal_stage_evidence` reads existing successful Pipeline deal-stage outcomes from `paige_client_events`. Direct authenticated Rail access stays revoked. A narrowly granted SECURITY DEFINER safe lens pins its search path, requires a live authenticated caller, resolves the active tenant on the server, checks the canonical staff role, addresses the client by its immutable public-safe `account_number`, and emits only the fixed Spine fields. Raw Rail title, summary, payload, user identifiers, internal deal identifiers, and stage content remain behind the boundary.

The `tenant_id`, signal UUID, and opaque `rail:` references in the contract are server-consumer scope/provenance evidence, not presentation copy. The 365-day value is a safe projection visibility window; source Rail retention remains independently domain-owned.

This slice is `PARTIAL`: evidence is registered and the read-only Chat adapter has structural and targeted runtime proof, so the Chat binding is `PARTIAL`; authenticated preview proof is still required before `LIVE`. The **Mind binding is `PARTIAL`** as of 2026-09-02: `_shared/paige-spine/mindEvidence.ts` projects the same resolver result into a bounded, attributable Mind record — citation, freshness, read-only boundary — and Chat renders that projection rather than the raw signals, so the two cannot describe one record differently. That projection is deliberately the Pipeline domain's, NOT a platform-wide Mind primitive; generalising it so a second domain depends on its shape changes Mind-wide retrieval semantics and needs its own Spine Change Request. `LIVE` still requires the authenticated drive. See `docs/delivery/paige-spine-mind-handoff.md`. It intentionally registers no Pipeline mutation. Pipeline currently has domain-held move-approval semantics; a Chat-owned reconciliation is required before any mutation can join the Spine.

## Domain self-service

A domain owner may add its own declaration and safe adapter in a later immutable migration without modifying another domain when all of these remain true:

1. the human surface and durable source already exist;
2. tenant context is server-resolved and any privileged safe lens recreates the source authorization boundary explicitly;
3. only reviewed fixed fields and exact declared scalar fact values cross the boundary;
4. no shared registry schema, resolver semantics, approval authority, or Chat routing rule changes;
5. the domain adds focused registry, SQL contract, real-role isolation, and regression tests;
6. maturity stays truthful until authenticated end-to-end proof exists.

## Approved Spine Change Requests

### SCR-2026-09-02 — the Chat-facing block may carry the safe citation

**Approved by the owner, 2026-09-02, at Gate 1.** The rendered Chat evidence block now names
the opaque `rail:<uuid>` source reference and states the read-only boundary. The previous
contract withheld the reference deliberately and a merged test asserted its absence, which is
why this needed a request rather than an edit: `renderSpineEvidenceForChat` is the Chat
adapter contract, a shared primitive.

**Bound.** The `rail:` reference is the approved citation for this first Mind/Pipeline slice.
It stays tenant-scoped, is non-dereferenceable outside authorized context, and reveals none
of the forbidden raw fields. Nothing else widened: no registry schema, resolver semantics,
safe-field set, lifecycle vocabulary, approval authority, projection-window meaning, shared
store or event bus changed. Approval authority stays `none`; no Chat tool was registered.

**Honest note.** The citation is `'rail:' || <Rail event id>`, so that record's UUID is inside
it by construction. It is the one identifier permitted to cross; it names a record, not a
person or a deal, and it is asserted to appear only inside the citation and never loose.

## Spine Change Request

A Spine Change Request is required before changing a shared primitive: registry schema, resolver result semantics, safe signal fields, lifecycle vocabulary, approval authority, Chat adapter contract, or projection-window interpretation.

The request must include: requested change; affected domains and flows; collision packet with current exact heads; tenant and sensitivity analysis; compatibility and migration plan; tests and rollback; Chat-owner review for any action/approval change; and owner Gate 1 approval. Implementation and release remain separate authority gates.

## Contribution model for future agents

### Domain self-service lane

Ordinary additive capabilities do not require returning to one specific coordinator. A domain-owning agent may extend the Spine when it keeps the shared contract unchanged and completes this sequence:

1. **Fresh collision check** — fetch current main and every active owner branch that touches the domain, Chat handler, registry, resolver, Rail source, migrations, or CI. Record exact heads and preserve newer work.
2. Add one declaration under supabase/functions/_shared/paige-spine/domains/ and export it from the canonical registry.
3. Reuse an existing durable Rail/outcome source or add one immutable, tenant-safe migration for a fixed-field adapter. Never expose raw payloads or accept a caller-supplied tenant id.
4. Add registry, safe-field, malformed-result, real-role, cross-tenant, account-switch, and direct-source-denial tests.
5. Add the smallest owning consumer. A shared file with no deployable consumer is intentionally red in CI; do not weaken edge-affected.py or convert zero consumers into a pass.
6. Keep chatBinding, mindBinding, and maturity truthful. Code and structural tests may justify PARTIAL; LIVE requires the corresponding correctly authenticated end-to-end proof.
7. Publish a green draft with exact automated, static, rendered/runtime, authenticated, and UNVERIFIED evidence separated. Merge and deployment remain separate authority gates.

This lane covers additive domain declarations, domain-owned safe adapters, tests, and consumers that use the existing resolver contract. It does not authorize editing another domain's behavior or a shared approval primitive.

### Shared-contract lane

A Spine Change Request and coordinated owner review are required for registry shape, resolver semantics, safe signal fields, lifecycle vocabulary, approval authority, Chat adapter contract, projection-window meaning, new shared stores/buses, or cross-domain behavior. Mutations and external effects also require the Chat owner's canonical risk classification, one-approval treatment, idempotency, recovery, and authenticated proof.

### Required handoff packet

Every agent leaves: exact base/head; active-owner heads inspected; affected-flow and collision map; changed files; registry key and domain owner; human surface; Rail/source and safe adapter; roles and denial cases; consumer/deployment identity; test commands and results; runtime/authenticated evidence; remaining BLOCKED, FAIL, and UNVERIFIED items; and explicit merge/deployment authority. That packet lets the next agent continue without relying on a particular person's memory.
