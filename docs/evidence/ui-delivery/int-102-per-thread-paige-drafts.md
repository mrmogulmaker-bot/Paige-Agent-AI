# UI delivery evidence: INT-102 per-thread PAIGE composer drafts

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The installed Flow-by-Flow skill and every routed orchestration, delivery, audit, build, verification, and review reference were read completely; the affected-flow packet below covers draft creation, thread selection, new-chat creation, lazy thread persistence, successful send, failure, tenant/user switch, sign-out, dictation delivery, return, and reload boundaries.
PAIGE_UI_DESIGN: PASS: The repository PAIGE UI Design skill and all routed references were read completely before design or implementation. There is no visual redesign: existing composer controls, tokens, focus route, and responsive layout remain. The authorized review repair adds only a truthful inline reason while composition is temporarily unavailable and disables the already-present input, mic, attachment, quick-action, and Send controls until the displayed conversation owns the resolved draft identity.
MATERIAL_FLOW_CHANGE: YES: Switching conversations or accounts changes which unsent text is visible, returning restores the origin conversation's text, and a successful send clears only that conversation's draft. Those are material state transitions even though presentation is unchanged.
FLOW_PROTOTYPE: PASS: The owner-approved 2026-09-20 INT-102 ruling defines the complete interaction, and the deterministic state-transition prototype under “User job and state map” maps each action, state, exit, and consequence before product edits.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authenticated Solo or AppShell PAIGE Chat user can leave an unsent typed or dictated message in one conversation, work elsewhere, and return without losing or leaking those words.
VISUAL_DIRECTION: PASS: Preserve the current PAIGE composer design. No control, motion, color, navigation, or information architecture is added; the only visible delta is an honest transient readiness sentence using existing typography and spacing.
AUTOMATED_EVIDENCE: PASS: Initial failing-first proved 10/10 new assertions red on the unmodified runtime, then green. Requested-review gaps failed first and were repaired. The first Ready-triggered review on `cda1b0fd11913fc976a872607897524f5def2114` found three additional valid P2 regressions; on that head the new proof was 3 failed/14 passed: AppShell accepted input before identity resolution, a delayed A→B hydration left A writable, and a successful Retry retained a resendable origin draft. Exact code head `94e53077f9bc8360a427a682b21eba267eb1f6ec` restores the two draft suites to 17/17 and the draft-plus-dictation contract set to 23/23. A load-bearing mutation reintroduced all three classes and produced 4 failed/13 passed, then restoration returned 17/17. The ten-file affected run is 99/100: the sole red is the inherited `SoloApp.tsx` text assertion reproduced from exact base, with zero INT-102 diff in either implicated file.
STATIC_EVIDENCE: PASS: Exact code head 94e53077f9bc8360a427a682b21eba267eb1f6ec; `npm run ci:tsc` baseline 12/current 12; `npm run build` green; changed-file ESLint has zero errors and only two inherited PaigeChat warnings; `git diff --check` clean before this evidence-only update. No localStorage, sessionStorage, server persistence, Supabase function, `_shared`, migration, provider, or capability-registry edit.
RENDERED_EVIDENCE: UNVERIFIED: The authorized transient readiness sentence and its disabled-control state have deterministic DOM coverage but were not manually rendered at the four Solo viewport sizes in this environment. Existing ordinary composer geometry remains represented by docs/evidence/ui-delivery/assets/int-086-dictation-toggle at 1536x770, 1366x768, 1024x768, and 900x1000; authenticated production behavior remains UNVERIFIED.
BEHAVIORAL_EVIDENCE: PASS: Deterministic React DOM drives prove A→B empty, A restoration, independent and cross-surface-isolated New chat, lazy New-chat→real-thread migration, clear only after terminal `[DONE]`, truncated/non-2xx failed-send and failed-Retry retention, successful Retry clear/no duplicate, tenant/user isolation, sign-out invisibility/same-user session recovery, AppShell remount stability, unresolved/mismatched identity disabling including dictation, delayed thread hydration disabling, and dictated origin words remaining in A across a mic-epoch switch. Existing #1298 dictation contract tests remain green; no provider call was made.
AUTHENTICATED_RUNTIME: UNVERIFIED: No authenticated production account or customer draft is used; post-deploy owner acceptance is required for live session behavior.
KEYBOARD_FOCUS: PASS: The existing textarea, Enter/Shift+Enter handlers, slash-command route, focus refs, buttons, and labels remain. While identity/hydration is unresolved, native disabled semantics remove every write control from operation; the status reason is exposed with `role=status`. Component drives cover these states, and the AppShell remount contract remains green. A manual production keyboard drive remains part of authenticated acceptance, not claimed here.
ZOOM_REFLOW: UNVERIFIED: The ordinary composer has no sizing or overflow-owner change and retains its accepted four-viewport artifacts; the one transient readiness sentence was not manually driven at zoom or the four supported Solo widths in this environment.
REDUCED_MOTION: PASS: No motion changes; existing reduced-motion behavior remains untouched.
STATE_COVERAGE: PASS: Covered unresolved tenant/portal identity, missing active tenant, portal/active-tenant mismatch, existing/new thread, empty/non-empty draft, requested-thread hydration latency, typed/dictated text, thread return, lazy thread-id migration, terminal success, Retry terminal success/no duplicate, non-2xx and truncated-2xx send/Retry failure, tenant switch, user switch, cross-surface isolation, sign-out hiding and same-user recovery, remount, and session-memory-only loss by source contract. Attachments remain on their existing scope-reset seam.
TRUTHFUL_STATE_LABELS: PASS: AppShell now states whether it is resolving the conversation, waiting for an active workspace, or refusing a portal/workspace mismatch; history composers state when the requested conversation is opening. Success still requires `[DONE]`, failure never clears the origin draft, and session-memory storage is not described as reload-persistent.
SOLO_UI: YES: The canonical Solo PAIGE workspace composer in PaigeAIChat is affected; AppShell PaigeChat receives the same isolation contract without a visual change.
SOLO_1536X770_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1536x770-paige-closed.png; existing composer geometry remains unchanged and reachable.
SOLO_1536X770_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1536x770-paige-open-listening.png; existing typed/dictated composer geometry remains unchanged and reachable.
SOLO_1366X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1366x768-paige-closed.png; existing composer geometry remains unchanged and reachable.
SOLO_1366X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1366x768-paige-open-listening.png; existing typed/dictated composer geometry remains unchanged and reachable.
SOLO_1024X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1024x768-paige-closed.png; existing composer geometry remains unchanged and reachable.
SOLO_1024X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/1024x768-paige-open-listening.png; existing typed/dictated composer geometry remains unchanged and reachable.
SOLO_900X1000_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/900x1000-paige-closed.png; existing composer geometry remains unchanged and reachable.
SOLO_900X1000_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/assets/int-086-dictation-toggle/900x1000-paige-open-listening.png; existing typed/dictated composer geometry remains unchanged and reachable.
UNVERIFIED: Authenticated production Solo/AppShell acceptance, a real browser thread/account/sign-out drive, Safari/macOS, iPhone Safari, and deployment remain unverified. Reload loss is source-proven (module memory only) but was not manually browser-driven.

