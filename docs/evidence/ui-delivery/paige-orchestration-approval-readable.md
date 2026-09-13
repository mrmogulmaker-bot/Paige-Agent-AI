# UI delivery evidence: Layer-C held-act approvals are readable in the owner inbox

Declared via a `Visible-Flow-Impact: yes` commit trailer because migration `20270306000000` changes what
the owner sees in the EXISTING approvals inbox: a held Layer-C act's companion approval row now carries a
human-readable description (`summary` + `draft_content.subject/preview/body`) instead of rendering
"(no summary)". No React/UI file changes and no redesign of the inbox — the existing `ApprovalRow.tsx`
renderer is unchanged; this populates the backend data it already reads (§00: Claude Code ports/records the
existing visual direction, it does not design it). Honest boundary: the authenticated approve→execute
live-drive is PROOF OWED (headless session — no JWT/Solo test tenant, MCP prod SQL permission-denied).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: §69 pre-edit frame in the fix-forward PR (mode=fix-forward, depth=standard, crew=implementer+§39+§5, failing-first pgTAP); actor=operator/tenant approver, goal="see WHAT action and WHICH record a held Layer-C act is asking approval for, then approve or decline"
PAIGE_UI_DESIGN: PASS: paige-ui-design router read; §00 confirms no visual direction to port — the inbox surface (ApprovalRow.tsx / paige_approval_queue_v) is unchanged; the fix writes the backend fields (summary, draft_content.subject/preview/body) the approved renderer already consumes, so there is no new surface/pack/token to design
MATERIAL_FLOW_CHANGE: NO: the approvals inbox — its surfaces, states, transitions, and exits — is unchanged; the change is backend (the minted companion row now carries a readable description the existing renderer shows), with no new or altered visual state to prototype
FLOW_PROTOTYPE: NOT_REQUIRED: no visual surface or interface-flow change to prototype (a backend migration populating data the existing inbox already renders); not a convenience skip
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = operator/tenant approvers (admin/coach) of a tenant with a held Layer-C act; primary action = read the held act's readable summary/description in the approvals inbox and approve (drives execution) or decline (cancels); purpose = make the high-risk held-act approval self-explanatory (§70 — the owner must know what and whom they are approving) instead of "(no summary)"
VISUAL_DIRECTION: NOT_APPLICABLE: no visual surface changed; no pack, tokens, layout, or motion involved (backend migration; the inbox component is unchanged)
AUTOMATED_EVIDENCE: PASS: supabase/tests/paige_orchestration_companion_minting.sql 45/45 — proven locally against a native PostgreSQL 16 cluster with BOTH migrations (20270303000000 + 20270306000000) applied in order, and wired into the required database-contract CI job (full prod-schema replay); includes readable-output assertions (subject/summary/preview/body), the ledger-proven guard (JWT forge refused, unresolved-ledger refused, executed-ledger allowed), reconciler actual-outcome stamping, and idempotent backfill
STATIC_EVIDENCE: PASS: lints green — migration-versions (20270306000000 unique; renumbered up from 20270304000000 as E5 #1220/#1237 and #1233 successively occupied 20270304/20270305 on main), definer-fns, managed-schema, action-authority, write-targets, governed-execution, approval-gate; the helper is a pure (non-DEFINER) content builder
RENDERED_EVIDENCE: NOT_APPLICABLE: no visual surface is rendered by this change; the existing ApprovalRow.tsx / paige_approval_queue_v renderer is unchanged and reads the now-populated fields
BEHAVIORAL_EVIDENCE: PASS: the 45-assertion pgTAP exercises the real triggers + reconciler + backfill against the replayed schema — mint writes a readable summary/draft_content (never "(no summary)"), the direct-approve guard refuses a JWT caller and any not-yet-resolved ledger act (forged metadata.act_outcome notwithstanding) and admits only the service-role executor path with a terminal ledger, the reconciler stamps the companion from the RPC's ACTUAL outcome, and the backfill is idempotent; the authenticated end-to-end drive is under AUTHENTICATED_RUNTIME
AUTHENTICATED_RUNTIME: UNVERIFIED: the authenticated approve→execute live-drive on a real held act (create an approval-required governed act → confirm one inbox row → approve once → one canonical domain action + durable readback + Rail + receipt, no duplicate) is owed to a browser/JWT/prod-SQL-capable session — this headless session has no authenticated user session and its MCP prod SQL is permission-denied; affects the claim that the owner can complete the approve flow on the live platform
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive visual surface changed (backend migration)
ZOOM_REFLOW: NOT_APPLICABLE: no visual surface changed
REDUCED_MOTION: NOT_APPLICABLE: no motion added or changed
STATE_COVERAGE: PASS: the companion row's states are covered in pgTAP — pending (minted, readable), approved (service-role executor/reconciler with a terminal ledger), rejected/skipped (cancellation-sync settles the ledger), and the backfilled pending state; each an honest, ledger-consistent state
TRUTHFUL_STATE_LABELS: PASS: the inbox status and the stamped metadata.act_outcome always reflect the canonical ledger — approved is admitted only when paige_act_executions is terminal (executed|failed), and the reconciler stamps the ACTUAL outcome (never a stale requested value); a still-held act can never read as approved
SOLO_UI: NO: not a Solo operator interface change; a backend migration to the shared approvals fabric; no src/solo, tenant-shell, growth, or public UI path changed
UNVERIFIED: the authenticated approve→execute live-drive (§32.c/§70) on a real held act — owed to a browser/JWT/prod-SQL-capable session unavailable to this headless run; all DB behavior is proven headless via the 45-assertion pgTAP

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: d9ff74baa9dc968a7f2c69259662ba2c54c0369f; deployment=none-pre-merge; environment=development; migrations=PROOF_OWED(persisted-apply-on-merge-via-deploy-migrations-db-live); edge=NOT_APPLICABLE; evidence=fix-forward-PR-and-supabase/tests/paige_orchestration_companion_minting.sql
RELEASE_CHANNEL: development: docs + migration on the fix-forward branch; the migration applies to production on merge via deploy-migrations
RELEASE_CLASSIFICATION: internal-only: a backend correctness/§70/§13 hardening of the Layer-C companion-mint seam; no owner-decided customer release
CUSTOMER_RELEASE_IDENTITY: none: internal engine-seam hardening, no owner-decided customer release
RELEASE_NOTE_REQUIRED: NO: internal correctness hardening; no customer-visible surface change (the approvals inbox surface is unchanged; it now shows a readable description for held Layer-C acts that were not yet being emitted to customers)
RELEASE_TRUTH_BOUNDARY: PARTIAL: the four DB fixes are proven headless (45-assertion pgTAP, both migrations applied) and persist-apply on merge; the authenticated approve→execute live-drive is PROOF OWED
RELEASE_RECOVERY: position=ship a FORWARD cleanup migration that DROPs the four objects (mint, cancellation-sync, guard, reconciler functions plus the paige_ppa_orchestration_act_uk index) and restores the prior 20270303000000 bodies via CREATE OR REPLACE, NEVER a git revert (a git revert does not reverse an applied migration and can wedge later deploys because supabase db push applies only unrecorded migrations); reference=a new forward migration authored on merge if rollback is needed, no edge rollback since this migration changed no edge bundle

## Scope and collisions

- Classification: backend migration (`20270306000000`) with a declared visible-flow impact; no UI source file changed.
- Affected flow: an operator/tenant approver opens the approvals inbox, sees a held Layer-C act's companion approval with a readable description (action + record + args), and approves (drives execution via execute-approval) or declines (cancels the held act).
- Neighboring regressions: none — the mint/guard/cancellation-sync/reconciler are CREATE OR REPLACE of the existing 20270303000000 functions; the trigger definitions are unchanged; the approvals inbox component and view are untouched.
- Active-owner/file collisions: none — #1225 (the base slice) and #1232 (its closeout) are merged; this fix-forward owns the current migration + test + doc corrections.
- Explicit exclusions: the authenticated approve→execute live-drive (PROOF OWED); the broader approvals-RLS tenant-scoping (the §59 global-role trap on the whole table) remains the separate owner-decided follow-up — the guard's JWT-refusal + ledger cross-check fully prevents a browser caller from forging an orchestration approval, so it is not reworked here.

## User job and state map

Purpose: an operator/tenant approver must be able to understand and act on a held Layer-C act in the approvals inbox. Audience: admin/coach approvers of a tenant with a held act. Primary action: read the readable summary/description and approve (execute-approval drives the act → terminal ledger outcome → the guard admits the approved stamp) or decline (cancellation-sync settles the ledger to cancelled). States: pending (readable) / approved (only with a terminal ledger, service-role only) / rejected / skipped / backfilled-pending — every state ledger-consistent. Scroll owner: N/A (no UI change).

## Evidence index

- `supabase/tests/paige_orchestration_companion_minting.sql` → 45/45 assertions, proven locally against PostgreSQL 16 with both migrations applied in order (roles seeded, zero apply errors), and wired into the required `database-contract` CI job.
- Lints: `migration-versions`, `definer-fns`, `managed-schema`, `action-authority`, `write-targets`, `governed-execution`, `approval-gate` — all green.
- §39 adversarial peer + §5 compliance: reviewed the pushed diff (findings folded in the PR).
- Redacted: no secrets or customer data in this record.

## Review and limitations

The four fixes address the external Codex review findings on the shipped slice (#1225): readable approval (§70), a ledger-proven direct-approve guard with no client-writable bypass (§13/§70), reconciler stamping from the RPC's actual outcome (§13), and an idempotent backfill for pre-mint held acts. Finding-3 test boundary (§13, honest): the reconciler code now captures and stamps the monotonic RPC's RETURNED row, and the pgTAP EXERCISES that return path — but a single-transaction pgTAP cannot construct the concurrency divergence the fix targets (a persisted outcome ≠ the requested one), so both seeded reconciler cases have actual==requested; the correctness of the divergence branch rests on the §39 adversarial read of the RPC's monotonicity, not on an isolating assertion. Limitation: the authenticated approve→execute live-drive is the one outstanding proof (UNVERIFIED above). The broader table-wide approvals-RLS weakness (the §59 global-role trap; NULL-tenant rows) is deliberately out of scope — the guard prevents the browser forge for orchestration rows (which always carry a non-null tenant_id, so `tenant_isolation` already blocks cross-tenant writes) — and remains the separate owner-decided follow-up.
