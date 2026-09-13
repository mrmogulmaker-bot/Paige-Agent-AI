# UI delivery evidence: Solo Beta local-number and international phone entry

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The existing Solo acquisition flow record remains canonical; this hotfix changes only mobile-number entry and the production migration recovery needed to complete that flow.
PAIGE_UI_DESIGN: PASS: Existing Paige labels, field controls, muted helper copy, focus treatment, grid breakpoints, and dual-theme tokens remain the visual authority.
MATERIAL_FLOW_CHANGE: YES: A customer can choose a country and enter a local mobile number without knowing or typing the calling prefix.
FLOW_PROTOTYPE: PASS: Owner approved no-+1 entry and an international setting in this task before implementation.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: A new Solo customer selects their country, enters the familiar local number, and continues through the unchanged Create Solo Beta account action.
VISUAL_DIRECTION: PASS: The native accessible country selector is contained within the existing signup field hierarchy with no added decoration or competing action.
AUTOMATED_EVIDENCE: PASS: Retained implementation head 357582bd735edf110ddcc6dc69d620438fd3df40 passed 181/181 focused phone, migration-recovery, acquisition, billing, webhook, and Solo security regressions; local normalization covers US, UK, Australia, explicit E.164 override, invalid input, and more than 200 country options.
STATIC_EVIDENCE: PASS: Production build, ci:regression, migration-version, managed-schema, definer-function, Rail-grant, Binding Ledger, release-governance, and diff-integrity checks passed locally.
RENDERED_EVIDENCE: PASS: Fresh production build passed 178/178 browser checks at 1536x770, 1366x768, 1024x768, and 900x1000 in light and dark themes; artifacts remain under the existing gitignored scripts/live-drive/artifacts/solo-beta-acquisition home.
BEHAVIORAL_EVIDENCE: PASS: Each rendered Auth state defaulted to United States, exposed more than 200 labeled countries/calling codes, accepted 4244575247 without +1, kept the primary action reachable, and produced no page error or horizontal overflow.
AUTHENTICATED_RUNTIME: UNVERIFIED: No disposable production customer was created; persistence through Supabase Auth remains subject to the production migration recovery and safe released-flow proof.
KEYBOARD_FOCUS: PASS: The signup drive traversed the real Auth controls and retained visible focus; the country selector is a labeled native keyboard control.
ZOOM_REFLOW: UNVERIFIED: Zoom is enabled, but a dedicated 200 percent reflow drive was not performed.
REDUCED_MOTION: PASS: Both themes and all required viewports reported no running decorative animation under reduced motion.
STATE_COVERAGE: PASS: Default US, selected international, explicit + prefix, invalid local input, disabled/loading, and text-consent-required validation are represented.
TRUTHFUL_STATE_LABELS: PASS: Copy says the selected country supplies the prefix; it does not claim SMS enrollment or provider delivery before account creation succeeds.
SOLO_UI: YES: Public Solo Beta Auth signup mobile-number field.
UNVERIFIED: Real authenticated signup persistence and SMS delivery are not claimed by this rendered/local proof.
OWNER_INTENT: Accept ordinary US numbers without +1 and add an international country setting to the full Solo Beta signup.
MUST_NOT_HAPPEN: Do not guess an international country, store an invalid number, change SMS consent, or disturb the approved trial and billing flow.
MUST_PRESERVE: Existing required consent, signup submission, Auth recovery, Solo-only offer, responsive fit, and server-verified entitlement behavior.
ACCEPTANCE_CRITERIA: US local entry normalizes to +1 E.164; a selected international country normalizes its local number; explicit + input works; invalid input gives one clear recovery message.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Auth metadata receives only validated E.164 or null; SMS consent remains the submission guard; production migration recovery remains fail-closed and digest-pinned.

SOLO_1536X770_PAIGE_CLOSED: PASS: light/dark Auth screenshots; selector, number, helper, and primary action fit with no horizontal overflow.
SOLO_1536X770_PAIGE_OPEN: NOT_APPLICABLE: public Auth does not mount the Paige panel.
SOLO_1366X768_PAIGE_CLOSED: PASS: light/dark Auth screenshots; selector and number remain reachable with visible focus.
SOLO_1366X768_PAIGE_OPEN: NOT_APPLICABLE: public Auth does not mount the Paige panel.
SOLO_1024X768_PAIGE_CLOSED: PASS: light/dark Auth screenshots; two-column phone control fits without clipping.
SOLO_1024X768_PAIGE_OPEN: NOT_APPLICABLE: public Auth does not mount the Paige panel.
SOLO_900X1000_PAIGE_CLOSED: PASS: light/dark Auth screenshots; responsive phone control and primary action remain reachable with no overflow.
SOLO_900X1000_PAIGE_OPEN: NOT_APPLICABLE: public Auth does not mount the Paige panel.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 357582bd735edf110ddcc6dc69d620438fd3df40; deployment=NOT_DEPLOYED; environment=local; migrations=PROOF_OWED(production_recovery_hotfix); edge=NOT_APPLICABLE; evidence=docs/evidence/ui-delivery/solo-beta-phone-entry.md
RELEASE_CHANNEL: development: retained implementation build and rendered proof; owner-approved production promotion follows exact-head PR checks.
RELEASE_CLASSIFICATION: patch: customer-visible phone repair plus fail-closed migration convergence.
CUSTOMER_RELEASE_IDENTITY: none: hotfix not yet merged or deployed.
RELEASE_NOTE_REQUIRED: YES: customer-visible signup entry changes.
RELEASE_TRUTH_BOUNDARY: PARTIAL: local normalization and rendered behavior are verified; production Auth persistence and migration recovery remain proof owed.
RELEASE_RECOVERY: position=forward-fix-on-main; reference=PR #1148 merge a725633b and failed migration run 34731904027.

## Scope and collisions

- Classification: Solo signup usability and production recovery hotfix.
- Affected flows: Auth mobile entry; post-merge migration deployment.
- Neighboring regressions: consent, signup metadata, billing, and canonical destination are unchanged and covered by focused Solo tests.
- Active-owner/file collisions: none on fresh merged main.
- Explicit exclusions: live Stripe activation, real customer charge, SMS provider delivery, and unrelated governance failures.