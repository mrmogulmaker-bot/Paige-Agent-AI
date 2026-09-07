# UI delivery evidence: Text-chat Skills and Intentful Interview MVP

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: grounded on current main 15da5afe; affected paths cover Setup -> Paige Brief, Business Game Plan -> selected Strategic Play -> Paige, the dedicated Paige transcript, canonical Setup save/readback, Action Bus Discussion Needed, Rail, and account-change fences
PAIGE_UI_DESIGN: PASS: repository Paige UI design and reference instructions were applied; the working session uses the existing Paige tokens, transcript scroll owner, action hierarchy, and truthful status language
MATERIAL_FLOW_CHANGE: YES: adds three contextual entries into the one dedicated Paige workspace plus optional interview lifecycle and selective canonical confirmation
FLOW_PROTOTYPE: PASS: owner-approved placement in this workstream requires no standalone Skills, Interview, Voice, or navigation destination; the real-component render harness preserves that contract
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a verified Solo owner may voluntarily clarify business context, plan against a selected Strategic Play, or resolve one named missing decision
VISUAL_DIRECTION: PASS: existing Solo/Paige token layers and owning-surface card patterns; no new visual system or customer recipe catalogue
AUTOMATED_EVIDENCE: PASS: pre-repair full Vitest suite 269 files / 3,880 tests; post-hotfix combined anchored-scroll, interview, scope, workspace, Discussion Needed, Paige chat, Business Mission, Campaign Brief, Setup, and navigation suite 163/163 green; GitHub full-suite conclusion is recorded on the final draft head
STATIC_EVIDENCE: PASS: type ratchet has no new errors; changed client modules pass ESLint; migration-version, binding-ledger, chat-tool-registry, governed-execution, and regression checks pass; production build passes
RENDERED_EVIDENCE: PASS: 24 visibly labelled real-component harness frames at 1536x770, 1366x768, 1024x768, and 900x1000 in light/dark for offer, selective recap, and Discussion Needed; existing Setup renderer passes 114 samples with no horizontal failures or runtime errors
BEHAVIORAL_EVIDENCE: PASS: browser drove start, answer, continue, pause, resume, end, independent fact selection, verified receipt, Talk now, Later, Don't ask again, and selected-play Plan with Paige callback
AUTHENTICATED_RUNTIME: UNVERIFIED: no owner credentials or deployed review migration were used; durable tenant write/readback, denied role, workspace switch, cross-tenant refusal, and live Rail row remain PROOF OWED
KEYBOARD_FOCUS: PASS: Tab order reaches all four focused paths, Skip, Start interview, Paige composer, and Send, then cycles without a trap
ZOOM_REFLOW: PASS: at 200% and 900x1000 there is no document horizontal overflow; the Paige transcript remains the internal scroll owner
REDUCED_MOTION: PASS: reduced-motion media is honored and component transition duration resolves to 0.01ms
STATE_COVERAGE: PASS: offer, skipped, active question, paused/resume, ended, recap with none/one/multiple selections, completed receipt, read failure, Discussion Needed available/unavailable, Talk now, Later, and topic dismissal
TRUTHFUL_STATE_LABELS: PASS: the UI and evidence distinguish the locally verified PARTIAL subset, explicit unavailable decision reads, disabled automatic Mind/Memory projection, and excluded production claims
SOLO_UI: YES: Settings -> Setup / Paige Brief, Command Center -> Business Game Plan, and Paige -> Chat
UNVERIFIED: new migration replay and authenticated preview behavior, including real owner permission, denied role, account switch, cross-tenant access, canonical Setup readback, Action Bus rows, and matching Rail evidence

