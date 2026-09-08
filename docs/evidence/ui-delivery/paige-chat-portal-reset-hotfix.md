# Chat portal reset hotfix — CI delivery receipt

Canonical investigation and closeout: [existing forensic record](paige-chat-scroll-forensic-regression-correction.md). This required PR receipt is not another ledger.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: canonical forensic record contains affected-flow, current-main collision and failing-first assessment
PAIGE_UI_DESIGN: PASS: project skill and all routed references read; no presentation redesign
MATERIAL_FLOW_CHANGE: NO: restores the already approved indefinite reading-position contract
FLOW_PROTOTYPE: NOT_REQUIRED: removes redundant DOM movement without changing owner actions or surfaces
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: owner reads a long conversation at the chosen position indefinitely
VISUAL_DIRECTION: PASS: unchanged existing chat, composer, Jump to latest and pop-out
AUTOMATED_EVIDENCE: PASS: 144 affected tests; full suite 292 files and 4051 tests; shell negative control failed with two redundant moves before guard
STATIC_EVIDENCE: PASS: build; type ratchet baseline13/current13; lint zero errors/five existing warnings; security definer lint
RENDERED_EVIDENCE: PASS: 127/127 real-component synthetic-transport checks, scripts/live-drive/artifacts/paige-scroll-stability-react/report.json and five viewport screenshots
BEHAVIORAL_EVIDENCE: PASS: same-parent refresh previously reset all five viewports to zero; now middle and one-pixel positions unchanged immediately, across12frames and2400ms; stream/status/receipt/thread/resize/minimize/pop-out return checks pass
AUTHENTICATED_RUNTIME: UNVERIFIED: signed-in browser bridge exits before session access; owner production acceptance remains required after deployment
KEYBOARD_FOCUS: PASS: existing keyboard/focus controller and shell tests included in144 affected tests
ZOOM_REFLOW: PASS: required widths plus520x820 have no transcript horizontal overflow; browser zoom beyond width reflow not re-proven
REDUCED_MOTION: PASS:1366x768 uses native no-preference motion; other viewports reduce; no product animation or timer added
STATE_COVERAGE: PASS: middle/one-pixel/bottom follow; token/tool/receipt; thread/reload; resize/minimize/pop-out; isolated synthetic tenant return
TRUTHFUL_STATE_LABELS: PASS: controlled evidence is not authenticated production acceptance; owner-reported failure remains open
SOLO_UI: YES: shared Solo chat portal only; no Secure Browser mount change
UNVERIFIED: authenticated production acceptance; physical touch device; screen-reader/zoom conformance; history prepend is controller/React proof because backend pagination is not implemented; every painted frame of existing minimize animation is not proven
INTERNAL_BUILD_IDENTITY: 02153224b5416e311448ac7f5d8caa2c13f9641f; deployment=NOT_DEPLOYED; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=canonical forensic record plus final PR head/checks
RELEASE_CHANNEL: development: authorized production hotfix awaiting exact-head CI/review
RELEASE_CLASSIFICATION: patch: remove unnecessary chat host reinsertions
CUSTOMER_RELEASE_IDENTITY: none: internal hotfix, no publication authority requested
RELEASE_NOTE_REQUIRED: NO: internal corrective patch
RELEASE_TRUTH_BOUNDARY: PROOF OWED: signed-in production acceptance, not a LIVE claim
RELEASE_RECOVERY: position=revert this guard if a new regression is proven; reference=canonical forensic record
SOLO_1536X770_PAIGE_CLOSED: PASS:127-check report and1536x770-closed.png
SOLO_1536X770_PAIGE_OPEN: PASS:127-check report and1536x770-open.png
SOLO_1366X768_PAIGE_CLOSED: PASS:127-check report and1366x768-closed.png
SOLO_1366X768_PAIGE_OPEN: PASS:127-check report and1366x768-open.png; settled minimize transition
SOLO_1024X768_PAIGE_CLOSED: PASS:127-check report and1024x768-closed.png
SOLO_1024X768_PAIGE_OPEN: PASS:127-check report and1024x768-open.png
SOLO_900X1000_PAIGE_CLOSED: PASS:127-check report and900x1000-closed.png
SOLO_900X1000_PAIGE_OPEN: PASS:127-check report and900x1000-open.png

## Evidence boundaries

The initial full drive was interrupted by a local rebase causing Vite reload (53/54), not accepted as proof. The next run was126/127 because it captured a temporary narrow minimize-animation layout before measuring a later tenant return. The test-only helper already preserved on the unmerged #1076 branch waits for actual finite animation completion, not a new product timeout, before taking that baseline. All original assertions remain; final127/127 passes. This proves settled transition endpoints, not every animation frame. Same-parent refresh tests separately assert immediate position and12successive frames without a settle exemption.
