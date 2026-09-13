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
RENDERED_EVIDENCE: UNVERIFIED: No UI source changed; authenticated browser sign-in, Billing rendering, and account-switch interaction remain proof owed.
BEHAVIORAL_EVIDENCE: VERIFIED: Production grant and retry readback proved exactly one personal standalone workspace, active owner membership, Solo subscription envelope, promotional revenue classification, usage receipt, and audit receipt; the retry returned already_granted with all counts remaining one. Authenticated browser sign-in and switching remain proof owed.
AUTHENTICATED_RUNTIME: PARTIAL: The existing production identity was granted server-side and its canonical membership/subscription/profile readback is verified. Browser sign-in, Billing rendering, and switching between the personal workspace and Antonio Daniel LLC were not exercised in this session.
KEYBOARD_FOCUS: PASS: No control or focus behavior changes; the existing verified Solo account switcher and Billing keyboard contracts are preserved.
ZOOM_REFLOW: PASS: No layout or responsive geometry changes; the existing Solo surfaces remain unchanged.
REDUCED_MOTION: PASS: No animation or transition is added or modified.
STATE_COVERAGE: PASS: Contract covers new grant, retry, existing Agency membership preservation, explicit promotional billing, zero due, provider conflict denial, and zero provider binding.
TRUTHFUL_STATE_LABELS: PASS: Revenue class is explicitly promotional, billing access_state is promotional, amount due is zero, and the grant never asserts paid, trialing, provider verified, or fulfilled Solo Beta state.
SOLO_UI: NO: This is a service-only database access contract; it deliberately reuses the current Solo shell and Billing UI without changing either interface.
UNVERIFIED: Authenticated browser sign-in, rendered Billing status, and account switching remain proof owed; production migration, grant, retry, and canonical readback are verified.
OWNER_INTENT: Grant Mr. Mogul Maker Academy, Antonio Daniel LLC, and the owner's personal Solo identity truthful grandfathered promotional access without lockout, while preserving metering and existing memberships.
MUST_NOT_HAPPEN: No Stripe Customer, Subscription, Invoice, Payment, Product, Price, or charge; no free or trial fallback; no paid marker; no unsupported topology; no membership loss.
MUST_PRESERVE: Public Solo Beta remains a separate 30-day-trial paid lane, existing authorized non-Solo access remains intact, and live Stripe creation remains outside this PR.
ACCEPTANCE_CRITERIA: Service-only platform-owner grant converges one standalone workspace and owner membership, reports promotional and zero due, retains other memberships, emits one audit and usage event, and refuses provider-bound identities.
MOTION_PURPOSE: NONE: no motion change.
PROTECTED_SEAMS: Account switching, paid Solo enrollment, provider identity, tenant ownership, billing readback, audit receipt, and metering are protected by explicit tests; current Solo routing and UI are unaffected.

INTERNAL_BUILD_IDENTITY: merge=PR #1202 fef8fb99e593a84127ba34de18ddc42b7b28037b; recovery=PR #1210 6781c8bb014d7542075209d75eb90479cf82861d; environment=production; migrations=VERIFIED run 34743013452; edge=NOT_APPLICABLE; evidence=production readback 2026-09-13
RELEASE_CHANNEL: production database: the service-only promotional grant contract is deployed and the owner-authorized personal Solo grant is applied.
RELEASE_CLASSIFICATION: patch: bounded customer-access recovery for explicitly grandfathered Solo identities.
CUSTOMER_RELEASE_IDENTITY: none: this internal access repair does not publish a customer announcement.
RELEASE_NOTE_REQUIRED: no: it is an owner-authorized account-access correction with no new public capability or interface.
RELEASE_TRUTH_BOUNDARY: PARTIAL: implementation, fresh replay, production deployment, one authorized grant, fresh readback, and idempotent retry are verified. PROOF OWED: authenticated sign-in, rendered Billing status, and account switching.
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
- Production: recovery migration `20270201000000` persisted in run `34743013452`; one authorized grant produced exactly one active standalone owner workspace, active Solo promotional subscription, metering/audit receipts, and no provider binding; retry returned `already_granted` without duplication. No credential, provider ID, or customer identifier is recorded here.

## Review and limitations

Production deploy run 34742551457 failed closed because schema_migrations already contained version 20270131000000. PR #1210 recovered forward under version 20270201000000; fresh replay passed and production deployment run 34743013452 persisted it. The first grant returned `created`; the required retry returned `already_granted`, and workspace/subscription/usage/audit counts remained exactly one. Antonio Daniel LLC membership was preserved, and both Antonio Daniel LLC and Mogul Maker Academy remained active promotional tenants. Provider-bound rows are never cleared or repurposed. Authenticated browser sign-in, rendered Billing status, and account switching remain explicitly `PROOF OWED`.
