# UI delivery evidence: INT-102A PaigeAIChat composer scope

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The installed Flow-by-Flow skill and every routed orchestration, delivery, audit, build, verification, and review reference were read completely. The affected-flow packet covers initial history resolution, explicit New chat, saved-thread hydration and failure, tenant/effective-user/client/mission transitions, typing, dictation delivery, send, Retry, lazy thread creation, Live thread creation, request abort, sign-out isolation, and cleanup exits for the PaigeAIChat family.
PAIGE_UI_DESIGN: PASS: The PAIGE UI Design skill and every routed reference were read completely. No visual design, layout, token, typography, navigation, copy, or information architecture changed; the existing composer controls now derive disabled/writable state from one complete scope handle.
MATERIAL_FLOW_CHANGE: YES: Unsent typed or dictated text now belongs to its tenant + effective user + conversation + focused client + focused mission, restores only in that exact scope, and stale async work can no longer write across a transition.
FLOW_PROTOTYPE: PASS: The owner-approved INT-102 state-machine contract and accepted 2026-09-22 split plan are represented by the deterministic transition table in src/lib/paigeComposerScopeState.test.ts and the three-mount interaction prototype in src/components/dashboard/PaigeAIChat.composerScope.test.tsx; the tests were written and run failing-first before implementation.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: A signed-in tenant workspace, tenant-less platform desk, or Solo user can write in the displayed PAIGE conversation, switch context without losing or leaking an unsent draft, return to restore it, and send only from the fully resolved displayed scope.
VISUAL_DIRECTION: PASS: Existing PaigeAIChat composer geometry, controls, labels, status treatment, and design tokens are preserved. This is state ownership and request fencing only; no visual design changed.
AUTOMATED_EVIDENCE: PASS: Failing-first on current main produced 16 failures and 8 passes. Codex review's controlled-parent load-failure case also failed first (thread-b remained selected instead of restoring thread-a). The second review's controlled-selection race, repeated-New-chat pending turn, and focused failed-draft reconciliation cases each failed before repair. The restored focused suite passes 80/80 across the pure resolver, PaigeAIChat integration, PaigeAIChat-only dictation assertions, and Solo contract. A wider 15-file affected-family run passed 210/211 before the review repairs; its sole failure is a current-main brittle source-text assertion in unchanged TenantCommandCenterShell.ownership.test.tsx, separately handed off under the found-bug rule.
STATIC_EVIDENCE: PASS: Scoped ESLint is clean; TypeScript ratchet reports baseline 12/current 12; production build succeeds with 5,699 modules; git diff --check passes; Impeccable context classified the work SCOPED_EXISTING_ALLOWED and its one final detector pass returned [].
RENDERED_EVIDENCE: UNVERIFIED: No authenticated or browser-rendered frame was captured for this branch. The diff changes no classes, layout, copy, or control structure, so no screenshot is presented as proof of the new state behavior.
BEHAVIORAL_EVIDENCE: PASS: React/jsdom drives the real PaigeAIChat composer through initial-history and confirmed-empty states, tenant workspace, tenant-less platform desk, Solo, agency/sub-account switches, client/mission/clear-focus switches, per-thread draft restoration, load failure, lazy thread migration, Retry, request abort, stale dictation, and Live thread creation. This is component behavior only; authenticated execution is separately UNVERIFIED.
AUTHENTICATED_RUNTIME: UNVERIFIED: No controlled authenticated tenant, platform, or Solo session was driven against a deployment; production behavior and persistence remain owed after release.
KEYBOARD_FOCUS: UNVERIFIED: Existing textarea and native-button keyboard semantics are structurally unchanged and component tests exercise disabled/enabled state, but a browser keyboard route was not driven on this branch.
ZOOM_REFLOW: UNVERIFIED: Browser zoom and reflow were not re-driven; no geometry, CSS, or responsive behavior changed.
REDUCED_MOTION: PASS: No motion or animation changed; existing reduced-motion behavior remains byte-unchanged.
STATE_COVERAGE: PASS: Identity unresolved, history unresolved, hydrating, ready-new, ready-thread, busy, empty history, newest-thread auto-resume, explicit and repeated New chat, controlled selection before hydration, load failure, focused-draft reconciliation, same-scope lazy persistence, account/user/client/mission/focus transition, late dictation, aborted request, successful/failed Retry, edited Retry draft, and sign-out/effective-user isolation are covered.
TRUTHFUL_STATE_LABELS: PASS: Existing capability labels remain unchanged. A composer is disabled until the complete displayed handle is writable, and no success, persistence, provider, or LIVE claim was added.
SOLO_UI: YES: The canonical Solo PaigeAIChat composer is one explicit mount row; its visual treatment is unchanged while draft and async-delivery ownership become tenant/user/conversation/focus exact.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: No authenticated browser drive at this viewport; no geometry changed.
UNVERIFIED: Authenticated production, browser keyboard/focus, zoom/reflow, real provider streaming, and post-deploy tenant/platform/Solo acceptance remain unverified.

