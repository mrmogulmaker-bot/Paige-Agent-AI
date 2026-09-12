# Solo Beta acquisition — Gate A affected-flow and collision record

Status: GATE A REVIEW CANDIDATE — NOT MERGED OR DEPLOYED

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: This record's affected-flow and state maps cover public entry, identity, intake/agreement, fixed checkout, atomic fulfillment, verified entitlement, recovery, current-Solo routing, and preservation of existing non-Solo access.
PAIGE_UI_DESIGN: PASS: Read the complete `.agents/skills/paige-ui-design/SKILL.md` bundle and applied the existing Paige tokens, accessibility checklist, and approved Gate B interaction direction.
MATERIAL_FLOW_CHANGE: YES: Replaces unsafe and obsolete enrollment paths with one paid Solo journey and intentional pending, failure, cancellation, retry, expiry, and recovery states.
FLOW_PROTOTYPE: PASS: The owner's 2026-09-12 Beta Activation Gate B instruction approved the complete customer-visible interaction contract and this record's deterministic state map before production implementation.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: A new Solo founder follows one obvious action from the public offer through identity, checkout verification, and the server-authorized current Solo workspace.
VISUAL_DIRECTION: PASS: Existing Paige premium dark/mineral themes, typography, command mark, restrained progress motion, and one-primary-action hierarchy were preserved under the approved Gate B direction.
AUTOMATED_EVIDENCE: PASS: Exact-head focused Vitest 63/63 and `ci:regression` passed; the whole-repository run reached 306/309 files and 4247/4265 tests, with 18 failures confined to untouched Settings, Game Plan, and Resend tests and disclosed separately below.
STATIC_EVIDENCE: PASS: Local production build for code head `67b2443b7bf6c883790db47dc69cea703f24c820`, 12/12 TypeScript ratchet, migration-version, definer, managed-schema, tier, Binding Ledger, release-governance, shadowed-credential, user-facing-admin-URL, and diff-integrity checks passed. Raw repository `tsc` still reports the 12 recorded current-main baseline errors; Deno execution is unavailable on this host and is not claimed.
RENDERED_EVIDENCE: PASS: The real local application passed 144/144 browser checks across Home, Pricing, Auth, retired-route recovery, and checkout-return recovery at all four required viewports in both themes. The run clicked the actual JavaScript CTAs, found no horizontal overflow or uncaught page errors, kept primary actions reachable, exposed visible keyboard focus, allowed zoom, and stopped decorative animation under reduced motion. Screenshots and the machine report are generated under the existing gitignored live-drive artifact home; pixel-level manual inspection was unavailable and remains outside this PASS.
BEHAVIORAL_EVIDENCE: PASS: Signed-out public Home/Pricing/Auth routes, exact paid-offer copy, canonical CTA transitions, retired-route recovery, checkout cancel/failure/expiry/recovery, visible keyboard focus, and reduced-motion behavior were driven in Chromium; authenticated and provider-backed outcomes were not represented as passed.
AUTHENTICATED_RUNTIME: UNVERIFIED: This host exposes only the production Supabase project connection. The approved Gate B contract forbids using it, and no approved non-production project connection or test identity is available to exercise real Solo provisioning, entitlement readback, or current-shell entry.
KEYBOARD_FOCUS: PASS: Keyboard traversal showed visible focus on the public Pricing and Auth actions at the required structural viewport checks.
ZOOM_REFLOW: UNVERIFIED: Pinch zoom is allowed by the viewport metadata, but a complete 200 percent zoom and reflow drive was not performed.
REDUCED_MOTION: PASS: With reduced motion requested, Auth decorative loops and entrance motion stopped and the browser reported no running decorative animations.
STATE_COVERAGE: PASS: Public offer, signup/sign-in, identity recovery, checkout wait/cancel/failure/expiry/retry, and safe exits are represented and each has a viable next action.
TRUTHFUL_STATE_LABELS: PASS: Public copy names Solo Beta only, treats a browser return as untrusted, and distinguishes in-progress, confirmed, failed, and recovery states.
SOLO_UI: YES: Public Solo Beta Pricing, Auth, Welcome verification, onboarding continuation, and current-Solo handoff are affected.
UNVERIFIED: Authenticated tenant provisioning and current-shell entry could not run without an approved non-production identity/database/provider environment. Stripe CLI/test credentials, a non-production Supabase connection, provider behavior, and pixel-level manual screenshot review were unavailable.
SOLO_1536X770_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_1536X770_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.
SOLO_1366X768_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_1366X768_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.
SOLO_1024X768_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_1024X768_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.
SOLO_900X1000_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_900X1000_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: 67b2443b7bf6c883790db47dc69cea703f24c820; deployment=NOT_DEPLOYED; environment=local; migrations=PROOF_OWED(non-production_database_connection_unavailable); edge=PROOF_OWED(no_approved_non-production_provider_deployment); evidence=docs/evidence/ui-delivery/solo-beta-acquisition.md
RELEASE_CHANNEL: development: local build and structural browser evidence only; no preview, staged, or production promotion was performed.
RELEASE_CLASSIFICATION: internal-only: Gate A review candidate with authenticated, provider, migration, deployment, and owner acceptance unavailable.
CUSTOMER_RELEASE_IDENTITY: none: no owner-approved customer release identity exists for this unmerged local candidate.
RELEASE_NOTE_REQUIRED: NO: internal-only candidate with no deployment or customer release identity.
RELEASE_TRUTH_BOUNDARY: PARTIAL: focused automated, static, local build, and public structural browser evidence passed; authenticated, provider, migration, pixel-review, deployment, and owner acceptance remain unavailable.
RELEASE_RECOVERY: position=do-not-merge-or-deploy; reference=PR #1148 and docs/evidence/ui-delivery/solo-beta-acquisition.md
## Intended usable outcome