INTERNAL_BUILD_IDENTITY: 54c0530ca5fda9ad674d1510e4adf157864954df; deployment=NOT_APPLICABLE; environment=development; migrations=PROOF_OWED(local replay unavailable and no remote migration authorized); edge=PROOF_OWED(paige-ai-chat change is not deployed and no edge deployment authorized); evidence=docs/evidence/ui-delivery/text-chat-skills-intentful-interview-mvp.md and PR 1044 checks
SUPPORTING_EVIDENCE_HEAD: 303f9d3ea92d40c8340b0ac5ed212f9bf0472e5e; role=render artifacts, check record, and review-resolution evidence; subsequent commits may update metadata pointers only
RELEASE_CHANNEL: development: draft PR 1044 and local rendered evidence only; no preview or production release claim
RELEASE_CLASSIFICATION: minor-candidate: meaningful owner-visible text-chat working-session capability pending final owner release decision
CUSTOMER_RELEASE_IDENTITY: 0.1.0 — Governed Workspace Foundations; owner-decision=PENDING
RELEASE_NOTE_REQUIRED: YES: a minor owner-visible capability requires a customer note if the owner later approves and the release gate is earned
RELEASE_TRUTH_BOUNDARY: PROOF OWED: implementation and local UI behavior are proven, but migration, edge deployment, authenticated tenant canonical write/readback, and production Rail evidence are not complete
RELEASE_RECOVERY: position=revert the exact MVP commits before any authorized deployment or forward-fix in the same bounded paths; reference=PR 1044 commit history and this evidence record

SOLO_1536X770_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/text-chat-intentful-interview-mvp-artifacts/1536-770-light-discussion-discussion.png and dark counterpart; no document overflow
SOLO_1536X770_PAIGE_OPEN: PASS: offer and recap light/dark frames in docs/evidence/ui-delivery/text-chat-intentful-interview-mvp-artifacts/; all controls reachable in the Paige transcript
SOLO_1366X768_PAIGE_CLOSED: PASS: Discussion Needed plus selected-play handoff frame; owning surface remains readable
SOLO_1366X768_PAIGE_OPEN: PASS: offer and recap light/dark frames; no clipping or document overflow
SOLO_1024X768_PAIGE_CLOSED: PASS: Discussion Needed light/dark frames; card stays inline and action row remains reachable
SOLO_1024X768_PAIGE_OPEN: PASS: offer and recap light/dark frames; transcript owns vertical overflow
SOLO_900X1000_PAIGE_CLOSED: PASS: Discussion Needed light/dark frames; no horizontal overflow
SOLO_900X1000_PAIGE_OPEN: PASS: offer and recap light/dark frames; controls, selective facts, and composer remain reachable

## Scope and collisions

- Classification: owner-complete text-chat vertical; PARTIAL until authenticated proof.
- Affected flows: optional first-use/Paige Brief interview; selected Strategic Play planning handoff; inline Discussion Needed handoff.
- Neighboring regressions: full Setup render, canonical Solo routing registry, no-floating-chat contract, existing Business Game Plan drawer, and production build.
- Active-owner/file collisions: scroll-stability PR #1050 landed first at 15da5afe and the shared Paige chat seam was reconciled; no active collision remains. The separate Live Voice worktree owns modality controls and has no overlapping product-component edits in this change.
- Explicit exclusions: Live Voice UI/session behavior, provider setup, standalone Skills/Interview/Voice destinations, seeded recipe runner, new navigation, automatic Mind/Memory projection, merge, and deployment.

## User job and state map

The owner stays on the relevant Setup or Business Game Plan surface until choosing a contextual Paige handoff. The one Paige workspace then holds the working session inside its transcript. Interview answers remain bounded proposals. Pause preserves the session; End and Skip exit without canonical writes. Recap begins with every fact unchecked. Only selected proposal IDs reach the server, which re-reads their stored values, calls the existing Setup owner, verifies the canonical result, records Rail evidence, and returns a plain-language receipt. Discussion Needed is filed from canonical Mission missing information and supports Talk now, seven-day Later, and topic-specific Don't ask again.

The Paige transcript is the scroll owner while Paige is open. The owning page remains the scroll owner for the inline Discussion Needed card. No new route or navigation item exists.

## Evidence index