OWNER_INTENT: The accepted INT-102A split ruling dated 2026-09-22 authorizes the PaigeAIChat-only state machine, per-thread drafts, request fences, Live fence, dictation assertions, Solo contract, explicit tenant workspace/platform/Solo rows, tenant-less platform regression, and agency/sub-account characterization, with no PaigeChat identity or send change.
MUST_NOT_HAPPEN: A draft or late stream/dictation callback must never cross tenant, effective user, conversation, client focus, or mission focus; a pending hydration must never remain writable; a stale request must not clear or reopen the target scope's busy state; no tenant-specific code or fixture may ship.
MUST_PRESERVE: PaigeChat/AppShell identity and send behavior, ConversationsRichComposer, providers, Edge functions, database, attachment behavior, existing visuals/copy, approved dictation behavior, transcript persistence, and the separate INT-115 and INT-126 scopes remain unchanged.
ACCEPTANCE_CRITERIA: In tenant workspace, tenant-less platform, and Solo mounts, type in thread A, switch to B, verify B has only its draft, return to A, and verify A restores. Repeat across tenant/effective-user/client/mission/clear-focus changes; verify the origin request and dictation stop delivering. Send a New chat, verify lazy thread migration, successful Retry clearing only unchanged submitted text, failed Retry preserving it, and newer edits surviving. Start Live thread creation, switch scope before resolution, and verify the orphan is not adopted.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Tested: PaigeAIChat tenant workspace, tenant-less platform desk, Solo, thread hydration, in-session draft store, dictation delivery, request/busy ownership, Retry clearing, lazy New-chat migration, and basic Live post-await adoption fence. Unaffected and excluded: PaigeChat/AppShell tenant and identity resolution/send, ConversationsRichComposer, MessageAudioButton, providers, supabase, database, entitlements, INT-115, and INT-126's transition-generation ABA follow-up.

INTERNAL_BUILD_IDENTITY: 24cecf017712cd05d3d45f69f0ad14718127ed89; synced-base=b86088bc4520eaa5457c91f2bbfa7f3c867f09ae; implementation-commit=0b75b09c5fc47ac8465d45bacd8ab58700442668; deployment=none-pre-ready; environment=local; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=failing-first+80-focused+210-of-211-prior-broad+three-mutations+eslint+tsc-ratchet+build+impeccable
RELEASE_CHANNEL: development: Draft PR only; the live-path gate requires exact-head CI and Codex review, followed by a coordinator ruling before Ready
RELEASE_CLASSIFICATION: patch: restores per-conversation in-session draft ownership and complete-scope async fencing in the PaigeAIChat family without visual, provider, schema, or entitlement change
CUSTOMER_RELEASE_IDENTITY: none: internal PAIGE Chat state-isolation repair pending coordinator release ruling
RELEASE_NOTE_REQUIRED: NO: bounded correction to the existing approved PAIGE Chat flow
RELEASE_TRUTH_BOUNDARY: PARTIAL: local state transitions, component behavior, mutations, static gates, and unchanged visual source are proven; authenticated deployed behavior is UNVERIFIED until a controlled production drive
RELEASE_RECOVERY: position=revert the INT-102A merge if deployed behavior regresses, otherwise stop and return for coordinator disposition; reference=INT-102 accepted split ruling dated 2026-09-22

