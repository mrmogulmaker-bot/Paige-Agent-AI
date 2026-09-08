# UI delivery evidence: canonical public-home route retirement

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: affected flow is direct public entry at the canonical or either retired homepage address.
PAIGE_UI_DESIGN: PASS: repository skill and every routed upstream, accessibility, quality-gate, and review reference read before route editing.
MATERIAL_FLOW_CHANGE: YES: direct visits to two superseded design URLs now replace-redirect to the canonical homepage.
FLOW_PROTOTYPE: PASS: compact flow model below; owner approval is the 2026-09-07 directive to remove verified obsolete platform routes without waiting for another approval.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a public visitor should reach the one current Paige homepage and its real navigation, never an unlinked prior design.
VISUAL_DIRECTION: PASS: no visual design was changed; PaigeHome remains the approved canonical public presentation.
AUTOMATED_EVIDENCE: PASS: the focused route contract passed 2/2 tests; the full suite passed 279/279 files and 3,939/3,939 tests with a 15-second per-test ceiling.
STATIC_EVIDENCE: PASS: TypeScript ratchet passed at baseline/current 13, production build passed, the retired page modules are absent from the build graph, and release-governance, integration-registry, binding-ledger, and regression lints passed.
RENDERED_EVIDENCE: PASS: local and exact post-merge production browser drives at 1366x768 and 900x1000 rendered the canonical PaigeHome for root, premium, and legacy entry on both public domains; screenshots are indexed below.
BEHAVIORAL_EVIDENCE: PASS: both retired deep links ended at / on both production domains, and a /about -> retired-path -> / drive returned to /about on Back, proving replacement rather than an extra history entry.
AUTHENTICATED_RUNTIME: NOT_APPLICABLE: the retired and canonical paths are public; exact unauthenticated production behavior and build identity were verified on both domains.
KEYBOARD_FOCUS: PASS: production keyboard entry reached the Paige Agent link on both domains and both tested viewports; the redirect adds no control or focus owner.
ZOOM_REFLOW: PASS: at 200 percent root font sizing, the canonical result had no horizontal overflow at 1366 and 900 CSS pixels.
REDUCED_MOTION: PASS: prefers-reduced-motion was emulated and both redirects still resolved to the canonical page without redirect-owned motion.
STATE_COVERAGE: PASS: direct canonical entry and both legacy deep-link entries apply; loading, form validation, permission, mutation, retry, destructive, and workspace-switch states are N/A because this is a synchronous public redirect.
TRUTHFUL_STATE_LABELS: PASS: no capability status changes; the old pages are described only as superseded route implementations.
SOLO_UI: NO: this is the unauthenticated public homepage router, not the Solo shell.
UNVERIFIED: public track-event requests emitted CORS and 401 console errors on both domains during proof; routing was unaffected, but telemetry behavior requires separate ownership and diagnosis.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: f8eb2362beb03ec609dfe645b4d00f43c3eebf2d; deployment=dpl_79gKFA29LsSstU6tJFEMxNeYWXdw; environment=production; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=this record and both embedded production drive manifests
RELEASE_CHANNEL: production: Vercel READY deployment aliases the canonical public domains from exact main SHA
RELEASE_CLASSIFICATION: patch: canonical-route cleanup plus shipped-log governance reconciliation, without a customer release identity
CUSTOMER_RELEASE_IDENTITY: none: no approved canonical customer release record
RELEASE_NOTE_REQUIRED: no: no customer version or announcement was authorized
RELEASE_TRUTH_BOUNDARY: LIVE: canonical public routing is verified on both production domains; telemetry errors and the separate tenant-redesign route are excluded and named
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

- Focused contract: `npx vitest run src/__tests__/canonical-public-route.test.ts` — 1 file, 2 tests passed.
- Full regression: `npm run test -- --run --testTimeout=15000` — 279 files, 3,939 tests passed.
- Static/governance: TypeScript ratchet, production build, regression lint, release-governance lint, integration-registry lint, and binding-ledger lint all passed.
- Browser drive: local plus `paigeagent.ai` and `app.paigeagent.ai` at 1366x768 and 900x1000; both retired routes ended at `/`; Back history returned to `/about`; keyboard entry, reduced-motion, and 200 percent reflow exercised.
- Production identity: route-remediation PR #1054 merged as `2719d7d86ccfa23d0e781b841b5ee134ec8e7276`; current descendant main is #1053 / `f8eb2362beb03ec609dfe645b4d00f43c3eebf2d`; Vercel `dpl_79gKFA29LsSstU6tJFEMxNeYWXdw` READY; both embedded `versionManifest` objects record `f8eb2362beb03ec609dfe645b4d00f43c3eebf2d-mts66mnc` and `customerUpdate: null`.
- Durable production artifacts: `production-paigeagent-drive.json` and `production-app-paigeagent-drive.json` preserve each tested entry, final path, heading, history result, focus target, reflow measurement, and console finding. Eight adjacent `production-*-premium-*.png` / `production-*-legacy-*.png` files preserve both retired-route results on both domains at both viewports.
- Screenshots: `canonical-1366x768.png`, `premium-1366x768.png`, `legacy-1366x768.png`, `canonical-900x1000.png`, `premium-900x1000.png`, `legacy-900x1000.png`, and `zoom-200-1366x768.png` in the adjacent evidence directory.
- Both public domains emitted background `track-event` CORS/401 console errors during production proof. They did not alter the canonical-route result and remain a separately owned telemetry finding.

## Review and limitations

- This removes two proven obsolete production route owners. The separately documented representative tenant-redesign prototype remains reachable and requires a distinct owner retirement decision.
