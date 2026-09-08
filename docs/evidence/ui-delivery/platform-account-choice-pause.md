# UI delivery evidence: Platform account-choice pause

Owner decision 2026-09-07: after sign-in, Platform staff must pause at the existing account chooser and deliberately select Platform or one of their directly authorized Paige workspaces. The retired `/admin` route is not a fallback.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: grounded current main `2719d7d86ccfa23d0e781b841b5ee134ec8e7276`, repository instructions, open PRs, Master Reference Section 4 and account-picker record, Second Brain decisions, tier/route contracts, prior route-retirement closeout, and the real chooser/auth implementation before resuming
PAIGE_UI_DESIGN: PASS: repository skill, pinned frontend-design core, accessibility checklist, Paige quality gates, and review/testing reference read completely; the approved flow reuses the existing chooser and Paige tokens
MATERIAL_FLOW_CHANGE: YES: Platform staff change from automatic Platform routing to a required deliberate context choice after sign-in
FLOW_PROTOTYPE: PASS: the owner directly approved the complete interaction contract in this workstream; the existing chooser is the approved production container and the prototype is absorbed into its deterministic component tests, with no throwaway route or mock surface retained
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: Platform staff choose their intended operating context after authenticating; non-platform people retain established membership routing
VISUAL_DIRECTION: PASS: preserve the existing full-page Secure workspace access chooser, hierarchy, controls, themes, focus treatment, and responsive behavior; add only the Platform option and conditional explanatory copy
AUTOMATED_EVIDENCE: PARTIAL: 105/105 focused tests pass on the rebased head. The 3,955-test repository sweep completed 3,954 assertions and exposed one unrelated removal-dialog timing failure; that exact assertion passed immediately in isolation. Exact-head CI remains required before merge and supersedes this contention-affected local sweep.
STATIC_EVIDENCE: PASS: affected-file ESLint has 0 errors (one inherited Auth hook warning); TypeScript ratchet 13 baseline/13 current; production build, retired-route scan, release-governance lint, regression lint, sensitive-data scan, and diff integrity pass. Repository-wide `npm run lint` remains baseline-red with 1,839 errors in unrelated legacy files and is not presented as green.
RENDERED_EVIDENCE: PASS: real ChooseAccount component with production styles at 1536x770, 1366x768, 1024x768, and 900x1000 in Mineral and Obsidian; 8 durable PNGs and report.json under docs/evidence/ui-delivery/platform-account-choice-pause/
BEHAVIORAL_EVIDENCE: PASS: deterministic real-browser drive is 90/90, including Platform-only, staff with direct memberships, ordinary one-account entry, no-choice failure, inaccessible selection, membership/account-authority failure and Retry, safe deep-link recovery after choice, direct workspace switch, and refresh
AUTHENTICATED_RUNTIME: UNVERIFIED: no signed-in production Platform or tenant identity has yet exercised the final deployed revision
KEYBOARD_FOCUS: PASS: first Tab focuses Platform at all eight theme/viewport combinations; semantic native buttons and labelled main section are present
ZOOM_REFLOW: PASS: 200% text-size browser drive at 900x1000 retains the Platform action with no horizontal overflow
REDUCED_MOTION: PASS: every browser context uses reduced motion and the accessibility contract confirms the media preference is active
STATE_COVERAGE: PASS: implementation/tests cover Platform-only staff, multi-account staff, non-platform one-account entry, no valid membership, read failure/retry, inaccessible selection, deep-link chooser entry, refresh, workspace switch, unsaved-work refusal, and no retired-route fallback
TRUTHFUL_STATE_LABELS: PASS: the chooser claims only Platform authority already resolved by the server and direct active memberships returned through existing RLS-bound reads; failures do not imply access changes
SOLO_UI: NO: this is the shared authentication/account-entry chooser before any Solo shell mounts
UNVERIFIED: authenticated production Platform selection, direct-workspace selection, refresh, and refusal remain proof owed until the exact deployed revision is driven with authorized identities. The chooser calls the existing registered unsaved-work guard before changing context; registrations for unrelated forms, chat, uploads, streaming, and Studio were not expanded or re-proven in this narrowly scoped auth repair.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: pending exact merge SHA; deployment=pending; environment=production candidate; migrations=NOT_APPLICABLE; edge=NOT_APPLICABLE; evidence=this record plus CI and rendered artifacts
RELEASE_CHANNEL: internal build: no staged customer release identity; normal production deployment after exact-head green review
RELEASE_CLASSIFICATION: patch: restores the owner-approved authentication choice without adding a new product surface
CUSTOMER_RELEASE_IDENTITY: none: this authentication repair does not independently earn a customer-facing release record
RELEASE_NOTE_REQUIRED: no: generic build freshness only
RELEASE_TRUTH_BOUNDARY: PARTIAL until deployed; local automated/static/rendered claims are recorded separately; authenticated production behavior remains PROOF OWED
RELEASE_RECOVERY: position=frontend rollback to prior production deployment; reference=normal Vercel deployment recovery for a migration-free patch