A legitimate new customer can enter through any public Paige conversion path, create or resume a verified identity, persist the Solo intake and current agreement, complete the approved $74.50/month Stripe test-mode checkout, and only after signed payment receive an atomic standalone tenant, owner membership, subscription, entitlement, and fulfillment receipt before landing in `/solo/{server-resolved account_number}/command-center`; interruption never creates duplicates or routes the customer into `/app`, while existing authorized non-Solo users retain their current server-derived access.

## Compact design brief

- Goal: become an authorized paid Paige Solo Beta customer without ambiguity or duplication.
- Human and feel: founder-led Solo operator; calm, premium, deliberate, and trustworthy.
- Entry and exit: public CTA or direct `/signup` to current Solo Command Center after verified entitlement.
- System: Paige public/auth surfaces, existing tokens and controls, one-page state focus, both supported themes.
- Signature: a single truthful readiness line that advances from identity to checkout to a verified workspace.
- Feedback: short opacity/state transitions only; progress is announced and never masks a timeout.
- Rejecting: generic pricing grids and browser-asserted payment success.
- Variants: new Solo enrollment is singular; existing authorized multi-account and non-Solo routing is preserved.

## Affected-flow map

| Actor goal | Entry | Server-authoritative seams | Successful exit | Failure/recovery |
| --- | --- | --- | --- | --- |
| Discover the available beta | Home, pricing, marketing CTA, direct signup | Public Solo offer contract | Solo signup/sign-in intent | Unsupported enrollment receives an intentional Solo-only explanation |
| Establish identity | Email/password or configured OAuth | Supabase Auth session and callback continuation | Pending Solo enrollment | Verification pending/expired, denied consent, duplicate identity, provider failure, retry |
| Stage Solo setup | Authenticated pending enrollment | `auth.uid()`, `signup_intake`, exact current `saas-standalone` acceptance | Checkout-eligible intake; no tenant yet | Safe resume; no planless/free fallback |
| Subscribe | Verified identity plus staged intake/agreement | Server-selected test Price, Stripe Checkout, signed metadata and stable idempotency slot | Signed paid provider result awaiting fulfillment | Cancel, expiry, provider failure, retry, duplicate request |
| Fulfill and verify access | Signed paid webhook, checkout return, refresh, sign-in, deep link | One atomic transaction creates tenant + owner membership + subscription + entitlement + receipt; fresh receipt/billing/membership readback | Canonical current Solo destination | Delayed webhook, stale state, payment failure, support reference |
| Begin using Paige | Current Solo Command Center | Server-resolved tenant/tier/capability truth | Honest first setup action | Unavailable domains remain labeled and non-actionable |

