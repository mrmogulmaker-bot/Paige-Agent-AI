# UI delivery evidence: solo-calendar-settings-write-gate

The Settings › Connections › Calendars write gate resolved against the VIEWED tenant, and honest,
categorised failure reporting for the Solo Calendar's "New appointment". Two distinct Solo defects;
no fixture revived, no parallel calendar system, no public booking preset auto-created.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: pre-edit packet in PR #1187 + session — mode Existing-project bugfix, depth Standard/Deep; affected flows = (a) operate the Calendars surface (create/edit/enable/hosts) as the account being viewed, (b) a refused New appointment; grounded against fresh `origin/main` a52b1947, collision-free (hooks only).
PAIGE_UI_DESIGN: PASS: read `.agents/skills/paige-ui-design/SKILL.md`; §00 port-only — this changes authorization-gate LOGIC and failure COPY, reusing the shipped `cc-*`/`sc-*` components and the existing error-notice + disabled-control patterns; no visual direction invented, substituted, or overridden.
MATERIAL_FLOW_CHANGE: YES: the owner regains the ability to OPERATE the Calendars surface (the "New preset" button and edit/enable/hosts) when viewing their own account while `profiles.active_tenant_id` is stale or just switched; and a failed "New appointment" now reports an honest, actionable category instead of a raw PostgREST/SQLSTATE string, and never reads as a booked appointment.
FLOW_PROTOTYPE: PASS: verbatim reuse of the shipped, Claude-Design-approved Calendars surface and `CreateDrawer` — the enable/disable gate, the `cc`/`sc` error notices, and the drawer are unchanged; only the gate predicate and the failure sentence change, so there is no new interaction shape to prototype (§69 precedent). Gate-1 prototype approval is lifted pre-launch (§4/§69 — owner reviews on the live site).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo (or sub-account) owner, on their own account, can create/manage their booking presets in Settings and add an internal appointment on their Calendar — and sees an honest reason when a write is refused.
VISUAL_DIRECTION: PASS: §00 port-only — no pack, tokens, layout, motion, or copy-styling changed; the only user-visible string changes are honest failure sentences shown in the existing `sc-msg--bad` / `cc` notice.
AUTOMATED_EVIDENCE: PASS: `npx vitest run src/components/tenant-calendar src/solo/data/useCalendarConnections.test.tsx src/solo/connections-calendars.test.tsx` = 216/216 across 7 files, including a new `useCalendarConnections` hook test (gate calls `is_tenant_admin` with the VIEWED id; grants on stale profile; grants a platform admin; re-evaluates on tenant switch; denies otherwise), `classifyBookingWriteError` unit tests, and New-appointment refusal/success workspace tests.
STATIC_EVIDENCE: PASS: `npm run ci:tsc` (tsc-ratchet) adds 0 errors beyond baseline in touched files (only the unrelated pre-existing `paige-capability-gateway.test.ts` baseline error remains); `eslint` clean on the touched hooks + tests; plus a local-Postgres RLS-parity harness proving `is_tenant_admin(viewed)` matches the real `calendars` "manage" RLS INSERT outcome (owner@own allowed, owner@other refused, non-member refused). No migration, no edge change.
RENDERED_EVIDENCE: UNVERIFIED: this headless remote session has no browser tool; the surface was not rendered here. Owed to a browser-capable session.
BEHAVIORAL_EVIDENCE: UNVERIFIED: the gate + failure paths are proven at the hook and component level (the real hook against a faked supabase boundary; the real `SoloCalendarWorkspace`/`CreateDrawer` against a mocked data boundary), but were not driven in a live browser (no browser tool). Owed to a browser-capable session.
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated production reach from this session (headless; Supabase MCP permission-denied on prod). The owner live-drive — "New preset" enabled for the signed-in owner, and New appointment end-to-end with persisted readback — is owed to a browser-capable session; the owner is capturing the exact live create request separately.
KEYBOARD_FOCUS: PASS: no focus/keyboard surface changed — the gate only toggles `disabled` on shipped controls and the drawer's shared focus contract is unchanged (covered by the existing Drawer focus test).
ZOOM_REFLOW: NOT_APPLICABLE: no layout change — gate logic and failure copy only.
REDUCED_MOTION: NOT_APPLICABLE: no motion added or changed.
STATE_COVERAGE: PASS: canWrite true (viewed-tenant admin), true (platform admin), true (stale profile pointing elsewhere), false (member-elsewhere-only), re-evaluated on tenant switch; and create refusal categories conflict/forbidden/not_found/invalid/unavailable/network/unknown plus success — all exercised by tests.
TRUTHFUL_STATE_LABELS: PASS: the write gate reflects the tenant actually being viewed (never the caller's own stale active tenant); a refused create is classified honestly and the form stays open — a refusal can never present as a saved appointment; an unrecognised cause is surfaced verbatim (§13).
SOLO_UI: YES: the Solo Settings › Connections › Calendars surface (`useCalendarConnections`) and the Solo Calendar create path (`useSoloCalendar` on `SoloCalendarWorkspace`).
UNVERIFIED: Remaining owed items — the live render, the browser behavioral drive, the authenticated owner drive (New preset enabled + New appointment end-to-end + persisted readback), and all eight Solo-viewport captures — are owed because this headless session has no browser tool and cannot reach prod. All owed to a browser-capable session (§32.c).
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 1536x770 PAIGE-closed capture owed to a browser-capable session.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 1536x770 PAIGE-open capture owed to a browser-capable session.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 1366x768 PAIGE-closed capture owed to a browser-capable session.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 1366x768 PAIGE-open capture owed to a browser-capable session.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 1024x768 PAIGE-closed capture owed to a browser-capable session.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 1024x768 PAIGE-open capture owed to a browser-capable session.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: no browser tool in this headless session; 900x1000 PAIGE-closed capture owed to a browser-capable session.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: no browser tool in this headless session; 900x1000 PAIGE-open capture owed to a browser-capable session.

OWNER_INTENT: Fix, as distinct live defects, (1) the Settings Calendars write gate so it aligns with the server-authorized VIEWED tenant using the same membership/management rule that governs the actual write, with tenant-switch and stale-profile coverage; (2) the client's New-appointment failure observability so a real live refusal reports an honest, actionable category and never looks like a successful appointment. Keep the internal-booking RPC untouched. Do not create a public booking preset. Target actor: Solo/sub-account owner on their own account.
MUST_NOT_HAPPEN: Must not revive a de-mounted fixture or a legacy calendar-settings screen; must not build a parallel calendar system; must not change the `create_internal_booking` RPC; must not auto-create a public booking preset; must not loosen the gate below the write's own RLS rule; must not let a refused create present as a success.
MUST_PRESERVE: The `calendars` manage-RLS as the source of truth; the existing read/empty/error/host/notify behavior of `useCalendarConnections` and its surface (74 surface tests stay green); the honest `bookingWriteMessage` outputs for edit/reschedule; the CreateDrawer close-only-on-ok contract; the three separated truths (internal appointments · tenant booking presets · personal provider connections).
ACCEPTANCE_CRITERIA: On the live Solo platform: a signed-in owner viewing their own account sees "New preset" ENABLED and can create/edit/enable a preset (persisted on reload) even right after a tenant switch; a non-admin sees it disabled with the read-only notice; adding an internal appointment succeeds and appears after reload; a refused appointment (e.g. an overlap) shows an honest category and the form stays open with nothing booked. (Authenticated live confirmation is PROOF OWED per above.)
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Tested — `useCalendarConnections` read/empty/error/canWrite (216/216 incl. the new hook test) and `useSoloCalendar` create/reschedule/edit/classifier + the CreateDrawer close-on-ok contract. Named unaffected — the `create_internal_booking` / `reschedule_internal_booking` / `update_internal_booking` RPCs (untouched), the public `/book/:slug` guest path, the ten-area preset builder, and provider connect/disconnect.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: c889cd0a834cd707b81eae98d7f41b424f2a2654; deployment=pre-merge-branch-build (PR #1187); environment=local; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/solo-calendar-settings-write-gate.md
RELEASE_CHANNEL: development: pre-merge branch build verified in CI/local; on merge to `main` it ships to production via Vercel (frontend only — no migration, no edge), per §4 pre-launch.
RELEASE_CLASSIFICATION: internal-only: pre-launch platform with no live customers; the owner reviews on the live site per §4.
CUSTOMER_RELEASE_IDENTITY: none: internal build, pre-launch; no customer version or name assigned.
RELEASE_NOTE_REQUIRED: NO: internal-only pre-launch delivery; no customer-facing release.
RELEASE_TRUTH_BOUNDARY: PARTIAL: the write-gate fix and the honest failure categories are LIVE on the frontend merge (no backend change); the authenticated owner live-drive and the eight Solo-viewport captures are PROOF OWED to a browser-capable session.
RELEASE_RECOVERY: position=forward-fix or clean revert; reference=the change is a small, additive client-only diff (two hooks + tests + docs), so reverting the branch commit removes it with no data migration or backfill.

## Scope and collisions

- Classification: existing-project bugfix of two live Solo surfaces (R1 client-only; no RPC/schema/edge change).
- Affected flows: operate the Calendars surface as the viewed account (create/edit/enable/hosts); a refused New appointment.
- Neighboring regressions: `useCalendarConnections` read/empty/error/host/notify (surface tests) and `useSoloCalendar` create/reschedule/edit — all retested green (216/216).
- Active-owner/file collisions: none — built on fresh `main` (`a52b1947`); hooks only.
- Explicit exclusions: no change to `create_internal_booking`; no public booking preset created; no fixture/legacy screen revived; no parallel calendar; no lifecycle-language change in this slice.

## User job and state map

Purpose: let the owner operate their own Calendars settings regardless of a stale/just-switched profile pointer, and see honest reasons when a Calendar write is refused. Primary action: "New preset" (Settings) / "New appointment" (Calendar). Visual direction: the shipped `cc-*`/`sc-*` systems, unchanged. States: canWrite true/false (viewed-tenant admin, platform admin, stale profile, member-elsewhere, tenant switch); create refusal categories (conflict/forbidden/not_found/invalid/unavailable/network/unknown) and success. Exits: Save (success), Cancel, refusal (form stays open). Side effect: none added.

## Evidence index

- `npx vitest run src/components/tenant-calendar src/solo/data/useCalendarConnections.test.tsx src/solo/connections-calendars.test.tsx` → 7 files, 216 passed.
- `npm run ci:tsc` → 0 new errors beyond baseline (only the pre-existing unrelated `paige-capability-gateway.test.ts`).
- `eslint` on the two hooks + three test files → clean.
- Local-Postgres RLS-parity harness (`/tmp/pgtest`, PostgreSQL 16, real `calendars` "manage" policy + verbatim helpers): `is_tenant_admin(viewed)` = t → INSERT ALLOWED (owner@own); = f → INSERT refused (owner@other, non-member). Faithful create-seam replay (verbatim 17-param `create_internal_booking`): create persists; overlap→23P01; cross-tenant/unauth→42501.
- Touched files: `src/solo/data/useCalendarConnections.ts`, `src/components/tenant-calendar/useSoloCalendar.ts` (+ tests).

## Review and limitations

Independent §39 adversarial self-read of the pushed diff: the Promise.all tuple is 8-wide and correctly ordered; `canWrite` ORs the two viewed-tenant checks and fails closed on a read error; the classifier preserves every existing `bookingWriteMessage` output (edit/reschedule tests green) and never swallows a real cause; `createBooking` returns no false success and the drawer closes only on `ok`; `activeTenantId` is guaranteed non-null at the Promise.all (the `!activeTenantId` branch returns first). §32.c limitations: rendered / behavioral / authenticated-runtime / all eight Solo-viewport captures are UNVERIFIED and owed to a browser-capable session. No migration or edge change, so no deployment-ledger proof applies.
