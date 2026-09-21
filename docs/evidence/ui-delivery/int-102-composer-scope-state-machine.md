# UI delivery evidence: INT-102 composer scope state machine

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: the complete Flow-by-Flow skill and routed references were read; the affected-flow packet below covers typed/dictated draft entry, history resolution, thread/account/user transitions, send/retry completion, and exits
PAIGE_UI_DESIGN: PASS: the complete PAIGE UI Design skill, doctrine, modules, accessibility checklist, and review protocol were read; this repair changes no visual design, layout, token, hierarchy, or interaction affordance
MATERIAL_FLOW_CHANGE: YES: owner-approved INT-102 changes unsent text from one shared composer value into session-memory drafts owned by a complete tenant + user + conversation scope, with explicit non-writable transition states
FLOW_PROTOTYPE: PASS: the owner-approved 2026-09-21 Option 2 contract memo and the deterministic transition table below are the flow prototype; they specify every state, transition, write gate, and completion consequence without inventing a new visual treatment
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a signed-in PAIGE user can write in one conversation, move elsewhere, and return without losing words or seeing them in another tenant, user, or thread
VISUAL_DIRECTION: PASS: preserve both existing composer designs and controls exactly; only their enabled state, truthful existing status region, and in-memory value source change
AUTOMATED_EVIDENCE: PASS: the round-one test-first head failed 3 files / 5 tests (27 passed) before implementation; completed focused verification passes 11 files / 115 tests; removing the full-handle delivery check fails its load-bearing test (1 failed / 20 passed) and restoring it passes 21/21
STATIC_EVIDENCE: PASS: focused ESLint, TypeScript ratchet, regression lint, production build, and git diff whitespace check pass; PR diff has zero files under supabase/ and does not touch MessageAudioButton
RENDERED_EVIDENCE: UNVERIFIED: no authenticated browser or preview drive was available before review; no visual or layout rule changed
BEHAVIORAL_EVIDENCE: PASS: jsdom integration tests drive both composer mounts through unresolved identity/history, thread hydration, tenant/user switches, late dictation, lazy thread creation, terminal stream completion, failure, Retry, and edit preservation
AUTHENTICATED_RUNTIME: UNVERIFIED: production deployment and authenticated interaction have not occurred; session-memory restoration and account/thread switching remain production proof owed
KEYBOARD_FOCUS: UNVERIFIED: native textarea/button keyboard semantics and existing focus calls are unchanged and statically inspected, but no authenticated browser keyboard drive was performed
ZOOM_REFLOW: UNVERIFIED: no rendered 200% zoom/reflow drive was performed; no geometry or CSS changed
REDUCED_MOTION: PASS: no animation, motion, or transition behavior changed
STATE_COVERAGE: PASS: identity-unresolved, history-unresolved, hydrating, ready-new, ready-thread, busy, explicit New, automatic resume, controlled selection, load failure, lazy persistence, sign-out, account/effective-user change, View-as-Client tenant resolution, mid-stream identity/thread switches, dictation delivery, send, truncated stream, and all four Retry/edit outcomes are covered
TRUTHFUL_STATE_LABELS: PASS: a composer is writable only with a complete displayed scope handle; unresolved/loading/switching states use the existing status region and no failed/truncated response clears the retained draft
SOLO_UI: YES: the canonical Solo PAIGE workspace composer is affected, alongside the AppShell PaigeChat composer
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no authenticated rendered drive; shell geometry is unchanged
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no authenticated rendered drive; component behavior is structurally covered
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no authenticated rendered drive; shell geometry is unchanged
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no authenticated rendered drive; component behavior is structurally covered
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no authenticated rendered drive; shell geometry is unchanged
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no authenticated rendered drive; component behavior is structurally covered
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no authenticated rendered drive; shell geometry is unchanged
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no authenticated rendered drive; component behavior is structurally covered
UNVERIFIED: authenticated production behavior, rendered viewport evidence, and page-reload draft survival; reload survival is intentionally out of scope because storage is session memory only

OWNER_INTENT: The 2026-09-21 Option 2 ruling requires one shared pure ComposerScopeState resolver for AppShell PaigeChat and PaigeAIChat so unsent words belong only to the tenant, effective user, and displayed conversation where they were entered.
MUST_NOT_HAPPEN: No lost input; no cross-tenant, cross-user, or cross-thread draft; no write while identity/history/transcript is unresolved; no duplicate send; no newer edit cleared or auto-sent by Retry; no late dictation delivery into a new scope; no visual redesign; no Supabase, MessageAudioButton, or deferred Draft-with-Paige change.
MUST_PRESERVE: Existing composer layouts, keyboard entry, dictation teardown and delivery fence, attachments, history rail, client focus, stream protocol, provider path, approval actions, thread persistence, transcript scroll, and current account-switch teardown.
ACCEPTANCE_CRITERIA: Draft A is disabled but remains visible while B hydrates, then B's own draft appears; returning to A restores A; explicit New owns a stable slot; first thread persistence migrates that slot; successful terminal send clears only the submitted unchanged draft; failure or newer edits preserve it; tenant/user/sign-out changes expose no prior draft; late dictation is dropped.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: AFFECTED and tested — AppShell PaigeChat composer, Solo/AppShell PaigeAIChat composer, View-as-Client displayed-tenant read, history hydration, controlled selection, session-memory draft store, dictation delivery, send/retry completion, and request abort/delivery fences. NOT AFFECTED — MessageAudioButton and INT-104 voice ownership; Draft with Paige deferred P2; ConversationsRichComposer implementation; authenticated send authority; Edge functions and _shared; provider/model/tool execution; migrations; durable storage.

