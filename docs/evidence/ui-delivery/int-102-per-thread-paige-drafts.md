# UI delivery evidence: INT-102 per-thread PAIGE composer drafts

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The installed Flow-by-Flow skill and every routed orchestration, delivery, audit, build, verification, and review reference were read completely; the affected-flow packet below covers draft creation, thread selection, new-chat creation, lazy thread persistence, successful send, failure, tenant/user switch, sign-out, dictation delivery, return, and reload boundaries.
PAIGE_UI_DESIGN: PASS: The repository PAIGE UI Design skill and all routed references were read completely before design or implementation. The established composers, controls, copy, geometry, tokens, focus route, and responsive layout do not change; this repair changes only which in-memory draft value each existing composer renders.
MATERIAL_FLOW_CHANGE: YES: Switching conversations or accounts changes which unsent text is visible, returning restores the origin conversation's text, and a successful send clears only that conversation's draft. Those are material state transitions even though presentation is unchanged.
FLOW_PROTOTYPE: PASS: The owner-approved 2026-09-20 INT-102 ruling defines the complete interaction, and the deterministic state-transition prototype under “User job and state map” maps each action, state, exit, and consequence before product edits.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authenticated Solo or AppShell PAIGE Chat user can leave an unsent typed or dictated message in one conversation, work elsewhere, and return without losing or leaking those words.
VISUAL_DIRECTION: PASS: Preserve the current PAIGE composer exactly. There is no new control, label, motion, color, layout, navigation, or information architecture.
AUTOMATED_EVIDENCE: PASS: Initial failing-first proved 10/10 new assertions red on the unmodified runtime (Solo 6/6; AppShell 4/4), then 10/10 green after implementation. The requested exact-head review found two valid P2 gaps; three added regressions failed first (3 failed/10 passed: AppShell/Solo new-chat alias plus truncated-2xx false clears in both composers), then the one permitted fix round returned the full focused set to 13/13 and focused-plus-remount to 14/14. The corrected eight-file affected regression run is 66/67: the sole red is an inherited SoloApp static assertion reproduced from exact base, with zero diff in either implicated file. Load-bearing mutation omitting `threadSlot` from the key made 5/6 Solo draft tests fail, then the restored key returned the original focused set to 10/10.
STATIC_EVIDENCE: PASS: Exact code head 7c2f8e8d0c2d95eec693625ca06bc9bd15787af8; `npm run ci:tsc` baseline 12/current 12; `npm run build` green; changed-file ESLint has zero errors and only two inherited PaigeChat warnings (the new scoped-setter dependency warning was found and fixed); `git diff --check` clean. No localStorage, sessionStorage, server persistence, Supabase function, `_shared`, migration, provider, or capability-registry edit.
RENDERED_EVIDENCE: PASS: No visual or layout change is proposed. The accepted unchanged Solo composer geometry remains represented by docs/evidence/ui-delivery/assets/int-086-dictation-toggle at 1536x770, 1366x768, 1024x768, and 900x1000 in closed/open states; deterministic behavioral transitions are proven separately, while authenticated production behavior remains UNVERIFIED.
BEHAVIORAL_EVIDENCE: PASS: Deterministic React DOM drives prove A→B empty, A restoration, independent and cross-surface-isolated New chat, lazy New-chat→real-thread migration, clear only after a terminal `[DONE]`, truncated/non-2xx failed-send retention, tenant/user isolation, sign-out invisibility/same-user session recovery, AppShell remount stability, and dictated origin words remaining in A across a mic-epoch switch. Existing #1298 dictation contract tests remain green; no provider call was made.
AUTHENTICATED_RUNTIME: UNVERIFIED: No authenticated production account or customer draft is used; post-deploy owner acceptance is required for live session behavior.
KEYBOARD_FOCUS: PASS: The existing textarea, Enter/Shift+Enter handlers, slash-command route, focus refs, buttons, labels, and disabled states are structurally unchanged; the component drives use the same textarea/input and send controls, and the AppShell remount contract remains green. A manual production keyboard drive remains part of authenticated acceptance, not claimed here.
ZOOM_REFLOW: PASS: No DOM structure, sizing, overflow owner, or visual class changes; the accepted four-viewport composer artifacts remain applicable.
REDUCED_MOTION: PASS: No motion changes; existing reduced-motion behavior remains untouched.
STATE_COVERAGE: PASS: Covered existing/new thread, empty/non-empty draft, typed/dictated text, thread return, lazy thread-id migration, terminal success, non-2xx and truncated-2xx failure, tenant switch, user switch, cross-surface isolation, sign-out hiding and same-user recovery, remount, and session-memory-only loss by source contract. Attachments remain intentionally on their existing scope-reset seam.
TRUTHFUL_STATE_LABELS: PASS: No availability, success, error, loading, or provider label changes. Draft storage is session-memory only and will not be described as reload-persistent.
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
MUST_NOT_HAPPEN: Drafts must not display or mutate across thread, tenant, user, client-focus, account-switch, or signed-out boundaries; a failed send must not erase words; dictation callbacks must not land outside their origin; no browser/server persistence; no visual redesign; no deferred INT-086 Draft-with-Paige repair.
MUST_PRESERVE: The #1298 scope-change teardown and late-callback fence; typed and dictated insertion; attachments and their existing scope reset; stream retry/cancel; quick actions and governed confirmations; history hydration; current responsive layout; AppShell's existing one-session composer; server-resolved authority and tenant enforcement.
ACCEPTANCE_CRITERIA: Type in thread A, switch to B and see B empty, then return to A and see A's text. Give New chat its own slot. Persist a new thread and move that slot to its real id. A successful composer send clears only its origin; a failed send retains it. Switch tenant or user and never see another scope's draft. Dictate, switch mid-capture, and retain delivered origin words only in the origin draft while late callbacks are dropped. Sign-out hides the draft; another user remains empty; the same user can recover only while the module-memory session survives. Reload truthfully loses session-only drafts.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Tested after implementation: PaigeAIChat thread rail/controlled selection, usePaigeThreads lazy ensureThread, PaigeChat AppShell user/tenant/client scope, #1298 DictationMicButton epoch teardown and delivery fence, stream failure rollback, slash/quick actions, and clear-on-terminal-`[DONE]`. Unaffected: ConversationsRichComposer runtime, attachments, localStorage/sessionStorage, Supabase Edge functions, _shared code, database, migrations, provider transport, paige-ai-chat, and Live Conversation.

