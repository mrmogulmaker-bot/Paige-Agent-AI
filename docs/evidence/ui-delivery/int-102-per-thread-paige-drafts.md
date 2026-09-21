# UI delivery evidence: INT-102 per-thread PAIGE composer drafts

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The installed Flow-by-Flow skill and every routed orchestration, delivery, audit, build, verification, and review reference were read completely; the affected-flow packet below covers draft creation, thread selection, new-chat creation, lazy thread persistence, successful send, failure, tenant/user switch, sign-out, dictation delivery, return, and reload boundaries.
PAIGE_UI_DESIGN: PASS: The repository PAIGE UI Design skill and all routed references were read completely before design or implementation. The established composers, controls, copy, geometry, tokens, focus route, and responsive layout do not change; this repair changes only which in-memory draft value each existing composer renders.
MATERIAL_FLOW_CHANGE: YES: Switching conversations or accounts changes which unsent text is visible, returning restores the origin conversation's text, and a successful send clears only that conversation's draft. Those are material state transitions even though presentation is unchanged.
FLOW_PROTOTYPE: PASS: The owner-approved 2026-09-20 INT-102 ruling defines the complete interaction, and the deterministic state-transition prototype under “User job and state map” maps each action, state, exit, and consequence before product edits.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: An authenticated Solo or AppShell PAIGE Chat user can leave an unsent typed or dictated message in one conversation, work elsewhere, and return without losing or leaking those words.
VISUAL_DIRECTION: PASS: Preserve the current PAIGE composer exactly. There is no new control, label, motion, color, layout, navigation, or information architecture.
AUTOMATED_EVIDENCE: UNVERIFIED: This is the plan-first head before product edits; failing-first component and store tests are required before implementation and will replace this status with exact counts.
STATIC_EVIDENCE: PASS: Source grounding on exact main 6d46ff6671785c646bcf0739340896a1baa56ede enumerated both affected composers, their selection/send seams, the parent-owned Conversations composer, and the paige.workspace binding; this planning commit changes no runtime file.
RENDERED_EVIDENCE: PASS: No visual or layout change is proposed. The accepted unchanged Solo composer geometry remains represented by docs/evidence/ui-delivery/assets/int-086-dictation-toggle at 1536x770, 1366x768, 1024x768, and 900x1000 in closed/open states; behavioral draft transitions remain separately UNVERIFIED at this plan-first head.
BEHAVIORAL_EVIDENCE: UNVERIFIED: The deterministic transition tests and rendered component drives have not run at this plan-first head; implementation must prove origin-only persistence, restoration, clear-on-success, failure retention, and tenant/user isolation.
AUTHENTICATED_RUNTIME: UNVERIFIED: No authenticated production account or customer draft is used; post-deploy owner acceptance is required for live session behavior.
KEYBOARD_FOCUS: UNVERIFIED: Existing textarea typing, Enter/Shift+Enter, slash-command, and focus behavior are unchanged by design but must be re-run after implementation.
ZOOM_REFLOW: PASS: No DOM structure, sizing, overflow owner, or visual class changes; the accepted four-viewport composer artifacts remain applicable.
REDUCED_MOTION: PASS: No motion changes; existing reduced-motion behavior remains untouched.
STATE_COVERAGE: UNVERIFIED: Planned coverage includes existing/new thread, empty/non-empty draft, typed/dictated text, thread return, lazy thread id migration, successful/failed send, tenant switch, user switch, sign-out, unmount/remount, and reload loss by design.
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
UNVERIFIED: Runtime behavior, final automated counts, browser interaction, production deployment, authenticated Solo/AppShell acceptance, Safari/macOS, iPhone Safari, and page-reload loss remain unverified at this plan-first head.

