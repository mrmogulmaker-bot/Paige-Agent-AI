# UI delivery evidence: release-aware customer update banner

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: Complete flow, state, collision, verification, and proof-boundary packet is recorded in this file and PR #1045.
PAIGE_UI_DESIGN: PASS: Read `.agents/skills/paige-ui-design/SKILL.md` and its routed accessibility, design-system, responsive, theme, evidence, and skill-pack references before adaptation.
MATERIAL_FLOW_CHANGE: YES: The existing update banner now distinguishes generic build freshness from one approved canonical customer release and protects active owner work before reload.
FLOW_PROTOTYPE: PASS: Owner-approved locked behavior and supplied existing-banner screenshot governed the adaptation; exact-component rendered matrix is stored beside this record.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Signed-in owners receive one non-blocking update entry point whose primary action is explicit Reload, with What’s new only for an eligible release.
VISUAL_DIRECTION: PASS: Preserved the existing bottom banner and Paige token system; used card, border, foreground, muted, gold button, indigo glyph, focus-ring, and reduced-motion behavior in Mineral and Obsidian.
AUTOMATED_EVIDENCE: PASS: Manifest resolver 10/10; banner/update/unsaved-work tests 9/9; release-governance self-test 154/154; repository governance lint passes.
STATIC_EVIDENCE: PASS: Diff check clean; TypeScript ratchet has 0 new errors against the 13-error repository baseline; changed-file ESLint has 0 errors; production build passes; sensitive-data diff scan recorded in PR #1045.
RENDERED_EVIDENCE: PASS: Eight screenshots beside this record cover 1536x770, 1366x768, 1024x768, and 900x1000 with Paige closed in Obsidian and Paige open in Mineral.
BEHAVIORAL_EVIDENCE: PASS: Keyboard Enter expands What’s new; blocked Reload retains the banner; dismissal, generic, approved-release, post-reload, editable-focus deferral, and fail-closed exits are covered by tests and browser drive.
AUTHENTICATED_RUNTIME: UNVERIFIED: Production owner credentials were unavailable, so authenticated owner reload, tenant switching, and true preserved-session behavior are excluded from the live claim.
KEYBOARD_FOCUS: PASS: What’s new, Reload, and Dismiss are native buttons with visible focus treatment; Enter toggled aria-expanded and revealed the controlled details region.
ZOOM_REFLOW: PASS: The 900x1000 Mineral Paige-open frame was driven at 200 percent root text scale with zero horizontal overflow and all controls reachable.
REDUCED_MOTION: PASS: Browser contexts used reduced-motion reduce; the component selected its zero-duration reduced-motion transition and remained operable.
STATE_COVERAGE: PASS: Generic, approved release, expanded notes, blocked reload, dismissed build, newer build reappearance, post-reload notes, editing-focus deferral, missing/invalid/stale/ambiguous/future/staged/unsafe/technical records, and unpublished correction lineage are covered.
TRUTHFUL_STATE_LABELS: PASS: Customer content is limited to LIVE, PARTIAL, UNAVAILABLE, and PROOF OWED from the canonical projection; ordinary builds expose no version or technical identifier.
SOLO_UI: YES: The global signed-in banner and reload guards affect Solo forms, Paige chat drafts and attachments, streaming, settings, sales dialogs, People editing, and Studio.
UNVERIFIED: Authenticated production owner interaction, true tenant switching, native reload confirmation, and production behavior are excluded because production owner credentials were unavailable; exact preview rendering is proven separately.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 144a350cad653ea8d204d08fee6b9182a03960fc; deployment=6312731135; environment=preview; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=https://paige-agent-5pqkknuir-paige-agent-ai.vercel.app
RELEASE_CHANNEL: preview: GitHub deployment 6312731135 completed successfully for exact head 144a350cad653ea8d204d08fee6b9182a03960fc at https://paige-agent-5pqkknuir-paige-agent-ai.vercel.app
RELEASE_CLASSIFICATION: minor-candidate: release-aware owner update behavior is meaningful, while this build remains generic until an approved canonical customer release record exists.
CUSTOMER_RELEASE_IDENTITY: 0.1.0 — Paige Solo Preview; owner-decision=PENDING
RELEASE_NOTE_REQUIRED: YES: a named customer release requires canonical approved What’s new content; without that record this deployment uses only the generic update message.
RELEASE_TRUTH_BOUNDARY: PARTIAL: exact preview rendering and automated behavior pass; authenticated owner and production interaction remain excluded.
RELEASE_RECOVERY: position=Revert PR #1045 or ship a forward fix while the banner fails closed to generic copy; reference=docs/evidence/ui-delivery/customer-update-experience.md

