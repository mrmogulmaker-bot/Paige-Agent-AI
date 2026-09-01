# PAIGE Spine Integration Standard

**Owner-approved architecture policy — 2026-09-01.** This is the repository-native standard for
connecting a feature/domain to Mind, PAIGE Chat, governed action, and Rail. It defines the required
architecture and workstream boundaries. It is **not** evidence that every domain adapter, evidence
manifest, Chat tool, Trust Compass clamp, shared executor, or Rail outcome contract already exists.

**Implementation maturity:** platform-wide coverage is **PARTIAL**. Each domain must state its own
`LIVE`, `PARTIAL`, `UNAVAILABLE`, and `UNVERIFIED` legs from exact evidence. A policy, type, fixture,
render, migration, deployment record, or static tool registration is not authenticated capability
proof.

---

## 1. What the Spine is

The **PAIGE Spine** is the platform-wide safe path by which a tenant/client domain event becomes:

1. structured evidence that Mind and PAIGE Chat may consume within the active user's authority;
2. a governed action when an authorized capability and approval treatment permit it; and
3. an attributable outcome recorded durably in Rail and reflected on the owning human surface.

The conceptual path is:

```text
Tenant/client domain event
  -> safe domain evidence contract
  -> Mind and PAIGE Chat read adapter
  -> Trust Compass restriction + server authorization
  -> governed domain action, when separately available
  -> safe attributable outcome
  -> Rail history/outcome + owning page
```

**Rail is part of the Spine, not the whole Spine.** Rail is the durable audit/history/outcome
component. It does not replace the domain server contract, safe evidence boundary, Mind/Chat adapter,
Trust treatment, governed executor, or human-management page.

This standard extends the established platform taxonomy
`Human -> Read -> Brain -> Trust Compass -> Write -> Rail -> Page`. It does not create permission,
provider access, an action, or implementation authority by naming those stages.

---

## 2. The universal evidence obligation

Every meaningful client event must eventually be available to **Mind and PAIGE Chat** as safe,
tenant/client-scoped, attributable evidence. “Eventually” is an architecture obligation, not a claim
that coverage exists today. Until its read path is implemented and authenticated, label it
`UNAVAILABLE` or `PARTIAL` and the runtime behavior `UNVERIFIED` as applicable.

A domain's safe evidence manifest defines the meaning and safe shape of evidence. It must preserve:

- a server-resolved tenant/account boundary and, where applicable, client/contact boundary;
- a stable domain event kind and safe subject/reference, not a provider payload;
- source, actor or system provenance, occurrence time, and freshness/availability state;
- only the normalized facts needed by authorized consumers;
- the audience/visibility rule that proves the active user may access it; and
- honest absence, partial, stale, error-category, and recovery states without inventing success.

The manifest is a contract, not permission to add or rewrite a shared store. The shared owner decides
how a safe contract joins the central Spine; the domain owner remains accountable for the truth and
tenant/client isolation of the source data.

### Never enter Mind, PAIGE Chat context, or a general Rail event

- raw provider payloads, webhook bodies, or unrestricted provider metadata;
- secrets, credentials, tokens, secret references, or private endpoints;
- raw endpoint errors, stack traces, request dumps, or internal exception detail;
- untrusted prompt text, hidden reasoning, chain-of-thought, or unrestricted free text;
- cross-tenant data or identifiers that allow another tenant's data to be resolved;
- content the active user cannot access on the owning page/server contract; or
- recordings, transcripts, messages, notes, or customer content merely because they exist.

Safe normalized states such as “delivery unavailable,” “provider check failed,” or “freshness
unknown” may be evidence when the domain contract defines them without copying the raw payload or
error.

---

## 3. Ownership — one coordinated Spine, no private integrations

| Owner | Owns | Does not own by default |
|---|---|---|
| **Feature/domain workstream** | Domain UI, domain data, tenant-safe server contract, safe event/evidence manifest, domain action implementation, and safe domain outcome shape. | Chat core, Mind central resolver, Trust Compass policy, Rail core writer/schema, Systems Check core logic, or the shared executor. |
| **Designated PAIGE Chat workstream** | The bounded Chat read/write adapter or tool, tenant/client scope, approval treatment, governed invocation, and final user-visible Chat behavior. It closes the authenticated Chat capability end to end. | Rewriting the domain's source of truth or bypassing the domain server contract. |
| **Designated shared-Spine owner(s)** | Central interfaces and policy for Mind resolution, Trust Compass, Rail core, Systems Check core, and shared execution. They accept or reject precise Spine Change Requests and protect cross-domain invariants. | Quietly absorbing domain truth, provider payloads, or feature-specific business logic into a shared core. |

Feature/domain agents must **not** directly wire, fork, or rewrite:

- PAIGE Chat core;
- Mind's central resolver;
- Trust Compass policy/enforcement;
- the Rail core writer or schema;
- Systems Check core logic; or
- the shared executor.

Existing interfaces may be consumed exactly as contracted. If a required interface is missing, the
feature/domain workstream files a **Spine Change Request** for the designated shared owner; it does
not invent a parallel writer, private resolver, local approval system, second chat, or shadow
executor.

---

## 4. Read and action are separate capabilities

Publishing safe evidence does not authorize an action. Registering an action does not make it
autonomous. Recording an outcome does not prove the action was authorized or successful.

For every governed domain action:

- the server re-resolves tenant/account/client scope and the active actor;
- the domain authorization contract establishes the caller's maximum permission;
- Trust Compass may restrict that maximum to observe, prepare, ask for confirmation, or act;
- **Trust Compass can never elevate permission** beyond the domain authorization contract;
- approval treatment is capability-specific and explicit;
- execution is bounded, attributable, idempotent where external effects are possible, recoverable,
  and fail-closed; and
- the final outcome is normalized safely for Rail and the owning human surface.

Custom job titles and responsibilities are descriptive context only. They never grant, widen, or
substitute for `role`, `is_owner`, RLS, server authorization, or capability approval.

---

## 5. Required Spine declaration on every feature assignment

Every new feature assignment must contain this declaration before implementation begins:

```text
PAIGE SPINE DECLARATION
Domain:
Domain owner:
PAIGE Chat owner:
Shared-Spine owner(s):

Publishes client evidence: YES / NO — event kinds and safe contract, or reason
Registers a governed action: YES / NO — capability and approval treatment, or reason
Emits an attributable outcome: YES / NO — safe outcome/reference, or reason
No Spine obligation: YES / NO — evidence-backed reason; cannot be selected with a YES above

Current maturity: LIVE / PARTIAL / UNAVAILABLE
Authenticated behavior: VERIFIED / UNVERIFIED
Spine Change Request needed: NONE / identifier + designated owner
```

The declaration may assign later delivery to the Chat/shared workstreams; it may not silently turn an
owed integration into “no obligation.” A meaningful client event cannot be classified out of the
Spine merely because the current slice is UI-only.

The assignment must name accountable workstreams or owners for all three roles. “Platform,” “backend,”
or “someone later” is not an owner.

---

## 6. Spine Change Request — the only path for a missing shared interface

A precise Spine Change Request states:

1. the requesting domain and accountable domain owner;
2. the missing shared interface and its designated owner;
3. the safe evidence/action/outcome contract needed — normalized fields, never raw samples;
4. tenant/account/client scope and active-user visibility rules;
5. permission ceiling, Trust Compass restriction, and approval treatment;
6. expected Rail outcome/provenance and the human page that owns intervention;
7. known producers, consumers, collisions, migration/backfill implications, and failure behavior;
8. current implementation maturity and exact `UNVERIFIED` limits; and
9. the verification required before any `LIVE` claim.

The request grants no authority to change the shared component. The shared owner reviews and delivers
that interface in its own bounded workstream, then the designated PAIGE Chat workstream completes the
read/write behavior.

---

## 7. Completion and evidence

A domain can claim **Spine-complete** only when every declared leg is proven at its actual boundary:

- safe evidence is produced from server-resolved tenant/client state;
- Mind and PAIGE Chat return only evidence the authenticated user may access;
- account/client switching cannot retain the prior scope;
- missing, stale, partial, denied, retry, abandonment, and recovery states are truthful;
- any action respects the domain permission ceiling plus Trust Compass restriction and approval;
- the outcome is attributable and reaches the intended Rail/page consumer without raw content; and
- authenticated end-to-end behavior is verified for each claimed capability.

Static types, fixtures, source inspection, a green build, a migration record, a deployment record, or
a rendered unavailable state may support the evidence packet but do not independently prove the
authenticated capability.

---

## 8. Relationship to existing contracts

- `docs/brain/paige-brain-wiring-standard.md` is the runtime-brain coverage ledger and implementation
  checklist. This document governs the cross-workstream ownership split and the broader evidence ->
  Chat/Mind -> action -> outcome architecture.
- `docs/doctrine/connections-rail-contract.md` is the Solo Connections/A2P domain specialization and
  its platform-pipeline taxonomy. Its safe evidence/never-list and missing-contract discipline remain
  binding; it grants no shared-core implementation authority.
- `docs/doctrine/calendar-capability-contract.md` is the Calendar domain specialization and an
  example of separating read, Trust, write, Rail, and page maturity honestly.
- `docs/brain/roles-permissions.md` records the authorization stores and the descriptive-only Team
  fields that Trust Compass may never promote into permission.

Where a domain contract needs a new central interface, use a Spine Change Request rather than editing
the shared core from the feature workstream.