OWNER_INTENT: Owner-approved INT-102 option (a), 2026-09-20: unsent composer text belongs to the conversation where it was written; switching shows the destination's own draft or empty state; returning restores the origin draft; no words are discarded or shown in another thread, tenant, or user context.
MUST_NOT_HAPPEN: Drafts must not cross thread, tenant, user, client-focus, account-switch, or sign-out boundaries; a failed send must not erase words; dictation callbacks must not land outside their origin; no browser/server persistence; no visual redesign; no deferred INT-086 Draft-with-Paige repair.
MUST_PRESERVE: The #1298 scope-change teardown and late-callback fence; typed and dictated insertion; attachments and their existing scope reset; stream retry/cancel; quick actions and governed confirmations; history hydration; current responsive layout; AppShell's existing one-session composer; server-resolved authority and tenant enforcement.
ACCEPTANCE_CRITERIA: Type in thread A, switch to B and see B empty, then return to A and see A's text. Give New chat its own slot. Persist a new thread and move that slot to its real id. A successful composer send clears only its origin; a failed send retains it. Switch tenant or user and never see another scope's draft. Dictate, switch mid-capture, and retain delivered origin words only in the origin draft while late callbacks are dropped. Sign out and clear that user's in-memory drafts. Reload and truthfully lose session-only drafts.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Tested after implementation: PaigeAIChat thread rail/controlled selection, usePaigeThreads lazy ensureThread, PaigeChat AppShell user/tenant/client scope, #1298 DictationMicButton epoch teardown and delivery fence, stream failure rollback, slash/quick actions, and clear-on-success. Unaffected: ConversationsRichComposer runtime, attachments, localStorage/sessionStorage, Supabase Edge functions, _shared code, database, migrations, provider transport, paige-ai-chat, and Live Conversation.

INTERNAL_BUILD_IDENTITY: 6d46ff6671785c646bcf0739340896a1baa56ede; deployment=NOT_APPLICABLE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=plan-first-source-grounding-and-owner-approved-state-map
RELEASE_CHANNEL: development: plan-first draft PR before runtime edits; INT-083 permits merge only after exact-head checks and both required reviews are complete and dispositioned
RELEASE_CLASSIFICATION: patch: session-memory conversation-draft isolation and restoration for existing PAIGE Chat composers
CUSTOMER_RELEASE_IDENTITY: none: internal corrective repair with no release-note identity requested
RELEASE_NOTE_REQUIRED: NO: restores expected draft ownership without adding a visible capability, provider, entitlement, or setup step
RELEASE_TRUTH_BOUNDARY: UNVERIFIED: owner intent and source contract are grounded; no runtime behavior is claimed until failing-first, regression, review, deploy, and authenticated acceptance evidence exists
RELEASE_RECOVERY: position=revert the INT-102 merge if deployment regresses chat composition; reference=owner-approved thread-draft state map in this record

## Scope and collisions

- Classification: one bounded client-only state-isolation repair under INT-102.
- Affected flows: Solo `PaigeAIChat` saved-thread selection, New chat, lazy thread creation, typed/dictated draft editing, send success/failure, account/user switch, and sign-out; AppShell `PaigeChat` session composer across user/tenant/client scope changes.
- Neighboring regressions: #1298 dictation teardown/late-drop/origin text; history hydration and controlled selection; quick/slash actions; approval/deny turns; attachment-only send; retry/cancel; AppShell client context; before-unload warning.
- Active-owner/file collisions: no current active PR owns either runtime file. Stale draft/unmergeable PRs #1044 and #729 overlap `PaigeAIChat.tsx` but are inactive historical artifacts. Current PRs #1303/#1307 overlap delivery documents only and require a later conflict-free main sync, not a source stop.
- Explicit exclusions: `ConversationsRichComposer` repair, deferred INT-086 Draft-with-Paige P2, attachments, reload persistence, localStorage/sessionStorage, server draft storage, provider/Edge/database changes, UI redesign, and any second bug.

## Flow-by-Flow affected-flow packet

- Actor: any authenticated user who has access to the existing Solo or AppShell PAIGE Chat surface. Tenant/role authority remains server-resolved and unchanged.
- User outcome: safely pause composition in one conversation, move elsewhere, and resume the exact unsent text without loss or cross-context display.
- Entry points: Solo PAIGE thread rail and New chat; AppShell PAIGE composer; typed input and DictationMicButton both feed the same active draft setter.
- First-use/empty: a scope with no stored draft shows an empty composer. No fake reload persistence is implied.
- Loading: history hydration changes transcript only; draft selection follows the logical thread slot. Send staging may hide the origin text while retaining it in memory until success.
- Success: after the real chat turn completes successfully, only the submitted origin draft is deleted.
- Failure/retry: authentication, transport, non-2xx, timeout, cancellation, or stale-scope exits retain the origin draft; the retry seam remains unchanged.
- Switch: before selecting another thread/scope, the current value is already stored under the origin key; the destination value is read by its own key. Tenant and user are part of every key.
- Sign-out: the signing-out user's in-memory draft entries are removed; another session cannot inherit them.
- Reload: module memory is intentionally lost. Reload persistence is out of scope and must remain unclaimed.
- Side effects: none beyond in-memory Map entries. No external action, provider call, database write, Rail event, or durable record is added.
- Collision boundary: the separate Conversations inbox parent currently resets body text on `selectedKey` and therefore does not provide per-conversation restoration. It will be reported for a separate owner decision and remains unchanged here.

