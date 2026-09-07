# UI delivery evidence: Paige loading brand hotfix

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: focused packet covered hard refresh, direct protected-route load, update-triggered reload, chunk recovery, booking-route neutral exception, splash dismissal, and theme/viewport regressions
PAIGE_UI_DESIGN: PASS: repository Paige UI Design instructions plus upstream platform, accessibility, quality, and review references were read before implementation
MATERIAL_FLOW_CHANGE: NO: presentation-only correction reuses the approved mark without changing goals, actions, state transitions, exits, timing, or consequences
FLOW_PROTOTYPE: NOT_REQUIRED: exact approved asset substitution on an existing loading state introduced no new interaction or product decision
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: authenticated Paige owners should see current Paige identity while waiting; there is no loading-screen action
VISUAL_DIRECTION: PASS: reused `src/components/brand/PaigeCommandMark.tsx` and `src/components/brand/paige-command-mark.css`; retained the dark cover, Paige wordmark, sizing, timing, and motion behavior
AUTOMATED_EVIDENCE: PASS: `npx vitest run src/components/brand/PaigeBootSplash.test.tsx src/components/PlatformUpdateBanner.test.tsx src/components/PlatformUpdateBanner.focus.test.tsx` — 3 files and 9 tests passed
STATIC_EVIDENCE: PASS: changed-file ESLint and `git diff --check` passed; `npm run build` passed; `npm run ci:tsc` passed with baseline 13/current 13; `npm run ci:regression`, `lint:legacy-mark`, `lint:skeleton`, and `lint:release-governance` passed
RENDERED_EVIDENCE: PASS: `docs/evidence/ui-delivery/paige-loading-brand-hotfix/after-1536x770-mineral.png`, `after-1366x768-obsidian.png`, `after-1024x768-mineral.png`, and `after-900x1000-obsidian.png`; canonical geometry present and legacy classes absent at each size
BEHAVIORAL_EVIDENCE: PASS: local production build on `/solo/1971670/growth/sales`; with the 1.059 MB main application asset aborted, canonical=1, old=0, splashVisible=true; normal protected-route load dispatched teardown once; reload primitive and update-banner unit regressions passed
AUTHENTICATED_RUNTIME: UNVERIFIED: the existing authenticated desktop browser session was unavailable after two control-runtime failures; protected-route testing therefore covered the pre-auth boot state and redirect boundary, not an authenticated banner click
KEYBOARD_FOCUS: PASS: loading cover has no interactive controls, exposes `role=status` with `aria-label=Loading`, and creates no focus target or focus movement
ZOOM_REFLOW: PASS: 200 percent browser zoom and compact 900x1000 rendering produced no horizontal overflow; the 132x132 mark remained centered and reachable
REDUCED_MOTION: PASS: reduced-motion media emulation disabled splash stage/word animations and the canonical component's animated class behavior remained governed by its existing stylesheet
STATE_COVERAGE: PASS: hard/direct load, cold main-bundle delay, normal dismissal, reload, Mineral, Obsidian, reduced motion, compact width, and booking-route no-host exception covered
TRUTHFUL_STATE_LABELS: PASS: no capability or availability claim was added; the existing Loading status remained unchanged
SOLO_UI: NO: the changed surface is the route-agnostic pre-hydration platform cover, not a Solo workspace interface; a Solo Growth to Sales route was used only as the required ordinary-route regression target
UNVERIFIED: authenticated reload-after-update banner click and real browser relaunch remain unverified because the authenticated browser-control runtime was unavailable; the same `window.location.reload()` primitive is covered by unit and built-browser evidence

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 9fd69254d3fbe117c3929f147ed8039432b1a070; deployment=local-production-preview-4173; environment=development; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=the built entry paints the canonical chunk before dynamically importing the full app chunk
RELEASE_CHANNEL: development: local production-build evidence complete; owner explicitly requested subsequent production release on 2026-09-07; monitoring-owner=release agent; recovery=revert implementation commit if live verification fails
RELEASE_CLASSIFICATION: patch: narrow replacement of an incorrect loading-screen brand mark with no customer workflow or data-contract change
CUSTOMER_RELEASE_IDENTITY: none: internal branding correction does not create a named customer release
RELEASE_NOTE_REQUIRED: NO: invisible-to-workflow branding correction with no owner action or changed capability
RELEASE_TRUTH_BOUNDARY: PARTIAL: local build and browser proof are complete; PROOF OWED for authenticated update-banner click and production deployment until post-merge verification
RELEASE_RECOVERY: position=revert-before-forward-fix for any loading regression; reference=final implementation commit 9fd69254d3fbe117c3929f147ed8039432b1a070

## Scope and collisions

- Classification: narrow global boot/loading presentation hotfix.
- Affected flows: hard refresh, direct route boot, chunk-recovery reload, service-worker/update reload, and shared splash dismissal.
- Neighboring regressions: Platform Update Banner action/focus, booking-page neutral cover, app mount, theme preference fallback, reduced motion, and compact reflow.
- Active-owner/file collisions: none; open-PR file-path comparison found no collision on `index.html`, `src/main.tsx`, `src/boot-splash.tsx`, the canonical brand component/style, `vite.config.ts`, or update-banner files.
- Explicit exclusions: shell redesign, update-banner behavior, chat, Live Voice, Secure Browser, Skills, Tenant Brain, data/provider work, and broad brand refresh.

## User job and state map

The owner waits through the non-interactive platform boot cover. The canonical Paige Command Mark is painted synchronously, the full application graph starts as a dynamic import, the existing double-animation-frame plus 550 ms hold runs, and the existing 700 ms fade completes before one teardown signal unmounts the mark and removes the cover. Failure to load the main graph leaves the correctly branded status cover visible. Booking routes synchronously remove the branded host and retain their established neutral presentation.

## Evidence index

- Before: `docs/evidence/ui-delivery/paige-loading-brand-hotfix/before-1366x768-obsidian.png` at 1366x768; old `.psx-plate/.psx-slash/.psx-dot` geometry present.
- After: four viewport/theme artifacts listed above, plus `after-built-main-blocked-1366x768.png` and `relaunch-to-update-1366x768-obsidian.png`.
- Route: `/solo/1971670/growth/sales`; anonymous pre-auth boundary; no customer-sensitive content captured.
- Built artifact: entry `main-DXre5xPo.js` synchronously mounts the isolated canonical command-mark chunk and then dynamically imports `main-BK6Fcy2o.js`; aborting the latter left the canonical mark visible.
- Theme results: Mineral uses the canonical light token treatment; Obsidian uses the canonical dark token treatment; neither reintroduces legacy splash geometry.
- Security review: no hotfix-blocking issue; unchanged dependency advisories remain tracked outside this patch.

## Review and limitations

Independent code review identified and blocked a first draft whose production optimizer made the full app graph a boot prerequisite. The repair changed the app start to a post-paint dynamic import and isolated the existing canonical component/style as a small shared chunk. Built-asset blocking then passed. Independent security review found no hotfix-specific regression. Authenticated update-banner clicking and a native relaunch remain `UNVERIFIED`; neither is represented as production proof.
