# UI delivery evidence: INT-118 dictation STOP settlement repair

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The affected flow is the existing Solo PAIGE Chat voice-typing STOP path, from an explicit stop tap through trailing-final delivery, the server's terminal `done` or specific error frame, transport close, timeout, and the unchanged pre-STOP failure path.
PAIGE_UI_DESIGN: PASS: The existing composer, status, and toast treatment remain unchanged. Copy is now state-specific and plain-language for finalize timeout, unavailable finalization, and failed finalization; it never names a provider or blames the user.
VISIBLE_FLOW_IMPACT: YES: After STOP, only the server's `done` receipt settles success; a close without `done` is an honest disconnect, and the three finalization codes surface their specific retry copy instead of the generic failure.
MATERIAL_FLOW_CHANGE: YES: `done` after STOP is the only success signal regardless of close code or `wasClean`. Close without `done` is failure even at code 1000; late transcripts after `done` are ignored; the existing 15-second timeout and pre-STOP `onerror` behavior remain.
FLOW_PROTOTYPE: WAIVED: owner-decision=Antonio Cook owner ruling 2026-09-21 for INT-118; reason=this bug fix removes a false error toast after STOP and makes no visual, layout, or design change
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authenticated Solo PAIGE Chat user dictates into the existing composer, taps STOP, keeps the final words, and receives either quiet success on `done` or a truthful retry message.
VISUAL_DIRECTION: PASS: The incumbent PAIGE composer, dictation control, toast component, layout, focus, motion, and tokens are preserved; only the state selection and three error messages change.
AUTOMATED_EVIDENCE: PASS: Failing-first produced 6 failures and 28 passes before the client fix. The completed focused suite passes 34/34. Removing the `done` handler produces 4 load-bearing failures and 30 passes; restoration returns 34/34 green.
STATIC_EVIDENCE: PASS: Focused tests, adjacent contract tests, scoped ESLint, the repository TypeScript ratchet, production build, evidence validation, Impeccable detector, and `git diff --check` pass; the exported hook API is unchanged.
RENDERED_EVIDENCE: UNVERIFIED: The change uses the existing toast/status presentation but changes visible copy; no authenticated rendered production exercise occurs before deployment.
BEHAVIORAL_EVIDENCE: UNVERIFIED: The owner's 2026-09-21 post-#1320 production check failed with the disconnect state despite all words arriving. Hook tests are automated evidence only; the owner must repeat dictation plus STOP after PR-B deploy.
AUTHENTICATED_RUNTIME: UNVERIFIED: The additive server receipt is live as `paige-dictate` v37 and matches merged PR-A source, but the PR-B client is not deployed; its production `done` handling and copy require the owner's post-deploy live check.
KEYBOARD_FOCUS: NOT_APPLICABLE: No control, focus order, keyboard handler, or focus-restoration behavior changed; the existing STOP control contract is preserved.
ZOOM_REFLOW: NOT_APPLICABLE: No markup, style, sizing, positioning, or responsive rule changed, so this state-machine repair has no zoom or reflow delta.
REDUCED_MOTION: NOT_APPLICABLE: No animation, transition, timing presentation, or motion preference behavior changed.
STATE_COVERAGE: PASS: Automated cases cover final then `done` then close 1006 success, close 1000 without `done` failure, all three server finalization codes, late transcript after `done`, no-toast success, 15-second timeout, and unchanged pre-STOP `onerror`.
TRUTHFUL_STATE_LABELS: PASS: `done` produces quiet success; missing `done` reports disconnect; finalize timeout says it took too long; unavailable/failed finalization says it stopped before finishing; every message offers retry and names no provider.
SOLO_UI: YES: The affected surface is the Solo `PaigeAIChat` side-panel composer on Command Center and every existing consumer of the unchanged `useDictation` public API.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No authenticated production browser drive was performed at this viewport; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: No authenticated production browser drive was performed at this viewport with PAIGE open; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No authenticated production browser drive was performed at this viewport; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: No authenticated production browser drive was performed at this viewport with PAIGE open; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No authenticated production browser drive was performed at this viewport; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: No authenticated production browser drive was performed at this viewport with PAIGE open; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No authenticated production browser drive was performed at this viewport; no layout or geometry changed, and the owner STOP check remains proof owed.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: No authenticated production browser drive was performed at this viewport with PAIGE open; no layout or geometry changed, and the owner STOP check remains proof owed.
UNVERIFIED: Authenticated production dictation followed by STOP, receipt of the trailing final transcript plus `done`, absence of a false toast despite the transport close, the three error-copy states, and the exact production Vercel deployment remain unverified until the owner live check after deployment.