## State and transition map

| From | Trigger / guard | To | Container and feedback | Recovery / exit |
| --- | --- | --- | --- | --- |
| Public Solo offer | Start Solo Beta | Auth with preserved Solo continuation | Page; primary action receives visible busy state | Return to public offer |
| Auth | Valid identity result | Identity verified or verification pending | Page; status region announced | Resend, retry provider, sign in existing identity |
| Verified identity | Server confirms no existing authorized destination | Stage Solo intake and current agreement | Page; validation and persisted intake | Retry safely or contact support |
| Checkout-eligible intake | Server confirms the exact fixed offer | Checkout handoff | Page to provider-hosted checkout; no tenant exists yet | Cancel returns to useful Solo offer state |
| Signed paid provider result | Immutable actor, customer, session, and offer checks pass | Atomic fulfillment and readback | Tenant, owner membership, subscription, entitlement, and receipt commit together | Transaction rollback and safe provider retry |
| Checkout return | Browser reports success only | Verification pending | Page; never says paid/confirmed | Refresh-safe poll, retry readback, support |
| Verification pending | Server confirms active paid entitlement | Verified | Success announcement | Continue to current Solo shell |
| Verification pending | Failed, expired, or timed out | Failure or delayed state | Plain-language error/status | Retry payment/readback or support |
| Any interrupted state | Refresh, new tab, sign-in, deep link | Server-reconstructed current state | Same canonical page/state | No local-storage authority |
| Existing authorized non-Solo identity | Sign-in/deep link | Existing account-choice or authorized shell contract | Existing destination | Never auto-provision or migrate to beta |

Motion: state regions use a 160ms opacity transition with no spatial dependency; interruptions retarget immediately. Under `prefers-reduced-motion`, state changes are immediate. The state heading labels the page, triggering controls retain ordinary focus, and asynchronous verification changes use a polite live region. A dedicated assertive confirmed-access announcement is not claimed; verified access immediately follows the server-authorized destination.

## Collision assessment before implementation

Initial base: `299c39b2bc6c10eb0440ce415a626fb0d534f5ca` from fresh `origin/main` on 2026-09-12. Final reconciliation base: `6aa077d04b47e4823f642a08cb2305d03dd02696`; the branch was rebased after the later current-main Harness governance delivery, preserving both additive Master/Brain histories. Verified code head before this evidence-only closeout: `67b2443b7bf6c883790db47dc69cea703f24c820`.

- PR #899 owns deterministic ordering for same-second payment-setup confirmations plus its Master/Brain/tier closeout. This branch will not modify `20261200000300_payment_setup_deterministic_order.sql` or `payment-setup-ordering-proof.sql`. Billing changes target the separate subscription-checkout/webhook/entitlement contracts. Shared Master and Brain updates must be additive and rebased before review.
- PR #724 owns canonical Solo shell resolution in `RequireSetupComplete`, `useTenantContext`, tier routing, `SoloEntry`, and related shell files. This branch treats `/solo/{server-resolved account_number}/command-center` as the downstream contract and will not replace its resolver or shell owner. Acquisition and post-entitlement routing call the canonical workspace-entry seam.
- Shared customer-flow files potentially affected: `src/App.tsx`, `src/pages/PaigeHome.tsx`, `src/pages/Pricing.tsx`, `src/pages/Auth.tsx`, `src/pages/GetStarted.tsx`, `src/pages/Onboarding.tsx`, `src/pages/Welcome.tsx`, `src/components/auth/RequireCompleteSignup.tsx`, `src/components/onboarding/WorkspaceProvisioner.tsx`, `src/lib/auth/signupPlanIntent.ts`, `src/lib/auth/workspaceEntry.ts`, `supabase/functions/platform-subscription-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts`, and new forward-only migrations.
- Shared records potentially affected: Master Project Reference Sections 4/5/7/10, Brain README/decision log, tier and billing records, and Surface Binding Ledger. Updates remain truthful about test mode, deployed production, provider proof, and owner acceptance.
- `create_contact` remains outside acquisition/provisioning execution, but the first-value regression collides with a fresh Solo owner: the prior global-role precheck rejected an owner holding only the base `user` role. The narrow boundary is repaired to authorize active tenant-scoped `owner/admin/super_admin/coach` membership, keep browser creator/tenant pinning, preserve platform-owner semantics, and require same-tenant service proof; no fake global admin role is granted.

