# PR #304 — tenant domain and email doctrine verification

Date: 2026-07-30  
Branch: `agent/tenant-wildcards-landing-rings`  
Capability home: `docs/architecture/tenant-domain-and-communications-spine.md`

## Decision and doctrine anchors

This capability extends the existing tenant, email-identity, connector, Conversations, portal, Paige chat, and Paige MCP rails. It does not create a second tenant registry, inbox, sender resolver, or portal.

- **§7 — intelligent client portal:** the included hostname resolves to the existing tenant-authored portal; hostname is routing context, never membership or authorization.
- **§8 — Paige orchestration:** Paige chat and MCP read the same canonical identity contract used by onboarding and settings.
- **§9 — platform vs tenant:** the platform/Super Admin authority is not a customer tenant identity. `features.system_workspace=true` explicitly excludes a system workspace. Agency roots, owned subaccounts, solo practices, and customer enterprises each own an independent identity.
- **§10 — Paige-governable:** the read seam is `resolve_tenant_domain_identity`; the service-role maintenance seam is `ensure_paige_managed_email_connector`; tenant lifecycle synchronization remains data/trigger driven.

## Account-type eligibility matrix

| Account class | Default web/email identity | Isolation rule | Evidence |
|---|---|---|---|
| Platform operator / Super Admin user | No extra tenant identity merely because the user is platform owner | Authority is a user role, not `account_type` | Static function/eligibility review |
| Explicit system workspace | Excluded | `features.system_workspace=true` | SQL test: no managed connector |
| Agency root | Included | Connector belongs to agency tenant | SQL test |
| Agency-owned subaccount | Included | Child tenant receives its own address; never inherits parent sender | SQL test |
| Antonio Daniel-style owned standalone | Included by the same parented-standalone rule | Child `tenant_id` remains authoritative | SQL test + production rollback inventory |
| MMA agency/subaccount pair | Both included independently | Distinct tenant IDs and sender addresses | SQL test + production rollback inventory |
| Solo standalone | Included | Own tenant only | SQL test |
| Customer enterprise | Included | Own tenant only | SQL test |
| Trial customer workspace | Included while trial is active | Same tenant isolation as active | SQL test |
| Past-due/canceled/suspended | Managed connector disabled | Custom connectors are not mutated | SQL test for canceled; static branch coverage for all inactive statuses |

## §37 producer inventory

| Producer | Credential / authority | Contract and tenant bind | Result |
|---|---|---|---|
| Tenant INSERT lifecycle trigger | Existing tenant writer; trigger runs server-side | `NEW.id` enters private provisioning core | Covered by fixtures |
| Tenant slug/name/status/type/parent/features UPDATE trigger | Existing tenant writer; trigger runs server-side | Same tenant row; eligibility re-evaluated | Canceled transition covered |
| Migration backfill | Migration owner | Iterates explicit tenant IDs; core applies account/system/status gates | Production `BEGIN/ROLLBACK` inventory passed |
| Service-role maintenance RPC | Exact service-role JWT claim and execute grant | Explicit `p_tenant_id` required | Auth rejection + service success covered |
| Authenticated browser | Authenticated JWT | Read-only identity RPC pins to `current_user_tenant_id()`; cannot execute maintenance RPC | Grants/body gate covered; live JWT walk still owed |
| Anonymous public hostname resolver | Anonymous | Hostname returns minimum public identity only; no membership | Routing tests; live wildcard smoke owed |
| Paige chat Edge Function | Service-role database client after its existing caller/tenant resolution | Passes resolved persona tenant explicitly | Static producer walk complete; deployed Edge proof owed |
| Paige MCP tool | Existing MCP authentication and `actorTenantId()` | Passes actor tenant explicitly; read-only | Static producer walk complete; deployed MCP proof owed |

## Response-consumer inventory

