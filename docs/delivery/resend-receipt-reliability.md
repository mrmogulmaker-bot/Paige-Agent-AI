# Shared Resend receipt reliability/security repair

Status: **BLOCKED by full-schema source permission proof. PR #906 open; not merged or released.**

## Release attempt, 2026-09-04 UTC

The owner explicitly authorized pushing to `mrmogulmaker-bot/Paige-Agent-AI`, opening, merging, deploying and verifying this repair. PR #906 was opened from commit `c0b850a3`; bounded proof diagnostics followed through `42875507`.

The clean Supabase database rebuild and existing Team database suites pass. The new receipt proof fails because `service_role` lacks SELECT on the existing `public.email_send_log` after migration replay. The processing function safely retains the receipt as pending/storage_retry. CI run `33824123655`, job `100873009893`, confirms the missing source read privilege before processing fixtures. Production catalog-only inspection confirms service_role already has SELECT, INSERT and UPDATE on that table, and SELECT/UPDATE on invitation tokens. No production records were queried.

Required scoped decision: allow an additive service-role grant on the existing shared delivery-log table, matching its intended production privileges, to make clean rebuilds preserve the same receipt path. Do not fix this by granting tenant access, switching to SECURITY DEFINER, weakening the test, or changing sender policy. The current approved migration otherwise adds only the receipt journal, processing functions, lookup index and schedule. No merge or deployment has occurred.

Local expanded Team/receipt suite: 237 PASS; build, type ratchet and focused security/schema/regression checks PASS. Clean full-schema receipt proof remains FAIL; production verification remains UNVERIFIED. This supersedes the earlier local-adapter-only evidence below.

## Approved boundary

Owner approved the existing shared receipt handler, smallest additive persistence needed for deduplication and early arrivals, focused proof, and minimal documentation. No sending policy, recipient, message, invitation/member/payment behavior, UI, provider configuration, secret, or historic record changes.

Grounding: main `bd32fd62`; branch `codex/resend-receipt-reliability`. Team #900 handoff complete. Active checked shared-work PRs #674/#673/#776/#729/#574/#572/#576 have no handler/shared test-workflow overlap. Billing and n8n work remains outside scope.

## Files and source contract

- `supabase/functions/handle-resend-webhook/index.ts`: original signature/timing-safe verification retained; only post-verification receipt persistence delegated.
- `supabase/functions/handle-resend-webhook/handler.ts`: bounded body reader and verified-payload persistence helper, wired into the existing entry point.
- `supabase/migrations/20260903235327_resend_receipt_reliability.sql`: additive processing journal, service-only invoker RPCs, bounded SQL reconciliation schedule, non-unique old receipt identity lookup index. Not deployed.
- `src/solo/resend-receipt-handler.test.ts`: signed request, allowlist and safe logging tests.
- `src/solo/team-invite-lifecycle-migration.test.ts`: existing signature checks retained; old persistence assertions updated to the atomic SQL path.
- `supabase/tests/resend_receipt_reliability.sql`: role, isolation, deduplication, early arrival, rollback/retry, compatibility and negative controls; all fixtures rolled back.
- `scripts/proof/resend-receipt-local-schema.sql`: explicitly restricted disposable local schema adapter, not production schema proof.
- `scripts/proof/resend-receipt-concurrency.mjs`: 16 independent loopback-only database callers.
- `.github/workflows/paige-spine-contract.yml`: relevant SQL/concurrency proof wiring.

Resend is the endpoint caller. Proven provider-ID correlations are portal/Team invitation sends, platform invitation sends, and legacy MCP template sends. The latter platform paths may legitimately have null tenant. Portal nullable/blank email binding is preserved; Team requires its bound recipient. Receipt tenancy, source kind and invitation identity are derived only from the trusted sender row and invitation join, never incoming tenant/recipient payload fields.

Auth/queue and booking paths lack matching provider identities; transactional email and other MCP send tools use other correlation fields. This repair does not expand correlation or enable delivery tracking for those paths. It affects shared tenant/platform receipt infrastructure, not a new tier capability.

## Proposed reliability guarantee

The signed `svix-id` is the stable receipt key. The journal stores only that key, provider message correlation, allowlisted status/time, bounded processing state, and source/outcome identifiers. It is not a tenant-readable notification history.

Receipt locking and outcome append share one transaction. A repeated completed receipt produces no new outcome; a changed identity refuses. Existing matching pre-journal outcomes are reused without modifying historic rows or removing historic duplicates. Distinct provider receipt IDs remain distinct events. Sent reuses the sender's recorded handoff rather than claiming delivery.

Early receipts are retained as pending. Reconciliation claims at most 100 due receipts per minute, backs off from one minute to one hour, and stops at 48 hours or 64 attempts. Unresolved/expired means no proven source outcome, never delivery failure. Append failures retain a pending receipt with a bounded category and roll back the attempted outcome. No source-send triggers or external sending are added.

The original signing secret and endpoint configuration are unchanged. The existing entry point verifies the raw body and five-minute signature window before privileged access. The helper bounds body size, passes only allowlisted fields and logs fixed categories. No raw database error, message content, recipient, credentials, tokens, invite links or payload is logged by this path.

## Evidence

- Existing Team baseline: **56 tests PASS** with original entry point.
- Real entry-point signed-request harness: **22 tests PASS**, including oversized bodies, malformed configuration and refusal before privileged client creation.
- Combined receipt/Team contract and lifecycle suite: **78 tests PASS**.
- Isolated PostgreSQL 16 adapter: SQL behavior/role/isolation/compatibility/forced-failure suite PASS.
- Same migration replayed over the disposable adapter successfully.
- **16 concurrent service-role sessions: one journal entry and one durable outcome PASS**.
- Negative controls remove the completed/old-identity protections and early retention; the same count/durability oracles detect the removed protections.
- Independent security/specification review and separate code-quality/operations review: **PASS**, no material blockers.
- Full production-schema CI, postmerge security/regression checks, and production verification: **PENDING / NOT RELEASED**.
- No production receipt/history data read, mutated, seeded, replayed or cleaned up for proof. Production inspection was limited to policy and extension metadata.

## Integration authority and release gate

An execution safety review initially rejected wholesale entry-point replacement. The owner subsequently explicitly approved the smaller in-place integration retaining the existing signature-verification block. That integration is complete; the former gate is resolved.

Remaining release gate: finish full CI, merge/deploy under the approved cadence, and verify schema/function metadata without live record proof. Receipt processing does not claim webhook configuration or live delivery tracking is ready. No historical replay or cleanup is performed.

Sources: [Svix stable receipt identity and raw-body signature](https://docs.svix.com/receiving/verifying-payloads/how-manual), [Resend retries](https://resend.com/docs/webhooks/retries-and-replays). These describe provider transport semantics, not configured production readiness.