OWNER_INTENT: Owner-approved INT-102 option (a), 2026-09-20: unsent composer text belongs to the conversation where it was written; switching shows the destination's own draft or empty state; returning restores the origin draft; no words are discarded or shown in another thread, tenant, or user context.
MUST_NOT_HAPPEN: Drafts must not display or mutate across thread, tenant, user, client-focus, account-switch, unresolved-identity, hydration, or signed-out boundaries; a failed send or Retry must not erase words; a successful Retry must not leave a duplicate-send draft; dictation callbacks must not land outside their origin; no browser/server persistence; no visual redesign; no deferred INT-086 Draft-with-Paige repair.
MUST_PRESERVE: The #1298 scope-change teardown and late-callback fence; typed and dictated insertion; attachments and their existing scope reset; stream retry/cancel; quick actions and governed confirmations; history hydration; current responsive layout; AppShell's existing one-session composer; server-resolved authority and tenant enforcement.
ACCEPTANCE_CRITERIA: Before identity resolution or while the requested transcript hydrates, every composer write control is disabled with an honest reason. Type in thread A, request B, and make it impossible for text entered during B's hydration to land in A; when ready, show B's own draft or empty state, then restore A on return. Give New chat its own slot and move it to the real id on persistence. A successful send or Retry clears only its original submitted identity after terminal `[DONE]`; a failed or truncated send/Retry retains it; a successful Retry cannot be sent twice from the draft. Switch tenant or user and never see another scope's draft. Dictation obeys the same readiness fence and retains delivered origin words only in the origin draft while late callbacks drop. Sign-out hides the draft; reload truthfully loses session-only drafts.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Tested after implementation: PaigeAIChat thread rail/controlled selection and delayed hydration, usePaigeThreads lazy ensureThread, Retry completion bookkeeping, PaigeChat AppShell tenant/portal-brand/effective-user/client scope, every alternate draft writer, #1298 DictationMicButton disabled-state/epoch teardown/delivery fence, stream failure rollback, slash/quick actions, and clear-on-terminal-`[DONE]`. Unaffected: ConversationsRichComposer runtime, localStorage/sessionStorage, Supabase Edge functions, _shared code, database, migrations, provider transport, paige-ai-chat, and Live Conversation.

