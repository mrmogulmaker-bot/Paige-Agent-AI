# UI delivery evidence: Solo Campaigns Sales blank-route hotfix

Owner incident 2026-09-06: the deployed `/solo/{account}/growth/sales` route rendered a blank dark surface after its initial read. This hotfix restores the approved Sales Command Desk without changing its route, design, tier, data, or authority contracts.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: current main and production revision, live SPA response and deployed assets, GrowthHub routing, lazy imports, Sales adapters, route lifecycle, active PR collisions, and the existing Sales product contract were grounded before editing
PAIGE_UI_DESIGN: PASS: the applicable Paige UI skill and references were read; this is a lifecycle correction with no visual or interaction redesign
MATERIAL_FLOW_CHANGE: NO: the existing approved loading-to-ready flow is repaired; no route, state, action, authorization, persistence, or UI contract is added
FLOW_PROTOTYPE: NOT_REQUIRED: the owner-approved Sales Command Desk is unchanged and the exact production failure is reproduced in the real mounted component
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: a Solo owner can open Campaigns → Sales after authentication and reach the existing evidence-aware Sales desk
VISUAL_DIRECTION: PASS: unchanged approved Solo System-C Sales Command Desk
AUTOMATED_EVIDENCE: PASS: the failing-first same-mount loading-to-ready regression failed with React's hook-order exception before the fix and passes after it; the focused six-surface Campaigns suite passes 220/220; the full repository suite passes 253 files and 3,708 tests
STATIC_EVIDENCE: PASS: TypeScript ratchet 13/13 with no new errors; changed-file ESLint 0 errors and one pre-existing warning; regression, skeleton, and tier-feature lints pass; production build passes
RENDERED_EVIDENCE: PASS: `npm run drive:sales-ops` passes 536/536 across both themes and all eight required Solo PAIGE/viewport states; the added browser checks drive loading-to-ready on the same mounted Sales instance with no crash or page error; horizontal overflow is zero
BEHAVIORAL_EVIDENCE: PASS: mounted-browser proof covers the exact failed lifecycle plus the existing first-use, populated, read-error, denied, unavailable, save-refusal, retry, cancellation, and view-switch paths
AUTHENTICATED_RUNTIME: UNVERIFIED: production HTML and every current Sales bundle dependency were reachable and Vercel reported no server-runtime error, but the signed-in browser helper could not attach; the owner screenshot is symptom evidence, not console or repaired-runtime proof
KEYBOARD_FOCUS: PASS: no focus behavior changed; existing Sales subnav and editor keyboard contracts remain covered
ZOOM_REFLOW: PASS: 536/536 browser checks include the real 439px and 521px constrained content columns with no horizontal overflow
REDUCED_MOTION: PASS: no motion changed; existing reduced-motion rules remain intact
STATE_COVERAGE: PASS: exact loading-to-ready transition added to both contract and mounted-browser proof; all previously approved Sales state coverage remains green
TRUTHFUL_STATE_LABELS: PASS: no commercial truth label or provider claim changed; the route no longer crashes when truthful data becomes ready
SOLO_UI: YES: Solo Campaigns → Sales only
UNVERIFIED: authenticated production owner loading-to-ready proof and exact post-merge production revision remain PROOF OWED until deployment verification

SOLO_1536X770_PAIGE_CLOSED: PASS: browser-driven, no route crash or horizontal overflow
SOLO_1536X770_PAIGE_OPEN: PASS: browser-driven at the constrained 521px content column, no route crash or horizontal overflow
SOLO_1366X768_PAIGE_CLOSED: PASS: browser-driven, no route crash or horizontal overflow
SOLO_1366X768_PAIGE_OPEN: PASS: browser-driven at the tightest 439px content column, no route crash or horizontal overflow
SOLO_1024X768_PAIGE_CLOSED: PASS: browser-driven overlay state, no route crash or horizontal overflow
SOLO_1024X768_PAIGE_OPEN: PASS: browser-driven overlay state, no route crash or horizontal overflow
SOLO_900X1000_PAIGE_CLOSED: PASS: browser-driven overlay state, no route crash or horizontal overflow
SOLO_900X1000_PAIGE_OPEN: PASS: browser-driven overlay state, no route crash or horizontal overflow

## Root cause and exact fix

`SalesOps` returned early while its production adapter was `loading`, before reaching a later `useMemo`. When the same mounted instance advanced to `ready`, React observed one more hook than on the prior render and aborted the route with `Rendered more hooks than during the previous render`. The existing fixture harness always began in `ready`, so it could not catch the lifecycle defect.

The minimal fix keeps the existing commercial model memo unconditional and above every phase return; it remains `null` until its sources are ready. No exception is swallowed and no fallback UI was added. The regression renders the real GrowthHub Sales route, changes the mocked adapter from loading to ready, and rerenders the same React root.

## Production and provider evidence

- Production baseline revision: `f4022bad` on Vercel deployment `dpl_FYY5HMw8etmBi8feuwB7a43vtQYq` at investigation time.
- The production route returned the SPA document and its Sales, Solo shell, and transitive assets returned HTTP 200; this was not a missing-bundle or rewrite failure.
- Vercel server-runtime logs contained no corresponding error because the failure was a client-side React invariant.
- The owner-supplied blank-screen screenshot is classified as production symptom evidence only; it does not prove the console exception by itself.

## Scope, collisions, and review

- Affected flow: authenticated Solo owner → Campaigns shell → Sales → initial adapter loading → ready → approved Sales desk.
- Regression flow: all six Campaigns tabs remain ordered and mountable: Overview, Catalog, Sales, Pipeline, Social, Performance. Focused automation passes 220/220. The shared navigation browser drive passes 218/218 and mounted, reached, and selected every tab across both themes and all required widths with zero page errors or document overflow.
- Independent adversarial review: PASS on the hook-order diagnosis and same-instance regression. HIGH collision warning: active PR #905 rewrites the same two Sales files from a stale base and could resurrect the crash; it must be superseded or manually rebased after this hotfix. PRs #907 and #706 touch shared growth/Pipeline surfaces but do not overlap the hotfix files.
- Explicit exclusions: no Sales redesign, route change, tier change, migration, provider action, commercial computation change, or broad error boundary.

## Durable status and handoff

Current status before merge: `PARTIAL` — the code repair, full/static suites, and local route proof are green; PR CI, merge, exact deployment, and authenticated production proof remain outstanding. Existing Sales truth remains: Contracted `PARTIAL`; Actual received, Contract-pending, and scenario persistence `UNAVAILABLE`; authenticated production runtime `PROOF OWED`.

Next owning workstream: shared Solo post-login squeezed-dashboard hotfix. It must first read this record, the Sales Command Desk record, current `main`, and active shared-shell PR collisions; it should treat the owner screenshots as evidence that Command Center and Clients share an initial-login width/hydration defect, not as authority to patch either page locally.