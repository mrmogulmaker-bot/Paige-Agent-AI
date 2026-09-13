# UI delivery evidence: tenant-owned Social connections

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The affected-flow packet covers Integrations catalogue entry, setup-required state, hosted authorization handoff, callback/readback, account selection, reconnect, disconnect, and truthful unavailable operations.
PAIGE_UI_DESIGN: PASS: The project UI-design chain, five experience-quality modules, approved integration-card system, and Impeccable quality guidance were read before implementation; Social remains one member of the existing Integrations catalogue.
MATERIAL_FLOW_CHANGE: YES: A Solo owner can begin and manage a tenant-owned Social connection and explicitly select a provider-discovered account; publishing, scheduling, and analytics remain unavailable.
FLOW_PROTOTYPE: PASS: The owner approved the interactive Social integration flow in this task, including the correction that customer-facing language is only Social and provider identity remains internal.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: The active workspace owner starts from an honest setup-required state, authorizes Social, inspects provider-read accounts and health, then explicitly chooses, reconnects, or disconnects an account.
VISUAL_DIRECTION: PASS: Existing approved Integrations cards, tokens, typography, and drawer language are the visual authority; the Social entry is not a separate integrations section.
AUTOMATED_EVIDENCE: PASS: 75 focused Vitest assertions cover empty state, tenant reset, provider-read account rendering, explicit selection approval, reconnect, disconnect, provider adapter bounds, and security contracts.
STATIC_EVIDENCE: PASS: Production build, Integration Registry lint, Binding Ledger lint, migration-version lint, action-risk lint, governed-door lint, JSON parsing, and diff check pass; one unrelated current-main TypeScript baseline error remains outside Social scope.
RENDERED_EVIDENCE: PASS: The owner-approved prototype was browser-driven at 1536x770, 1366x768, 1024x768, and 900x1000 with nonblank content, no horizontal overflow, a visible Social drawer, and Escape exit; this is design/geometry evidence, not authenticated implementation proof.
BEHAVIORAL_EVIDENCE: PASS: Component and adapter tests prove setup-required, connection-readback, no implicit target, exact approval before selection, reconnect, disconnect confirmation, workspace reset, error, and unavailable-operation behavior.
AUTHENTICATED_RUNTIME: UNVERIFIED: The merged migration, deployed functions, real hosted authorization, authenticated tenant readback, receipt/Rail visibility, and disconnect/reconnect have not yet been proven in production.
KEYBOARD_FOCUS: PASS: The drawer focuses its close control, traps Tab within the active panel or confirmation dialog, closes/cancels by Escape, and restores focus to the opening integration card; component coverage locks focus return.
ZOOM_REFLOW: UNVERIFIED: Four required viewport geometries passed in the approved prototype, but browser zoom and authenticated implementation reflow are not yet driven.
REDUCED_MOTION: PASS: The Social drawer adds no decorative motion; its CSS disables transitions under prefers-reduced-motion.
STATE_COVERAGE: PASS: Resolving, setup-required, approval-required, authorizing, connected, account-unselected, selected, needs-reauth, disconnected, denied, error, retry, and unavailable operation states are represented without fixtures presented as provider truth.
TRUTHFUL_STATE_LABELS: PASS: A server credential never counts as a tenant identity; only provider-read accounts are shown; no target is implicit; provider/action capabilities are open-list readback; publishing, scheduling, and analytics remain unavailable.
SOLO_UI: YES: Settings Integrations is the canonical connection-management surface and Campaigns Social remains the truthful downstream operating destination.
UNVERIFIED: Production deployment and authenticated provider proof remain owed; no connection or external publication is claimed by this PR.
SOLO_1536X770_PAIGE_CLOSED: PASS: approved prototype browser proof; no horizontal overflow and the Social entry remains reachable.
SOLO_1536X770_PAIGE_OPEN: PASS: approved prototype browser proof; Social drawer is visible, bounded, and exits by Escape.
SOLO_1366X768_PAIGE_CLOSED: PASS: approved prototype browser proof; no horizontal overflow and the Social entry remains reachable.
SOLO_1366X768_PAIGE_OPEN: PASS: approved prototype browser proof; Social drawer is visible, bounded, and exits by Escape.
SOLO_1024X768_PAIGE_CLOSED: PASS: approved prototype browser proof; no horizontal overflow and the Social entry remains reachable.
SOLO_1024X768_PAIGE_OPEN: PASS: approved prototype browser proof; Social drawer is visible, bounded, and exits by Escape.
SOLO_900X1000_PAIGE_CLOSED: PASS: approved prototype browser proof; no horizontal overflow and the Social entry remains reachable.
SOLO_900X1000_PAIGE_OPEN: PASS: approved prototype browser proof; Social drawer is visible, bounded, and exits by Escape.

OWNER_INTENT: Deliver a reusable tenant-owned, multi-account Social integration whose customer language is Social, whose identities come only from server-resolved tenant authorization and provider discovery, and whose first external publication remains separately gated.
MUST_NOT_HAPPEN: No hardcoded workspace, brand, identity, page, profile, account group, default target, shared-credential publishing, manual secret in normal form storage, fake connection, inferred platform capability, cross-tenant access, or publication.
MUST_PRESERVE: The unified Integrations catalogue and card language, active-tenant reset behavior, shared Gateway/Harness authority and receipt seams, Campaigns six-tab layout, provider secrecy, and Phase 0 containment for undelivered Social operations.
ACCEPTANCE_CRITERIA: An authenticated owner sees setup required; starts one hosted authorization through a server-resolved tenant connection; returns through a one-time callback; sees only provider-read accounts for that tenant; selects one with exact approval; can inspect health and verification time; can reconnect or explicitly confirm disconnect; workspace switching clears stale state; unsupported actions remain disabled with an explanation.
MOTION_PURPOSE: State change only: the existing drawer transition communicates open/close and is removed under reduced motion; no ambient or decorative Social motion is introduced.
PROTECTED_SEAMS: AFFECTED and tested - tenant context, action-risk classification, exact approval, idempotent connection attempts, provider correlation, callback claim, receipt/Rail recording, workspace switching, account selection, disconnect, RLS, grants, and capability truth. UNAFFECTED - publication jobs, scheduling engine, analytics store, paid actions, Vibe generation, Campaign creation, billing, CRM, and general Chat.