INTERNAL_BUILD_IDENTITY: 94e53077f9bc8360a427a682b21eba267eb1f6ec; deployment=PENDING_PR_MERGE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=second-round-failing-first-readiness-hydration-retry-plus-load-bearing-mutation-plus-99-of-100-affected-plus-tsc-build-lint
RELEASE_CHANNEL: development: implemented draft PR; INT-083 permits merge only after current-main sync, exact-head CI with zero new failing steps, one requested review, the Ready-triggered auto review, and individual finding disposition
RELEASE_CLASSIFICATION: patch: session-memory conversation-draft isolation and restoration for existing PAIGE Chat composers
CUSTOMER_RELEASE_IDENTITY: none: internal corrective repair with no release-note identity requested
RELEASE_NOTE_REQUIRED: NO: restores expected draft ownership without adding a visible capability, provider, entitlement, or setup step
RELEASE_TRUTH_BOUNDARY: PARTIAL: deterministic local draft ownership/restoration behavior and the requested review are proven; final exact-head CI, the Ready-triggered auto review, production deployment, and authenticated runtime acceptance remain owed
RELEASE_RECOVERY: position=revert the INT-102 merge if deployment regresses chat composition; reference=owner-approved thread-draft state map in this record

## Scope and collisions

- Classification: one bounded client-only state-isolation repair under INT-102.
- Affected flows: Solo `PaigeAIChat` saved-thread selection, New chat, lazy thread creation, typed/dictated draft editing, send success/failure, account/user switch, and signed-out identity loss; AppShell `PaigeChat` session composer across user/tenant/client/session scope changes.
- Neighboring regressions: #1298 dictation teardown/late-drop/origin text; history hydration and controlled selection; quick/slash actions; approval/deny turns; attachment-only send; retry/cancel; AppShell client context; before-unload warning.
- Active-owner/file collisions: no current active PR owns either runtime file. Stale draft/unmergeable PRs #1044 and #729 overlap `PaigeAIChat.tsx` but are inactive historical artifacts. Current PRs #1303/#1307 overlap delivery documents only and require a later conflict-free main sync, not a source stop.
- Explicit exclusions: `ConversationsRichComposer` repair, deferred INT-086 Draft-with-Paige P2, attachments, reload persistence, localStorage/sessionStorage, server draft storage, provider/Edge/database changes, UI redesign, and any second bug.

## Flow-by-Flow affected-flow packet

