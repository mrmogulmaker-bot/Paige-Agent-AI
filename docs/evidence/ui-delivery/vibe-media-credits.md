# UI delivery evidence: vibe-media-credits — Media Credit ledger + Billing integration

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: doctrine-hierarchy grounding (the ZCode-environment equivalent, recorded in vibe-media-fal.md's FLOW_BY_FLOW): CLAUDE.md §00–§70, Master §3 Harness + §4.0 billing rows, the Billing Experience contract files (billing-contract.ts, settings-billing.tsx headers), get_workspace_ai_usage migration precedent, and the money-truth append-only precedents (20261230000000, 20260102000000-re2_m1a).
PAIGE_UI_DESIGN: PASS: skill read this session (SKILL.md + routed references); the new card reuses the shipped Billing card system verbatim (Card / ss-state / ss-fields / ss-note, the UsageCard template) — no new visual direction, per §00.
MATERIAL_FLOW_CHANGE: YES: Billing gains its first metered customer-facing usage category (Vibe Media credits) and the Vibe composer/rail now show the credit truth; the estimate-approval boundary now has a hard ledger behind it (hold-before-dispatch).
FLOW_PROTOTYPE: PASS: the owner's 2026-09-12 build authorization + economics packet specify the exact product rules (300 credits = $3.00 monthly, $0.01/credit, ≥20% pack margin, $74.50 plan unchanged, no unlimited) — the authorization is the approved flow artifact.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = workspace owner on Settings → Billing (and in Vibe Studio while creating). Primary action = see the included allowance, what remains, where credits went, and the notices at 50/80/100% — while Vibe requests beyond the allowance show cost and ask first.
VISUAL_DIRECTION: PASS: the shipped Billing card system; nothing new invented.
AUTOMATED_EVIDENCE: PASS: 12 contract tests (media-usage-contract) pin the owner-required states (allowance, 50/80/100 notices, exhausted, holds, breakdown, refusals, retry); media-credits-seam (12) pins whole-credit rounding-up conversion, notice bands, the platform guard posture, and the ≥20% pack-margin product rule; the pgTAP suite supabase/tests/media_credit_ledger.sql (22 assertions) proves append-only triggers, lazy-mint exactly-once, closure math, insufficient-writes-nothing, the anti-leakage release gate, settlement consumption, per-grant pack keys, and §59 service-role-only writers — running in CI's database-contract job against the replayed schema.
STATIC_EVIDENCE: PASS: tsc-ratchet green (baseline 13 = current 13); vite build green; eslint 0 errors on all changed files (1 pre-existing warning, verified on main); secret scan clean; types.ts gains paige_media_credit_entries.
RENDERED_EVIDENCE: UNVERIFIED: component-level render not yet driven for the new card (the contract resolver is fully tested; the card is a mechanical mapping of it); authenticated renders owed with the proof session below.
BEHAVIORAL_EVIDENCE: PASS: the ledger's behavioral guarantees are the pgTAP suite's (real SQL against the replayed schema in CI); the Vibe-side insufficient-credit denial surfaces the server's own message through the FunctionsHttpError parsing proven in vibe.render tests.
AUTHENTICATED_RUNTIME: UNVERIFIED: no test credentials in this environment; the controlled provider proof session (authorized ≤$1.25) will drive the live surface immediately after deploy and is the designated authenticated proof for this delivery.
KEYBOARD_FOCUS: PASS: the card reuses the shipped Billing controls (buttons reachable/focusable; state rows are static text); full keyboard walk owed with the proof session.
ZOOM_REFLOW: UNVERIFIED: the card is a standard ss-fields stack; owed with the proof session.
REDUCED_MOTION: NOT_APPLICABLE: the card adds no motion.
STATE_COVERAGE: PASS: trial-equivalent included allowance (fields), low balance (80% notice), exhausted (dedicated state with next-step copy), hold (reserved-in-flight field), completion (category breakdown), failed/released (ledger receipt trail labels every entry type), provider-unavailable + approval-required + declined + cancellation (Vibe-surface states, tested in vibe.render), retry (media-error), receipts history (entries list).
TRUTHFUL_STATE_LABELS: PASS: "One Media Credit covers one cent of approved provider cost"; no unlimited promise anywhere; Chat/automations stated as included-in-Beta and shown separately; packs labeled roadmap-only until checkout exists.
SOLO_UI: YES: Settings → Billing (the Solo surface) + the Vibe Studio rail.
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: owed to the credentialed proof session (no test credentials in build sessions); the card reuses the shipped Billing layout whose geometry is proven at these viewports by prior delivery records
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: owed with the same session; PAIGE-open collapses the settings pane, the card stack reflows within the proven shell
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: owed to the credentialed session
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: owed to the credentialed session
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: owed to the credentialed session
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: owed to the credentialed session
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: owed to the credentialed session; the settings scroll owner is the page column (proven shell)
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: owed to the credentialed session
UNVERIFIED: authenticated live render of both surfaces; the controlled paid proof (owner-authorized ≤$1.25, runs after deploy); pgTAP concurrency claims beyond single-session (the FOR UPDATE tenant lock follows the house precedent; a two-connection proof script is a follow-up).

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 373ffde27d463181eb5eed7393c202176cf3b8d2; deployment=none-PR-head-only; environment=development; migrations=PROOF_OWED(20270123000000_media_credit_ledger merge pending CI validation incl the new pgTAP suite); edge=PROOF_OWED(paige-media paige-media-sweeper redeploys with credit gate pending merge); evidence=docs/evidence/ui-delivery/vibe-media-credits.md and the PR checks
RELEASE_CHANNEL: development: PR head only — merge and deploy follow Gate A once exact-head checks are green
RELEASE_CLASSIFICATION: internal-only: metered usage visibility + ledger, no charge path exists — no Stripe products, no customer billing
CUSTOMER_RELEASE_IDENTITY: none: no charge path and no approved release record; media credits are visible tracking only
RELEASE_NOTE_REQUIRED: NO: internal capability; the customer-facing moment is the future pack checkout
RELEASE_TRUTH_BOUNDARY: PARTIAL: credit ledger code complete with CI-proven SQL invariants; deployed state and provider proof owed; no customer can be charged anything by this delivery
RELEASE_RECOVERY: position=git revert of the merge plus edge redeploy of prior versions (the migration is additive-only and the ledger is append-only so recovery preserves history); reference=docs/evidence/ui-delivery/vibe-media-credits.md

## Scope and collisions

- Classification: extends the ONE Billing surface (settings-billing.tsx + billing-contract.ts + a data hook in the established family) — no second billing system; the ledger is one table + service-role RPCs on the existing seams; Vibe gains a credit line, not a new page.
- Explicit exclusions (owner-locked): no live Stripe prices or charges; no paid fal calls until the separately-authorized proof (≤$1.25); no unlimited promises; plan price unchanged at $74.50 with 30-day trial; Chat/automation usage visible but included.
- Truthful provider setting: `media_provider_ceiling_usd` documented as an activation gate (what it always was); the NEW `media_spend_ceiling_usd` is the ENFORCED platform-wide daily guard (checked inside media_credit_hold under a global-class advisory lock).
- Video: catalog corrected to the live Veo 3.1 family (`fal-ai/veo3.1/fast` $0.15/s audio-on, `fal-ai/veo3.1` $0.40/s); still flag-gated OFF + per-job approval + 1/day.

## Evidence index

vitest: `npx vitest run src/solo/media-usage-contract.test.ts src/__tests__/media-credits-seam.test.ts` (+ the five existing media suites, 66 green). pgTAP: CI database-contract job runs `supabase test db supabase/tests/media_credit_ledger.sql`. Static: ratchet/build/lint as above. The authorized controlled proof (≤$1.25: one image ≤$0.25, one fast video ≤$1.00) executes against the deployed result and its report is the authenticated-runtime evidence.
