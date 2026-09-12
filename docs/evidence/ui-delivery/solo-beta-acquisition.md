# Solo Beta acquisition — Gate A affected-flow and collision record

Status: GATE A REVIEW CANDIDATE — NOT MERGED OR DEPLOYED

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: This record's affected-flow and state maps cover public entry, identity, intake/agreement, fixed checkout, atomic fulfillment, verified entitlement, recovery, current-Solo routing, and preservation of existing non-Solo access.
PAIGE_UI_DESIGN: PASS: Read the complete `.agents/skills/paige-ui-design/SKILL.md` bundle and applied the existing Paige tokens, accessibility checklist, and approved Gate B interaction direction.
MATERIAL_FLOW_CHANGE: YES: Replaces unsafe and obsolete enrollment paths with one paid Solo journey and intentional pending, failure, cancellation, retry, expiry, and recovery states.
FLOW_PROTOTYPE: PASS: The owner's 2026-09-12 Beta Activation Gate B instruction approved the complete customer-visible interaction contract and this record's deterministic state map before production implementation.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: A new Solo founder follows one obvious action from the public offer through identity, checkout verification, and the server-authorized current Solo workspace.
VISUAL_DIRECTION: PASS: Existing Paige premium dark/mineral themes, typography, command mark, restrained progress motion, and one-primary-action hierarchy were preserved under the approved Gate B direction.
AUTOMATED_EVIDENCE: PASS: Focused Vitest 23/23, dedicated Deno 16/16, and `ci:regression` passed; whole-repository baseline failures remain separately disclosed below.
STATIC_EVIDENCE: PASS: Local production build for `c971226413aaa06fa9853934bbe03fa22b3241dd`, project typecheck, Deno checks for all three dedicated Edge handlers, 13/13 TypeScript ratchet, Binding Ledger lint, and diff integrity passed.
RENDERED_EVIDENCE: PASS: Structural browser checks covered Pricing and Auth at all four required viewports in both themes with no horizontal overflow or nested scroll and reachable primary CTA; pixel-level screenshot inspection was unavailable and remains outside this PASS.
BEHAVIORAL_EVIDENCE: PASS: Signed-out public Pricing/Auth routes, intentional state labels, CTA reachability, visible keyboard focus, and reduced-motion behavior were exercised structurally; authenticated and provider-backed outcomes were not represented as passed.
AUTHENTICATED_RUNTIME: UNVERIFIED: No approved non-production authenticated account and provider environment was available to exercise real Solo provisioning, entitlement readback, or current-shell entry.
KEYBOARD_FOCUS: PASS: Keyboard traversal showed visible focus on the public Pricing and Auth actions at the required structural viewport checks.
ZOOM_REFLOW: UNVERIFIED: Pinch zoom is allowed by the viewport metadata, but a complete 200 percent zoom and reflow drive was not performed.
REDUCED_MOTION: PASS: With reduced motion requested, Auth decorative loops and entrance motion stopped and the browser reported no running decorative animations.
STATE_COVERAGE: PASS: Public offer, signup/sign-in, identity recovery, checkout wait/cancel/failure/expiry/retry, and safe exits are represented and each has a viable next action.
TRUTHFUL_STATE_LABELS: PASS: Public copy names Solo Beta only, treats a browser return as untrusted, and distinguishes in-progress, confirmed, failed, and recovery states.
SOLO_UI: YES: Public Solo Beta Pricing, Auth, Welcome verification, onboarding continuation, and current-Solo handoff are affected.
UNVERIFIED: Authenticated tenant provisioning and current-shell entry could not run without an approved non-production identity/database/provider environment; Stripe provider behavior and pixel-level screenshot review were also unavailable.
SOLO_1536X770_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_1536X770_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.
SOLO_1366X768_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_1366X768_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.
SOLO_1024X768_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_1024X768_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.
SOLO_900X1000_PAIGE_CLOSED: PASS: Pricing and Auth structural checks in both themes found no horizontal overflow or nested scroll and kept the primary action reachable.
SOLO_900X1000_PAIGE_OPEN: NOT_APPLICABLE: Public acquisition does not mount the Paige panel; authenticated current-shell panel geometry is owned and proven separately.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: c971226413aaa06fa9853934bbe03fa22b3241dd; deployment=NOT_DEPLOYED; environment=local; migrations=PROOF_OWED(non-production_database_connection_unavailable); edge=PROOF_OWED(no_approved_non-production_provider_deployment); evidence=docs/evidence/ui-delivery/solo-beta-acquisition.md
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

Base: `299c39b2bc6c10eb0440ce415a626fb0d534f5ca` from fresh `origin/main` on 2026-09-12.

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
- **Accessibility/rendered (`PARTIAL`):** completed structural browser checks cover Pricing and Auth at `1536×770`, `1366×768`, `1024×768`, and `900×1000` in both supported themes. They found no horizontal overflow or nested scrolling, the primary CTA remained reachable, keyboard focus was visible, and reduced-motion mode had no running decorative animations. Axe reported 0 violations with one incomplete manual contrast-review bucket. Pinch zoom is permitted and the Auth separators use the compliant foreground token. Pixel-level screenshot inspection, authenticated behavior, and provider-backed rendering remain `PROOF OWED`, so rendered status stays `PARTIAL`.
- **Collision reconciliation:** PR #899's deterministic same-second payment-setup ordering remains carried forward and untouched; this flow adds a separate Solo subscription lane. PR #724's server-derived canonical Solo destination remains carried forward. Only its obsolete public-acquisition detours through generic `/app`/account choice are superseded for a new Solo enrollment; existing authorized multi-account and non-Solo behavior is retained.
- **Not performed:** no Stripe product/price/configuration mutation, OAuth configuration mutation, charge, live webhook call, migration apply, deployment, merge, or production access change.

### Evidence by category

- **Automated — VERIFIED for new scope:** focused Vitest `23/23`; dedicated Deno tests `16/16`; `ci:regression` passes. **Whole repository — PARTIAL/baseline failures:** Vitest `299/302` files and `4157/4175` tests, with 18 failures in untouched Settings/Game Plan/Resend fixtures.
- **Static — VERIFIED for new scope:** project TypeScript check, Deno check for all three dedicated Edge functions, TypeScript CI ratchet `13 baseline / 13 current`, Binding Ledger lint, and `git diff --check` (warnings only, no errors). **Whole-repository ESLint — baseline failing:** 1,805 existing errors; no all-repo lint-green claim.
- **Rendered — PARTIAL:** four-viewport, both-theme structural checks for Pricing/Auth are complete with no overflow/nested-scroll or reduced-motion failures and axe 0 violations; one incomplete manual contrast bucket plus pixel-level screenshot inspection, authenticated, and provider proof remain owed.
- **Authenticated — PROOF OWED:** disposable new Solo identity, existing non-Solo preservation, refresh/deep-link/account-switch in approved environment.
- **Payment/provider — PROOF OWED:** safe Stripe test success/cancel/failure/expiry/retry/delayed/duplicate webhook and provider readback.
- **Database/migration — UNAVAILABLE locally:** no local PostgreSQL service; pgTAP and forward migration execution not claimed.
- **PR #1148 database-contract — BLOCKED before Solo migrations:** current-main `20270117000000_social_operations.sql` attempts to index the missing `public.paige_social_posts.tenant_id` column before any new Solo migration is reached. This is a pre-existing Social schema/workstream failure; every Solo migration in this candidate remains unexecuted and no database proof is claimed.
- **Deployed production — UNVERIFIED. Owner acceptance — UNVERIFIED.** Explicit owner go-live approval is required before merge or deployment.