- Actor: any authenticated user who has access to the existing Solo or AppShell PAIGE Chat surface. Tenant/role authority remains server-resolved and unchanged.
- User outcome: safely pause composition in one conversation, move elsewhere, and resume the exact unsent text without loss or cross-context display.
- Entry points: Solo PAIGE thread rail and New chat; AppShell PAIGE composer; typed input and DictationMicButton both feed the same active draft setter.
- First-use/empty: a scope with no stored draft shows an empty composer. No fake reload persistence is implied.
- Loading: the requested thread identity is selected before hydration starts, and the entire composer is disabled until that exact transcript is displayed; the origin remains stored but cannot receive new writes. AppShell likewise stays disabled until effective user, active tenant, and portal-brand tenant agree. Send staging may hide origin text while retaining it until success.
- Success: after the real chat turn reaches its terminal stream `[DONE]`, only the submitted origin draft is deleted.
- Failure/retry: authentication, transport, non-2xx, truncated 2xx without `[DONE]`, timeout, cancellation, or stale-scope exits retain the origin draft. Retry uses the same terminal-completion helper as Send, clears the original submitted identity only after `[DONE]`, and cannot leave a duplicate-send draft.
- Switch: before selecting another thread/scope, the current value is already stored under the origin key; the destination value is read by its own key. Tenant and user are part of every key.
- Sign-out: the active identity disappears, so no draft renders. Entries remain isolated under tenant+user+thread in this module-memory session; another user cannot inherit them, while the same user may recover them before a reload.
- Reload: module memory is intentionally lost. Reload persistence is out of scope and must remain unclaimed.
- Side effects: none beyond in-memory Map entries. No external action, provider call, database write, Rail event, or durable record is added.
- Collision boundary: the separate Conversations inbox parent currently resets body text on `selectedKey` and therefore does not provide per-conversation restoration. It will be reported for a separate owner decision and remains unchanged here.

## User job and state map

The deterministic prototype uses a logical key `JSON.stringify([tenantId, userId, threadSlot])`. A persisted conversation uses its real thread id. An unsaved conversation uses a stable `new-chat` slot qualified by surface and the existing conversation scope where necessary, so Solo, AppShell, client, and mission composers cannot alias one another. AppShell uses an explicit `new-chat:app-shell` namespace inside its resolved tenant/user/client scope.

| Start state | Action | Destination state | Required consequence |
|---|---|---|---|
| Thread A / `draft A` | Select thread B | Thread B / its draft or empty | `draft A` remains stored only under A |
| Thread A / `draft A` | Request B while B hydrates | B pending / disabled composer | no input, dictation, attachment, quick action, or Send can write A or B until B is displayed |
| Thread B | Return to A | Thread A / `draft A` | exact text restored, caret behavior preserved |
| Persisted thread A | New chat | `new-chat` / its draft or empty | A remains untouched; new chat never borrows A |
| `new-chat` / draft | First successful send creates thread C | Thread C / send in flight | draft ownership moves atomically from `new-chat` to C |
| Any origin / composer send | Terminal `[DONE]` completion | same origin / empty | clear only submitted origin |
| Any origin / composer send | Failure, truncated 2xx, cancellation, stale scope | origin draft retained | never false-clear; do not paint into current destination |
| Failed turn / Retry | terminal `[DONE]` | original submitted identity / empty | one completion path clears it, so the same draft cannot resend |
| Failed turn / Retry | non-2xx or missing `[DONE]` | original submitted identity / retained | preserve exact words for another deliberate attempt |
| Tenant/user/client scope A | Switch to scope B | B's own logical slot | no A value rendered or mutated |
| Dictation in A | Thread/scope switch | destination draft | recorder stops; finalized A words stay under A; late provider callback drops |
| Signed-in user | Sign out | no active composer | hide every draft; a different user resolves a different key |
| Any draft | Full page reload | empty module store | expected session-only loss, no persistence claim |

## Capability routing

- Portfolio family/domain owner: `paige.workspace`, existing PAIGE Chat surface; this is UI state hygiene, not a new capability.
- Ten binding questions: existing authenticated chat consumer; no new canonical read; no governed write; no approval; no autonomous lane; no provider/connection; no durable job; no Rail producer; no Mind/Memory eligibility change; no completion-criterion change.
- Shared Harness seams: none added or changed. Existing paige-ai-chat, authority, confirmation, thread persistence, and request fence remain consumers only.
- Provider/connection: no provider change and no registry entry.
- Truth label: `paige.workspace` remains `PARTIAL`; this repair neither closes nor widens its documented context/production proof gaps.
- Proof obtained versus owed: source/owner contract, failing-first, deterministic behavioral, mutation, static, and build proof obtained; exact-head review/CI, deployment, and authenticated runtime remain owed.
- Canonical records: Binding Ledger read and unchanged; Integration Registry, Spine registry, Rail, Harness map, and tier matrix are not applicable because this adds no capability/provider/action. Master/Second Brain delivery rows will be updated with the final exact evidence before merge.
- Nothing duplicated: no second chat engine, thread registry, authority seam, draft database, provider registry, memory, orchestrator, or persistence layer.

