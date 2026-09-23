# UI delivery evidence: INT-140 CRM create-contact governance repair

This record is routed by a `Visible-Flow-Impact: yes` commit trailer because a shared
tool contract and Edge action door change the outcome of the existing Solo PAIGE Chat
flow. No interface source, layout, copy, control, state, action, transition, or exit
changes. Authenticated post-deploy execution remains proof owed because this repair
must not write production customer data before release.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: the affected-flow packet traces authenticated Solo operator -> canonical PAIGE Chat -> crm_create_contact tool definition -> crm-command JWT action door -> server-resolved tenant, role and autonomy lane -> confirm or standing-authority execution -> canonical readback -> durable capability receipt/Rail locator; flow-by-flow/SKILL.md and its orchestration, delivery, audit, build and verification references were read completely, and the producer/consumer, authority, failure, retry, readback and regression paths were grounded before editing
PAIGE_UI_DESIGN: PASS: .agents/skills/paige-ui-design/SKILL.md, its upstream frontend-design and accessibility references, the five routed delivery modules, and the UI-delivery doctrine were read completely; no visual design, component, copy, geometry, motion, focus, action, state or exit changes, so the approved Solo PAIGE Chat and Trust Compass presentation is preserved
IMPECCABLE: PASS: the installed Impeccable skill, context loader and audit reference were read completely; its state-truth, hierarchy, accessibility, responsive and interaction checks found no UI artifact in scope, and the repair deliberately leaves all rendered controls and wording unchanged
MATERIAL_FLOW_CHANGE: NO: this restores the already-approved governed create-contact path by aligning the emitted model schema and canonical executor input; it adds no user goal, choice, step, state, transition, confirmation, exit, recovery path or side effect
FLOW_PROTOTYPE: NOT_REQUIRED: the existing approved PAIGE Chat -> governed CRM confirmation/execution/readback flow is restored without changing any user-visible interaction decision
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: an authenticated Solo owner, admin or assigned coach asks PAIGE to add a CRM contact; the primary action remains reviewing the existing confirmation card when the workspace lane is confirm, or receiving the existing truthful execution result when the lane is auto
VISUAL_DIRECTION: PASS: the canonical Solo shell, PAIGE Chat composer, confirmation card, Trust Compass, Rail receipt and existing tokens/layout/copy remain untouched
AUTOMATED_EVIDENCE: PASS: initial failing-first on current main produced 4 named failures; all three review-found defects failed before repair; repaired focused suites pass 27/27 and the wider affected family passes 137/137; restoring presence-only name handling makes the malformed-name regression red, restoring the missing-counterpart condition makes the absent-name-part regression red, and removing pre-hash/invocation canonicalization makes the equivalent-retry regression red; restoration returns all three green; the exact 147-tool manifest contract passes 9/9; knowledge scope passes 369/369; extraction proposal passes 15/15; apply extraction passes 26/26; trace wiring passes 12/12; action-risk lint reports 157 classified actions with 0 unclassified writes; tool-catalogue lint reports 0 growth in governed-but-invisible tools
STATIC_EVIDENCE: PASS: the create-contact nested patch declares only canonical executor fields with additionalProperties=false and canonical lifecycle values; normalization runs immediately after crm-command request validation and before tenant readback, autonomy resolution, confirmation, idempotency or execution; PAIGE Chat derives both its fallback idempotency fingerprint and invocation body from one canonical command; focused changed-file ESLint passes, while the pre-existing paige-ai-chat full-file lint baseline remains outside this repair; TypeScript ratchet remains baseline=12/current=12; git diff --check is clean; the production build passes
RENDERED_EVIDENCE: NOT_APPLICABLE: no interface source, visual state, geometry, copy, motion or control changed
BEHAVIORAL_EVIDENCE: PASS: controlled offline tests reproduce the production-shaped name/lifecycle payload, fill absent or malformed canonical name parts from the usable legacy alias without overwriting usable canonical values, normalize without mutating the original input, bind legacy and canonical forms to the same approval subject and fallback retry key, invoke the same canonical command that was hashed, retain unrelated malformed fields for canonical fail-closed validation, and preserve the existing confirm, execute, readback and receipt contracts; this is not authenticated production execution
AUTHENTICATED_RUNTIME: UNVERIFIED: the repaired Edge bundle is not deployed and no disposable authenticated production contact has been created on this head; live confirmation or direct execution, canonical readback, persisted contact and Rail receipt are proof owed after merge under an explicitly controlled test identity
KEYBOARD_FOCUS: NOT_APPLICABLE: no control or focus path changed
ZOOM_REFLOW: NOT_APPLICABLE: no layout, content geometry or responsive behavior changed
REDUCED_MOTION: NOT_APPLICABLE: no motion or reduced-motion behavior changed
STATE_COVERAGE: PASS: covered states are canonical payload, production-shaped legacy name plus lifecycle alias, both canonical names, either canonical name missing, malformed canonical name parts with usable-alias fallback, unrelated malformed fields that remain fail closed, stable approval and retry fingerprints across equivalent spellings, confirm proposal contract, standing-authority execution contract, canonical readback, receipt/Rail locator, tenant-scope guards, and account-change refusal
TRUTHFUL_STATE_LABELS: PASS: no visible label changed; the Trust Compass aggregate remains derived from all CRM tools, while the action door uses the specific server-resolved lane for crm_create_contact; the pre-release repaired behavior is labeled PROOF OWED rather than LIVE
SOLO_UI: NO: the affected outcome is observed in canonical Solo PAIGE Chat, but this diff changes only shared/Edge CRM contract code, the existing paige-ai-chat tool-dispatch seam, focused tests and this evidence record; no Solo shell, page, Chat component, Trust Compass component, navigation, geometry or interaction artifact changed
UNVERIFIED: exact merged Edge deployment identities, deployed source-bundle matches, one controlled authenticated create-contact turn, the resulting canonical record readback and the matching Rail receipt remain unverified until post-merge production acceptance

