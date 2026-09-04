# Solo Sales Release 1 usability repair

**Status: implementation complete; final verification in progress / NOT RELEASED.**

This record describes the working branch `codex/solo-sales-release1-usability`, re-grounded on main `bd32fd629079e59257fdf939b4ae250e2de9e005`. It is not a claim that the repair has merged, deployed, or passed an authenticated owner test. Final exact-head checks and production evidence must be recorded before that status changes.

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
- `src/components/tenant-relationships/PeopleContactEditor.tsx`: owner-approved completion scope guard; no mutation or permission contract change.
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

## Approved Client completion guard

The owner approved the narrowly prepared `PeopleContactEditor.tsx` exception on 2026-09-03. Before application, the patch was checked to touch only that production file; focused tests and browser adapters provide its evidence. A layout-effect generation binds completions to tenant, contact identity and open/unmount lifetime. Checks after the canonical mutation, after `onSaved`, and before error/finally feedback discard departed-context presentation. The existing server save contract and authorization are unchanged; an accepted save may still persist in its initiating workspace.

Two active regression tests failed before this guard (late success and error toasts after departure) and pass with it. Returning to A reads the canonical source; A-to-B-to-A cannot revive the original attempt. Normal in-place success, failure and retry remain covered. The Sales continuation selects a newly created client only after the destination's tenant-filtered client source and permission/readability checks accept it.

## Evidence and release status

- Automated: **174/174 focused tests PASS** across seven Sales, navigation, GrowthHub and canonical Clients suites after merging current main `bd32fd629079e59257fdf939b4ae250e2de9e005`. Includes dirty history, scope cleanup, failure/retry, same-context feedback, delayed success/rejection, return-A source refresh and negative regression controls.
- Independent review: no material blocker found in the approved guard or complete Sales diff. This is code review, not authenticated proof.
- Chromium: final complete interaction matrix in progress. Production components use deterministic fixture adapters; this is actual browser interaction, not production authorization or persistence proof.
- Build/type/lint: final release gates in progress.
- Production: not yet merged or deployed. Ready deployment, exact commit and serving asset verification must be recorded separately.
- Authenticated owner and production canonical persistence: **Proof Owed**. The owner explicitly authorized release without holding for this proof.

The browser matrix covers 1536x770, 1366x768, 1024x768 and 900x1000, both themes and reduced motion. It exercises X, Cancel, Escape, focus entry/trap/restoration, dirty abandonment, URL/Back/direct/invalid navigation, Catalog round trip, workspace cleanup, true scroll ownership and negative inert ancestry/pointer controls. The canonical Client adapter additionally exercises cancellation, failure/retry/success return, delayed successful/failed saves during a workspace switch and canonical refresh on return.

The existing canonical Client editor has visible field captions that are not programmatically associated with their inputs. Browser automation targets the caption's adjacent input rather than claiming accessible-label coverage for that existing editor. The approved completion guard preserves its focus behavior; this release does not claim a general Client accessibility redesign.

## One-minute owner test map

After Ready production is verified: Campaigns -> Sales -> open each of Quick Offer, Payment Handling and Commercial Terms -> type/edit -> Cancel/discard -> reopen empty -> test X, Escape and Back -> open a direct panel URL -> try Quick Offer -> Catalog -> Return to Sales and Commercial Terms -> Create Client -> return with the authorized new client selected. Switch workspace while a flow or save is pending; no prior-workspace draft, selection, pending state or toast should appear. Return to the original workspace and refresh from the canonical source.

No charge, provider action, plan change or legal-document lifecycle is implied. The locked Campaign navigation and existing Pipeline work remain unchanged.
