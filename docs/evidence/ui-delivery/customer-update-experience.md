# Customer-facing update experience — UI delivery evidence

**Date:** 2026-09-07
**State:** MVP candidate; not merged or deployed
**Canonical surface:** existing signed-in `PlatformUpdateBanner`

## Contract and source

- The supplied screenshot established the existing banner as the visual and interaction source.
- Pack-first searches for update, release, version, reload, notice, announcement, banner, drawer, sheet, and popover found no pre-existing release UI to reuse.
- This change consumes the release-record schema and validator from the release-governance workstream; it creates no release record, release identity, feed, badge, page, modal, or dashboard.
- The built `dist/version.json` contained `customerUpdate: null`, proving the present checkout fails closed to the generic path.

## Deterministic component proof

The actual `PlatformUpdateBannerView` was rendered in a temporary Vite harness over a neutral owner-workspace backdrop. The harness used no provider connection or fabricated application data. The four frames covered both themes, Paige open/closed context, generic, approved-release, blocked-reload, expanded notes, and post-reload availability.

| Viewport | Theme / context | State | Result |
|---|---|---|---|
| 1536×770 | Obsidian / Paige closed | approved release, keyboard-expanded notes | PASS — 0 page overflow; 512×368.25 banner; all controls 44px high; no browser errors |
| 1366×768 | Mineral / Paige open | routine generic build | PASS — 0 page overflow; 512×115.75 banner; no public version or release language; no browser errors |
| 1024×768 | Obsidian / Paige closed | reload refused by active-work guard | PASS — explanatory copy remains in the banner; 0 page overflow; no browser errors |
| 900×1000 | Mineral / Paige open | post-reload release notes, keyboard-expanded | PASS — no second Reload action; 0 page overflow; all controls 44px high; no browser errors |

## Behavioral and static proof

- Resolver: 10/10 assertions pass for exact-build projection and missing, invalid, ambiguous, future, superseded, unapproved, and technically unsafe fail-closed paths.
- Banner/update hooks: 9/9 focused assertions pass for generic wording, approved identity, canonical details, post-reload availability, blocked reload, explicit dirty-work registration, no synthetic unload/presence side effect, manifest parsing, and editable-focus deferral.
- Release-governance guard: PASS; self-test 154/154.
- TypeScript ratchet: PASS with no new errors; repository baseline remains 13 pre-existing errors.
- Production build: PASS. Existing bundle-size and third-party annotation warnings remain non-blocking.
- Changed-file ESLint: PASS (0 errors; 7 pre-existing warnings in touched owner files).
- Local production preview: meaningful page content and 18 interactive elements rendered with no framework overlay. The local-only origin produced existing external analytics/auth 404, CORS, and unauthenticated 401 console responses, so a clean hosted preview console remains required before merge.

## Honest limitations

- Authenticated owner interaction, true tenant switching, native browser reload confirmation, exact deployed build identity, and production behavior are `PROOF OWED`.
- The harness proves component rendering and geometry, not authenticated application data or deployment.
- No merge, deployment, customer release record, customer announcement, or go-live approval is claimed by this evidence.
