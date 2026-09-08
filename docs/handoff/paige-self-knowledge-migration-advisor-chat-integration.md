# Paige Self-Knowledge & Migration Advisor — conversation-owner handoff

**Status:** isolated read-only Harness module implemented; shared conversation integration remains separately owned and `UNAVAILABLE`.

**Grounded base:** `610e609c0f4b5f78e232cdb17de8c4d75b2f40f0` (includes #1070/#1071 and the later #1068 merge).

## Delivered seam

`supabase/functions/_shared/paige-migration-advisor.ts` exports:

- `normalizeMigrationIntent(utterance)` — returns exactly one of `off_external_to_paige`,
  `into_external`, `compare_only`, or `ambiguous`, with source, target, dependency, outcome, object
  class, assumption, ambiguity, and minimal clarification fields;
- `projectN8nMigrationInventory(...)` — separates saved configuration, last-known provider
  connection state, readiness freshness, recorded workflow count, approval count, and current/partial/
  stale/unavailable workflow evidence;
- `runReadOnlyMigrationAdvisor(input)` — owner-only, server-scope-bound composition of the canonical
  Spine registry, caller-scoped n8n readiness, an already-redacted read-only workflow inventory,
  canonical provider-governance evidence, and dated external comparison evidence.

The returned response order is fixed: Paige coverage now, gaps and truth, phased transition, exact
owner approvals. It includes an inline-only response artifact and always returns
`external_changes: []`. The module has no write dependency, HTTP route, provider credential, durable
receipt, Rail writer, Memory write, or chat/UI import.

## Inputs the conversation owner must supply

1. Server-resolved active tenant/workspace/role/legal-owner/context-epoch state. Do not accept these
   identifiers from the request body.
2. Runtime evidence keyed only by a current `PAIGE_SPINE_CAPABILITIES` key. Registry presence is not
   tenant availability, eligibility, authority, proof, freshness, or release identity.
3. `get_n8n_spine_readiness()` through the caller JWT.
4. The existing `n8n_list_workflows` read projection when available. Pass only its redacted result;
   never workflow definitions, node parameters, credentials, execution payloads, or provider errors.
5. Provider-governance fields projected from the canonical Integration Capability Registry. Do not
   load that document as tenant connection truth.
6. External comparison claims with source URL, publisher, checked-as-of date, plan/edition/region,
   limitation, confidence, and re-verification period. Research cannot modify Paige truth.

## Smallest future conversation integration

After PR #1044 releases or coordinates the shared server conversation seam, its owner can import the
single module into the existing `paige-ai-chat` runtime. Route only capability/comparison/migration
intent into `runReadOnlyMigrationAdvisor`; render the returned ordered sections in Paige's existing
conversation response. Do not edit `PaigeAIChat`, transcript anchors, scroll ownership, Live
Conversation, Secure Browser, Skills/Interview, or create another assistant/tool registry.

The owner must re-check `scope.is_current()` after every awaited evidence read, preserve a denied or
changed scope as a refusal, and never pass a mutation callback into the advisor. Any later external
action must leave this module and enter the existing Spine approval/execution path under a separately
authorized delivery contract.

## Proof boundary

Automated coverage proves deterministic direction, the required GHL-to-Paige regression, ambiguity,
owner denial, cross-tenant readiness refusal, account switching, stale/unavailable evidence, dated
comparisons, inline receipts, and zero external changes. It does not prove an authenticated owner can
reach the advisor through Paige chat.

Therefore:

- isolated server contract: `PROOF OWED`;
- shared conversation binding: `UNAVAILABLE`;
- migration execution: `UNAVAILABLE`;
- provider/account/workflow/data/message changes: **none performed**.

Do not promote any of these until authenticated tenant isolation, first-use, failure/retry,
abandonment, account switching, response rendering, and exact release-identity proof pass. Full
migration execution additionally requires separately approved bounded execution, canonical provider
readback, matching receipt and Rail evidence, and rollback/recovery proof.