OWNER_INTENT: restore the existing canonical Solo PAIGE Chat capability so every tenant can ask PAIGE to add a contact and reach the governed lane, execution, canonical readback and Rail receipt instead of a generic refusal
MUST_NOT_HAPPEN: no tenant-specific branch, identifier or configuration; no production data write during pre-merge proof; no approval bypass or lane change; no new CRM capability; no Trust Compass redesign; no customer content in committed evidence; no provider, database, migration, AppShell, Mind/Memory or unrelated Communications change
MUST_PRESERVE: server-derived tenant and actor authority, active membership and role checks, effective autonomy lane, single approval store, canonical idempotency, account-switch revalidation, service-only executor, canonical readback, durable receipt/Rail locator, the full 147-tool manifest, and all existing Solo visuals and wording
ACCEPTANCE_CRITERIA: crm_create_contact advertises only canonical patch fields; a production-shaped legacy payload resolves to the same canonical command, approval subject and fallback retry key; absent or malformed canonical name parts cannot suppress a usable alias; confirm mode returns the existing approval prompt and executes only after its stored single-use approval; auto mode executes under standing authority; both modes return canonical readback plus a durable receipt/Rail locator; off and unrelated malformed requests remain refused; no tenant, user or account authority comes from model arguments
MOTION_PURPOSE: NONE: no motion was added or changed
PROTECTED_SEAMS: affected and tested = shared CRM tool manifest, create-contact legacy compatibility, approval-subject stability, paige-ai-chat canonical retry/invocation binding, crm-command pre-authority normalization, confirm/auto routing, executor readback and receipt contract; explicitly unaffected = tenant/account/user authorization, role policy, Trust Compass persistence and aggregate rendering, UI components, navigation, billing/entitlements, providers, migrations, Mind/Memory, outbound communications, document extraction and responsive geometry

INTERNAL_BUILD_IDENTITY: e601f4bae28f793f82c50e9f63fe2bcbe5e2a27f; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(crm-command and paige-ai-chat automated deployment/source match after merge); evidence=INT-140-focused-and-regression-suites
RELEASE_CHANNEL: development: exact product-code head on the draft INT-140 branch; production promotion remains merge automation only
RELEASE_CLASSIFICATION: patch: MVP-blocking governed CRM reliability repair restoring an approved capability without a new workflow or interface
CUSTOMER_RELEASE_IDENTITY: none: no owner-approved customer release identity was assigned to this bounded repair
RELEASE_NOTE_REQUIRED: NO: bounded defect repair with no new workflow, interface, action or customer instruction; the separate failure-explanation wording defect remains outside this PR
RELEASE_TRUTH_BOUNDARY: PROOF OWED: schema alignment, compatibility normalization, approval-subject stability, confirm/execute/readback/Rail contracts and non-regression are proven offline; authenticated production execution and deployed bundle lineage are not yet proven
RELEASE_RECOVERY: position=revert the bounded INT-140 merge if deployment or controlled acceptance regresses, then diagnose from preserved action-door and audit evidence before any forward fix; reference=INT-140