INTERNAL_BUILD_IDENTITY: 7c2f8e8d0c2d95eec693625ca06bc9bd15787af8; deployment=PENDING_PR_MERGE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=failing-first-component-drives-plus-review-regressions-plus-load-bearing-key-mutation-plus-tsc-build-lint
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
- Loading: history hydration changes transcript only; draft selection follows the logical thread slot. Send staging may hide the origin text while retaining it in memory until success.
- Success: after the real chat turn reaches its terminal stream `[DONE]`, only the submitted origin draft is deleted.
- Failure/retry: authentication, transport, non-2xx, truncated 2xx without `[DONE]`, timeout, cancellation, or stale-scope exits retain the origin draft; the retry seam remains unchanged.
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
| Thread B | Return to A | Thread A / `draft A` | exact text restored, caret behavior preserved |
| Persisted thread A | New chat | `new-chat` / its draft or empty | A remains untouched; new chat never borrows A |
| `new-chat` / draft | First successful send creates thread C | Thread C / send in flight | draft ownership moves atomically from `new-chat` to C |
| Any origin / composer send | Terminal `[DONE]` completion | same origin / empty | clear only submitted origin |
| Any origin / composer send | Failure, truncated 2xx, cancellation, stale scope | origin draft retained | never false-clear; do not paint into current destination |
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

- Exact implementation base/main: `6d46ff6671785c646bcf0739340896a1baa56ede`; conflict-free synced main: `0f3c994cb54168099e9a102bdb07fd10524c9219`; exact code head: `7c2f8e8d0c2d95eec693625ca06bc9bd15787af8`.
- Source seams grounded: `src/components/dashboard/PaigeAIChat.tsx`, `src/components/app/PaigeChat.tsx`, `src/hooks/usePaigeThreads.ts`, `src/pages/admin/conversations/shell/ConversationsRichComposer.tsx`, `src/pages/admin/ClientsConversations.tsx`, `docs/binding-ledger/surface-binding-ledger.json` (`paige.workspace`).
- Skills executed: Flow-by-Flow plus every routed reference; Flow Prototype plus its flow-UI reference; PAIGE UI Design plus every routed reference; Vercel React Best Practices.
- Failing-first: `npx vitest run src/components/dashboard/PaigeAIChat.drafts.test.tsx` = 6/6 red; AppShell draft suite = 4/4 red after the initial harness selector was corrected, all on behavioral assertions.
- Requested-review failing-first: on reviewed head `f65a792df3b29c4fb989ecc031b40372e0925ff0`, the three new assertions failed while the prior ten passed; they name the AppShell/Solo `new-chat` alias and missing-`[DONE]` false-clear in both composers.
- Restored proof: focused draft suites 13/13; focused plus AppShell remount 14/14; affected eight-file regression 66/67 with one exact-base Solo static-contract failure; `ci:tsc` 12→12; production build green; changed-file ESLint zero errors.
- Mutation: temporarily omitted `threadSlot` from the draft key; 5/6 Solo assertions failed; restored implementation returned 10/10 green.
- Provider/database evidence: NOT_APPLICABLE; no provider call, SQL, Supabase function, migration, or production data access was used.

## Review and limitations

- Review: the one requested exact-head Codex review completed on `f65a792df3b29c4fb989ecc031b40372e0925ff0` with two valid P2 findings. Both were reproduced failing-first and fixed in the single permitted code round at `7c2f8e8d0c2d95eec693625ca06bc9bd15787af8`: AppShell now has a surface-qualified New-chat slot, and both composers require `[DONE]` before clearing. The Ready-triggered exact-head auto review remains pending and is not pre-claimed.
- Baseline limitation: `SoloPaigeWorkspace.contract.test.tsx` asserts all `tenant_id:` text is absent from untouched `SoloApp.tsx`, while exact base already contains two `_tenant_id:` RPC argument names. The implicated source/test have zero INT-102 diff; the other 66 affected assertions pass.
- ConversationsRichComposer: the shared component is correctly controlled, but `ClientsConversations` stores one `body` and clears it on `selectedKey`; it does not restore per-conversation drafts. Per owner instruction this requires a separate proposal and is not folded into INT-102.
- Remaining limitations: session-memory only; reload loses drafts; attachments remain governed by their existing scope-reset behavior; authenticated production acceptance is owed.
