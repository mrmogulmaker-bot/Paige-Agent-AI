# Solo Sales Release 1 usability repair

**Status: FAIL / repair in progress / NOT RELEASED.**

This record describes the working branch `codex/solo-sales-release1-usability`, grounded on main `12e495a99ef9e2e951732bf511feeaa18e8bdcfd`. It is not a claim that the repair has merged, deployed, or passed an authenticated owner test. Final exact-head checks and production evidence must be recorded before that status changes.

## Intended usable outcome

A Solo owner can open, interact with, safely abandon or complete each Sales drawer, use browser navigation and reload-safe panel addresses, and return from canonical Catalog or Client creation without losing tenant isolation or mistaking an unsaved draft for a saved record.

## Ownership and bounded scope

The owner approved the combined Sales repair and the narrow shared `growth2.tsx` and `TenantRelationshipsClientsWorkspace.tsx` exceptions. The Pipeline owner released the active editing collision: PR #706 remains untouched, open/draft, with no new release authority; later Pipeline folders release #718 is already included in current main. This Sales branch does not cherry-pick #706 or change Pipeline contracts. Shared drawer/background composition still requires Pipeline and Catalog regression proof.

Current implementation files:

- `src/solo/growth2.tsx`: Sales panel routing and browser history, scoped detail cleanup, fixed Catalog return, canonical Client entry, redundant banner removal, and contextual Settings Billing navigation.
- `src/solo/sales-ops.tsx`, `src/solo/sales-ops.css`: interactive drawer mounting outside the inert background, close/discard/focus behavior, state cleanup, accessible control treatments, and truthful Commercial Terms naming.
- `src/solo/sales-navigation.ts`: allowlisted panel enum and fixed internal paths; one-use tenant/account-bound Client continuation held only in module memory.
- `src/solo/useSoloSalesOps.ts`, `src/solo/useSoloAgreements.ts`: delayed mutation completion guards and bounded diagnostic handling.
- `src/components/tenant-relationships/TenantRelationshipsClientsWorkspace.tsx`: Solo-only return from canonical creation; successful new contact passed as a candidate in memory, never added to the public URL by this continuation. Ordinary canonical contact editing remains separate.
- Relevant Sales, navigation, adapter and Clients tests; `scripts/live-drive/sales-ops-drive.mjs` and its Sales mount fixtures.

No database migration, provider mechanics, payment collection, Platform Billing behavior, legal documents, e-signatures, Marketplace templates, or new Spine capability registration is part of this release. The locked six Campaign tabs and Pipeline behavior remain protected regression boundaries.

## Affected flows and contracts

| Flow | Implemented contract | Required completion proof |
|---|---|---|
| Quick Offer | Open `?panel=quick-offer`; use canonical Catalog draft creation; return from Catalog through an allowlisted Sales panel only | Actual X/Cancel/Escape/focus, dirty abandonment, save/failure/retry, Catalog round trip, reload and browser Back |
| Payment Handling | Open `?panel=payment-handling`; record the workspace's declared handling; contextual explanation distinguishes client payments from workspace subscription Billing | Real control operation, selected state, validation, save/refusal/retry, clean reopen, no payment collection |
| Commercial Terms | Open `?panel=commercial-terms`; record commercial terms and retainers, not a completed legal-agreement product | Form interaction, truthful empty/readability/permission states, clean close/reopen and existing source-backed record behavior |
| Canonical Client creation | Matching Solo continuation auto-opens canonical new contact; existing role gate and server writer enforce authorization; successful new contact becomes an in-memory candidate for Sales reauthorization | Success, cancel/discard, failed/refused save, unavailable/read-loading state and tenant-switch interruption |
| Browser and direct entry | Opening pushes a history step; Back closes; direct-entry X/Cancel falls back to base Sales; malformed/unsupported/unauthorized panel addresses normalize safely | All three panels, direct reload, invalid panel, no private values in URL |
| Workspace switch | Outstanding completions cannot reopen or navigate to old workspace; drawer/detail/selection/banner state and return intent clear | Switch during editing, save, callback and return; wrong-tenant candidate refusal |

The public panel address contains only a small allowlisted enum. Form values, contact identifiers, offer identifiers, payment details and provider state are not serialized into these navigation hints. Unsaved fields are not reconstructed on reload. The Client continuation disappears on reload; a return candidate is re-read against Sales' authorized tenant client list and manage/readability state before selection.

## Proof record — in progress

