# UI delivery evidence: canonical public-home route retirement

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: affected flow is direct public entry at the canonical or either retired homepage address.
PAIGE_UI_DESIGN: PASS: repository skill and every routed upstream, accessibility, quality-gate, and review reference read before route editing.
MATERIAL_FLOW_CHANGE: YES: direct visits to two superseded design URLs now replace-redirect to the canonical homepage.
FLOW_PROTOTYPE: PASS: compact flow model below; owner approval is the 2026-09-07 directive to remove verified obsolete platform routes without waiting for another approval.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a public visitor should reach the one current Paige homepage and its real navigation, never an unlinked prior design.
VISUAL_DIRECTION: PASS: no visual design was changed; PaigeHome remains the approved canonical public presentation.
AUTOMATED_EVIDENCE: PENDING: focused route contract, full Vitest suite, and CI results will be recorded before merge.
STATIC_EVIDENCE: PENDING: TypeScript ratchet, production build, route/reference scan, and governance lints will be recorded before merge.
RENDERED_EVIDENCE: PENDING: local browser redirects and canonical landing at representative widths will be recorded before merge.
BEHAVIORAL_EVIDENCE: PENDING: both retired paths, history replacement, and canonical navigation will be recorded before merge.
AUTHENTICATED_RUNTIME: UNVERIFIED: authentication is not part of these public routes; post-merge production aliases and redirect behavior must be checked separately.
KEYBOARD_FOCUS: PENDING: canonical landing keyboard entry will be checked; removed pages expose no controls.
ZOOM_REFLOW: PENDING: canonical landing at 200 percent will be checked; redirect adds no layout.
REDUCED_MOTION: PENDING: canonical landing preference behavior will be checked; redirect adds no motion.
STATE_COVERAGE: PASS: direct canonical entry and both legacy deep-link entries apply; loading, form validation, permission, mutation, retry, destructive, and workspace-switch states are N/A because this is a synchronous public redirect.
TRUTHFUL_STATE_LABELS: PASS: no capability status changes; the old pages are described only as superseded route implementations.
SOLO_UI: NO: this is the unauthenticated public homepage router, not the Solo shell.
UNVERIFIED: post-merge production redirect and deployment identity remain pending until the exact merge deployment exists.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: PENDING_COMMIT; deployment=PENDING_UNTIL_MERGE; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=this record plus exact Git/Vercel closeout
RELEASE_CHANNEL: development: production promotion occurs only through the reviewed merge; no staged rollout
RELEASE_CLASSIFICATION: internal patch: canonical-route cleanup plus shipped-log governance reconciliation
CUSTOMER_RELEASE_IDENTITY: none: no approved canonical customer release record
RELEASE_NOTE_REQUIRED: no: no customer version or announcement was authorized
RELEASE_TRUTH_BOUNDARY: redirect behavior is locally verifiable; production remains PROOF OWED until the exact deployment is checked
RELEASE_RECOVERY: position=forward-fix or restore the two route mappings from Git history; reference=this record

## Scope and collisions

- Classification: active route/component duplication narrowed to one canonical public homepage.
- Affected flows: direct entry at the two retired paths now resolves to the canonical root with history replacement.
- Neighboring regressions: the root homepage, public navigation, authentication, and every authenticated shell remain unchanged.
- Active-owner/file collisions: open PRs #12 and #11 touch src/App.tsx, and #10 touches the retired Index page; they are historical branches and must rebase after this canonical correction. PR #560 touches src/App.tsx and the separately retained tenant-redesign prototype; that route is not changed here.
- Explicit exclusions: no provider, tenant data, migration, Edge function, product capability, customer announcement, or tenant-redesign retirement.

## User job and state map

Goal: reach the one current Paige public homepage from any formerly published Paige homepage URL.
Human and feel: a public visitor receives a direct, unsurprising canonical landing.
Entry and exit: the root or either retired address enters; canonical navigation exits from the root.
System: existing Vite/React Router and PaigeHome; no new tokens, components, or motion.
Signature: none added; the canonical homepage remains the sole visual identity.
Feedback: ordinary route replacement; no haptic or transition.
Rejecting: parallel public designs and a redirect loop.
Variants: authentication, role, tenant, and provider state do not apply.

| From | Trigger | Guard or input | To | Container | Feedback | Recovery or exit |
|---|---|---|---|---|---|---|
| canonical root | direct visit | none | canonical PaigeHome | page | existing load behavior | existing public navigation |
| retired premium path | direct visit or bookmark | none | canonical root | router replacement | canonical page renders | Back does not re-enter the retired route |
| retired legacy path | direct visit or bookmark | none | canonical root | router replacement | canonical page renders | Back does not re-enter the retired route |

## Evidence index

- Exact commands, browser observations, commit, checks, and production identifiers will replace every pending field before merge.

## Review and limitations

- This removes two proven obsolete production route owners. The separately documented representative tenant-redesign prototype remains reachable and requires a distinct owner retirement decision.