- Automated: `npx vitest run --maxWorkers=2` -> 269 files / 3,879 tests.
- Setup real-component matrix: `node scripts/live-drive/setup-business-context-render.mjs` -> 114 samples, zero horizontal failures, zero runtime errors.
- Text-flow real-component matrix: 24 frames under `docs/evidence/ui-delivery/text-chat-intentful-interview-mvp-artifacts/`; every frame reported content, no overlay, no document overflow, visible non-live label, and a reachable internal scroll owner.
- Browser behavior: agent-browser sessions exercised interview lifecycle, selective recap/receipt, all Discussion Needed choices, and selected Strategic Play Plan with Paige.
- Accessibility: exact-head axe WCAG 2 A/AA -> 0 violations and 0 incomplete across light offer, dark recap, and light Discussion Needed after semantic and contrast corrections.
- Static: affected ESLint green; CI type ratchet green; regression, migration version, ledger, chat-tool registry, and governed-execution checks green; Vite production build green.
- Database: local Supabase lint could not connect because no local Postgres stack was running. No remote database or provider was touched.

## Review and limitations

The exact-head accessibility rerun found insufficient contrast on the dark recap primary treatment and the light Discussion Needed label; the product tokens were corrected and the WCAG A/AA rerun returned zero violations.

Independent Codex review found owner authority broader than the product contract, resumable raw-answer retention risks, missing canonical revision and representative preservation, focused-plan history carry-over, and a null-thread resume gap. Exact-head review then found a non-atomic final-answer transition, inaccessible local-only render evidence, stale build identity, over-broad interview focus release, stale Discussion Needed responses, duplicate canonical-field selections, caller-controlled durable labels, and incomplete radio-group keyboard behavior. The repaired build makes the answer-to-recap transition atomic while retaining an explicit recovery path, commits all render frames, isolates interview-scope release, binds responses to the Mission revision, rejects duplicate canonical fields, derives durable labels server-side, and implements roving focus with Arrow/Home/End behavior. A subsequent canonical-schema review found that Discussion Needed referenced non-existent Mission relation and lifecycle names; the final implementation now reads the latest immutable `business_mission_brief_versions` row and `business_missions.lifecycle_state`, pinned by a negative schema contract test. Final authority review also found that Setup `owner_full` retained a display-only owner fallback after co-owner revocation; all interview and Discussion Needed gates now additionally require canonical active `is_tenant_owner(actor, tenant)` membership. The next review found stale Public Presence context at the Paige Brief handoff and an unlocked Mission revision check; the final implementation clears incompatible context before setting the interview scope and locks the Mission row through the response write. The repair uses `solo_setup_access_scope() = owner_full`, rejects likely sensitive or document-sized answers, scrubs proposed values on terminal states, reads the complete canonical Setup context and passes its revision, preserves representatives, treats every mission ask as focused context, and requires explicit resume whenever the interview thread is not selected. The existing Setup renderer caught and drove repair of a null interview-read shell crash. The card now validates the read contract and fails closed without taking down Setup or Paige. A separate ledger review caught and removed an over-broad mechanical status edit before commit; the final ledger diff is restricted to the three owned rows plus current-main grounding. The latest exact-head review found that selecting a recap thread could incorrectly invoke resume, null revision tokens could bypass inequality checks, and a caller-controlled fact ID could persist arbitrary payload material. The repaired implementation now selects active/recap threads without mutating workflow status, uses null-safe revision fences, and derives fact IDs server-side from the allowlisted focus path and field key; focused regressions cover all three cases. A final exact-head review found five owner-flow issues: the Mission drawer obscured Talk now, canonical success relied on the save return instead of a fresh read, cleared Mission history could rehydrate without focus, recap checkbox focus was not visible, and accepted question transitions did not move focus. All five are repaired and covered. The branch was then collision-gated behind scroll-stability PR #1050, rebased onto exact main 15da5afe34c4be2740e381232b40a991d5ed8cfc, and reconciled so the anchored transcript controller remains the sole scroll owner around transcriptLead while Mission ask/history isolation remains intact; the combined collision suite passes 163/163.

Harness records use explicit fictional values and are burned with `HARNESS RENDER · NOT LIVE`. They prove rendering, interactions, focus, reflow, and local state transitions only. They do not prove authenticated tenant isolation, durable writes, database migration success, canonical readback, or Rail persistence.