## Scope and collisions

- Classification: R3 authentication/context selection; Deep assurance and independent review required.
- Affected flows: `/auth` post-identity routing → `/choose-account` → Platform or direct Paige workspace; chooser refresh; account switch; inaccessible selection and retry.
- Neighboring regressions: non-platform one-membership direct entry, multi-membership selection, workspace-scoped state clearing, unsaved-work guard, operator authorization, canonical tier routes.
- Active-owner/file collisions: none across 31 open PRs at initial grounding. Before delivery, `origin/main` advanced from `531045004aa306beecb669b31c385c779c76c4b8` to `2719d7d86ccfa23d0e781b841b5ee134ec8e7276` through PR #1054. That delivery overlaps only additive canonical documentation and public-home routing, not the auth implementation; its shipped-reference additions are preserved during rebase.
- Explicit exclusions: logout behavior, Google identity chooser behavior, tenant/role/billing/account management, operator permissions, new routes, `/admin` compatibility, migrations, provider work.

## User job and state map

Goal: authenticate once, then consciously choose Platform or the directly authorized Paige workspace in which to work.
Human and feel: a Platform operator who may also own or support Paige accounts; deliberate, clear, and safe rather than surprising.
Entry and exit: `/auth` after identity resolution enters `/choose-account`; Platform exits tenant scope then enters `/operator/fleet`; a workspace enters its canonical tier root; unresolved states stay on the chooser.
System: existing responsive full-page chooser, Paige Command Mark, established Mineral/Obsidian tokens, native buttons, one page scroll owner.
Signature: Platform appears as an explicit peer operating-context choice, visually distinguished by the existing shield icon without implying tenant membership.
Feedback: inline loading/error states and disabled duplicate actions; no new motion or haptics.
Rejecting: automatic Platform routing and any retired `/admin` fallback; no second account-management surface.
Variants: Platform-only staff, staff with memberships, ordinary multi-account and one-account users, and no-access/error states.

| From | Trigger | Guard or input | To | Feedback | Recovery or exit |
|---|---|---|---|---|---|
| Authenticated sign-in | identity resolves | Platform authority true | Chooser | loading then Platform/direct memberships | choose context or different Google identity |
| Chooser | Platform | unsaved-work guard and audited null-scope switch succeed | `/operator/fleet` | disabled/busy during transition | failure stays with current context unchanged |
| Chooser | Paige workspace | direct active membership, enterable tenant, guard and switch succeed | canonical tier root | disabled/busy during transition | failure stays with current context unchanged |
| Chooser | membership read fails | no trustworthy choice set | error + Retry | honest access-unchanged copy | retry or different Google identity |
| Chooser | no valid membership | non-Platform identity | fail-closed guidance | no guessed tenant or redirect | different Google identity or support |
| Chooser | refresh/deep link | authenticated Platform identity | same chooser | no auto-selection | deliberate choice remains required |

## Evidence index

Local browser evidence: `scripts/live-drive/account-choice-drive.mjs` → 90/90 PASS. Durable artifacts: `docs/evidence/ui-delivery/platform-account-choice-pause/{1536x770,1366x768,1024x768,900x1000}-{mineral,obsidian}.png` plus `report.json`. All identities and account names are synthetic (`example.invalid`, Example Studio, Northstar Advisors); the sensitive-data scan found no credential, token, private customer content, or internal secret. Final PR, CI, merge, deployment, and production proof are appended before closeout.

## Review and limitations

Independent spec/security and code-quality re-reviews: PASS, no remaining must-fix finding. Authenticated production proof remains `PROOF OWED` unless authorized identities exercise the exact deployed revision.
