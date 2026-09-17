# UI delivery evidence: solo-826-setup-gate — the canonical setup journey records its completion

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: the synced third-party Flow-by-Flow skill is absent from this environment (verified: repo-local skills are second-brain + paige-ui-design only; the bundle lives in Claude containers per docs/brain/decision-log.md 2026-09-01). The doctrine-hierarchy equivalent ran at authentication/routing-boundary depth — the full grounding record is docs/delivery/solo-826-setup-gate-cycle-grounding.md (flow, ownership, entry state, every redirect transition, collision surface, #811 adjacents, failing-first proof, regression plan; read BEFORE any edit).
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md read completely this session; NOT exercised because there is no visible-interface change — the fix touches a route guard's completion SIGNAL and a data hook's post-save refresh; the rendered surfaces are byte-identical. The skill was nonetheless read this session for the prior media workstream; nothing here exercises design authority (§00).
MATERIAL_FLOW_CHANGE: NO: no goal, state, transition, exit, or consequence changes for any user — a playbook-less tenant's journey already held on the shell Setup; the change lets that journey COMPLETE (the gate opens) instead of dead-ending. The proof that the existing journey is unchanged for every already-complete tenant is the journey suite itself.
FLOW_PROTOTYPE: NOT_REQUIRED: no material flow change (see MATERIAL_FLOW_CHANGE); the failing-first journey suite is the behavioral artifact.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = an eligible standalone Solo tenant that has not completed Setup; primary action = complete the in-shell Setup, after which the whole workspace opens (the gate that held them releases) — the exact #826 mission outcome.
VISUAL_DIRECTION: NOT_APPLICABLE: no visual change.
AUTOMATED_EVIDENCE: PASS: src/__tests__/setup-gate-journey.test.tsx walks the COMPLETE redirect journey (real guard order RequireCompleteSignup→RequireSoloBetaEntitlement→RequireSetupComplete over the real decideWorkspaceEntry) — proof 1 FAILED on main (failing-first: the canonical completion marker was ignored → re-trap) and passes with the fix; 10 journey proofs total. Adjacent: admin-route-retirement + workspaceEntry + ChooseAccount + SoloEntry + BusinessEntry = 98/98; setup contract family = 90/90; hook boundary = 20/20; eslint 0 errors on changed files.
STATIC_EVIDENCE: PASS: tsc-ratchet — no new errors from this PR's files (2 pre-existing main-drift errors in untouched files paige-capability-gateway.test.ts / Step1Welcome.tsx, verified by stash on the clean tree); CI database-contract PASS on the rebased head (the trigger replays cleanly; migration renumbered 20270126→20270323 after a second version collision, main took the slot).
RENDERED_EVIDENCE: NOT_APPLICABLE: no visual change; the journey harness renders the real guard components through a memory router (component-level rendered proof of every state).
BEHAVIORAL_EVIDENCE: PASS: the journey suite IS the behavioral proof (hold, completion, open, oscillation, back/forward, refail-safety); the guarded post-save context refresh is covered by the hook boundary suite (20/20 after the typeof guard).
AUTHENTICATED_RUNTIME: UNVERIFIED: no credentialed browser session exists in this environment; an authenticated live journey (a real playbook-less tenant completing in-shell Setup on the deployed build) is owed to a capable session — stated, not claimed.
KEYBOARD_FOCUS: NOT_APPLICABLE: no visual change.
ZOOM_REFLOW: NOT_APPLICABLE: no visual change.
REDUCED_MOTION: NOT_APPLICABLE: no visual change.
STATE_COVERAGE: PASS: gated-hold, held-surface-reachable (no loop), completion→open, playbook-complete→no-gate, staff no-op, loading fail-open, agency untouched, sub-account unchanged, repeated-evaluation stability, post-completion back/forward — all asserted.
TRUTHFUL_STATE_LABELS: PASS: the gate's header now names all three completion writers truthfully (two retired-marketplace markers + the canonical journey's marker); no capability overclaim anywhere.
SOLO_UI: YES: the setup gate governs the canonical Solo shell's surfaces (no visual change; the affected canonical surface is /solo/{n}/settings/setup + the gated workspace routes).
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: no visual change to capture — the rendered surfaces are byte-identical; owed with the authenticated session only if the owner wants captures of the unchanged pixels.
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: same reason.
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: same reason.
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: same reason.
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: same reason.
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: same reason.
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: same reason.
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: same reason.
UNVERIFIED: authenticated live journey (credentialed session owed); the trigger's prod persisted-apply rides the merge pipeline's §32 verify (database-contract PASS on the replayed schema is the pre-merge proof).

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 088b5337ad82a457f5ed8253641480da31303442; deployment=none-PR-head-only; environment=development; migrations=PROOF_OWED(20270324000000_solo_setup_completion_marker merge pending the pipeline PERSISTED-verify); edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/solo-826-setup-gate.md and PR 1269 checks
RELEASE_CHANNEL: development: PR head only — merge/deploy follow the owner's reconciliation instruction for this parity train
RELEASE_CLASSIFICATION: internal-only: a latent trap repair; no customer-visible release moment
CUSTOMER_RELEASE_IDENTITY: none: no approved release record and no coherent owner-visible outcome beyond the repair itself
RELEASE_NOTE_REQUIRED: NO: internal trap repair; nothing a customer was able to hit (latent, zero affected tenants measured)
RELEASE_TRUTH_BOUNDARY: PARTIAL: code + tests complete and CI-green; deployed state and authenticated live journey owed; UNAVAILABLE for nothing — the trap itself was latent
RELEASE_RECOVERY: position=git revert of the merge (additive trigger + two-line signal + guarded refresh) and the migration pipeline advances db-live on the revert commit; reference=docs/evidence/ui-delivery/solo-826-setup-gate.md and PR 1269 checks

## Scope and collisions

- Classification: this PR = #826 only. The working tree carries ANOTHER workstream's uncommitted operator/command-center edits (foreign files, untouched by this PR, left in place for their owner); my one stray file from the stopped Vibe-reliability workstream was removed pre-commit.
- Collision check performed twice: migration version collided twice with concurrent main traffic (20270122 taken by social_foundation; 20270126 taken during the build) — renumbered to 20270323000000 and rebased onto the taking commit each time.
- Explicit exclusions: no solo_shell_enabled change; no #790 rollout; no production data writes; no Setup redesign; no Agency/sub-account behavior change; no second chooser; no #811 reopening; no provisioning; no tenant-specific branches; no merge/deploy.

## Evidence index

vitest commands and counts in AUTOMATED_EVIDENCE; CI run links on PR #1269 (database-contract PASS at run 35274259845; validator green with this record). Production measurements (read-only SQL): 10 standalone tenants / 7 with playbook / 3 exposed / 0 canary-no-playbook overlap — the trap is latent today and #790 is the activator.