| Consumer | Fields read | Compatibility result |
|---|---|---|
| Included-address settings card | web hostname/URL; email sender/source/status | Uses canonical RPC; no address reconstruction |
| Email Integration home | connector active/status/from address | Existing `channel_connectors` rail |
| Owner onboarding welcome | canonical web/email identity | Additive consumer; unavailable state remains honest |
| Conversations new-message picker | connector ID/type/provider/from address | Exact connector is visible and selected |
| Conversations reply/approval | thread/message connector where present | Existing send seam; exact-sender behavior verified separately in the PR |
| `send-message` | tenant-bound connector and sender identity | Cross-tenant connector gate remains server-side |
| Paige chat prompt context | canonical identity and readiness status | Does not invent custom domains |
| Paige MCP response | canonical identity plus guidance | Read-only `admin.read` tool contract |
| Portal gateway | tenant slug derived from canonical route | Server-owned tenant lookup remains authoritative |

No response field was removed. New readiness detail is additive. Consumers must distinguish `reserved`, `outbound_ready`, and future web/inbound-live proof rather than treating address reservation as deployment proof.

## §32 Layer A — build, schema, and persisted-apply

| Gate | Status | Evidence |
|---|---|---|
| Migration syntax + complete backfill | Pass in production transaction, rolled back | Eligible inventory: agency root 1/1; root standalone 2/2; parented standalone 4/4; zero writes persisted |
| Durable database behavior test | Pass | `supabase/tests/tenant_domain_identity.sql`, 17 assertions, executed with the complete migration inside `BEGIN/ROLLBACK` |
| Managed uniqueness | Pass | Advisory transaction lock + partial unique index + repeated-call assertions |
| Tenant/system eligibility | Pass | Agency, child, solo, enterprise, trial, canceled, and system fixtures |
| Existing custom connector preservation | Pass | SMTP fixture remains after managed reprovision |
| Repository/Vercel checks | Must be read from the final PR head | Do not reuse an earlier-head result |
| Fresh Supabase preview replay | Blocked before this migration | Existing `profiles already exists` baseline, tracked in #305; not represented as green |
| Production persisted-apply | Not yet run | Must occur only through the normal post-merge release rail |

## §32 Layer B — behavior

| Behavior | Expected | Evidence / remaining work |
|---|---|---|
| Anonymous provision attempt | Denied | Execute privilege assertion |
| Authenticated provision attempt | Denied | Execute privilege + function-body rejection assertion |
| Service-role provision | Success | pgTAP `lives_ok` |
| Repeated provision | Same connector ID and one physical row | pgTAP |
| Agency parent + child | Two tenant-pinned, distinct addresses | pgTAP |
| Solo / enterprise / trial | One managed connector each | pgTAP |
| System workspace | No managed connector | pgTAP |
| Inactive tenant | Managed connector disabled | pgTAP |
| Custom connector | Preserved | pgTAP |
| Authenticated tenant A requests tenant B identity | Must remain pinned to tenant A | Live JWT/RPC walk owed before persisted-apply is called complete |
| Default outbound email | Exact managed connector sends successfully | Live Resend smoke owed after migration and Edge deploy |
| Default inbound email | Reply resolves to correct tenant/thread | Platform inbound routing smoke owed; do not claim ready before proof |
| Wildcard website | Active tenant resolves; reserved/system host does not | Live DNS/Vercel smoke owed after wildcard attachment |

## Rollout order and stop conditions

1. Final-head repository checks and adversarial review.
2. Resolve #305 or record the doctrine-authorized preview exception; never relabel the failure as success.
3. Merge verified code.
4. Apply the database migration first.
5. Deploy affected Edge Functions, then web application.
6. Prove one managed outbound send and inbound reply.
7. Attach `*.paigeagent.ai` only after the code and database contract are live.
8. Smoke agency root, child, solo, enterprise, inactive/system, and reserved host cases.
9. Record migration/Edge/web persisted-apply hashes and drift evidence.

Stop and roll back the cutover if the backfill reports an address conflict, more than one managed connector per tenant, cross-tenant ownership, a system workspace connector, an exact-sender mismatch, or an unproven inbound/web state displayed as ready.

## Honest outstanding evidence

- Supabase preview replay remains red for the pre-existing baseline tracked in #305.
- No production migration, wildcard attachment, or connector backfill has been applied by this PR audit.
- Live authenticated tenant-A/tenant-B RPC behavior, outbound delivery, inbound receipt, and wildcard DNS behavior remain post-deploy/cutover gates.
