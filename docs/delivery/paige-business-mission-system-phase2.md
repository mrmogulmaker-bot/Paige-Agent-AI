# Paige Business Mission System — Phase 2 foundation

Status: infrastructure-only draft release candidate; not merged, migrated, deployed, or production-proven.

## Owner-intended outcome

Preserve the approved tenant-safe Mission source of truth and governed Paige mutation path without committing production to the rejected Business Game Plan composition. The separately owned Business Game Plan redesign may consume this contract, but this branch owns no page layout, route composition, CSS, UI state hierarchy, or render harness.

## Ownership and collision result

- This branch was rebuilt from current `origin/main` at `1a183149ab06fcdd013b257b62a8740989f7e302` after #973 and #980 changed the Business Game Plan UI and its harness.
- The current-main `SoloGamePlanWorkspace`, `useSoloGamePlan`, Command Center mount, CSS, tests, and render harness are preserved byte-for-byte. The rejected `SoloBusinessGamePlanWorkspace`, its hook, CSS, and component tests are absent from this branch.
- PR #952 remains superseded as an implementation direction. Its design contribution remains historical input; this branch neither revives nor deletes its UI.
- PR #776 remains untouched. Phase 2 adds no Mission Rail reader, writer, event, hook, or grant.
- The governed MCP-door work from #960 remains intact. Mission tool discovery is additive to its canonical MCP checks.
- Current-main Campaign and artifact work does not overlap the retained Mission schema or tool contracts.
- Hot master-reference and decision-log files are not edited here. Merge-ready record reconciliation remains with their active owners.

## Durable Mission/backend infrastructure

New durable contracts:

- `business_missions`: tenant-owned identity, lifecycle, next action, revision, and honest close-out.
- `business_mission_brief_versions`: immutable, append-only Mission Brief history.
- `business_mission_mutation_receipts`: tenant-and-actor-scoped idempotency receipts for atomic create, revise, and transition replay.
- Server-resolved owner RPCs: create, revise, transition, list, and get.
- Three high-risk Paige chat tools registered through the existing stored-argument approval gate.
- A presentation-neutral TypeScript projection for the future Business Game Plan adapter.

Reused contracts:

- `current_user_tenant_id()` and canonical `is_tenant_owner(actor, tenant)`.
- Existing Paige pending-confirmation approval and refusal path.
- Existing action-risk and governed MCP-door enforcement.
- Existing `paige_audit_log` for safe owner mutation attribution.

## Business Game Plan redesign ownership

The Business Game Plan UI workstream owns:

- strategic record hierarchy across annual, semiannual, quarterly, seasonal, campaign, Mission, decision, and revision contexts;
- page composition, information hierarchy, interactions, responsive behavior, styling, and all UI state presentation;
- adaptation of current-main `useSoloGamePlan` and `SoloGamePlanWorkspace` to this durable contract;
- real browser and authenticated UI proof.

This infrastructure branch does not prescribe a readiness-checklist layout or task-list information architecture.

## Exact integration seam

```text
Owner strategy in Paige chat
  -> Paige proposes structured Mission arguments
  -> existing stored-argument approval gate approves or refuses the exact call
  -> caller-JWT Mission RPC creates or appends an immutable Mission Brief
  -> list_business_missions / get_business_mission return tenant-safe projections
  -> redesign-owned useSoloGamePlan adapter maps those projections into Business Game Plan
  -> future Paige context reads the approved Mission and Brief revision, never an unapproved draft
```

Lifecycle detail: a partly achieved Mission is `lifecycle_state = completed` with `closure_outcome = partly_achieved`; it is not a separate lifecycle state. No Mission evidence link exists yet, so Systems Check, Mind, and Rail must not be inferred from the audit log.

## Governance and truth

- Only resolved top-level standalone Solo tenant owners may use the Mission RPCs.
- Co-owners read the shared tenant portfolio; `requested_by` is attribution, not a private partition.
- Expected revision is mandatory for revise/transition and rejects stale or missing values.
- Duplicate request keys replay the committed result; a different payload under the same key fails closed.
- Chat provenance requires the caller's coach-lens, owner-side thread in the resolved tenant.
- Direct browser table writes remain revoked; RLS is enabled; SECURITY DEFINER functions re-check caller and tenant in-body.
- Chat results say a Mission record changed. They do not claim work executed, a client was contacted, an outcome occurred, or Rail evidence exists.
- The Spine catalogue uses `chatBinding: LIVE` to mean the callable chat binding is implemented and passes the registry invariant. The overall capability remains `maturity: PARTIAL`; because this branch is not deployed, the user-facing production status is `UNVERIFIED`, not LIVE.

## Explicit exclusions

No Business Game Plan UI replacement, Rail integration, Work Orders, internal/external workers, Promise Ledger, Client Engagement, Client Portal, Decision Lab, adaptive learning, subaccount/Agency/Enterprise UI, rollout, merge, migration, or deployment.

## Proof status

Automated/local proof present:

- Mission source-contract tests.
- Action-risk, one-approval-gate, chat registry, governed MCP-door, definer-function, migration-version, write-target, and Rail-grant checks.
- TypeScript ratchet and production build.
- The executable SQL contract passed 30/30 assertions in a disposable loopback PostgreSQL 16 database, covering owner/co-owner/member and workspace boundaries, direct-table denial, immutable briefs, lifecycle validation, stale revision, idempotency, and exact receipt/audit counts. Because standalone PostgreSQL did not provide pgTAP, the repository SQL body ran unchanged with transaction-local compatibility assertion helpers and rolled back.
- The true concurrent harness passed: duplicate create produced one Mission plus one replay; competing same-revision updates produced one commit plus one revision conflict.
- Independent pre- and post-current-main collision review.

Proof Owed before final release consideration:

- Full zero-to-head migration replay and the native pgTAP suite in an isolated Supabase stack.
- Authenticated browser flows for tenant/workspace switching and Mission reads.
- Deployed Paige approval, refusal, retry, and replay proof.
- Genuine browser review of the redesign-owned Business Game Plan UI.
- Deployment and exact-SHA production proof.

No capability in this record is claimed live.