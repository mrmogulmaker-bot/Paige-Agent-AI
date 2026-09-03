# Solo Team invitation recipient binding P0

Status: repair candidate in PR #900; isolated applied-schema proof PASS, production persistence pending.

The deployed legacy accept_tenant_invite(text) could accept a Solo Team token without binding the signed-in caller to its intended recipient. This was confirmed by live function-definition and privilege inspection, not by attempting a live exploit. No prior exposure is asserted.

Both Solo token consumers are hardened: accept_solo_team_invite(text) and accept_tenant_invite(text). They resolve auth.uid() to auth.users.email and email_confirmed_at, require nonblank confirmed identity and invitation email, and compare lower(btrim(...)). JWT email, browser fields and user metadata cannot authorize acceptance. The legacy check applies only to kind=team; its other contracts remain unchanged.

Entry-point inventory: /join/:token -> JoinWorkspace -> accept_solo_team_invite; direct legacy accept_tenant_invite remains callable and now receives the same recipient boundary. Auth redirect/pending-invite restoration returns to /join. accept-invite, accept_invitation, broker and platform invite paths use separate token stores and cannot consume Solo Team tokens. No UI, sender, webhook, role, ownership or RLS changes.

The forward migration changes only two function definitions. Locked token handling and transactional membership/consumption remain. Tests use synthetic rolled-back fixtures in isolated databases, actual authenticated/anonymous roles, both RPCs, wrong/verified/unverified identity, spoofed email claims, lifecycle denials, resend replacement, normalization, duplicate use, cross-workspace effects and forced late-failure rollback.

Current signup pre-confirms accounts; email_confirmed_at is a server account-state check, not independent real-inbox proof. The owner-confirmed invitation send leg remains LIVE. Fresh-account end-to-end acceptance remains Proof Owed until the controlled owner recipient test. No live invitation, membership, account or provider mutation is part of verification.

Delivery-status work resumes only as a separate slice after this P0 is green, merged and production-verified. Super Admin remains deferred.

Verification before release: 110/110 behavioral pgTAP assertions passed on this PR's isolated Supabase preview, including both binding-removal negative controls and late-failure rollback. The exact checked-in statements were run with an output collector that raises on any failed TAP assertion; CI runs the unmodified file against a from-zero schema. Initial fixture run failed because simulated JWT context leaked into setup for the next actor; fixed by clearing fixture context, preserving every consent trigger. 66 focused Team/workspace-context integration tests PASS. Production build PASS. Migration, definer, view, tenant-feature, write-target, managed-schema and credential linters PASS. Independent specification/security and final adversarial reviews PASS. Full CI rerun is required on the corrected fixture commit.
