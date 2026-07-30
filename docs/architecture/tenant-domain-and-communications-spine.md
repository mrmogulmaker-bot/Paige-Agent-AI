# Tenant Domain and Communications Spine

Status: canonical capability map for PR #304. Runtime schema and functions remain the executable source of truth; this record explains ownership, account eligibility, producers, consumers, and rollout evidence.

## North Star

Paige is AI-native, not AI-bolted. She is the tenant-aware operating layer for both sides of the intelligent client portal:

- Owner Ops: onboarding, pipeline, follow-up, scheduling, communications, and next actions.
- Client Experience: intake, answers, nurture, and a continuous client conversation.

A tenant address is therefore not decorative setup data. Paige must be able to read it, explain it, activate it through an authorized seam, select it when communicating, and report its real readiness.

## One ownership spine

- Tenant identity: `tenants.id` is authoritative. A slug is an address label, never authorization.
- Default web identity: `resolve_tenant_domain_identity(...)` returns the reserved `<slug>.paigeagent.ai` identity.
- Default email identity: `resolve_tenant_sender(...)` retains verified custom-domain precedence and the shared `mail.paigeagent.ai` fallback.
- Usable communication channel: `channel_connectors` is the operational rail used by Conversations and `send-message`.
- Human setup home: existing Email Integration page.
- Human communications home: existing Conversations page and `ComposeThreadDialog`.
- Paige read/control homes: tenant-pinned RPCs plus Paige chat/MCP tools. React must never be the only owner of capability logic.

No competing domain table, email setup page, quick-email modal, or conversation store should be introduced.

## Platform and tenant boundary

Super Admin is platform authority, not automatically a tenant. Never create a tenant website or sender merely because a profile has platform-owner privileges.

Eligible customer workspaces receive independent identities when structurally marked active/trial and not a system workspace:

| Account class | Default identity |
| --- | --- |
| Agency root | Its own web and email identity |
| Agency child/subaccount | Its own identity; never inherits the parent address |
| Mogul Maker Academy child workspace | Its own tenant identity |
| Antonio Daniel child workspace | Its own tenant identity |
| Solo/standalone workspace | Its own tenant identity |
| Enterprise customer workspace | Its own tenant identity |
| Platform/system workspace | Excluded when structurally marked `features.system_workspace=true` |
| Suspended/canceled/past-due workspace | Managed connector disabled, never deleted |

Names are not durable classification. System/customer eligibility must be structural.

## Readiness vocabulary

Do not collapse these states into a generic “Ready”:

- `reserved`: the canonical address is allocated to the tenant.
- `outbound_ready`: an active tenant-bound connector can send from the address.
- `inbound_ready`: platform/provider routing has been verified to receive into the unified inbox.
- `web_live`: wildcard DNS/Vercel routing has been attached and smoke-tested.
- `verified`: a verified custom-domain sender is active.
- `error`: the identity or connector contract could not be read; surface the error honestly.

The UI and Paige must never call reserved infrastructure connected or live.

## Lifecycle and backfill

1. Tenant lifecycle trigger invokes a private, explicit-tenant provisioning core.
2. The core is service/trigger controlled, advisory-locked, and concurrency safe.
3. Exactly one managed default email connector exists per eligible tenant.
4. Parent and child workspaces remain isolated even when creation occurs under a parent-authenticated session.
5. Slug changes update only that tenant’s managed address.
6. Custom Resend, Gmail, and SMTP connectors remain untouched.
7. Inactive or system workspaces have the managed connector disabled rather than deleted.
8. A backfill performs collision preflight before writing.

## Conversations contract

- New conversation selects an exact active connector ID, not only a channel type.
- Reply composition keeps the thread’s exact connector when it is still active.
- `send-message` server-validates connector existence, active state, channel, and tenant ownership.
- An explicitly selected managed/custom Resend, Gmail, or SMTP connector is authoritative for sender name, address, reply-to, and provider.
- Connectorless sender resolution exists only for legacy/internal fallback paths.
- Scheduled delivery and drainers preserve the chosen connector ID.
- A successful first outbound message creates/coalesces into the canonical tenant thread and appears in Conversations.

## Command Center activation journey

The existing compact owner checklist is the first-run home. It must not become a banner or a second setup dashboard.

1. “Activate your Paige email” opens the existing Email Integration home.
2. The step completes from the active connector state, never from clicking the button.
3. “Add and message your first client” opens the existing Conversations composer.
4. The composer can resolve or create the contact through the existing atomic contact seam.
5. The exact active sender is visible before Send.
6. Send writes the message/thread into the existing unified Conversations substrate.
7. Client-level Message actions deep-link to `/admin/clients-hub/conversations?contact=<tenant-scoped-client-id>`.
8. `?compose=1` opens the same existing new-conversation surface; no duplicate quick-email modal.

Every human touchpoint must open a real working surface. Every mutation behind it must remain callable by Paige or an authorized sub-agent.

## Producer and consumer inventory

Producers to verify:

1. Tenant creation lifecycle trigger.
2. Existing-tenant backfill/reconciliation.
3. Service-role maintenance/retry.
4. Email Integration UI reads.
5. Command Center onboarding reads and navigation.
6. New Conversation sends.
7. Existing-thread replies, approvals, scheduling, and drainer release.
8. Paige chat and Paige MCP reads/actions.

Consumers to verify:

- Tenant domain identity card and Email connection state.
- Owner onboarding checklist.
- Conversations channel picker and reply composer.
- `send-message` provider adapter.
- Scheduled-message drainer.
- Inbound email resolver/thread creation.
- Paige chat guidance and MCP result contract.
- Public wildcard host routing.

## Required verification before merge

- Fresh migration replay succeeds, or an explicit doctrine-approved exception is recorded for a proven unrelated baseline failure.
- Anonymous denial, authenticated tenant pinning, cross-tenant rejection, and service-role behavior are durable tests.
- Concurrency/idempotency, parent/child creation, slug rename, inactive disabling, and custom-connector preservation are tested.
- Managed and custom Resend selections produce the exact chosen sender.
- Reply and scheduled delivery preserve connector identity.
- Wildcard hosts reject application/operator routes and pin tenant-bearing public routes.
- Account-class evidence covers platform/system, agency root, MMA/Antonio-class children, solo, enterprise, trial, and inactive tenants.
- Pre-deploy verifier and compliance passes are recorded.
- Post-deploy persisted-apply proof confirms migration, Edge functions, frontend commit, wildcard routing, outbound delivery, and inbound receipt.

## Cutover order

1. Complete repository tests and clean migration replay.
2. Merge verified code to `main`.
3. Persist and verify the database migration.
4. Deploy `send-message`, Paige chat, and MCP consumers.
5. Deploy the matching frontend.
6. Verify default outbound and inbound email with a tenant-scoped test.
7. Attach `*.paigeagent.ai` only after routing and resolver state are live.
8. Smoke each account class plus reserved/cross-tenant host behavior.
9. Record persisted-apply evidence and any owed follow-ups.