## Scope and collisions

- Classification: INT-102A, the PaigeAIChat-only half of the accepted INT-102A → INT-126 → INT-102B sequence.
- Affected flows: in-session composer draft ownership, conversation hydration, request/busy delivery, Retry clearing, dictation delivery, lazy thread migration, and basic Live thread adoption for PaigeAIChat mounts.
- Explicit mount rows: tenant workspace, tenant-less platform desk, and Solo.
- Neighboring regressions: document attachment, transcript rendering, client focus, Solo account switch, command chips, confirmations, and existing dictation controls.
- Active-owner/file collisions: parked #1315 remains untouched. This branch contains no PaigeChat.tsx, ConversationsRichComposer, MessageAudioButton, supabase, provider, migration, or shared Edge file.
- Explicit exclusions: INT-115 View-as-Client send, INT-126 Live ABA transition generation, INT-102B client-portal identity, AppShell behavior, local/session storage, server-side draft persistence, providers, and all unrelated bugs.

## User job and state map

The complete identity is tenant + effective user + focused client or explicit none + focused mission or explicit none. Conversation adds New-chat or persisted thread identity. History starts unresolved, then becomes confirmed empty or hydrates a requested thread. Only a complete identity whose displayed and requested conversation agree is writable. Scope change removes writability immediately, aborts the origin request, stops accepting dictation, and preserves each delivered draft under its origin handle. A successful [DONE] clears only an unchanged submitted draft; failure or a newer edit preserves it. Lazy thread creation moves the origin New-chat draft to the persisted thread only while its scope remains current.

## Evidence index

- Base/current main: b86088bc4520eaa5457c91f2bbfa7f3c867f09ae (original authorized baseline: 2546ceb5be44cb8f7addbb70db4bf35b94e399ee; all later main syncs were conflict-free).
- Exact code head before this evidence-only update: 24cecf017712cd05d3d45f69f0ad14718127ed89 (review-fix implementation commit: 0b75b09c5fc47ac8465d45bacd8ab58700442668).
- Failing-first: `npx vitest run src/components/dashboard/PaigeAIChat.composerScope.test.tsx src/components/voice/DictationComposer.contract.test.ts --reporter=verbose` → 16 failed, 8 passed on current-main behavior before implementation.
- Focused proof: resolver + PaigeAIChat integration + dictation contract + Solo contract → 80/80.
- Wider affected-family proof: 15 files → 210/211; sole failure is unchanged current-main source assertion at src/components/tenant-shell/TenantCommandCenterShell.ownership.test.tsx:224. Both that test and src/solo/SoloApp.tsx are byte-unchanged in this branch.
- Mutation 1: remove client/mission from the full handle comparison → 1 failed, 46 passed; full-scope delivery test rejects the mutation.
- Mutation 2: remove the request-handle comparison → 1 failed, 46 passed; stale tenant delivery is accepted and the fence test fails.
- Mutation 3: remove the Live post-await handle/epoch check → all five tenant/effective-user/client/mission/clear-focus orphan-adoption rows fail.
- Review-fix failing-first: round one left a controlled parent on thread-b after B hydration failed; the regression expected restored thread-a and failed before repair. Round two separately proved (1) an awaited controlled selection projected thread-a over requested thread-b, (2) repeated New chat cancelled an already-new pending turn before any fetch, and (3) focus release made a failed focused-thread draft unreachable.
- Restored proof: focused 80/80; PaigeAIChat client-scope plus composer-scope 37/37; scoped ESLint clean; CI regression gate clean; TypeScript ratchet 12/12; production build 5,699 modules; Impeccable detector [].

## Review and limitations

The first exact-head Codex review found one P2 controlled-parent recovery defect; it was fixed failing-first and individually dispositioned. The next exact-head review found three P2 scope-transition defects; all three were repaired failing-first in the capped second round. A final exact-head review and hosted CI remain the pre-Ready gates and will be recorded on the PR thread. No authenticated or browser-rendered runtime was driven. The test-only current-main assertion failure is outside this diff and is logged as #1330 under the found-bug handoff rule. Section 4 of the Master Reference is intentionally not updated before merge, per the coordinator ruling.