## Evidence index

- Exact implementation base/main: `6d46ff6671785c646bcf0739340896a1baa56ede`; conflict-free synced main: `0f3c994cb54168099e9a102bdb07fd10524c9219`; exact second-round code head: `94e53077f9bc8360a427a682b21eba267eb1f6ec`.
- Source seams grounded: `src/components/dashboard/PaigeAIChat.tsx`, `src/components/app/PaigeChat.tsx`, `src/hooks/usePaigeThreads.ts`, `src/pages/admin/conversations/shell/ConversationsRichComposer.tsx`, `src/pages/admin/ClientsConversations.tsx`, `docs/binding-ledger/surface-binding-ledger.json` (`paige.workspace`).
- Skills executed: Flow-by-Flow plus every routed reference; Flow Prototype plus its flow-UI reference; PAIGE UI Design plus every routed reference; Vercel React Best Practices.
- Failing-first: `npx vitest run src/components/dashboard/PaigeAIChat.drafts.test.tsx` = 6/6 red; AppShell draft suite = 4/4 red after the initial harness selector was corrected, all on behavioral assertions.
- Requested-review failing-first: on reviewed head `f65a792df3b29c4fb989ecc031b40372e0925ff0`, three assertions failed while the prior ten passed; they name the AppShell/Solo `new-chat` alias and missing-`[DONE]` false-clear in both composers. The first Ready-triggered review then found three valid P2s on `cda1b0fd11913fc976a872607897524f5def2114`: unresolved AppShell identity, delayed thread hydration, and successful Retry completion.
- Second-round failing-first: the two draft suites on `cda1b0fd11913fc976a872607897524f5def2114` were 3 failed/14 passed, directly reproducing those three regressions. Restored exact code head is 17/17; with the dictation composer contract it is 23/23.
- Restored proof: affected ten-file regression 99/100 with one exact-base Solo static-contract failure; `ci:tsc` 12→12; production build green; changed-file ESLint zero errors/two inherited warnings.
- Mutations: omitting `threadSlot` from the key failed 5/6 Solo assertions in the original load-bearing proof. Second-round mutations re-enabled unresolved AppShell writing, re-enabled origin writes during delayed hydration, and omitted terminal Retry clearing; 4/17 assertions failed, then the restored implementation returned 17/17.
- Provider/database evidence: NOT_APPLICABLE; no provider call, SQL, Supabase function, migration, or production data access was used.

## Review and limitations

- Review: the one requested exact-head Codex review completed on `f65a792df3b29c4fb989ecc031b40372e0925ff0` with two valid P2 findings, fixed failing-first. The first Ready-triggered exact-head review completed on `cda1b0fd11913fc976a872607897524f5def2114` with three valid P2 regressions; the coordinator authorized this second and final fix round. Exact code head `94e53077f9bc8360a427a682b21eba267eb1f6ec` implements the single displayed-identity writability invariant plus shared Retry completion bookkeeping. The post-fix Ready-triggered exact-head review remains pending and is not pre-claimed.
- Baseline limitation: `SoloPaigeWorkspace.contract.test.tsx` asserts all `tenant_id:` text is absent from untouched `SoloApp.tsx`, while exact base already contains two `_tenant_id:` RPC argument names. The implicated source/test have zero INT-102 diff; the other 99 affected assertions pass.
- ConversationsRichComposer: the shared component is correctly controlled, but `ClientsConversations` stores one `body` and clears it on `selectedKey`; it does not restore per-conversation drafts. Per owner instruction this requires a separate proposal and is not folded into INT-102.
- Remaining limitations: session-memory only; reload loses drafts; attachments remain governed by their existing scope-reset behavior; authenticated production acceptance is owed.