SOLO_1536X770_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/update-1536x770-obsidian-paige-closed.png; Obsidian; expanded notes; zero horizontal overflow; 44px controls.
SOLO_1536X770_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/update-1536x770-mineral-paige-open.png; Mineral; Paige panel present; expanded notes; zero horizontal overflow; 44px controls.
SOLO_1366X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/update-1366x768-obsidian-paige-closed.png; Obsidian; expanded notes; zero horizontal overflow; 44px controls.
SOLO_1366X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/update-1366x768-mineral-paige-open.png; Mineral; Paige panel present; expanded notes; zero horizontal overflow; 44px controls.
SOLO_1024X768_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/update-1024x768-obsidian-paige-closed.png; Obsidian; expanded notes; zero horizontal overflow; 44px controls.
SOLO_1024X768_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/update-1024x768-mineral-paige-open.png; Mineral; Paige panel present; expanded notes; zero horizontal overflow; 44px controls.
SOLO_900X1000_PAIGE_CLOSED: PASS: docs/evidence/ui-delivery/update-900x1000-obsidian-paige-closed.png; Obsidian; expanded notes; zero horizontal overflow; 44px controls.
SOLO_900X1000_PAIGE_OPEN: PASS: docs/evidence/ui-delivery/update-900x1000-mineral-paige-open.png; Mineral; Paige panel present; 200 percent text reflow; zero horizontal overflow; 88px controls.

## Scope and collisions

- Classification: owner-visible minor candidate; no customer release identity is emitted without a valid approved canonical record.
- Affected flows: update detection, generic/release presentation, What’s new expansion, dismissal/reappearance, explicit reload, post-reload note availability, and registered unsaved-work blocking.
- Neighboring regressions: signed-in banner mount, Paige conversations, forms, file processing, streaming, Studio, cache cleanup, themes, focus, reduced motion, and responsive fit.
- Active-owner/file collisions: PR #1044 overlaps `PaigeAIChat.tsx` and `SoloBusinessContextSetup.tsx` but non-mutating merge-tree proof found no conflict. Older open branches overlap shared handoff/index files; current main and PR #1045 merge cleanly.
- Explicit exclusions: unread badge, workspace/account indicator, standalone Updates page, new navigation, modal, feed, dashboard, second destination, auto-reload, sign-in promise, and customer-visible technical evidence.

## User job and state map

The signed-in owner keeps working while the non-blocking banner reports an available build. A routine build shows only “An update is ready” and Reload. Exactly one valid, approved, exact-production-build canonical release record may add the approved release name/version, owner outcome, and inline What’s new details. Every unresolved or unsafe record fails closed to the generic state. Reload is explicit; registered unsaved forms, Paige drafts, attachment processing, attachments, streaming responses, and Studio work keep the owner on the current page with a save-or-finish explanation.

## Evidence index

- Preview deployment: GitHub deployment `6312731135`, exact head `144a350cad653ea8d204d08fee6b9182a03960fc`, successful preview URL recorded above.
- Rendered matrix: eight PNG files beside this record, generated 2026-09-07 from the exact `PlatformUpdateBannerView` with no provider or customer data.
- Geometry: expanded banner 512x368.25 at ordinary scale; 900x1000 200-percent reflow 836x764.5; every frame had zero horizontal overflow, no framework overlay, and no browser error.
- Accessibility: semantic region label, polite status, native buttons, `aria-expanded`, `aria-controls`, keyboard Enter, 44px minimum controls, reduced-motion drive, and 200-percent reflow passed.
- Tests: resolver 10/10; affected UI/hooks 9/9; release-governance 154/154; repository governance lint, TypeScript ratchet, changed-file ESLint, and production build pass.

## Review and limitations

Independent review found and repaired one P1 lifecycle defect: customer-visible `CORRECTED` records must descend from a `PUBLISHED` record. Re-review found no remaining actionable defect. Authenticated production owner interaction, true tenant switching, native browser reload confirmation, exact production deployment identity, and production behavior remain `PROOF OWED`; preview rendering does not prove them.