# UI delivery evidence: chat-confirm-gate-terminal

The Main Paige chat consequential-action confirm gate (`paige-ai-chat`). Covers the P0 repair
(batch disambiguation / honest terminal / bug-report honesty, shipped in #1185 as `ff5fc9ed`)
and its fix-forward: a lookup FAILURE during an approval now routes to the honest terminal
instead of falling through to a fresh proposal (Codex P1, 2026-09-13). Backend edge-function
change that alters an owner-visible flow → declared `Visible-Flow-Impact: yes`.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Flow-by-Flow + orchestration references read; pre-edit packet delivered — mode Bug/Repair (fix-forward), depth Standard, affected flow = operator consequential-action approval in Main Paige chat, fresh main `1c182156`, single-region edit in the FIX A approved-set lookup, states + regression map below, gates applied — recorded in the PR description and session transcript.
PAIGE_UI_DESIGN: PASS: read `.agents/skills/paige-ui-design/SKILL.md` (router + material-flow test). This is a §00 backend honest-state change: the terminal COPY ("Action execution is temporarily unavailable; nothing changed or sent.") is the owner-specified FIX B string, rendered by the EXISTING chat tool-result surface; no Claude Design pack surface, token, or visual direction is invented or changed.
MATERIAL_FLOW_CHANGE: YES: the consequence changes — on an approved-set lookup failure mid-approval the operator now sees ONE honest terminal and nothing is recorded, where the pre-fix path fell through to `recordConfirmation` and minted a drifted proposal (the re-ask loop the P0 exists to stop).
FLOW_PROTOTYPE: PASS: the honest-terminal interaction shape is the already-shipped FIX B terminal (#1185, `ff5fc9ed`) — this fix-forward routes one additional internal error path INTO that existing tool-result state and adds no new interaction shape to prototype (§69 precedent reduces prototype scope); §00 reserves interaction design to Claude Design, and §4/§69 lift Gate-1 prototype approval pre-launch (the owner reviews on the live site).
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: an operator (any tenant/operator tier) approves a consequential action in Main Paige chat; primary action = approve; when the approval cannot be safely pinned — a genuinely ambiguous batch, or a lookup failure mid-approval — the gate returns one honest "nothing changed or sent" + correlation id and the operator can retry one at a time.
VISUAL_DIRECTION: PASS: §00 — no visual change; the terminal is a backend tool-result string rendered by the existing chat; no pack, tokens, or motion touched.
AUTOMATED_EVIDENCE: PASS: `npx vitest run src/__tests__/confirm-fingerprint.test.ts src/__tests__/confirm-gate-containment-wiring.test.ts` = 26/26 (13 fingerprint + 13 wiring), including the new assertion that a lookup failure during an approval sets the ambiguous terminal (`else if (lookupError) approvedSetAmbiguous = true;` + the thrown-path catch) rather than falling through to `recordConfirmation`.
STATIC_EVIDENCE: PASS: the exact-head CI dispatch runs the Deno edge ratchet over the affected set (`paige-ai-chat` + `_shared/confirm-fingerprint.ts`) and the tsc ratchet; the pre-existing `verify` debt (tsc baseline, chat-tool-registry, Solo-frontend tests, full-tree lint guards) is unrelated and reproduces identically on `main`. The change is a single-region edit inside the FIX A block.
RENDERED_EVIDENCE: UNVERIFIED: this headless remote session has no browser tool, so the surface was not rendered here; the live render is owed to a browser-capable session.
BEHAVIORAL_EVIDENCE: UNVERIFIED: the Deno + Supabase edge handler is not unit-runnable headless; the lookup-failure → terminal path is proven at the source-wiring level (and the entry guard `approvedConfirmations.size > 0` means the block only runs mid-approval), but the live behavioral drive is owed to a browser-capable / prod-log session.
AUTHENTICATED_RUNTIME: UNVERIFIED: no test tenant, no prod MCP, and no browser-drive this session — the authenticated three-outcome battery (benign dismissal completes/honestly refuses; a batch resolves only the approved actions OR returns one honest terminal without looping; an un-fileable bug-report says nothing was filed) and the lookup-failure terminal drive are §32.c PROOF OWED.
KEYBOARD_FOCUS: NOT_APPLICABLE: no visual surface or chrome change — the gate returns a tool-result string rendered by the existing chat; no new focusable controls.
ZOOM_REFLOW: NOT_APPLICABLE: no visual surface change; no layout introduced.
REDUCED_MOTION: NOT_APPLICABLE: no motion or animation added or changed.
STATE_COVERAGE: PASS: the gate states are covered in code + wiring assertions — exactly-one-in-approved-set (runs STORED args), ambiguous batch (honest terminal), lookup failure mid-approval (honest terminal — the new path), first proposal (own card, unaffected even if the lookup errors because the block's `size > 0` guard excludes it), high-risk never model-asserted (card-only), and the tenant/thread/scoped-client/predate predicates on the lookup.
TRUTHFUL_STATE_LABELS: PASS: the terminal states "nothing changed or sent" with a correlation id and records NOTHING (no fresh proposal, no execution); no fabricated success; `improvement_propose` returns an honest "nothing was filed" for a tenant-less/role-refused caller.
SOLO_UI: NO: this is the platform-wide Main Paige chat confirm gate (all tiers), not a Solo canonical visual surface; no Solo-specific chrome is added or changed, so the eight Solo-viewport captures do not apply.
UNVERIFIED: the authenticated deployed-surface battery (the three outcomes above) and the live behavioral drive of the lookup-failure terminal are owed to a browser-capable / prod-log session (§32.c); everything else (logic wiring, the batch/terminal/honesty seams, the edge ratchet) is proven.

OWNER_INTENT: The owner's P0 — a consequential Chat action must never loop asking for confirmation and never fake success; an un-completable action must say plainly "nothing changed or sent." This fix-forward extends that to the one path that still violated it: an approved-set lookup failure mid-approval.
MUST_NOT_HAPPEN: Must not mint a drifted proposal on a lookup failure (the loop); must not execute on an unverifiable approval; must not fabricate a success; must not change the first-proposal card behavior (a fresh `confirm:false` proposal still gets its own card even if the lookup errors — the `size > 0` guard excludes it); must not touch task↔thread (#1177) or Calendar.
MUST_PRESERVE: FIX A batch disambiguation by the stable subject id within the approved set (stored args execute); FIX B's single honest terminal; FIX C's honest "nothing was filed"; every confirm-gate isolation predicate (user/tenant/thread/scoped_client/predate/unexpired/unconsumed); high-risk never model-asserted.
ACCEPTANCE_CRITERIA: On the live chat, approving a batch where the approved-set lookup errors (or its jsonb path filter is rejected) returns ONE honest "nothing changed or sent" + correlation id — never a re-ask loop and never an execution; a first proposal still gets its confirmation card; a genuinely ambiguous batch still ends in the terminal. (Authenticated confirmation is PROOF OWED per above.)
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Tested — `confirm-fingerprint` (13/13) and `confirm-gate-containment-wiring` (13/13) stay green, including the unchanged FIX A/B/C assertions. §37 producer inventory: the only site changed is the FIX A approved-set lookup's error/throw handling (a new `else if (lookupError)` branch + the catch); no other confirm-gate caller, Channel 1/2, `claimConfirmation`, `recordConfirmation`, `describeConfirm`, or downstream executor is touched. Named unaffected — the #1186 social tools, the #1177 task↔thread link, and the high-risk card-only path are all outside this edit.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 1c8e4752873f1c45a3a1bd01d733d8fdb1ca8799; deployment=pre-merge-branch-build (fix-forward for #1185, on main 1c182156); environment=local; migrations=NOT_APPLICABLE; edge=PROOF_OWED(deploy-edge-functions deploys paige-ai-chat + _shared/confirm-fingerprint.ts on merge to main); evidence=docs/evidence/ui-delivery/chat-confirm-gate-terminal.md
RELEASE_CHANNEL: development: pre-merge branch build verified in CI/local; on merge to main it ships to production via `deploy-edge-functions`, per §4 pre-launch.
RELEASE_CLASSIFICATION: patch: reliability hardening of the existing confirm gate — no new surface, no migration, no new provider spend.
CUSTOMER_RELEASE_IDENTITY: none: internal build, pre-launch; no customer version or name assigned.
RELEASE_NOTE_REQUIRED: NO: internal-only pre-launch delivery; no customer-facing release.
RELEASE_TRUTH_BOUNDARY: PARTIAL: the lookup-failure terminal is LIVE on the edge deploy at merge and proven at the logic/wiring level (+ §39/Codex review); the authenticated three-outcome battery and the live terminal drive are PROOF OWED.
RELEASE_RECOVERY: position=forward-fix or clean revert; reference=additive (one `else if` branch + a catch assignment in the confirm gate, one test assertion, this evidence) — reverting the code commit removes it with no data migration or backfill, and the terminal only fires on an un-pinnable approval.

## Scope and collisions

- Classification: bug/repair fix-forward of the live Chat confirm gate (R2 — governed consequential-action path).
- Affected flows: operator consequential-action approval (the lookup-failure sub-path).
- Neighboring regressions: the confirm-fingerprint + confirm-gate wiring suites (26/26) stay green; FIX A/B/C seams unchanged.
- Active-owner/file collisions: `paige-ai-chat/index.ts` is also touched by #1177 (task↔thread) in a DIFFERENT region (the `crm_create_task` dispatch, not the confirm gate); the two are disjoint and #1177 re-syncs cleanly.
- Explicit exclusions: no change to Channel 1/2, claim/record, the high-risk card path, the social tools, or task↔thread; no new copy beyond the owner-specified FIX B terminal.

## User job and state map

Purpose: keep the operator's consequential-action approval honest and loop-free even when the server lookup that disambiguates the approved set fails. Primary action: approve (the card or a typed yes). States: claimed-exactly-one (executes the stored approved call), ambiguous batch (honest terminal), lookup failure mid-approval (honest terminal — the new path), first proposal (own card), high-risk self-approval refused. Exit: the terminal tool-result tells the operator in one line that nothing changed or sent and to approve one at a time; nothing is recorded. Side effect: none on the failure path (no proposal minted, no execution). Scroll owner: the existing chat transcript (unchanged).

## Evidence index

- `npx vitest run src/__tests__/confirm-fingerprint.test.ts src/__tests__/confirm-gate-containment-wiring.test.ts` → Test Files 2 passed, Tests 26 passed (1 new: the lookup-failure terminal assertion).
- Code: `supabase/functions/paige-ai-chat/index.ts` (the FIX A approved-set lookup error/throw handling, ~L8486–8491).
- Exact-head CI: dispatched on the branch (`workflow_dispatch`), Deno edge ratchet over `paige-ai-chat` + `_shared/confirm-fingerprint.ts`.
- Review: this fix-forward addresses Codex P1 `#1185 discussion_r3998706098` (lookup errors terminal) and P1 `r3998706101` (this evidence record + the `Visible-Flow-Impact: yes` trailer).

## Review and limitations

Codex (independent §39-class reviewer) raised two P1s on merged #1185 that my own §39 pass missed — the layered-defense point (§39/§5/Codex, none alone sufficient). (1) The approved-set lookup's returned-error AND thrown-error paths left `approvedSetAmbiguous` false, so with a non-empty approved set execution fell through to `recordConfirmation` and recreated the loop; verified real against the code and fixed (both paths now set the terminal; the block's `size > 0` entry guard means the fix never affects a first proposal). (2) This change altered an owner-visible flow without the `Visible-Flow-Impact: yes` trailer or a ui-delivery record; this file + the trailer close it. §32.c limitations: RENDERED / BEHAVIORAL / AUTHENTICATED_RUNTIME are UNVERIFIED and owed to a browser-capable / prod-log session (no browser tool, no test tenant, no prod MCP this session).
