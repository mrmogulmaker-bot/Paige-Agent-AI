# UI delivery evidence: solo-business-game-plan-live-data-corrections

Follow-up to the shipped Business Game Plan (Solo default Command Center landing), correcting five
things the owner found against authenticated live Solo data (workspace Mogul Maker Academy): the
greeting identity source, drill-ability of every summary claim, the payment-processor blocker
wording, and confirming Trust Compass stays out (no dead tab). Verified against PRODUCTION data via
authenticated Supabase queries. Touches only `src/solo/SoloGamePlanWorkspace.tsx`,
`src/solo/data/useSoloGamePlan.ts`, and `src/solo/solo-game-plan-workspace.css`.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow (Deep — behaviour + identity correctness on a shipped surface) applied; pre-edit frame + per-item authenticated-data trace recorded in this PR and docs/delivery/solo-business-game-plan-ui.md.
PAIGE_UI_DESIGN: PASS: the frontend-design skills standard (vendored bundle now wrapped by .agents/skills/paige-ui-design) governs the surface; this change is behaviour/identity/honesty (CC jurisdiction, §00), porting no new visual direction — the chip pill and layout are unchanged, only made interactive.
MATERIAL_FLOW_CHANGE: NO: existing summary claims become navigation affordances, but every destination already exists and is already reachable from this shell (Clients, the Systems Check sibling tab, and the ever-present PAIGE dock) — no new screen, state, or goal is introduced and the user's goals are unchanged; the greeting identity source is corrected and one move title is made honest. (A Codex P1 argued the added exits make this material; noted and addressed here — the affordances target pre-existing exits, the interaction was directly owner-requested, and the prototype gate is handled below.)
FLOW_PROTOTYPE: NOT_REQUIRED: the interaction "each summary claim opens its backing surface" was DIRECTLY REQUESTED by the owner (item 2, 2026-09-05: "Each item must open a real supporting surface…"), so there is no unapproved interaction to prototype; the targets are already-reachable surfaces and the visual direction is unchanged. Additionally, §69's Gate 1 prototype-approval is lifted pre-launch per §4/§69 (no live customers) — so even under the stricter "material" reading, the gate is satisfied, not bypassed.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Solo business owner; purpose unchanged (answer "what should we do?"). New: each summary claim opens the surface that backs it (§36 drill-down); the greeting names the person only when they own the workspace.
VISUAL_DIRECTION: PASS: unchanged `.paige-solo` tokens; the chip becomes a real control with a violet focus ring (never gold, §11) and a small arrow affordance; no new palette or layout.
AUTOMATED_EVIDENCE: PASS: full `npx vitest run` — 233 files / 3457 tests passed; the surface suites SoloGamePlanWorkspace.test.tsx (12) + data/useSoloGamePlan.test.ts (14) include failing-first tests for the greeting ownership gate, the greeting business-name-fallback neutralisation (peer-gate MAJOR), the honest payment title, and every chip carrying a real destination; `npm run build` green; `npx tsc --noEmit` clean; ESLint + gold-discipline on the changed src exit 0.
STATIC_EVIDENCE: PASS: tsc-clean typed files (useSoloGamePlan.ts / SoloGamePlanWorkspace.tsx carry no @ts-nocheck); removed the now-unused CHECK_DESTINATIONS import; eslint changed-src exit 0; gold-discipline clean.
RENDERED_EVIDENCE: PASS: real component + real CSS rendered headless (Chromium, scripts/live-drive/game-plan-render-drive.mjs) across all 8 states × light+dark × eight Solo content widths — 128/128 geometry checks (bodyOX=0, gpOX=0, rendered, no crash), with the attention chips now rendering as interactive buttons. Artifacts: scripts/live-drive/artifacts/game-plan/*.png.
BEHAVIORAL_EVIDENCE: PASS: component tests drive the real flows — the "clients at risk" chip navigates to /solo/42/clients/people, the "drafts waiting" chip invokes openPaige, a foundation row navigates, a priority row expands (keyboard), and no route/provider/internal id leaks into visible copy; hook tests prove the greeting is neutral for a non-owner viewer and the payment move title is the honest state clause.
AUTHENTICATED_RUNTIME: UNVERIFIED: the DATA layer IS verified against production — authenticated Supabase queries confirmed MMA's owner identity (owner_user_id → mogulmakeracademy@gmail.com, metadata "Antonio"), its systems-check findings (payment_processor_connected fail/blocking with declare-oriented copy; 3/10 fail), 1 pending email approval, and the real workspace events incl. the "Zapier PAIGE tools test succeeded" row (zapier_mcp_connection, 2026-09-05 14:08). What remains owed (§32.c): a browser-driven render of the DEPLOYED authenticated Solo surface with the real Paige dock — this headless session has no browser/auth tool.
KEYBOARD_FOCUS: PASS: the attention chips are now real <button>s in the tab order with a visible violet focus ring (`.gp-chip-act:focus-visible`), each carrying an aria-label naming the surface it opens ("… Open Clients."); the tablist, priority disclosure, and foundation buttons are unchanged.
ZOOM_REFLOW: PASS: relative units + internal scroll owner unchanged; the render drive re-confirmed zero horizontal overflow at every Solo content width down to a 490px column with the chips as buttons. A separate 400%/320px browser zoom pass was not run (UNVERIFIED).
REDUCED_MOTION: PASS: the new `.gp-chip-act` hover transition is disabled under @media (prefers-reduced-motion: reduce); no JS-driven animation added.
STATE_COVERAGE: PASS: loading / spine-error / empty first-run / grounded (with grounded-partial-needs input-blocked proof states) / recorded-work motion (incl. the honest source+freshness caveat and the "No recorded work yet" empty) — all rendered in the drive and covered by tests.
TRUTHFUL_STATE_LABELS: PASS: the greeting voices a personal name only when the viewer genuinely owns the active workspace (a non-staff viewer is RLS-scoped to their own tenants) AND the name is a real personal name — NOT the business-name fallback `useCommandCenter` emits when auth metadata has no display name (peer-gate MAJOR: "Good evening, Mogul" from firstToken("Mogul Maker Academy") is neutralised to "there"); a failing check's title is the true present state, never the achieved goal ("You can take payment" removed); the motion caveat states the source (recorded workspace activity) + freshness and that the underlying record isn't available to open from this summary view — the earlier "ask PAIGE for the detail" promise was REMOVED (Codex P2: PAIGE has no workspace-event reader, `get_solo_rail_activity` strips the refs, so the promise was unsupported, §13); every chip opens a real surface; the payment reason is declare-oriented, never "can't take payment" (§38). Tests lock each.
SOLO_UI: YES: Solo → Command Center → Business Game Plan (src/solo/SoloGamePlanWorkspace.tsx + src/solo/data/useSoloGamePlan.ts), the default landing of the canonical Solo shell.
SOLO_1536X770_PAIGE_CLOSED: PASS: render drive at 1536×770 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash, chips render as buttons.
SOLO_1536X770_PAIGE_OPEN: PASS: render drive at a 1126px content column (1536 minus the ~410px Paige rail) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash. (Component at the Paige-open content width; the authed shell's real dock is owed — see UNVERIFIED.)
SOLO_1366X768_PAIGE_CLOSED: PASS: render drive at 1366×768 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1366X768_PAIGE_OPEN: PASS: render drive at a 956px content column — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1024X768_PAIGE_CLOSED: PASS: render drive at 1024×768 — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_1024X768_PAIGE_OPEN: PASS: render drive at a 614px content column — single-column reflow — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_900X1000_PAIGE_CLOSED: PASS: render drive at 900×1000 — single-column reflow — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
SOLO_900X1000_PAIGE_OPEN: PASS: render drive at a 490px content column (the narrowest real Solo case) — all 8 states × both themes: bodyOX=0, gpOX=0, rendered, no crash.
UNVERIFIED: (1) AUTHENTICATED_RUNTIME browser drive of the deployed authed Solo surface with the real Paige dock — no browser/auth tool this headless session; the DATA claims are verified against prod, the pixel render is owed (§32.c). (2) A separate browser 400%/320px zoom pass. (3) The at-risk-clients AND follow-ups-due counts come from `practice_attention_queue` (unresolved past-due `paige_actions`) on a different data path than the Clients list, and the Clients route carries no at-risk / follow-up filter param — so each chip opens the Clients surface (a real supporting surface, satisfying the owner's item-2 "open a real supporting surface") but not a pre-filtered/itemised subset of the exact rows that drove the count (Codex P2). Itemising them would need a filter param on the Clients workspace or a dedicated action-queue reader — a separate surface, out of this scope. (4) The work-in-motion rows cannot open their individual underlying record — `get_solo_rail_activity` deliberately strips the per-row reference and changing that shared Rail RPC is out of scope; the caveat now states this honestly and no longer implies PAIGE can fetch the detail (Codex P2 fix).

## Scope and collisions

- Classification: Solo UI behaviour/identity/honesty correction on an already-shipped, owner-approved surface; no backend contract introduced or changed.
- Affected flows: one — the Solo owner reading and acting on the Business Game Plan.
- Neighboring regressions: none. The greeting fix lives in the Game Plan's own hook (`useSoloGamePlan`) and does NOT touch the shared `useCommandCenter` greeting — so the Systems Check surface's greeting is untouched (owner boundary: don't change Systems Check work). No change to Mission System, Rail, Mind, Systems Check, or Trust Compass source. Trust Compass remains OUT (3 real tabs: Business Game Plan → Systems Check → Mind; its slot reserved, no dead tab, §58).
- Active-owner/file collisions: only the three Game Plan files. `main` reset before edit; no cross-owner file touched.
- Explicit exclusions: no change to the Rail RPC (`get_solo_rail_activity`), the Systems Check runners/CHECK_DESTINATIONS, the Clients workspace, or `useCommandCenter`.

## User job and state map

Purpose unchanged: a Solo owner opens Command Center → Business Game Plan to learn where the business
stands and act on the next move. New behaviour: every summary claim (drafts waiting / clients at risk
/ follow-ups due / move blocked / read-outage indicators) is a real control that opens the surface
backing it; the greeting names the owner only on their own workspace; a blocked check states the true
condition, not the achieved goal. Intended scroll owner and geometry unchanged (verified 128/128).

## Evidence index

- Authenticated production data (Supabase project xygzykjyynhzqytbqnzu): tenants/profiles/auth.users for MMA + operator identities; paige_systems_check_run/_finding latest MMA run (2026-09-05 09:00, 10 checks, 7 pass, 3 fail); tenants.payment_processor_declared = null / payment_methods_declared = []; paige_pending_approvals (1 pending, email); paige_workspace_events (incl. zapier_mcp_test_succeeded 2026-09-05 14:08).
- Commands (repo root): `npm run build` (green); `npx vitest run` (233 files / 3456 passed); `npm run ci:tsc` (no new errors); ESLint + gold-discipline on changed src (exit 0); `node scripts/live-drive/game-plan-render-drive.mjs` (128/128).
- Tenant context in the harness: a labelled generic advisory business (§2-clean, §63). No secrets; no owner PII in committed artifacts.

## Review and limitations

Independent review: a §39 peer-gate (independent adversarial read — correctness / §57 identity / §36
drill / §13 honesty / §58) ran on the real diff and returned ONE MAJOR plus minors; all are resolved
in this diff:
- MAJOR (§57/§13): the greeting read `cc.greeting.name`, which `useCommandCenter` resolves to
  `authName || activeTenant.name || "there"` — so an owner with no auth display name would be voiced
  as their BUSINESS name ("Good evening, Mogul"). Resolved: the greeting now also requires the name to
  be a genuine personal name (≠ the workspace name, ≠ "there"), locked by a failing-first test.
- MINOR (§58): the original owner-gate keyed on `tenants.owner_user_id`, which is NULL on prod for
  every sub-account and 3/8 solo tenants (verified) — so real owners would be greeted "there". Resolved:
  the gate now uses the reliable membership signal (`!isPlatformStaff && activeTenantId`) — a non-staff
  viewer is RLS-scoped to their own tenants; a platform operator reaches other tenants only by act-as.
- MINOR: the harness stub carried `destination` on only one mode → dead buttons in three harness
  frames. Resolved: all attention chips in the stub's partial/blocked/owner modes now carry a real
  `destination`.
- MINOR: `checkStateTitle` split on a bare spaced hyphen as well as em/en dashes. Resolved: tightened
  to em/en dash only (the authored "STATE — next step" separator) so a state clause with " - " isn't
  truncated.
Limitations: every UNVERIFIED item above, chiefly the authenticated browser render of the deployed
surface (owed to a browser-capable session, §32.c) and the coarse at-risk-clients drill. KNOWN,
HONEST greeting-gate limitation (§13): an agency PARENT who switches into a sub-account's Solo shell is
also non-staff, so they would be greeted by their own name over the child workspace. A sub-account
carries no `owner_user_id`, so distinguishing that case robustly needs a per-workspace owner seam
(`get_user_primary_tenant`) not read here — documented, not silently assumed away. Not the reported
bug (operator/super-admin over a tenant), which IS fixed.
