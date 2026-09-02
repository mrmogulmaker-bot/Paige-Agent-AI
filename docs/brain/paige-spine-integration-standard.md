# PAIGE Spine Integration Standard

**Owner-approved architecture policy — 2026-09-01.** This is the repository-native standard for
connecting a feature/domain to Mind, PAIGE Chat, governed action, and Rail. It defines the required
architecture and workstream boundaries. It is **not** evidence that every domain adapter, evidence
manifest, Chat tool, Trust Compass clamp, shared executor, or Rail outcome contract already exists.

**Implementation maturity:** platform-wide coverage is **PARTIAL**. Each domain must state its own
`LIVE`, `PARTIAL`, `UNAVAILABLE`, and `UNVERIFIED` legs from exact evidence. A policy, type, fixture,
render, migration, deployment record, or static tool registration is not authenticated capability
proof.

### Current grounding audit — `origin/main` `76bb3bbca74ff4214feba28995d5cd0b9196fb6b`

PR [#728](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/728) merged the PAIGE Chat work,
canonical approval doctrine and Spine foundation into `main`. `docs/doctrine/one-approval-gate.md`
remains the exclusive authority for the approval segment; this standard links it rather than
restating its mechanism.

This docs pass did not perform a fresh authenticated production query. The exact source establishes:

- `supabase/functions/_shared/paige-spine/registry.ts` is the canonical capability registry and
  fails closed at import; `resolveEvidence.ts` is the shared safe evidence resolver.
- `scripts/ci/paige-spine-registry-lint.mjs`, `chat-tool-registry-lint.mjs`,
  `action-risk-lint.mjs`, and `one-approval-gate-lint.mjs` enforce the foundation in CI. The inline
  Chat catalogue remains legacy debt behind a no-growth ratchet; new capabilities use the registry.
- The first entry, `pipeline.deal_stage_evidence`, is a read-only safe Pipeline evidence slice. Its
  registry/evidence leg is `PARTIAL`, Chat binding is `PARTIAL`, Mind binding is `UNAVAILABLE`, and
  mutation is not registered. A declaration or structural/runtime test does not make it `LIVE`.
- Solo Compass uses the module-local `TRUST` store in `src/solo/compass.tsx`; Agency's
  `useAgencyCompass.ts` labels autonomy tiers preview-only with no persisted tier store; the operator
  `useCompass.ts` derives display lanes from action-kind defaults. No server-persisted Compass
  evaluation contract was proven. **The Compass UI is non-authoritative/in-memory or derived display
  today and must not be described as evaluating permissions or actions.**

Therefore the centralized Spine **foundation is implemented**, while platform-wide domain adoption
remains `PARTIAL`. Exact deployed persistence and authenticated behavior remain `UNVERIFIED` in
this documentation pass.

---

## 1. What the Spine is

The governing Solo platform definition is
[`docs/brain/solo-platform-taxonomy-and-ui-flow-standard.md`](solo-platform-taxonomy-and-ui-flow-standard.md):
PAIGE is the tenant-scoped AI COO, not a chat product. Chat is one governed human interface. The
Spine is how safe business truth and bounded actions support her operating loop without becoming a
second product, domain store, authority system or workspace.

The **PAIGE Spine** is the platform-wide safe path by which a tenant/client domain event becomes:

1. structured evidence that Mind and PAIGE Chat may consume within the active user's authority;
2. a governed action when an authorized capability and approval treatment permit it; and
3. an attributable outcome recorded durably in Rail and reflected on the owning human surface.

The conceptual path is:

```text
Tenant/client domain event
  -> safe domain evidence contract
  -> Mind and PAIGE Chat read adapter
  -> server action-risk policy + canonical approval gate
  -> governed domain action, when separately available
  -> safe attributable outcome
  -> Rail history/outcome + owning page
```

**Rail is part of the Spine, not the whole Spine.** Rail is the durable audit/history/outcome
component. It does not replace the domain server contract, safe evidence boundary, Mind/Chat adapter,
Trust treatment, governed executor, or human-management page.

This standard extends the established platform taxonomy
`Human -> Read -> Brain -> Trust Compass -> Write -> Rail -> Page`. In that taxonomy, Trust Compass
names the intended governance experience; it does **not** describe today's authoritative runtime.
Until a server-persisted Compass contract exists, the server action-risk policy plus the canonical
approval gate is the clamp. The approval segment is specified only by
`docs/doctrine/one-approval-gate.md`. No runtime or document may claim “Compass evaluated” merely
because a dial, lane, label, or in-memory preference rendered. Naming a stage creates no permission,
provider access, action, or implementation authority.

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
| **Designated PAIGE Chat workstream** | The bounded Chat read/write adapter or tool, tenant/client scope, binding to the canonical approval gate when required, governed invocation, and final user-visible Chat behavior. It closes the authenticated Chat capability end to end and exclusively owns changes to how approval is proven. | Rewriting the domain's source of truth, bypassing the domain server contract, or accepting a second approval channel from another slice. |
| **Designated shared-Spine owner(s)** | Central interfaces and policy for Mind resolution, the future server-persisted Compass contract, Rail core, Systems Check core, the centralized registry/action-risk policy, and shared execution. They accept or reject precise Spine Change Requests and protect cross-domain invariants. | Quietly absorbing domain truth, provider payloads, or feature-specific business logic into a shared core. |

Feature/domain agents must **not** directly wire, fork, or rewrite:

- PAIGE Chat core;
- Mind's central resolver;
- Trust Compass policy/enforcement;
- the Rail core writer or schema;
- Systems Check core logic; or
- the shared executor.

Existing stable interfaces are the normal path: the domain registers its evidence/action/outcome
contract within the schema, and the PAIGE Chat workstream completes the bounded binding. A **Spine
Change Request** is required only when the capability needs a genuinely new shared primitive or a
schema change. It is not required for ordinary registration within the stable schema. No workstream
may invent a parallel writer, private resolver, local approval system, second chat, or shadow
executor.

---

## 4. The Spine registry is code-enforced, not a documentation list

The stable registry/policy is the common self-service integration contract. Within its schema, a
domain registers its capability key, safe evidence contract, tenant/client scope resolver, action
risk/approval treatment when applicable, and safe outcome contract. The domain does not need a Spine
Change Request to add a normal entry. The designated PAIGE Chat workstream then supplies the final
bounded adapter/tool binding and user-visible behavior.

The registry must be enforced at runtime and in CI. CI must fail when a change:

- adds a direct or hard-wired PAIGE Chat read tool or action outside the centralized registry;
- adds a mutation/action branch with no centralized server action-risk-policy entry;
- creates a competing confirmation, approval, autonomy, or execution channel outside the
  centralized policy/gate; or
- bypasses the registered tenant/client scope, domain server contract, or safe outcome path.

Documentation, comments, a hand-maintained second list, or a ratchet that merely prevents an existing
gap from growing does not satisfy this contract. The canonical registry and Spine CI foundation
shipped in #728. The legacy inline Chat catalogue remains migration debt behind its no-growth guard;
that debt does not make a new hard-wired capability acceptable and does not make every domain live.

---

## 5. Read and action are separate capabilities; approval has one canonical source

Publishing safe evidence does not authorize an action. Registering an action does not make it
autonomous. Recording an outcome does not prove the action was authorized or successful.

For every governed domain action:

- the server re-resolves tenant/account/client scope and the active actor;
- the domain authorization contract establishes the caller's maximum permission;
- the centralized server action-risk policy classifies the action and routes it to the canonical
  approval gate when required;
- the feature/domain workstream registers the capability but does not create or reinterpret approval
  proof;
- execution is bounded, attributable, idempotent where external effects are possible, recoverable,
  and fail-closed; and
- the final outcome is normalized safely for Rail and the owning human surface.

**Approval authority and mechanics are delegated to
`docs/doctrine/one-approval-gate.md`.** That PAIGE Chat-owned file decides how operator intent is
proven, how a gated action binds to the approved call, and which approval-channel shapes CI forbids.
This standard owns the whole Spine architecture around that segment and intentionally does not
duplicate those rules. Adding a normal gated capability is self-service within the stable
classification/registry contract; changing how approval is proven belongs to the PAIGE Chat
workstream.

**Trust Compass does not currently evaluate or authorize the action.** Its UI is non-authoritative
today. A future server-persisted Compass contract may further restrict the already-authorized domain
action, but it may never elevate the domain permission ceiling or bypass the server action-risk and
approval gates.

Custom job titles and responsibilities are descriptive context only. They never grant, widen, or
substitute for `role`, `is_owner`, RLS, server authorization, or capability approval.

---

## 6. Required Spine declaration on every feature assignment

Every new feature assignment must contain this declaration before implementation begins:

```text
PAIGE SPINE DECLARATION
Domain:
Domain owner:
PAIGE Chat owner:
Shared-Spine owner(s):

Publishes client evidence: YES / NO — event kinds and safe contract, or reason
Registers a governed action: YES / NO — capability and canonical approval-gate classification, or reason
Emits an attributable outcome: YES / NO — safe outcome/reference, or reason
No Spine obligation: YES / NO — evidence-backed reason; cannot be selected with a YES above

Stable registry entry/entries:
Current maturity: LIVE / PARTIAL / UNAVAILABLE
Authenticated behavior: VERIFIED / UNVERIFIED
Spine Change Request for a NEW shared primitive/schema: NONE / identifier + designated owner
```

The declaration may assign later delivery to the Chat/shared workstreams; it may not silently turn an
owed integration into “no obligation.” A meaningful client event cannot be classified out of the
Spine merely because the current slice is UI-only.

The assignment must name accountable workstreams or owners for all three roles. “Platform,” “backend,”
or “someone later” is not an owner.

---

## 7. Spine Change Request — only for a new shared primitive or schema

Ordinary registration within the stable Spine schema is self-service and does not need a change
request. File one only when the stable contract cannot express the required safe evidence, scope,
action-risk/approval, outcome, or shared execution primitive without changing a shared interface.

A precise Spine Change Request states:

1. the requesting domain and accountable domain owner;
2. the missing shared interface and its designated owner;
3. the safe evidence/action/outcome contract needed — normalized fields, never raw samples;
4. tenant/account/client scope and active-user visibility rules;
5. permission ceiling, server action-risk policy, and dependency on the canonical approval source;
6. expected Rail outcome/provenance and the human page that owns intervention;
7. known producers, consumers, collisions, migration/backfill implications, and failure behavior;
8. current implementation maturity and exact `UNVERIFIED` limits; and
9. the verification required before any `LIVE` claim.

The request grants no authority to change the shared component. The shared owner reviews and delivers
that interface in its own bounded workstream, then the designated PAIGE Chat workstream completes the
read/write behavior.

### Ruled future SCR: workspace-scoped Team outcomes

PAIGE-proposed Team changes and the owner's resulting Team-UI writes may not be projected into a
contact/client-keyed Rail event with a null or missing `contact_id`. Preserve the existing client
Rail's client-keyed integrity. Team invite, resend, revoke, work-profile, role, permission and other
access changes are workspace-level outcomes and require a distinct workspace-scoped outcome
projection/record. For MVP these actions remain canonical `owner_only`: Chat may prepare and hand off
but may not execute them at any confirmation strength.

That new shared primitive must carry, at minimum: server-resolved tenant; authenticated actor;
action kind; safe target member or invitation reference; the owner approval binding; requested,
refused, executed, failed and recovered result as applicable; occurrence time; and safe owner-visible
evidence. It must not expose invitation tokens, raw email/provider payloads, credentials, internal
errors or another tenant's identity. It must support the owner-visible Team history surface without
turning client Rail into a nullable catch-all.

This is an approved **SCR requirement**, not an implemented capability. Its schema, projection,
writer, reader, Chat binding, migration and browser proof are separately scoped future work. No
schema, code, migration, Chat or approval-mechanism change is authorized by this docs assignment.

---

## 8. Completion and evidence

A domain can claim **Spine-complete** only when every declared leg is proven at its actual boundary:

- safe evidence is produced from server-resolved tenant/client state;
- Mind and PAIGE Chat return only evidence the authenticated user may access;
- account/client switching cannot retain the prior scope;
- missing, stale, partial, denied, retry, abandonment, and recovery states are truthful;
- any action respects the domain permission ceiling, centralized server action-risk policy, and
  canonical approval gate;
- the outcome is attributable and reaches the intended Rail/page consumer without raw content; and
- authenticated end-to-end behavior is verified for each claimed capability.

Static types, fixtures, source inspection, a green build, a migration record, a deployment record, or
a rendered unavailable state may support the evidence packet but do not independently prove the
authenticated capability.

---

## 9. Incremental adoption — no big-bang rewrite

- **All new capabilities follow this standard now.** Their assignment declares the Spine legs and
  owners before implementation, and ordinary cases register within the stable schema.
- **Existing direct couplings migrate one at a time behind existing seams.** Each bounded migration
  preserves behavior and authorization unless its separately approved scope says otherwise, adds the
  registry/policy binding, and removes the superseded direct coupling only after verification.
- Do not pause unrelated active work, prescribe a platform-wide refactor, or create a migration flag
  day. File and sequence concrete debt from the grounding audit without widening it.
- A legacy direct path remains truth-labeled `PARTIAL` / `UNVERIFIED` until migrated; its existence is
  not permission to copy the pattern into a new capability.

---

## 10. Relationship to existing contracts

- `docs/doctrine/one-approval-gate.md` is the **exclusive authority for the approval segment** of
  the Spine. It is owned by the PAIGE Chat workstream. This document governs the full pathway but
  does not redefine how approval is proven. It is present on current `main` through #728.
- `docs/brain/solo-platform-taxonomy-and-ui-flow-standard.md` is the canonical Solo human-job,
  department/subtab and surface-card map. It assigns where a capability lives; this standard owns
  how that capability joins safe evidence, Chat/Mind, governed action and Rail.
- `docs/doctrine/autonomy-architecture.md` owns the human-selected autonomy model: account ceiling,
  process grant and capability floor. It does not supersede domain permission, action-risk or the
  one approval gate, and no Compass UI is server authority until persisted and enforced there.
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