INTERNAL_BUILD_IDENTITY: 4f8c336f923060378857a413dd9781ceba9ce47e; deployment=none-PR-head-only; environment=development; migrations=PROOF_OWED(20270127000000_social_connection_lifecycle pending exact-head database-contract); edge=PROOF_OWED(paige-social and paige-social-callback pending merge/deployment); evidence=docs/evidence/ui-delivery/social-tenant-connections.md and PR 1186 checks
RELEASE_CHANNEL: development: PR head only; Gate A allows merge and deployment after exact-head checks are green
RELEASE_CLASSIFICATION: internal-only: connection implementation is not a LIVE customer capability until deployment and authenticated provider proof
CUSTOMER_RELEASE_IDENTITY: none: owner authorization and provider readback proof remain pending
RELEASE_NOTE_REQUIRED: NO: no LIVE Social capability is claimed by this PR-head record
RELEASE_TRUTH_BOUNDARY: PARTIAL: implementation and controlled tests exist; connection is excluded from LIVE until deployed authenticated provider readback, tenant-isolation, reconnect/disconnect, receipt/Rail, and UI evidence pass; publishing, scheduling, analytics, comments, messaging, ads, and paid actions remain UNAVAILABLE
RELEASE_RECOVERY: position=git revert before database deployment or forward-fix after the additive migration while retaining provider history; reference=PR 1186 and migration 20270127000000_social_connection_lifecycle

## Scope and collisions

- Classification: complete provider-neutral tenant connection lifecycle plus one internal initial adapter; no external publication.
- Affected flows: Settings Integrations Social connection drawer, hosted authorization callback, account discovery/readback, explicit account selection, reconnect, disconnect, and Campaigns Social capability truth.
- Neighboring regressions: all other Integration cards and drawers, active-workspace changes, Campaigns Social containment, approval records, Rail receipts, and provider callback routing.
- Active-owner/file collisions: only artifacts merged into the recorded current-main base were consumed; no unmerged work was copied or modified.
- Explicit exclusions: publication, scheduling, analytics, recommendations, comments/replies, direct messaging, ads, spend, autonomous actions, manual-credential channels, and Vibe media generation.

## User job and state map

The active tenant begins with no assumed Social identity. The owner opens Social inside the common Integrations catalogue, reviews the provider-resolved OAuth platform list and current limitations, approves creation or reconnection of one tenant connection, and follows a short-lived hosted authorization URL. The callback is bound to a one-time hashed attempt and exact tenant connection. Provider readback creates or updates only accounts beneath that connection. No account becomes a target until the owner makes an exact approved selection. Reconnect repeats hosted authorization; disconnect requires confirmation and removes the provider profile before marking local accounts disconnected. Any ambiguous or failed provider outcome remains an error or reauthorization state, never connected.

## Evidence index

- Fresh current-main base: `f45d067061b0139354836f803274dd3f356df134`; pre-attestation review head: `4f8c336f923060378857a413dd9781ceba9ce47e`; branch `codex/social-operations-connections`; PR `#1186`.
- Focused Vitest: `npx vitest run src/__tests__/social-connection-security-contract.test.ts src/__tests__/social-phase0-containment.test.ts src/__tests__/social-provider-adapter.test.ts src/solo/settings-integrations.test.tsx` - PASS, 75/75.
- Schema behavior: disposable PostgreSQL 16 installation proved two forced-RLS service tables, no browser table/callback access, service callback claim, tenant-bound connection/account FK, one-time callback rejection, atomic provider account readback, explicit selection, and disconnect state transition.
- Static gates: `npm run lint:integration-registry`, `npm run lint:binding-ledger`, `npm run lint:migration-versions`, `npm run lint:definer-fns`, `npm run lint:action-risk`, `npm run lint:mcp-governed-door`, production build, and `git diff --check` - PASS.
- Visual prototype: `C:/Users/tonig/.codex/visualizations/2026/09/12/01a09735-31d5-7f71-bd21-9b38dde7fb48/social-operations-upload-post-flow.html`; `node scripts/social-visual-proof.mjs <loopback-url>` - PASS at all four required viewport sizes. The filename is historical technical provenance; customer copy is Social.
- Source truth scans: complete Social diff contains no owner- or brand-specific names; changed customer source contains no internal provider name outside negative tests; generic UUIDs and opaque profile identifiers are used in automated tests.
- TypeScript ratchet: the Social-introduced Deno namespace issue is resolved; one unrelated current-main error remains in `src/__tests__/paige-capability-gateway.test.ts` because its mapping predates two capability states.

## Review and limitations

Self-review only because the owner prohibited external-agent coordination. The approved prototype proves intent and basic geometry, while authenticated implementation render and provider-hosted behavior remain explicitly unverified. No account was connected, no credential value was read, and no public content was submitted. The final LIVE decision requires exact deployed identifiers plus controlled authenticated proof for authorization, discovery, selection, tenant isolation, reconnect, disconnect, receipt/Rail, failure handling, and truthful UI state.
