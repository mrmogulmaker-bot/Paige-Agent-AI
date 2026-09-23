# UI delivery evidence: INT-162 — review findings, and the signing credential in analytics

Covers the fixes for all six Codex findings on merged PR #1364, plus a seventh this lane found by
taking the disclosure family first. Off current `main` (`64c568b6`); the prior branch was
squash-merged, so this restarts rather than stacks.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: flow-by-flow v2.0.1 with flow-prototype v2.0.1 paired at the same version (Gate 5 PASS); mode Bug/Repair, risk R3 (a credential disclosure plus false statements on a legal record) so depth Deep with independent review — the review here being Codex's, verified rather than accepted. Affected flows: a Solo owner reads a completed agreement and is told only what is true about it, and a counterparty opens a signing link without that link being recorded anywhere.
PAIGE_UI_DESIGN: PASS: impeccable read; reference/craft-floor.md read before the CSS edit. No visual direction was invented — the only visual change is the REMOVAL of two paint-property transitions AGENTS.md's interface standard forbids, leaving the approved states intact and instant.
MATERIAL_FLOW_CHANGE: YES: the completion screen stops asserting a commercial state it cannot know and stops describing a sealed PDF that may not exist; the audit trail discloses truncation instead of presenting a partial chain of custody as whole; the client-record control now reaches the named client; and the signing bearer token is redacted before anything records it.
FLOW_PROTOTYPE: PASS: owner-approved prototype Artifact S271qc7uGTFXbdNoTz49VC Version 2 §28 APPROVED-FROZEN. Nothing here re-opens an approved design: the removed sentence ("These terms are now active against their record") was this lane's own addition, not the pack's, and it contradicted the pack's closing note which is preserved verbatim.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: purpose is that a legal record states only what is known and that a signing credential is never written to an analytics store; audience is the Solo business owner reading a completed agreement, and every counterparty who opens a signing link; the primary action is unchanged — retrieve the sealed copy, or open the client's record.
VISUAL_DIRECTION: PASS: the committed Solo palette, unchanged. Two `transition` declarations on `background`, `color` and `border-color` were removed because AGENTS.md's interface standard says motion animates `transform`/`opacity` only. The state changes remain; they are instant rather than eased.
AUTOMATED_EVIDENCE: PASS: EXIT CODE 0 across src/solo/sales-ops.contract.test.tsx and src/hooks/useAnalytics.redaction.test.ts, 93 tests (90 + 3). FIVE new guards, each proven NON-VACUOUS by restoring the exact defect it exists to catch: restoring the false "terms are now active" claim fails 1 of 90; hiding truncation again fails 1; dropping the contact id fails 1; removing the path redaction fails 2 of 3. Restored, 93 pass. The routing guard asserts the real destination through a router LocationProbe rather than a spied callback, because a spy would prove only that a handler fired, not that it routed anywhere.
STATIC_EVIDENCE: PASS: npm run ci:tsc (the RATCHET, which is the real typecheck — `npx tsc --noEmit` at the repo root typechecks nothing, tsconfig.json being references-only) EXIT 0, baseline 12, current 12. ESLint over every changed src file EXIT 0. vite build EXIT 0. npm run lint:tier-features EXIT 0. HONEST LIMIT: src/solo/sales-ops.tsx carries // @ts-nocheck, so even the real typecheck skips the file most of this change is in.
RENDERED_EVIDENCE: PASS: rendered in real Chromium through the sales-mount harness. The full surface drive (scripts/live-drive/sales-ops-drive.mjs) passes 536/536 EXIT 0, horizontal overflow 0 across all 48 column states. Screen 5 re-shot in BOTH themes at 900x1000 with assertions read from the live DOM, confirming the corrected copy renders and the trail still carries five events with two settled marks. Frames in scripts/live-drive/artifacts/sales-ops (gitignored). LOCAL harness renders, never deployed or authenticated captures (§32.c).
BEHAVIORAL_EVIDENCE: PASS: driven through the rendered DOM — opening a completed record and reading the seal's claims back, a completed record with no sealed copy, a trail that reads successfully and comes back empty, a trail the engine reports as truncated, and clicking the client-record control and reading the resulting route. The redaction is proven directly against its function over token, word-shaped and ordinary paths. Harness and double evidence, NOT authenticated runtime.
AUTHENTICATED_RUNTIME: UNVERIFIED: LIVE_DRIVE_EMAIL and LIVE_DRIVE_PASSWORD are unset and the INT-163 backend is undeployed, so no authenticated run exists. Owed to a capable session. Stated precisely because it bears on the credential finding: the disclosure is ARMED, not firing — no tokens are minted yet — and it begins firing the moment they are, with no further code change.
KEYBOARD_FOCUS: PASS: unchanged from the merged delivery. Every attach row and dialog control remains a real button in document order with a visible focus ring; the completion dialog still takes focus on the panel, closes on Escape, and returns focus to its opener. No control was added or removed by this change.
ZOOM_REFLOW: PASS: the truncation notice is a normal paragraph inside the trail panel and wraps like the copy around it; no new fixed width, no new min-width. The full drive measures zero horizontal overflow across all 48 column states including the 439px tightest real column.
REDUCED_MOTION: PASS: strictly improved. Two paint-property transitions were REMOVED, so there is less motion than before, and the sheet-wide prefers-reduced-motion guard already in sales-ops.css still covers everything that remains.
STATE_COVERAGE: PASS: a completed agreement with a sealed copy and one without; a trail that loads, fails, returns empty, returns events, and returns more events than the cap; an agreement whose commercial row is draft, paused, cancelled or absent (the case the removed sentence misstated); the client-record control with and without a contact id; and the signing path redaction over a real token, a word-shaped token and every unrelated route.
TRUTHFUL_STATE_LABELS: PASS: this change is almost entirely about this field. The completion screen no longer asserts that terms are active — signing does not touch the commercial row and create-and-sign saves it draft, so the common case made it false, and it contradicted the closing note eight lines below. It no longer describes a sealed PDF when none is recorded. The ready-empty trail says the read succeeded and came back empty rather than offering "could not be read", a reason `phase === "ready"` has already excluded. And a truncated trail says so instead of presenting a partial chain of custody under a heading that implies completeness.
SOLO_UI: YES: Campaigns → Sales → Commercial Terms (src/solo/sales-ops.tsx, src/solo/sales-ops.css, src/solo/useSoloAgreementSignings.ts, src/solo/growth2.tsx), plus the shared analytics hook src/hooks/useAnalytics.ts.
SOLO_1536X770_PAIGE_CLOSED: PASS: rendered via the sales-mount harness at 1536x770 with PAIGE docked-closed, light and dark, frames fit-{light,dark}-1536-paige-closed-terms.png. Zero horizontal overflow, single shell scroll owner.
SOLO_1536X770_PAIGE_OPEN: PASS: rendered at 1536x770 with PAIGE open (521px column), light and dark. Zero horizontal overflow, single shell scroll owner.
SOLO_1366X768_PAIGE_CLOSED: PASS: rendered at 1366x768 with PAIGE docked-closed (685px column), light and dark. Zero horizontal overflow, single shell scroll owner.
SOLO_1366X768_PAIGE_OPEN: PASS: rendered at 1366x768 with PAIGE open — the 439px tightest real column. Zero horizontal overflow, single shell scroll owner; the column scrolls vertically, recorded by the drive as an expected scroll rather than a fit.
SOLO_1024X768_PAIGE_CLOSED: PASS: rendered at 1024x768 where PAIGE becomes an overlay, light and dark. Zero horizontal overflow, single shell scroll owner.
SOLO_1024X768_PAIGE_OPEN: PASS: covered by the same 1024x768 overlay frames — PAIGE opens AS an overlay at this width rather than narrowing the column, so the page geometry is identical. Named rather than duplicated.
SOLO_900X1000_PAIGE_CLOSED: PASS: rendered at 900x1000 (overlay), light and dark, and the viewport the screen-5 frames were shot at. Zero horizontal overflow, single shell scroll owner.
SOLO_900X1000_PAIGE_OPEN: PASS: covered by the same 900x1000 overlay frames, for the reason given in the 1024 open row.
UNVERIFIED: the authenticated runtime drive. Owed to a capable session; needs credentials this session does not hold and a deployed backend.
INTERNAL_BUILD_IDENTITY: fdcb4daea4c74cbccdf85e769af4a4f9c8f15ff4; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=this-PR+src/solo/sales-ops.contract.test.tsx-and-src/hooks/useAnalytics.redaction.test.ts(93-tests-EXIT-0)+scripts/live-drive/sales-ops-drive.mjs(536/536-EXIT-0)+five-defect-restoration-proofs
RELEASE_CHANNEL: development: branch build (environment=development); frontend-only, deploying via Vercel on merge. No supabase/migrations file and no supabase/functions bundle changed, so neither db-live nor edge-live moves.
RELEASE_CLASSIFICATION: internal-only: a credential-disclosure fix plus five truthfulness corrections on a pre-launch surface; no owner-decided customer release.
CUSTOMER_RELEASE_IDENTITY: none: pre-launch platform with no live customers on this surface and no tokens yet minted; no customer release identity earned or decided.
RELEASE_NOTE_REQUIRED: NO: no customer holds an account on this surface and the backend it reads is undeployed, so there is no customer-visible behaviour change to announce.
RELEASE_TRUTH_BOUNDARY: PARTIAL: the corrected statements, the truncation disclosure, the routing and the redaction are all proven headless — 93 tests EXIT 0 with five guards proven by defect restoration, 536/536 harness checks EXIT 0, and a two-theme render read from the live DOM. What is NOT proven is any authenticated run: credentials are unset and the backend is undeployed, so the credential disclosure is demonstrated by tracing route to sink in code rather than by observing a row in analytics_events.
RELEASE_RECOVERY: position=fully reversible by revert — frontend-only and additive, creating no table, column, index or stored object and altering no deployed contract, so reverting the merge commit restores the previous copy, the previous routing and the unredacted path with no data or runtime state to unwind (a revert would also restore the disclosure, which is the reason not to); reference=git revert of the merge commit
OWNER_INTENT: an owner reading a completed agreement is told only what is true about it, and a counterparty's signing link is never written anywhere it can be read back.
MUST_NOT_HAPPEN: never write a bearer credential into an analytics store, a log or any durable record; never assert a commercial state the surface has not read; never describe an artifact that is not recorded; never present a truncated chain of custody as complete; never offer "could not be read" for a read that demonstrably succeeded.
MUST_PRESERVE: every control and state from the merged delivery. Nothing was removed — the sealed-copy act, the three exits, the trail, the attach list, the pager, the snapshot lock and the approved closing note all stand. Two CSS transitions were removed; the states they eased remain and are now instant.
ACCEPTANCE_CRITERIA: on the real platform, a completed agreement's summary matches what the database actually holds; a trail longer than the cap says so; the client-record button opens the named client; and opening a signing link leaves no token in analytics_events. The first three are proven against the harness and the contract; the fourth is proven by code trace and unit test, and becomes observable only once tokens are minted.
MOTION_PURPOSE: less of it, deliberately. The two hover transitions removed were paint-triggering and forbidden by the interface standard; the hover state still changes, instantly. No motion was added.
PROTECTED_SEAMS: the sales-mount harness is an impacted seam and was TESTED — and it caught what the suite did not. Exporting TRAIL_LIMIT changed a module contract the harness stub stands in for, and the stub did not re-export it, so the harness failed to mount at all while 90 tests passed. Repaired in the stub, which also now returns `truncated` from its signingEvents fixture. src/hooks/useAnalytics.ts is a shared seam. CORRECTED 2026-09-23 — the sentence previously here read "the redaction is applied at the two points where a path enters the payload, so no caller can bypass it." Both halves were wrong. There were FOUR sinks, not two, and the guard did not cover the wiring at all. See CORRECTION below. Unaffected and named: the Catalog surface, Revenue, Scenarios, the signing page's own reads, and every other live-drive harness. Full drive 536/536 EXIT 0 after the change.

