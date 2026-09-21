# UI delivery evidence: INT-118 dictation STOP settlement repair

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The affected flow is the existing Solo PAIGE Chat voice-typing STOP path, from an explicit stop tap through WebSocket settlement, trailing-final delivery, clean or unclean close, timeout, and the unchanged pre-STOP failure path.
PAIGE_UI_DESIGN: PASS: No visual design, layout, copy, token, navigation, focus, or accessibility contract changes. The repair keeps the existing composer, status, and toast treatment and makes the result truthful.
VISIBLE_FLOW_IMPACT: YES: The user-visible STOP outcome changes from a premature connection-failure toast after `WebSocket.onerror` to settlement by the subsequent final transcript and close result.
MATERIAL_FLOW_CHANGE: YES: Once STOP has been sent, `onerror` is no longer terminal; the released run waits for final transcript frames plus close, or the existing 15-second settlement timeout. Before STOP, `onerror` remains terminal.
FLOW_PROTOTYPE: NOT_REQUIRED: This is a state-machine correction within the owner-approved dictation interaction; it adds no surface, control, copy, or interaction shape.
AUTOMATED_EVIDENCE: PASS: The focused dictation suite covers all four required cases and passes; the adjacent static contract suite also passes. Removing the released-run guard restores the defect and fails the two post-STOP settlement cases.
RENDERED_EVIDENCE: NOT_APPLICABLE: No markup, style, geometry, copy, focus, or responsive behavior changed.
BEHAVIORAL_EVIDENCE: PASS: Deterministic hook tests drive STOP, `onerror`, trailing `is_final`, clean/unclean close, and the 15-second settlement timer. This is automated state-machine evidence, not authenticated production proof.
AUTHENTICATED_RUNTIME: UNVERIFIED: The authenticated production STOP flow must be exercised by the owner after deployment. Until that live check, production restoration is proof owed.
TRUTHFUL_STATE_LABELS: PASS: A clean close after STOP produces success without an error toast; an unclean close reports a disconnect; silence through the settlement deadline reports a timeout; pre-STOP connection failure keeps the existing connection error.
SOLO_UI: YES: The affected surface is the Solo `PaigeAIChat` side-panel composer on Command Center and every existing consumer of the unchanged `useDictation` public API.
UNVERIFIED: Authenticated production dictation followed by an explicit STOP, receipt of the trailing final transcript, absence of a false toast after clean close, and the exact production Vercel deployment remain unverified until the owner live check after deployment.

OWNER_INTENT: On STOP, preserve and deliver the trailing final utterance; do not surface a false connection failure merely because the browser fires `onerror` during normal released-run settlement.
MUST_NOT_HAPPEN: A post-STOP `onerror` must not discard a trailing final, produce a false error before close, or leave the run unsettled past 15 seconds. A pre-STOP `onerror` must not become non-terminal.
MUST_PRESERVE: The hook's exported names, option and callback signatures, return shape, start/stream behavior, clean/unclean close semantics, 15-second timeout, composer delivery callback, and PR #1315's chat-container ownership.
ACCEPTANCE_CRITERIA: In authenticated production, dictate text, tap STOP, receive the trailing final words in the composer, and observe no error toast after clean closure. Unclean closure must report a truthful disconnect; no settlement within 15 seconds must report the existing timeout.
PROTECTED_SEAMS: AFFECTED and tested — released-run WebSocket error settlement and trailing-final delivery. PRESERVED — pre-STOP errors, public hook API, chat containers, `paige-dictate`, provider routing, authentication transport, database, and all other voice features.

INTERNAL_BUILD_IDENTITY: 1e8caf134621e7e2c3a96b9caf67a4f34b071644; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=focused-tests+mutation+exact-head-review
RELEASE_CHANNEL: development: PR #1320; production deployment follows only after the exact-head review and merge gate
RELEASE_CLASSIFICATION: patch: repairs settlement of an existing dictation STOP flow without adding a capability or changing provider behavior
CUSTOMER_RELEASE_IDENTITY: none: internal reliability repair
RELEASE_NOTE_REQUIRED: NO: bounded correction to existing voice typing behavior
RELEASE_TRUTH_BOUNDARY: PARTIAL: automated hook behavior and static/build checks are proven; authenticated production STOP remains UNVERIFIED pending the owner live check
RELEASE_RECOVERY: position=roll back the exact Vercel production deployment if STOP loses trailing text, falsely reports failure after a clean close, or changes pre-STOP error behavior; reference=PR #1320

## Before and after

- Before: after the user tapped STOP, a browser `WebSocket.onerror` immediately failed the run. A later final transcript could not reach the composer, and even a clean close could leave the user with the connection-failure toast while interim text remained.
- After: after STOP marks the run released, `onerror` does not settle it. Final transcript frames continue to reach the composer. Clean close finishes successfully without a toast; unclean close owns the disconnect error; no close or completion within 15 seconds owns the timeout error.
- Unchanged: before STOP, `onerror` remains immediately terminal with the existing connection-failure message.

## Four-case proof matrix

| Case | Expected result | Automated result |
| --- | --- | --- |
| STOP → `onerror` → final → clean close | trailing text delivered; idle; no error callback/toast | PASS |
| STOP → `onerror` → unclean close | one truthful disconnect error | PASS |
| STOP → silence | existing timeout after 15 seconds | PASS |
| pre-STOP `onerror` | existing immediate connection failure | PASS |

## Test-line disclosure

One pre-existing line was removed from `DictationMicButton.test.tsx` at the former line 266: the click that sent STOP immediately before `socket.error()` inside the combined error-state test. That case therefore moved from a post-STOP error to a pre-STOP error. This matches the repaired contract because immediate `onerror` failure remains correct only before release. Post-STOP behavior is not weakened or omitted: it now has dedicated tests for trailing-final plus clean close, unclean close, and settlement timeout.

## Proof boundary

- Automated: focused dictation plus adjacent contract suites pass 36/36; the load-bearing mutation fails the two post-STOP cases and restoration returns 36/36 green.
- Static/build: scoped ESLint, TypeScript ratchet, regression lint, build, and `git diff --check` pass.
- Authenticated production STOP: **UNVERIFIED** until the post-deployment owner live check confirms the final utterance remains in the composer and no false toast appears after clean close.
