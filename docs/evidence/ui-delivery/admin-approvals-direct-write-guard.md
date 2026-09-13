# UI delivery evidence — delete unmounted approval surfaces + guard the live approve invariant (#15)

This slice **removes** two UNMOUNTED approval surfaces (`src/pages/admin/ApprovalsInbox.tsx`,
`src/pages/admin/ApprovalDetail.tsx`) and adds a CI guard. External Codex review + primary-source
verification established that neither file is imported or routed anywhere in production (App.tsx's
only approvals route is `/app/approvals → ClientApprovals`); the MOUNTED approve surfaces
(`ApprovalRow` via `DraftsAwaitingPanel`/`GamePlanApprovals`, and the Solo/Agency Command Center
hooks) **already** route approve through the canonical `execute-approval` seam, so the "no direct
browser `status='approved'` write" invariant is already met in production. Owner decision
(2026-09-13): guard the live flow + delete the dead files, rather than harden unreachable code
(§70). There is **no visible interface change** — the deleted surfaces were unreachable and the
mounted surfaces are untouched.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: §69 frame — mode=hardening + dead-code removal, depth=standard, crew=implementer + §39 adversarial peer + §5 compliance. The actor-goal flow (operator/tenant approver approves a held act/draft) is UNCHANGED — it already runs through the mounted seam-routed surfaces; this slice deletes two unreachable duplicate surfaces and adds a CI lint that locks the seam-routing invariant so it cannot regress. No flow gains, loses, or changes a step/state/exit.
PAIGE_UI_DESIGN: PASS: paige-ui-design router + references/paige-quality-gates.md + references/review-and-testing.md read; §00 — no visual direction is involved. The two deleted files are UNMOUNTED (no user ever reached them); no mounted surface's appearance, layout, tokens, or copy changes; the added artifact is a CI-only lint (scripts/ci/approval-direct-write-lint.mjs).
MATERIAL_FLOW_CHANGE: NO: no visible flow changes. The deleted ApprovalsInbox/ApprovalDetail were unmounted (unreachable — no route imports them), so removing them changes nothing a user can see or do; the mounted approve surfaces are untouched; the guard is CI-only.
FLOW_PROTOTYPE: NOT_REQUIRED: no visible surface or interface-flow change to prototype — deletion of unreachable code plus a build-time lint; presentation- and flow-unaffected; not a convenience skip.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = future contributors + CI (and, indirectly, the operator/tenant approver whose live approve flow is protected). Primary action being protected = approve a held act/draft through the canonical execute seam. Purpose = (a) remove two unmounted duplicate approve surfaces (§18 redundancy) and (b) lock the invariant that no src/ surface writes the approvals-inbox status='approved' directly, so the compliance the live surfaces already have cannot silently regress. See scripts/ci/approval-direct-write-lint.mjs.
VISUAL_DIRECTION: NOT_APPLICABLE: no visual surface changed — two unmounted files removed, one CI lint added; no pack, tokens, layout, or motion involved.
AUTOMATED_EVIDENCE: PASS: scripts/ci/approval-direct-write-lint.mjs ships a 9-case --self-test (catches a direct approved write; a ternary producing approved; approved not-first-field; ignores a decline/rejected write; ignores a different table's approved write; ignores the canonical execute seam call; ignores comments; honors the approval-write-exempt escape; reports the real line number) — all 9 pass; and the real scan is GREEN across 1184 src files (no direct approved-write to the approvals inbox remains after the dead files are removed). Wired into the CI audit job as lint:approval-direct-write + :test.
STATIC_EVIDENCE: PASS: eslint clean on the changed files; the two deletions break no imports (verified — nothing in src outside the removed files references them); no migration and no edge bundle changed (git diff touches only src deletions, scripts/ci, package.json, .github/workflows/ci.yml).
RENDERED_EVIDENCE: NOT_APPLICABLE: no visible surface is rendered by this change — the deleted files were unmounted (never rendered in production) and the mounted surfaces are untouched; the added artifact is a CI lint.
BEHAVIORAL_EVIDENCE: NOT_APPLICABLE: no runtime UI behavior changed — the removed surfaces were unreachable; the live approve behavior (ApprovalRow / Command Center hooks) is unchanged and already seam-routed.
AUTHENTICATED_RUNTIME: NOT_APPLICABLE: this change alters no runtime behavior (dead-code removal + a CI lint), so no authenticated-runtime proof is owed by it. The live approve flow is untouched and already routes through execute-approval; its own authenticated approve→execute drive is a pre-existing, separately-tracked item, not introduced or affected here.
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive surface changed.
ZOOM_REFLOW: NOT_APPLICABLE: no layout changed.
REDUCED_MOTION: NOT_APPLICABLE: no motion changed.
STATE_COVERAGE: NOT_APPLICABLE: no visual states changed; the guard's positive/negative cases (approved write / ternary / decline / other-table / seam-call / comment / exemption / line-number) are recorded under AUTOMATED_EVIDENCE.
TRUTHFUL_STATE_LABELS: NOT_APPLICABLE: no UI labels or states ship in this change (the labelled surfaces are being removed as unmounted; the mounted surfaces are untouched).
SOLO_UI: NO: no src/solo, tenant-shell, growth, or public UI path changed — the deletions are under src/pages/admin and the guard is under scripts/ci.
UNVERIFIED: nothing for this change — it is fully proven headless (guard self-test 9/9 + green scan across 1184 files + no-import verification for the deletions), and it changes no runtime behavior so no runtime/authenticated proof is owed.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->

INTERNAL_BUILD_IDENTITY: 02b8f1d65928a25aaae7c162de7f789492e12ec2; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=this-PR-and-scripts/ci/approval-direct-write-lint.mjs(9-case-self-test)
RELEASE_CHANNEL: development: frontend/CI-only change on the branch; deploys to production via Vercel on merge (no migration, no edge bundle — db-live/edge-live do not move)
RELEASE_CLASSIFICATION: internal-only: dead-code removal (§18) + a CI regression guard (§10/§18/§70) locking the frontend approve invariant; no owner-decided customer release
CUSTOMER_RELEASE_IDENTITY: none: internal engineering hardening, no customer-decided release
RELEASE_NOTE_REQUIRED: NO: removes two unmounted (never-shipped-to-a-user) surfaces and adds a CI lint; no customer-facing change
RELEASE_TRUTH_BOUNDARY: LIVE: the guard and the dead-code removal are fully proven headless (self-test 9/9, green scan across 1184 src files, no-import verification) and CI-enforced on merge; the change alters no runtime behavior, so there is no PARTIAL/PROOF-OWED runtime remainder
RELEASE_RECOVERY: position=revert this PR with a follow-up commit that re-adds the two deleted files (still unmounted, so still unreachable) and removes the CI lint — no migration, edge bundle, db-live, or edge-live movement to reverse; reference=git revert of the merge commit, and the deleted surfaces carry no data or runtime state
