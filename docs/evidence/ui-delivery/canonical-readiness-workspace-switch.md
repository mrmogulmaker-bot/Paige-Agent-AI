# UI delivery evidence: canonical-readiness-workspace-switch

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Deep/R3 (permissions, persistence, cross-tenant data). Affected actor-goal flow — a Solo operator on Clients → Conversations reads whether this business can text, across an account switch. Frame stated before the first edit: base origin/main 3d0b4a38, head claude/canonical-readiness-provenance; file ownership checked against every open PR (#921, #674, #917, #724 collide on other files, none on these two); changed-file boundary held to the two UI files listed below plus one migration, three edge-shared files and two test files; failing-first plan = the prod rollback proof reproduced the contradiction (3 rows) before the fix and measured 0 after, and pgTAP asserts the same over both readers. Full packet: PR #958 body and docs/delivery/canonical-readiness-contract.md.
PAIGE_UI_DESIGN: PASS: Read completely this session, in the routed order — .claude/skills/paige-ui-design/SKILL.md (wrapper), .agents/skills/paige-ui-design/SKILL.md, UPSTREAM.md (pin da1f686c, frontend-design 2.0), vendor/frontend-design/SKILL.md, vendor/frontend-design/references/accessibility-checklist.md, references/paige-quality-gates.md, references/review-and-testing.md. Design mode is not being selected here: no visual direction is authored or changed (§00 — visual direction is Claude Design's, and this change ports none).
MATERIAL_FLOW_CHANGE: NO: no goal, choice, step, transition, exit, recovery path or side effect changes. The intended state set is unchanged — the surface stops VIOLATING the flow contract it already had. During an account switch it was painting workspace A's readiness under workspace B's heading; it now shows nothing until B's own answer arrives, which is the state the contract already specified and which the sibling surface (src/solo/settings.tsx useCommsReadiness) has always implemented. The stricter counter-reading is recorded under "Review and limitations" rather than omitted.
FLOW_PROTOTYPE: NOT_REQUIRED: a correctness fix to WHICH workspace's data is rendered; no action, state, exit or consequence within a workspace is added, removed or altered, and no visible element, token, copy string or interaction is touched. Not claimed because a prototype was inconvenient — the diff is one unconditional state clear, one equality guard, and one optional type field.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Purpose — a Solo operator reading the SMS channel disclosure must never be shown another business's texting readiness. Audience — the Solo operator/admin on /admin/clients-hub/conversations. Primary action — read the disclosure and act on what is actually true of the account now on screen. Recorded in the code comment at src/pages/admin/ClientsConversations.tsx and in docs/delivery/canonical-readiness-contract.md §9.
VISUAL_DIRECTION: NOT_APPLICABLE: no visual direction is authored, changed or ported. Zero markup, token, class, style, copy or layout changes in the diff — verified by `git diff origin/main...HEAD -- src/` containing no JSX, CSS or string-literal changes to rendered text.
AUTOMATED_EVIDENCE: PASS: `npx vitest run` — 3403 passing, 0 failing, plus the 8 suites that need @twilio/twilio-compliance-embed installed locally (130 tests) which all pass once installed and fail identically on a clean tree without it. New assertions: src/pages/admin/conversations/solo/ClientsConversations.solo-contract.test.ts "clears comms readiness before the next account paints, and never renders another account's answer" asserts the clear precedes the guard by index and that the tenant bind exists; src/__tests__/paige-spine-business-context-readiness.test.ts adds 3 cases (legacy state renders both halves, next step present/absent, pre-contract rows render without throwing). Server side: supabase/tests/business_context_readiness.sql raised to plan(46), including the both-readers regression pair. Negative control: the earlier plan(45) run went red on CI at assertion 34 because that assertion was vacuous (bool_and over an empty set), which is why the count form replaced it.
STATIC_EVIDENCE: PASS: `npx tsc --noEmit -p tsconfig.json` clean; `npm run build` green (built in 51.13s); lint gates green — lint:views, lint:definer-fns, lint:readiness-copy, lint:migration-versions, lint:managed-schema, lint:pg-tokens, lint:shadow-vars, lint:conversation-tenant, lint:tier-features, and node scripts/ci/paige-spine-registry-lint.mjs (PASS, 17 capabilities). Contract inspection: the payload key this surface reads (tenant_comms_readiness.business) is byte-identical before and after, asserted per tenant across all 14 production tenants inside a BEGIN..ROLLBACK proof.
RENDERED_EVIDENCE: UNVERIFIED: this session holds no browser-driving tool and LIVE_DRIVE_EMAIL/LIVE_DRIVE_PASSWORD are unset, so no screenshot or recording at any viewport or theme was captured. Owed to the next capable session per §32.c. Scope of the claim left unproven: the appearance of the channel disclosure — which the diff does not change.
BEHAVIORAL_EVIDENCE: UNVERIFIED: the account-switch interaction itself (switch A→B, observe the disclosure) was not driven in a real browser, for the reason above. What IS proven at a lower evidence class: the state machine is asserted at source level by the contract test, and the identical pattern is already shipped and exercised on src/solo/settings.tsx.
AUTHENTICATED_RUNTIME: UNVERIFIED: no authenticated route was exercised from this session — no browser tool, no test-tenant credentials (docs/delivery/solo-test-tenant-spec.md is the standing owner task that would close this). Affected claims: that a real operator switching accounts sees the disclosure clear. Server-side authenticated proof that DID run: tenant_comms_readiness executed under a real production owner's verified JWT inside a rollback transaction, returning the correct tenant_id binding and business_provenance.
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive control, focus target, tab order, roving index or overlay is added, removed or reordered. The diff changes a useState value and a type field; no element is rendered or unrendered as a result within a single workspace.
ZOOM_REFLOW: NOT_APPLICABLE: no layout, sizing, container, overflow rule or scroll owner is touched. No CSS file is in the diff.
REDUCED_MOTION: NOT_APPLICABLE: no animation, transition or motion-bearing component is added or changed; nothing in the diff reads or should read prefers-reduced-motion.
STATE_COVERAGE: PASS: States mapped for the affected flow and where each is covered — first use / no account resolved (early return leaves readiness null; the disclosure reads "Not reported"); loading (readiness null between the clear and the RPC returning — this is the state the fix restores during a switch); populated (payload whose tenant_id matches the active account); read failure (error → null, never inferred from connector presence — pre-existing and unchanged); wrong workspace (payload naming another account is discarded — NEW, the defect being fixed); workspace switch (clear precedes every early return, so no stale value survives the transition). Not applicable and why: no validation, confirmation, destructive or cancellation state exists on a read-only disclosure. The RENDERED and BEHAVIORAL proof of these states is UNVERIFIED above; the state machine itself is asserted by the contract test.
TRUTHFUL_STATE_LABELS: PASS: This change is itself a truthful-labelling fix on the server contract behind this surface. tenant_comms_readiness previously collapsed three distinct cases into one boolean — a value confirmed in Setup, a value inherited from the legacy brand record, and a FAILED read — all rendering as has_website: false or true with no way to tell them apart. The payload now carries business_provenance with state/source/as_of/next_action per fact, derived from the one canonical resolver. The capability labels used in the record are exactly the four defined in references/paige-quality-gates.md; nothing here is labelled LIVE.
SOLO_UI: YES: src/pages/admin/conversations/solo/soloConversationModel.ts is a recognized Solo path, and the Solo channel disclosure on Clients → Conversations is the consuming surface.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no browser-driving tool and no test-tenant credentials in this session; no geometry was measured at any viewport. Owed to the next capable session (§32.c).
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: same reason.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: same reason.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: same reason.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: same reason.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: same reason.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: same reason.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: same reason.
UNVERIFIED: Two things remain unproven, both at the same evidence class and for the same reason. (1) The account-switch interaction driven in a real browser on the deployed surface — switch from one Solo account to another and observe that the channel disclosure clears rather than carrying the previous account's answer. (2) Every Solo viewport/PAIGE-state record above. Reason: this session holds no browser-driving tool and LIVE_DRIVE_EMAIL/LIVE_DRIVE_PASSWORD are unset, so no authenticated route can be exercised. The layout matrix is additionally not expected to move, because the diff contains no markup, style or geometry change — but "not expected to move" is a prediction, not a measurement, and it is recorded as UNVERIFIED rather than as a pass. Proof boundary that IS complete: the server contract behind the surface, exercised under a real production owner's JWT inside a rollback transaction, plus source-level and automated assertions on the client state machine.

## Scope and collisions

- Classification: Deep / R3 — permissions, persistence, and cross-tenant data. Two UI files touched inside a change whose centre of gravity is a database migration.
- Affected flows: Solo operator reads the SMS channel disclosure on Clients → Conversations (`/admin/clients-hub/conversations`), including across an account switch. Adjacent, unchanged: Solo Settings → Connections, which reads the same resolver and already implemented both behaviours.
- Neighboring regressions: the `tenant_comms_readiness` payload gained a key (`business_provenance`) and its `business` booleans were re-derived from the canonical resolver. Every consumer suite was run — `settings.connections-states`, `settings.connections-actions`, `settings.numbers`, `settings.registration`, `settings.registration-business`, `settings.readiness-boundary`, `settings.rendered-copy`, `soloConversationModel`, `soloConversationReadiness` — all pass. The booleans were additionally asserted byte-identical per tenant across all 14 production tenants.
- Active-owner/file collisions: none on these two files. #917 edits `paige-spine/registry.ts`, `settings.tsx` and `paige-ai-chat/index.ts`; #674 and #724 edit `settings.tsx`; #921 edits systems-check runners. `src/solo/settings.tsx` was deliberately NOT touched, which keeps this change clear of all three.
- Explicit exclusions: no visual, layout, token, copy or interaction change; `src/solo/settings.tsx` untouched; A2P surfaces untouched.

## User job and state map

**Purpose** — a Solo operator reading the SMS channel disclosure must be told the truth about the account now on screen, and nothing about any other account.

**Audience** — the Solo operator or admin on Clients → Conversations.

**Primary action** — read the disclosure and act on what is true of this business: whether it can text, from which number, and what is still outstanding.

**Visual direction** — none authored or changed (§00).

**States and exits** — first use / unresolved account · loading during a switch · populated for the active account · read failure ("Not reported", never inferred from connector presence) · payload naming another workspace (discarded) · account switch (state cleared before the next account paints). No validation, confirmation, destructive or cancellation state exists on a read-only disclosure.

**Side effects** — none. The surface performs one read; it writes nothing.

**Intended scroll owner** — unchanged; no scroll container is touched.

## Evidence index

| Class | Artifact / command | Result |
|---|---|---|
| Automated | `npx vitest run` | 3403 passed, 0 failed |
| Automated | `npx vitest run` on the 8 suites needing the local dep | 130 passed |
| Automated | `supabase/tests/business_context_readiness.sql` (pgTAP, plan(46)) | runs in CI job `database-contract` |
| Automated | prior CI run at plan(45), commit b3447d29 | 44 passed, 1 failed — assertion 34 was vacuous; fixed, not loosened |
| Static | `npx tsc --noEmit -p tsconfig.json` | clean |
| Static | `npm run build` | green, 51.13s |
| Static | 9 repo lint gates + `paige-spine-registry-lint.mjs` | all green |
| Authenticated runtime (server) | `BEGIN … ROLLBACK` on project `xygzykjyynhzqytbqnzu`, executed under production owner `a4b6cb56` (tenant `7eaf8859`) via `request.jwt.claims` | 12 assertions, all passing; contradiction 3 → 0 |
| Authenticated runtime (server) | second rollback proof, resolver only, verifying the two counts pgTAP now asserts | 4 and 2 measured; pre-fix control 0 |
| Rendered / Behavioral / Solo matrix | — | UNVERIFIED, see above |

Timestamp: 2026-09-05. No secrets or customer-sensitive data appear in this record; production tenants are referenced by UUID prefix only, and no credential value was read, logged or stored.

## Review and limitations

**Independent review.** A §39 peer-gate pass is running against the real pushed diff with a mandate covering the producer/consumer inventory for both changed contracts, the PL/pgSQL shadowing class, migration replayability, the security claim on the new resolver, and §58 silent-removal. Its findings are not yet in hand; nothing in this record depends on them, and any finding will be handled before merge.

**The judgement call in MATERIAL_FLOW_CHANGE, stated rather than laundered.** A stricter reading of the skill's material-flow test would say that a transient state the user could encounter — workspace A's readiness visible under workspace B's heading — is being removed, and that removing an encounterable state is a material change requiring a Flow Prototype. I did not classify it that way, for two reasons: the state being removed was never part of the intended flow (it was a defect), and the resulting behaviour is the one the sibling surface reading the same resolver already ships. A reviewer who disagrees should treat FLOW_PROTOTYPE as owed rather than NOT_REQUIRED; the code change would not differ either way.

**Limitations.** Everything marked UNVERIFIED above, unchanged: no browser drive, no Solo viewport matrix, no authenticated UI route. The standing fix is the least-privilege test tenant specified in `docs/delivery/solo-test-tenant-spec.md`, which this change adds two rows to.