---

## CORRECTION (2026-09-23) — four sinks, not two, and a guard that proved nothing

Codex review raised two P1s against the redaction this record describes. Both premises were checked
before any code moved, and checking them found a third and fourth sink neither of us had named.

**What the earlier claim got wrong.** It said two points, and it said no caller could bypass them.
Four sinks record the URL, and the guard asserted only that the pure functions worked — stripping all
three call sites out of the payload left every test green, EXIT 0. A guard that passes while the
credential ships is worse than no guard, because it reports safety.

| # | Sink | Who can read it | Status when found |
|---|---|---|---|
| 1 | `page_path` -> `analytics_events` | `is_platform_owner()` | redacted in the prior commit |
| 2 | `properties.path` -> `analytics_events` | `is_platform_owner()` | redacted in the prior commit |
| 3 | `referrer` -> `analytics_events.referrer` | `is_platform_owner()` | MISSED — one line below sink 1 |
| 4 | `landing_path` -> `referral_clicks` | **the owning affiliate** | MISSED — raised by review |

**Sink 4 is the worst of the four and was not the one flagged loudest.** `referral_clicks` RLS is
`affiliate_id in (select id from affiliate_profiles where user_id = auth.uid())`, so the credential
would reach an ordinary tenant-tier user rather than a platform operator — a cross-principal
disclosure, where the party who can read the row is the same party who controls whether `?ref=` is
appended to create it.