INTERNAL_BUILD_IDENTITY: 428c39165fc4726ba3de5acf3fadea82c771d6c8; deployment=none-pre-push; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=this record, transition-table suite, both mount suites, and focused 115-test regression set
RELEASE_CHANNEL: development: post-sync branch build from current main 47291b603ccae615145d313d11ce2620e8cf03cd; production deploy is authorized only after the Ready/review/CI gates
RELEASE_CLASSIFICATION: patch: restores conversation-owned unsent text and fail-closed scope transitions in existing PAIGE composer flows
CUSTOMER_RELEASE_IDENTITY: none: internal reliability and tenant-isolation repair, not a separately named customer release
RELEASE_NOTE_REQUIRED: no: no approved customer publication record and no new advertised capability
RELEASE_TRUTH_BOUNDARY: PARTIAL: deterministic and jsdom proof establishes the state, storage, delivery, and completion contracts; PROOF OWED: authenticated production restoration and account/thread switching after Vercel deployment
RELEASE_RECOVERY: position=roll back the exact Vercel frontend deployment if authenticated drafts are lost, leaked, duplicated, or hidden; reference=this evidence record, PR exact-head review, and deployment record

## Scope and collisions

- Classification: existing-flow reliability and isolation repair.
- Affected flows: type or dictate an unsent prompt; initial history resolution; explicit New; automatic newest-thread resume; controlled thread selection; load failure; lazy thread persistence; send; truncated stream; Retry; tenant, user, and sign-out transition.
- Neighboring regressions: attachments, slash/quick actions, approval cards, history transcript loading, client focus, dictation finalization, late callbacks, scroll behavior, and failed-response recovery.
- Active-owner/file collisions: Voice agent PR #1310 owns MessageAudioButton and was merged into current main before this record; INT-102 makes no edit to that file. No active PR owns either composer file at the post-sync collision check.
- Explicit exclusions: every file under supabase/; MessageAudioButton; Draft with Paige during dictation; durable/local/session storage; page-reload recovery; visual redesign; provider/model/tool behavior.
- ConversationsRichComposer: unchanged. It is a controlled component whose parent owns one body value and clears it on selected-thread change; it does not restore one draft per conversation today. That separate behavior is not folded into this two-mount redesign.

## User job and state map

Draft key: tenantId + userId + conversationId. The new-chat conversation id is a stable slot scoped to the mount context; the first persisted thread atomically moves that value to the real id. Values live only in a module-memory store for the browser session.

| State | Entry | Visible value | Writable | Exit |
| --- | --- | --- | --- | --- |
| identity-unresolved | tenant, effective user, portal brand, or sign-in identity absent | none from the prior identity | no | complete matching identity |
| history-unresolved | authenticated mount before history is confirmed | stable new-chat draft | no | confirmed empty, explicit New, or thread request |
| hydrating | requested thread differs from displayed thread, or identity is switching | prior displayed-thread draft only when identity still matches | no | requested transcript loads or load fails back to prior display |
| ready-new | complete identity and confirmed/explicit new-chat slot | that new-chat draft | yes unless busy | send, lazy persistence, thread request, or scope transition |
| ready-thread | complete identity and requested thread equals displayed thread | that thread's draft | yes unless busy | send/retry, thread request, or scope transition |

Send and Retry require terminal [DONE]. Each request captures tenant + effective user + conversation, an epoch, and an AbortController. A scope transition aborts the request; every later stream, transcript, busy, retry, draft-clear, and error delivery is dropped unless the complete captured handle and epoch still match. A successful completion clears only when the retained draft equals the submitted text under the same trim rule. Failure preserves it. A newer edit survives every outcome and is never auto-sent. Dictation captures a scope handle and every final, interim, and error delivery is dropped when that handle no longer equals the writable displayed scope.

View-as-Client resolves the displayed tenant from the existing RLS-protected `clients` row selected by the impersonation contact id and effective user id. The authenticated staff tenant can never substitute for that displayed tenant: a mismatch keeps input, dictation, and Send disabled. This is read-side resolution only; the authenticated send contract and request body are unchanged from the base.

## Evidence index

- Fresh base at branch creation: 2d9350a116137a759e0d033ef181366a0ab483f3; conflict-free current-main sync and PR base: 47291b603ccae615145d313d11ce2620e8cf03cd; round-one code head: 428c39165fc4726ba3de5acf3fadea82c771d6c8.
- Round-one test-first head 88c71cd69f46aeb9d5d1f7a6c4344d46df6d2a09: the shared-fence, effective-user tenant, AppShell abort, and PaigeAIChat thread-switch expectations produced 3 failed files / 5 failed tests, with 27 passing.
- Completed focused suite: 11 files / 115 tests passed across the transition table, both composer integrations, Solo workspace contract, dictation component/contract, AppShell remount/scroll, PaigeAIChat honesty, document proposal, and client scope.
- Load-bearing mutation: removing `composerDraftHandlesMatch` from `createComposerRequestFence.isCurrent` made the full-handle delivery contract fail (1 failed / 20 passed); restoring it passed 21/21.
- Static checks: focused ESLint passed; npm run ci:tsc passed; npm run ci:regression passed; npm run build passed with only the repository's existing Tailwind ambiguity warning; git diff --check passed.
- Storage inspection: the resolver module uses a process-memory Map; no localStorage, sessionStorage, database, Edge function, migration, or network persistence was added.

## Review and limitations

- Fresh exact-head Codex review, CI comparison, thread dispositions, merge identity, and Vercel production deployment are pending. The Live-Path gate keeps this PR Draft, so no Ready-triggered review, merge, or deployment occurs in this return.
- Authenticated production restoration, account/thread switching, keyboard drive, and responsive rendered evidence remain explicitly unverified.
- A browser reload intentionally clears these in-memory drafts. Persisted drafts require a separate owner decision.
