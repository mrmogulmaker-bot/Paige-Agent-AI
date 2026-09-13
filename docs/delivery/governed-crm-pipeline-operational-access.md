# Governed CRM/Pipeline operational access — release candidate

Date: 2026-09-13
Status: source-complete release candidate; NOT SHIPPED; authenticated/deployment proof owed.

This delivery completes one canonical Paige CRM path across the shared capability catalogue, trusted `crm-command` Edge door, action-risk/autonomy decision, existing single-use confirmations, service-only `execute_crm_command`, canonical CRM/Pipeline writes, durable readback, capability receipt/Rail, and persistent Chat result cards.

It covers contact/company CRUD and relationships; deal creation/edit/assignment/move/outcome/reopen/delete on the canonical Pipeline model; task CRUD/status/assignment; internal activity logging; contact merge and hard delete; and exact-set bulk contact update. All referenced tenant, actor, role, membership, owners, assignees and targets resolve or validate server-side. Model schemas contain none of those authority fields.

High-risk previews bind immutable target/version/dependency facts. Merge refuses conflicting portal identities and unsupported dependencies. Hard delete refuses dependent/portal contacts. Bulk execution refuses changed target versions. Identical idempotent replay returns the durable result; changed-payload replay refuses. Receipt or readback failure rolls back the transaction.

Chat success cards are derived from the executor result, persisted in the existing `bundle_ref`, and offer only the exact route or surface route returned by the server. Activity cards state that no email/SMS was sent, no call placed and no meeting scheduled.

Proof: focused CRM/Chat/Pipeline/Gateway and rendered-card tests pass; TypeScript ratchet, production build, Edge bundle checks, migration version, SECURITY DEFINER and one-approval-gate checks pass. PAIGE Spine run `34781454063` passed fresh Supabase startup, full migration replay, and all 59 rollback-only database/RLS assertions at repaired code head `11949cbe7a3737ecfb317b101c244dd03f0cf03d`; this is approved CI proof, not deployed-runtime proof. Authenticated tenant and deployment proof remain owed. Do not add this candidate to the shipped log until the exact deployed SHA passes those gates.