## Scope and collisions

- Classification: production Edge/shared-contract repair with visible-flow impact and no UI source change.
- Affected flow: authenticated Solo operator asks PAIGE to add a contact; Chat emits a canonical tool call; crm-command resolves identity, role and lane server-side; confirm mode proposes the existing approval card, auto mode executes under the existing standing setting; success returns canonical readback and a Rail locator.
- Neighboring regressions: full Anthropic tool manifest, CRM adoption/action door/executor, active-account protection, Knowledge scope, extraction, trace wiring, TypeScript ratchet, action-risk catalogue and production build.
- Active-owner/file collisions: none on the shared CRM catalog, crm-command action door, or the two focused test files at grounding time; paige-ai-chat/index.ts is shared Chat code and is touched under an explicit coordinator exception only to canonicalize before fallback-key hashing and invocation, with no other edit in that file.
- Explicit exclusions: tenant-specific handling, production data writes, Trust Compass UI, refusal wording (tracked separately), new capabilities, lane changes, migrations, providers, AppShell, MCP, Mind/Memory and unrelated Communications work.

## User job and state map

The existing user job is unchanged. The operator asks PAIGE to add a contact. Chat maps
the tool name to the canonical contact.create action, canonicalizes once before
computing its fallback retry key, and sends that same canonical command to the authenticated
crm-command door. The door validates and canonicalizes the command again before any
readback, policy or authority seam, resolves the current tenant, active membership,
role and effective tool lane, and then either refuses `off`, renders the existing
single-use approval for `confirm`, or executes under the existing standing setting
for `auto`. The service-only executor performs the tenant-bound write, reads the
canonical record back, records the durable capability receipt, and returns the
existing route locator. Account changes and malformed fields continue to fail closed.

## Evidence index

- Product-code head after the conflict-free current-main merge: e601f4bae28f793f82c50e9f63fe2bcbe5e2a27f.
- Failing-first: the original contract repair produced 4 failures / 12 passes on untouched product code; review follow-up separately reproduced malformed-name, absent-name-part and equivalent-retry failures before their corrections.
- Load-bearing mutations: restoring presence-only canonical-name handling makes the malformed-name regression fail; restoring the missing-counterpart condition makes the absent-name-part regression fail; removing PAIGE Chat's pre-hash/invocation canonicalization makes the equivalent-retry regression fail; restoring the repairs returns all three green.
- Focused proof: CRM adoption 11/11, action-door contract 8/8, canonical executor/readback/Rail contract 8/8 = 27/27.
- Wider proof: affected CRM/governance family 137/137; exact manifest 9/9; Knowledge scope 369/369; extraction proposal 15/15; apply extraction 26/26; trace wiring 12/12; TypeScript ratchet 12/12 baseline/current; production build passed.
- Production grounding was SELECT/log-only and is intentionally not reproduced with customer content or tenant identifiers in this committed record.

## Review and limitations

The proven pre-release defect is a contract mismatch introduced when the original
create-contact arguments were replaced by one generic nested patch: the model could
emit a display-name field and historical lifecycle value that the canonical executor
rejects. Accepting those legacy aliases also opened two correctness obligations that
did not exist while legacy arguments were rejected outright: absent or malformed canonical
name parts must not discard a usable alias, and equivalent retry spellings must not mint
different fallback keys. The repair narrows only contact.create to the executor-owned
schema and normalizes the repository-proven aliases before approval, retry hashing and
invocation. It does not change the effective lane. A workspace configured auto
therefore executes directly; a workspace configured `confirm` receives the existing
approval card. Post-merge acceptance must use a controlled identity and verify the
stored contact, readback and Rail receipt without touching a real customer's data.