## Security and regression boundaries

- Browser query parameters, route account numbers, metadata, and local storage never confer tenant or entitlement authority.
- Unsupported account-type input fails before provisioning or Stripe session creation.
- Existing tenants, memberships, products, subscriptions, and authorized non-Solo routes are read-only to this acquisition change.
- Checkout success is an untrusted hint; access requires server-side membership and paid-entitlement verification.
- Provisioning, checkout creation, and webhook fulfillment are idempotent and concurrency-tested.
- No live Stripe mutation, production credential use, production deployment, real charge, or existing-customer migration is authorized.

## Proof plan

- Automated: failing-first unit/integration tests for plan restriction, callbacks, provisioning idempotency, checkout selection, webhook replay/order, entitlement readback, canonical routing, and recovery.
- Static: typecheck, lint, build, secret/security scan, migration checks, RLS/definer audit.
- Rendered: both themes at 1536x770, 1366x768, 1024x768, and 900x1000; overflow, scroll owner, reachability, zoom/reflow, keyboard, focus, labels, contrast, and reduced motion.
- Authenticated: disposable new Solo user plus existing multi-account/non-Solo regression in an approved non-production environment.
- Payment/provider: Stripe test-mode success, cancellation, failure, expired session, retry, delayed/duplicate webhook, refresh, cancellation-at-period-end, and server readback.
- Deployed production and owner acceptance: PROOF OWED; no release claim before explicit final go-live approval.


## Gate A candidate reconciliation — 2026-09-12

- **Public acquisition (`PARTIAL`, candidate):** every reachable current public CTA and pricing entry presents Paige Solo Beta only at the approved `$74.50/month`; public Agency, Platform, Client Portal, sub-account, free, trial, annual, and planless enrollment choices are absent. Reachable homepage claims are limited to guided setup, drafts, review, and visibility; illustrative automatic sends, fulfilled testimonials, and Agency personas were removed.
- **Identity and return recovery (`VERIFIED` automated/static; authenticated runtime `PROOF OWED`):** public Solo uses ordinary Supabase signup and verification, never the pre-confirming `tenant-signup` service. A signed-out checkout-success return immediately offers `Sign in and resume`; it makes no payment claim. Expired/denied/provider callback states have useful recovery.
- **Provisioning and authorization (`VERIFIED` source/test contract; database execution `UNAVAILABLE` locally):** fulfillment is service-owned, fenced, atomic, idempotent, and limited to one top-level standalone tenant plus active owner membership. `create_contact` accepts that fresh owner through active tenant-scoped `owner/admin/super_admin/coach` membership; it does not require or mint a fake global admin role.
- **Billing (`VERIFIED` automated/static; Stripe test-mode acceptance `PROOF OWED`):** fixed offer code `paige-solo-beta-monthly-v1`, `$74.50`, monthly, USD, zero trial. Checkout uses a stable provider idempotency slot across stale lease recovery. Fulfillment requires a signed paid active subscription and exact current agreement. After fulfillment, status verifies receipt + immutable subscription + membership before acquisition-agreement checks, so agreement rotation cannot lock out a paid user. Lifecycle handling binds persisted product/price/customer/provider facts, accepts revoking `past_due/canceled/unpaid/paused` states, orders by provider `event.created`, and records one event receipt/evidence.
- **Destination (`VERIFIED` contract; authenticated runtime `PROOF OWED`):** only a verified server response may emit `/solo/{server account_number}/command-center`, and the browser allowlist accepts only `^/solo/[0-9]+/command-center$`. Existing authorized non-Solo access remains on the canonical resolver/account-choice contract.
- **Accessibility/rendered (`VERIFIED` structural and interaction; manual pixel review `PROOF OWED`):** the real local app passed 144/144 browser checks over Home, Pricing, Auth, legacy recovery, and checkout recovery at `1536×770`, `1366×768`, `1024×768`, and `900×1000` in both supported themes. There was no horizontal overflow or uncaught browser error, actual CTAs reached the canonical flow, keyboard focus was visible, zoom remained enabled, and reduced-motion mode had no running decorative animations. Pixel-level manual screenshot inspection, authenticated behavior, and provider-backed rendering remain `PROOF OWED` and are not included in the verified claim.
- **Collision reconciliation:** PR #899's deterministic same-second payment-setup ordering remains carried forward and untouched; this flow adds a separate Solo subscription lane. PR #724's server-derived canonical Solo destination remains carried forward. Only its obsolete public-acquisition detours through generic `/app`/account choice are superseded for a new Solo enrollment; existing authorized multi-account and non-Solo behavior is retained.
- **Not performed:** no Stripe product/price/configuration mutation, OAuth configuration mutation, charge, live webhook call, migration apply, deployment, merge, or production access change.