OWNER_INTENT: On STOP, preserve and deliver the trailing final utterance and trust the server's terminal `done` receipt rather than transport close cleanliness.
MUST_NOT_HAPPEN: A close without `done` must not be called success; a `done` receipt followed by close 1006 must not show an error; a transcript after `done` must not duplicate text; raw server/vendor detail must not reach the user.
MUST_PRESERVE: The hook's exported names, option and callback signatures, return shape, start/stream behavior, 15-second timeout, composer delivery callback, pre-STOP error behavior, and PR #1315's chat-container ownership.
ACCEPTANCE_CRITERIA: In authenticated production, dictate text, tap STOP, receive the trailing final words and `done`, and observe idle with no toast even if the later transport close is 1006. Close without `done` must report disconnect; all three server codes must show their documented copy.
PROTECTED_SEAMS: AFFECTED and tested — terminal receipt, post-STOP close classification, finalization-code copy, and late-frame fencing. PRESERVED — public hook API, chat containers, `paige-dictate`, provider routing, authentication transport, database, and all other voice features.

INTERNAL_BUILD_IDENTITY: 1a2bab58e3ecf7dd9645c5fb1596c66ec79464a3; deployment=PROOF_OWED; environment=development; migrations=NOT_APPLICABLE; edge=APPLIED(paige-dictate@v37); evidence=focused-tests+mutation+exact-head-review-pending
RELEASE_CHANNEL: development: PR-B; production deployment follows only after coordinator Ready authorization, merge, and Vercel deploy
RELEASE_CLASSIFICATION: patch: repairs settlement of an existing dictation STOP flow without adding a capability or changing provider behavior
CUSTOMER_RELEASE_IDENTITY: none: internal reliability repair
RELEASE_NOTE_REQUIRED: NO: bounded correction to existing voice typing behavior
RELEASE_TRUTH_BOUNDARY: PARTIAL: automated client receipt behavior and static/build checks are proven; authenticated production STOP remains UNVERIFIED pending the owner live check
RELEASE_RECOVERY: position=roll back the exact PR-B Vercel production deployment if STOP loses trailing text, accepts close without done, falsely errors after done, or changes pre-STOP behavior; reference=INT-118 PR-B

## Before and after

- Before PR-B: #1320 correctly ignored post-STOP `onerror`, but then inferred success from `wasClean`; production closed without a clean frame, so the owner kept all words yet saw “Voice typing disconnected. Please try again.”
- After PR-B: trailing finals continue until the server sends `done`; `done` immediately settles quiet success regardless of the later close code. Any close before `done` reports disconnect, and each server finalization code uses its exact retry copy.
- Unchanged: before STOP, `onerror` remains immediately terminal; the 15-second client settlement timeout remains.

## PR-B proof matrix

| Case | Expected result | Automated result |
| --- | --- | --- |
| final → `done` → close 1006 | trailing text delivered; idle; no error callback/toast | PASS |
| close 1000 without `done` | one truthful disconnect error + code/reason diagnostic | PASS |
| `stt_finalize_timeout` | “Voice typing took too long to finish. Please try again.” | PASS |
| `stt_finalize_unavailable` | “Voice typing stopped before it could finish. Please try again.” | PASS |
| `stt_finalize_failed` | “Voice typing stopped before it could finish. Please try again.” | PASS |
| transcript after `done` | ignored; no duplicate composer text | PASS |
| STOP without receipt/close | existing timeout after 15 seconds | PASS |
| pre-STOP `onerror` | existing immediate connection failure | PASS |

## Test-line disclosure

One pre-existing line was removed from `DictationMicButton.test.tsx` at the former line 266: the click that sent STOP immediately before `socket.error()` inside the combined error-state test. That case therefore moved from a post-STOP error to a pre-STOP error. This matches the repaired contract because immediate `onerror` failure remains correct only before release. Post-STOP behavior is not weakened or omitted: it now has dedicated tests for trailing-final plus clean close, unclean close, and settlement timeout.

## Proof boundary

- Automated: failing-first 6 failures / 28 passes; focused suite 34/34 green; removing `done` handling produces 4 failures / 30 passes; restoration returns 34/34 green. Adjacent contract suite is included in the final verification run.
- Static/build: scoped ESLint, TypeScript ratchet, regression lint, build, and `git diff --check` pass.
- Authenticated production STOP: **UNVERIFIED** until the post-deployment owner live check confirms the final utterance remains in the composer and no false toast appears after the server's `done` receipt.
