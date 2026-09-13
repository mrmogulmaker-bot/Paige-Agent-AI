# UI delivery evidence: solo-calendar-newcalendar-copy

A small owner-directed UX correction on the already-live Settings › Connections › Calendars surface
(#1196): make the creation action an obvious PRIMARY button labelled **New calendar**, placed with the
"What people can book" heading (not a low-emphasis action floating far right), and scrub user-facing
"preset" → "calendar" consistently across the creation / list / chooser / editor copy. "preset" is
preserved ONLY in code/DB/RPC identifiers, CSS classes, and `/book/:slug` URLs — no data contract or
route renamed. This is copy + button-emphasis only; the create/edit/publish/pause/duplicate/archive/
restore flows are unchanged.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: owner-directed copy/emphasis correction on a shipped flow (#1196); no new actor-goal flow — the create-a-calendar flow is unchanged, only its label, primary-button emphasis, and the word "preset"→"calendar" in visible copy. Affected surface: the LIST header CTA + chooser + list/editor copy in `src/solo/connections-calendars.tsx`.
PAIGE_UI_DESIGN: PASS: §00 port-only — this is the owner's explicit design direction (label text, "clear primary button placed with the heading", and the exact "preset"→"calendar" wording), ported verbatim using the established `cc-*` primitives + `--pg` tokens. No visual direction invented, substituted, or overridden; the primary treatment reuses the surface's existing `Btn kind="act"`.
MATERIAL_FLOW_CHANGE: NO: no goal, state, transition, exit, or consequence changes — the create-a-calendar flow is identical; only the trigger's label + emphasis and visible wording change ("preset"→"calendar").
FLOW_PROTOTYPE: NOT_REQUIRED: copy + button-emphasis correction on an already-approved, shipped flow; no new flow or state to prototype (the owner directed the exact wording/emphasis).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo / sub-account owner on Settings › Connections › Calendars; the primary action — create a new booking calendar — is now an obvious gold primary CTA in the section header, in human language ("calendar", not "preset").
VISUAL_DIRECTION: PASS: reuses the shipped Solo `cc-*` primitives + `--pg` tokens. The "New calendar" trigger changes from a low-emphasis `size="s"` button to the full-size `Btn kind="act"` primary treatment already used on this surface for Publish / Create draft; gold stays on the one act moment of the list screen (§11 — no competing gold there). No new tokens, no new component.
AUTOMATED_EVIDENCE: PASS: `npx vitest run src/solo/connections-calendars.test.tsx src/solo/data/useCalendarConnections.test.tsx src/lib/calendar` = 174/174 across 4 files; the component suite (86) asserts the new copy — the chooser opens from the "New calendar" trigger, "No booking calendars yet" empty state, "All calendars" back, the archived "This calendar is Archived" banner, and the new-booking-calendar aria-label field.
STATIC_EVIDENCE: PASS: `tsc-ratchet` clean (baseline 12, current 12 — 0 new); the change is client-only (one `.tsx` + its test), no schema/RPC/edge change, no contract touched.
RENDERED_EVIDENCE: UNVERIFIED: this headless session has no browser tool; no surface rendered here. The live render is the owner's own validation pass on the deployed surface (the fast-follow ships to prod on merge).
BEHAVIORAL_EVIDENCE: PASS: the rendered copy + the primary-button behavior are exercised by the jsdom component suite (86 tests) — opening the chooser from the relabelled "New calendar" trigger, the empty state, the archived read-only banner, and the list/editor copy. The authenticated live browser drive is the owner's validation (see AUTHENTICATED_RUNTIME).
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production reach from this headless session. The owner live-drive on the deployed Calendar surface is the validation pass; this is a client-only copy/emphasis change with no server contract, so there is no persisted-state claim to prove.
KEYBOARD_FOCUS: UNVERIFIED: the trigger remains a native `<button>` with the same focus/keyboard contract (only its class + label changed) and the chooser's focus management is unchanged; runtime keyboard verification is owed to a browser-capable session.
ZOOM_REFLOW: UNVERIFIED: the header row (`cc-head`) already wraps at narrow widths (`flex-wrap: wrap`) and a larger button inherits that; measured zoom/reflow at the four Solo viewports is owed to a browser-capable session.
REDUCED_MOTION: PASS: no new animation — the `Btn kind="act"` hover/active transitions are the surface's existing ones, already covered by the `.cc-btn` entry in the surface's `prefers-reduced-motion: reduce` block.
STATE_COVERAGE: PASS: the relabelled trigger + new copy are exercised across the list states (empty / loading / error / populated / archived group) and the editor states (Draft / Live / Paused / Archived) by the component suite; the button's disabled state (no write / stale account / create in flight) is unchanged and still tested.
TRUTHFUL_STATE_LABELS: PASS: (§13) the copy change does not alter any capability/state claim — Draft/Paused/Archived honesty (reserved-URL, "not public yet", read-only banners) is preserved verbatim except "preset"→"calendar"; no label now over-claims.
SOLO_UI: YES: the Solo Settings › Connections › Calendars surface (`src/solo/connections-calendars.tsx`).
UNVERIFIED: the live render, the eight Solo-viewport captures, the browser keyboard/zoom checks, and the authenticated owner drive are owed — this headless session has no browser tool. All owed to the owner's own live validation on the deployed fast-follow (§32.c). No server contract changed, so no persisted-state proof is owed.

OWNER_INTENT: Make the calendar-creation action obvious and use human language throughout the visible Calendar flow — relabel "New preset" → "New calendar", make it a clear primary button with the heading (not low-emphasis far-right), and scrub visible "preset" → "calendar" consistently; keep "preset" internal only (code/DB/RPC/URLs). Ship it live as a small final #1196 UX correction.
MUST_NOT_HAPPEN: Must not rename any data contract, RPC, table, column, CSS class, or `/book/:slug` URL; must not change the create/edit/publish/pause/duplicate/archive/restore flows or their honesty labels; must not misuse gold beyond the one list-screen act (§11); must not regress the disabled/stale-account guards on the create trigger.
MUST_PRESERVE: The `calendars`/preset RPC data contracts and identifiers; the master/detail flow and ten-area editor; the Draft/Paused/Archived honesty copy (only the word changes); the account-identity write guards; the public `/book/:slug` resolver behavior.
ACCEPTANCE_CRITERIA: On the live Solo surface: the section shows a prominent "New calendar" primary button by the "What people can book" heading; the chooser header reads "New booking calendar"; the eyebrow reads "BOOKING CALENDARS"; the empty state reads "No booking calendars yet"; the word "calendar" (not "preset") appears throughout the visible flow; and every create/edit/publish/pause/duplicate/archive/restore action still works exactly as before.
MOTION_PURPOSE: NONE: no motion change — reuses the existing `Btn` hover/active transitions and their reduced-motion twin.
PROTECTED_SEAMS: NONE_AFFECTED: client-only copy/emphasis change — no migration, RPC, edge function, action-risk, autonomy catalogue, or Spine registry touched; the `calendars` data contract and the public-booking resolver are unchanged.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: c327102a9cd80da32097db0e1375185508e569ca; deployment=pre-merge-branch-build (branch claude/calendar-newcalendar-copy); environment=local; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/solo-calendar-newcalendar-copy.md
RELEASE_CHANNEL: development: client-only copy/emphasis fast-follow to the live #1196 Calendar surface; ships to prod via Vercel on merge to main. Owner-authorized merge + deploy.
RELEASE_CLASSIFICATION: internal-only: pre-launch platform, no live customers; owner reviews on the live site per §4.
CUSTOMER_RELEASE_IDENTITY: none: internal pre-launch UX correction; no customer version or name assigned.
RELEASE_NOTE_REQUIRED: NO: internal-only pre-launch delivery; no customer-facing release.
RELEASE_TRUTH_BOUNDARY: PARTIAL: the copy/emphasis change is proven at the unit/component layer (174 calendar tests, tsc clean) and builds green; it is LIVE on merge+deploy (Vercel prod). No server/DB claim — client-only.
RELEASE_RECOVERY: position=forward-fix or clean revert; reference=client-only copy/class change in one `.tsx` (+ its test) with no data or contract change — reverting the commit removes it with nothing to unwind.

SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 1536x770 PAIGE-closed capture owed to the owner's live validation / a browser-capable session.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 1536x770 PAIGE-open capture owed to the owner's live validation / a browser-capable session.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 1366x768 PAIGE-closed capture owed to the owner's live validation / a browser-capable session.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 1366x768 PAIGE-open capture owed to the owner's live validation / a browser-capable session.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 1024x768 PAIGE-closed capture owed to the owner's live validation / a browser-capable session.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 1024x768 PAIGE-open capture owed to the owner's live validation / a browser-capable session.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 900x1000 PAIGE-closed capture owed to the owner's live validation / a browser-capable session.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 900x1000 PAIGE-open capture owed to the owner's live validation / a browser-capable session.

## Scope and collisions

- Classification: existing-project / UX-copy correction (client-only); no persistence, permissions, or contract change.
- Affected flows: the create-a-calendar entry (relabelled primary CTA) + visible copy across list/chooser/editor. No behavioral flow change.
- Neighboring regressions: `connections-calendars.test.tsx` (86) updated to the new copy; the hook + config suites unaffected (174 total green).
- Active-owner/file collisions: none — single `.tsx` + its test, off current `origin/main`.
- Explicit exclusions: internal identifiers (functions/RPCs/CSS/`PRESET_CATALOG`/`presetLifecycle`), the `calendars` data contract, and `/book/:slug` URLs are deliberately NOT renamed.

## User job and state map

Purpose: make "create a calendar" the obvious primary action and speak in human language. Audience: Solo/sub-account owner. Primary action: New calendar (gold `act` CTA in the section header). Visual direction: owner-directed, ported to existing primitives. States: unchanged (list empty/loading/error/populated/archived; editor Draft/Live/Paused/Archived). Scroll owner: unchanged (the surface owns no nested scroller).

## Evidence index

- `npx vitest run src/solo/connections-calendars.test.tsx src/solo/data/useCalendarConnections.test.tsx src/lib/calendar` → 174/174, 4 files.
- `node scripts/ci/tsc-ratchet.mjs` → 0 new (baseline 12, current 12).
- `node scripts/ci/ui-delivery-evidence.mjs` → this record.
- Live render / viewport captures / authenticated drive: owed to the owner's live validation (no browser tool here).

## Review and limitations

Client-only copy + button-emphasis change ported from explicit owner direction (§00). Limitation: no headless browser, so the eight Solo-viewport captures and the live keyboard/zoom/authenticated drive are UNVERIFIED and owed to the owner's own validation on the deployed fast-follow. No server contract changed, so there is no persisted-state claim to prove.