| Evidence class | Current record | Limit |
|---|---|---|
| Automated | Latest individually reported runs: 83 Sales tests; 44 Clients tests; 41 Growth/navigation tests passing | Root must refresh the combined exact-head results before release; these are not browser or provider proof |
| Focused static checks | Clients wrapper/test ESLint passed; full release checks remain with root | Does not prove runtime interaction or deployment |
| Chromium with fixtures | Root is running the project-owned real Chromium drive against production components with fixture adapters | Fixture persistence/roles are not authenticated production evidence; final counts, viewport/theme/motion coverage and negative-control results are not yet recorded |
| Authenticated owner | UNVERIFIED for this release | Requires real authorized Solo account and canonical operations, with safe test records where authorized |
| Production | NOT RELEASED; deployment and production persistence unchanged by this branch | A merge or started build is not a Ready serving deployment or a successful live flow |

Required Chromium matrix: 1536×770, 1366×768, 1024×768 and 900×1000; both themes; reduced motion; actual scroll ownership; keyboard navigation, focus trap/restoration; drawer not beneath inert ancestry; background remains inaccessible. Negative controls must fail for inert-parent drawers and stale panel state on workspace switch. Existing unit/DOM and historical rendered counts do not replace these interaction checks.

## Adjacent confirmed defect and unapplied exception

`PeopleContactEditor.tsx` awaits its canonical mutation and `onSaved` callback, then emits a global success toast and updates editor state. Its error branch likewise emits a global error toast. That editor-owned lifecycle lacks a save-scope/unmount guard, so a delayed result can surface a toast after a workspace switch even though the authorized wrapper prevents stale selection and navigation.

The file is outside the explicitly named shared-file exception. It has **not been modified**. A review-only minimal patch is prepared in the owner's task outputs as `people-contact-editor-scope-guard-proposal.patch`. It proposes a layout-effect generation scoped to tenant, contact identity and open/unmount lifecycle, with checks after mutation, after `onSaved`, and before error/finally updates. The patch is not applied or verified product code. Root must resolve this exception before declaring the full workspace-switch experience complete.

If approved, verification must cover delayed success and rejection after tenant switch, unmount and close/reopen; a delayed `onSaved` callback; and unchanged same-scope success, failure and retry. A guard suppresses stale presentation; it does not undo an already authorized server mutation.

## Release documentation and owner test map owed

Before a released capability claim, update the current Sales section in the master reference, the tier matrix and Brain index with exact release evidence and remaining Proof Owed. Historical release notes must stay attributable to their original evidence; do not turn prior fixture counts into authenticated claims.

Owner map after a verified Ready deployment: Campaigns → Sales → open each of Quick Offer, Payment Handling and Commercial Terms → type/edit → Cancel/discard → reopen empty → test X, Escape and Back → open a direct panel URL → try Catalog return and canonical Create Client return → switch workspace during an open flow. Only authorized persistence is a successful save. No charge, provider action or legal-document lifecycle is implied.


## Release-blocking regression captured

Two active tests in `TenantRelationshipsClientsWorkspace.test.tsx` exercise the real canonical editor with a deferred mutation. Both currently fail: after the workspace switches and the editor unmounts, delayed success still emits `Contact created`, and delayed rejection still emits the old workspace error. The production editor file is unchanged. A review-only patch adds an attempt scope generation guard before callbacks, state updates and toasts after each asynchronous boundary. Applying it requires the additional `PeopleContactEditor.tsx` shared-file exception.

Verification recorded before the final blocker tests: 168 combined tests passed; the subsequent retry-retention regression increased the independently passing Sales suites to 84. The TypeScript ratchet passed (13 existing baseline errors, 13 current), focused lint passed with the existing GrowthHub fast-refresh warning, and a production build passed. The initial browser run passed 1,464 checks; a stricter rerun then found contrast issues and drove further Sales-local fixes. That earlier browser count is not final exact-head proof. The final complete browser matrix, canonical Client browser return and authenticated production/persistence remain Proof Owed. No PR merge, deployment, provider call or production data mutation occurred.


Latest complete fixture Chromium run: 1,780/1,784 checks passed across the four viewports and both persistent themes. Drawer controls, focus, dirty browser history including repeated Back, direct/invalid URLs, Catalog return, workspace switching, negative inert ancestry/pointer controls, scroll ownership and Sales resting contrast passed. The four failures were the same dark-theme hover contrast (3.92:1). A scoped hover foreground/background fix has been applied; its targeted rerun is recorded separately. This runtime evidence still excludes real canonical Client creation, authenticated tenants and persistence.


Targeted hover verification after the fix: **8/8 PASS**, all four required viewports in light and dark. Evidence is `scripts/live-drive/artifacts/sales-ops/hover-results.json`; the full interaction evidence remains `interaction-results.json` with the original four now-resolved hover failures preserved. The two canonical late-toast regressions remain active failures. Product implementation snapshot: local commit `86718095`; no release performed.