## User job and state map

The deterministic prototype uses a logical key `JSON.stringify([tenantId, userId, threadSlot])`. A persisted conversation uses its real thread id. An unsaved conversation uses a stable `new-chat` slot qualified by the existing conversation scope where necessary, so client/mission focus cannot alias another unsaved composer. AppShell uses its one stable new-chat slot within its resolved tenant/user/client scope.

| Start state | Action | Destination state | Required consequence |
|---|---|---|---|
| Thread A / `draft A` | Select thread B | Thread B / its draft or empty | `draft A` remains stored only under A |
| Thread B | Return to A | Thread A / `draft A` | exact text restored, caret behavior preserved |
| Persisted thread A | New chat | `new-chat` / its draft or empty | A remains untouched; new chat never borrows A |
| `new-chat` / draft | First successful send creates thread C | Thread C / send in flight | draft ownership moves atomically from `new-chat` to C |
| Any origin / composer send | Successful completion | same origin / empty | clear only submitted origin |
| Any origin / composer send | Failure, cancellation, stale scope | origin draft retained | never false-clear; do not paint into current destination |
| Tenant/user/client scope A | Switch to scope B | B's own logical slot | no A value rendered or mutated |
| Dictation in A | Thread/scope switch | destination draft | recorder stops; finalized A words stay under A; late provider callback drops |
| Signed-in user | Sign out | no active composer | clear that user's module-memory drafts |
| Any draft | Full page reload | empty module store | expected session-only loss, no persistence claim |

## Capability routing

- Portfolio family/domain owner: `paige.workspace`, existing PAIGE Chat surface; this is UI state hygiene, not a new capability.
- Ten binding questions: existing authenticated chat consumer; no new canonical read; no governed write; no approval; no autonomous lane; no provider/connection; no durable job; no Rail producer; no Mind/Memory eligibility change; no completion-criterion change.
- Shared Harness seams: none added or changed. Existing paige-ai-chat, authority, confirmation, thread persistence, and request fence remain consumers only.
- Provider/connection: no provider change and no registry entry.
- Truth label: `paige.workspace` remains `PARTIAL`; this repair neither closes nor widens its documented context/production proof gaps.
- Proof obtained versus owed: source/owner contract obtained; automated, rendered behavioral, exact-head review/CI, deployment, and authenticated runtime remain owed at this plan-first head.
- Canonical records: Binding Ledger read and unchanged; Integration Registry, Spine registry, Rail, Harness map, and tier matrix are not applicable because this adds no capability/provider/action. Master/Second Brain delivery rows will be updated with the final exact evidence before merge.
- Nothing duplicated: no second chat engine, thread registry, authority seam, draft database, provider registry, memory, orchestrator, or persistence layer.

## Evidence index

- Exact base/main: `6d46ff6671785c646bcf0739340896a1baa56ede`.
- Source seams grounded: `src/components/dashboard/PaigeAIChat.tsx`, `src/components/app/PaigeChat.tsx`, `src/hooks/usePaigeThreads.ts`, `src/pages/admin/conversations/shell/ConversationsRichComposer.tsx`, `src/pages/admin/ClientsConversations.tsx`, `docs/binding-ledger/surface-binding-ledger.json` (`paige.workspace`).
- Skills executed: Flow-by-Flow plus every routed reference; Flow Prototype plus its flow-UI reference; PAIGE UI Design plus every routed reference; Vercel React Best Practices.
- Provider/database evidence: NOT_APPLICABLE; no provider call, SQL, Supabase function, migration, or production data access is needed.

## Review and limitations

- Review: not yet requested at this plan-first head.
- Implementation proof: not yet run; status is explicitly UNVERIFIED above.
- ConversationsRichComposer: the shared component is correctly controlled, but `ClientsConversations` stores one `body` and clears it on `selectedKey`; it does not restore per-conversation drafts. Per owner instruction this requires a separate proposal and is not folded into INT-102.
- Remaining limitations: session-memory only; reload loses drafts; attachments remain governed by their existing scope-reset behavior; authenticated production acceptance is owed.
