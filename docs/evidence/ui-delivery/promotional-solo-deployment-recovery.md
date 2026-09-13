# UI delivery evidence: promotional Solo deployment recovery

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: The affected-flow and collision assessment is recorded in docs/evidence/ui-delivery/solo-beta-acquisition.md under Promotional Solo grandfathering.
PAIGE_UI_DESIGN: PASS: Existing Paige Solo Billing and account-switch surfaces remain the visual authority; this change adds no component, route, style, or motion.
MATERIAL_FLOW_CHANGE: YES: A grandfathered identity gains one explicit promotional Solo workspace and reaches existing authenticated Billing and account-switch outcomes without paid entitlement fencing.
FLOW_PROTOTYPE: PASS: Owner-approved flow is platform grant to canonical writes to fresh billing readback to existing Solo setup and account-switch surfaces; all failure exits are transactional and fail closed.
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: A platform owner grants an existing identity non-expiring promotional Solo access; the customer then signs in and selects the authorized workspace normally.
VISUAL_DIRECTION: PASS: No visual change; existing Solo shell, Billing states, focus behavior, and account switcher remain authoritative.
AUTOMATED_EVIDENCE: PASS: src/lib/auth/promotionalSoloGrant.test.ts passed 5 of 5; supabase/tests/promotional_solo_grant.sql defines 33 fresh-replay assertions and is wired into PAIGE Spine database-contract CI.
STATIC_EVIDENCE: PASS: Exact-head definer, migration-version, Rail-grant, managed-schema, Binding Ledger, Integration Registry, regression, focused ESLint, and production build checks passed at f3e29c44742b49574649e4d70303cd6293dccfbf before this evidence-only amendment.
RENDERED_EVIDENCE: UNVERIFIED: No UI source changed; production promotional readback on the existing Solo Billing and account-switch surfaces requires the migration and owner-authorized grant to be deployed first.
BEHAVIORAL_EVIDENCE: UNVERIFIED: The static and database contracts cover denial, idempotency, paid conflict, preservation, metering, audit, and billing status; authenticated production sign-in and switching require deployed readback.
AUTHENTICATED_RUNTIME: UNVERIFIED: Production already contained migration version 20270131000000 without this repository change; the forward-only recovery migration is not deployed yet, so the owner-authorized identity has not been granted or driven through the production Solo shell.
KEYBOARD_FOCUS: PASS: No control or focus behavior changes; the existing verified Solo account switcher and Billing keyboard contracts are preserved.
ZOOM_REFLOW: PASS: No layout or responsive geometry changes; the existing Solo surfaces remain unchanged.
REDUCED_MOTION: PASS: No animation or transition is added or modified.
STATE_COVERAGE: PASS: Contract covers new grant, retry, existing Agency membership preservation, explicit promotional billing, zero due, provider conflict denial, and zero provider binding.
TRUTHFUL_STATE_LABELS: PASS: Revenue class is explicitly promotional, billing access_state is promotional, amount due is zero, and the grant never asserts paid, trialing, provider verified, or fulfilled Solo Beta state.
SOLO_UI: NO: This is a service-only database access contract; it deliberately reuses the current Solo shell and Billing UI without changing either interface.
UNVERIFIED: Production migration application, the single authorized grant, fresh server readback, authenticated sign-in, and account switching are unavailable until exact-head database CI passes and the migration deploys.
OWNER_INTENT: Grant Mr. Mogul Maker Academy, Antonio Daniel LLC, and the owner's personal Solo identity truthful grandfathered promotional access without lockout, while preserving metering and existing memberships.
MUST_NOT_HAPPEN: No Stripe Customer, Subscription, Invoice, Payment, Product, Price, or charge; no free or trial fallback; no paid marker; no unsupported topology; no membership loss.
MUST_PRESERVE: Public Solo Beta remains a separate 30-day-trial paid lane, existing authorized non-Solo access remains intact, and live Stripe creation remains outside this PR.
ACCEPTANCE_CRITERIA: Service-only platform-owner grant converges one standalone workspace and owner membership, reports promotional and zero due, retains other memberships, emits one audit and usage event, and refuses provider-bound identities.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Account switching, paid Solo enrollment, provider identity, tenant ownership, billing readback, audit receipt, and metering are protected by explicit tests; current Solo routing and UI are unaffected.

INTERNAL_BUILD_IDENTITY: f3e29c44742b49574649e4d70303cd6293dccfbf; deployment=not observed because the PR is unmerged; environment=development; migrations=PROOF_OWED(PR #1202 fresh replay and production application); edge=NOT_APPLICABLE; evidence=PR #1202 exact-head checks and this record
RELEASE_CHANNEL: development: PR #1202 is an unmerged production-migration candidate; no customer state changes until merge and migration deployment.
RELEASE_CLASSIFICATION: patch: bounded customer-access recovery for explicitly grandfathered Solo identities.
CUSTOMER_RELEASE_IDENTITY: none: this internal access repair does not publish a customer announcement.
RELEASE_NOTE_REQUIRED: no: it is an owner-authorized account-access correction with no new public capability or interface.
RELEASE_TRUTH_BOUNDARY: PARTIAL: implementation and local exact-head checks pass; PROOF OWED: fresh database replay, deployment identity, production grant/readback, authenticated sign-in, and account switching.
RELEASE_RECOVERY: position=forward-fix before any grant and revoke explicit promotional records only through a separately reviewed platform operation after grant; reference=supabase/migrations/20270201000000_platform_promotional_solo_grant_recovery.sql and PR #1202

## Scope and collisions

- Classification: backend-to-visible promotional access repair.
- Affected flows: service grant, sign-in eligibility, Solo billing state, setup entry, and account switching.
- Neighboring regressions: paid Solo enrollment and existing non-Solo memberships are preserved by fail-closed provider checks and behavioral assertions.
- Active-owner/file collisions: live Stripe Product and Price creation is handled separately and this PR changes no Stripe configuration or checkout code.
- Explicit exclusions: public acquisition, provider objects, customer charges, UI redesign, and automatic bulk conversion.

## User job and state map

The platform owner selects an existing identity through a trusted service operation. The transaction proves platform-owner authority, rejects paid/provider conflicts, creates or safely reuses one standalone tenant, restores active ownership, writes explicit promotional billing truth, and records metering plus audit evidence. The customer signs in through existing Auth, reaches the current Solo setup/shell, and may switch back to existing authorized workspaces. Every invalid or ambiguous topology rolls back with no partial grant.

## Evidence index

- Local exact-head: focused Vitest 5/5, focused ESLint, production build, definer, migration-version, Rail-grant, managed-schema, Binding Ledger, Integration Registry, and regression checks passed on 2026-09-13.
- Database contract: supabase/tests/promotional_solo_grant.sql, 33 assertions, scheduled by .github/workflows/paige-spine-contract.yml after fresh reset.
- Production: no migration or grant applied at authoring time; no credential, provider ID, or customer identifier is recorded here.

## Review and limitations

Production deploy run 34742551457 failed closed because schema_migrations already contained version 20270131000000. Recovery uses the next unused version and replays the same idempotent contract. The first draft incorrectly reused a helper that would have created a legacy free 14-day trial; that call was removed before commit. Fresh replay exposed and repaired an ambiguous revenue-classification conflict target plus a test-only stale JWT context at the provider-conflict fixture. Provider-bound rows are never cleared or repurposed. Production application and authenticated customer proof remain explicitly unverified until GitHub database-contract passes and deployment/readback completes.