### Evidence by category

- **Automated — VERIFIED for new scope:** focused Vitest `63/63`; `ci:regression` passes. **Whole repository — PARTIAL:** exact-head Vitest `306/309` files and `4247/4265` tests, with 18 failures in untouched Settings, Game Plan, and Resend tests. Those failures are not represented as green.
- **Static/security — VERIFIED for new scope:** production build; TypeScript CI ratchet `12 baseline / 12 current`; migration version `1019` with no reuse; definer, managed-schema, tier-feature, Binding Ledger, release-governance, shadowed-credential, user-facing-admin-URL, and diff-integrity checks. **Raw repository checks — inherited failing:** `tsc` has the 12 ratcheted current-main errors; ESLint has 2,055 repository-wide issues; gold discipline has the untouched Business Credit finding; view security fails on the current-main `paige_unclassified_inbound` migration. Deno is not installed, so Deno execution is `UNAVAILABLE`, not passed.
- **Rendered — VERIFIED for the signed-out local flow:** 144/144 checks at four viewports × two themes across actual Home, Pricing, Auth, legacy recovery, and checkout recovery. Screenshots and JSON were produced under `scripts/live-drive/artifacts/solo-beta-acquisition/` and remain gitignored. Manual pixel inspection is `PROOF OWED` because the available image-inspection and interactive-browser tools failed on this host.
- **Authenticated — PROOF OWED:** disposable new Solo identity, existing non-Solo preservation, refresh/deep-link/account-switch in an approved non-production environment. The only configured Supabase connection was confirmed as production and was not used.
- **Payment/provider — UNAVAILABLE / PROOF OWED:** Stripe CLI and test credential names are absent on this host. No Product, Price, webhook, Checkout Session, Subscription, charge, cancellation, or provider mutation was performed. Safe test success/cancel/failure/expiry/retry/delayed/duplicate-webhook and provider readback remain owed.
- **Database/migration — UNAVAILABLE locally:** no approved non-production Supabase connection was present. The available project reference is the canonical production project and was deliberately not queried or mutated for Gate B. pgTAP and forward migration execution are not claimed.
- **PR #1148 database-contract — PROOF OWED behind current-main replay health:** current main records issue #1155 for the pre-existing fresh-migration replay conflict in Social schema history, which prevents a clean replay from reaching the later Solo migrations. This branch does not alter that separate Social history; every Solo migration remains unexecuted against a real database and no database proof is claimed.
- **Deployed production — UNVERIFIED. Owner acceptance — UNVERIFIED.** Explicit owner go-live approval is required before merge or deployment.