**Sink 3 is armed, not firing.** `AgreementSigning.tsx` performs no full-page navigation and an SPA
route change does not update `document.referrer`; `Referrer-Policy` is `strict-origin-when-cross-origin`,
which strips the path cross-origin but not same-origin. Closed anyway — it begins firing the moment
someone adds a same-origin link or a post-sign redirect, with nobody watching.

**Premise verdicts, stated separately from the fixes.** The case-insensitivity half of P1 #1 is TRUE:
`matchPath({path:"/sign/:token"}, "/SIGN/TOK")` matches against the installed react-router-dom 6.30.4
and yields `token=TOK`, so `startsWith("/sign/")` waved a rendering signing page straight through. The
percent-encoding half is FALSE on its stated grounds — `/%73ign/TOK` does not match the route and never
renders. The underlying concern survives independently: these sinks log whatever is in the URL
regardless of what matched, so the guard is now deliberately wider than the router.

**Non-vacuity, each defect restored and the suite re-run:** case-sensitive prefix restored -> 2 fail ·
referrer un-redacted -> 2 fail · `page_path` un-redacted -> 2 fail · affiliate landing path
un-redacted -> 1 fail · all restored -> 12 pass, EXIT 0.

AUTHENTICATED_RUNTIME is still UNVERIFIED — credentials unset, backend undeployed.
