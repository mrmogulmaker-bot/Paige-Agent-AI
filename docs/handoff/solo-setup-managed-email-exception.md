# Solo Setup managed-email lifecycle exception

Status: scoped authority APPROVED by the owner ("Yes, absolutely, by the way.") on 2026-09-03.
Implementation and independent runtime checks are in progress; this is not production proof.

## Owner outcome

Every top-level Solo owner can choose an available platform-managed email local part in Setup,
register it durably, reload, and retain it after later business-name/slug updates. No tenant-specific
code or hardcoded owner address. Custom-domain configuration remains Connections-owned.

## Why Setup alone cannot finish this flow

The existing registry and actual sender connector are different records. Updating only
`tenant_email_identities.local_part` does not update the managed connector. Updating the connector
once is insufficient: the tenant lifecycle reruns `provision_paige_managed_email_connector(uuid)`,
which reconstructs the address from the slug/name. Availability must also protect existing inbound
and outbound connector addresses and platform-reserved addresses, not just registry entries.

The base migration refuses registration until the forward lifecycle migration enables it.
Registration atomically updates the registry, private opt-in marker and actual managed connector.
The Solo adapter requires a matching durable readback before reporting success and leaves any
unsaved brief and its revision untouched. No deployment or production mutation has occurred yet.

## Exact exception approved

Add `supabase/migrations/20261104000000_solo_managed_sender_lifecycle.sql` to amend
`public.provision_paige_managed_email_connector(uuid)` and complete the Setup-only registration
transaction. Do not edit previously applied migrations. The latest existing function body is in
`supabase/migrations/20260803120000_p1_subaccount_owner_leak_fix.sql`, beginning at line 189.

Only top-level Solo tenants with an explicitly registered managed identity may use the new
local-part resolution. Coordinate registry and connector atomically, check both address sources
and reserved identities, and preserve the choice during lifecycle reconciliation. Preserve the
existing protected sender boundary, grants, and active workspace authorization. No provider
connection, DNS operation, email send, Team role change, or shared-shell redesign is authorized
by this exception request.

## Caller and behavior inventory

Direct callers: service-only `ensure_paige_managed_email_connector(uuid)`;
`sync_paige_managed_email_connector_on_tenant()` lifecycle trigger; historical migration backfills.
The trigger runs on tenant creation and name, slug, status, account type, parent, and features changes.

| Affected consumer / tier | Behavior to preserve |
|---|---|
| Solo Settings Setup and Connections | Same managed identity on read, registration and lifecycle updates; custom sender stays distinct |
| Agency and Enterprise roots | Existing independent sender ownership and slug-derived behavior |
| Sub-account workspaces | Independent sender; never inherit the agency owner's identity |
| Operator / system workspaces | Existing system-workspace exclusion and disabled connector behavior |
| Legacy Admin email integration | Existing provider configuration and service maintenance behavior |
| Inbound routing and send-message | No cross-tenant address claim or divergent inbound/from address |
| Transactional, booking and portal email | Preserve verified custom-domain priority and existing fallback behavior |
| PAIGE identity reads | No new model context or additional private data; no autonomy change |

Known UI routes include `/solo/:account/settings/setup`, `/solo/:account/settings/connections`,
and legacy Admin email-integration surfaces. The database lifecycle is route-independent and can
run for any of the tiers above. Exact route spelling for every legacy provider caller remains to
be verified before implementation, not inferred from the function name.

## Collision evidence

Current main reconciled: `93a21831c1dfeef96e34760c2b0129f188830100` (merge `3784c26a`).
The merge preserves main's `SoloBillingView` and changes only the Setup mount.
Fresh checks of PRs #847, #846, #724, #674, #312 and #731 find no managed-helper collision.
The known `settings.tsx` overlaps remain separate: only Setup's import/mount is changed here.
All 30 currently open GitHub PR file lists were checked by the database reviewer; no direct
managed-email helper/path collision found. Historical unmerged helper commits exist on
`origin/agent/tenant-wildcards-landing-rings`, `origin/claude/p1-subaccount-owner-leak`, and
`origin/claude/task126-operator-tenant-hotfix`; none has a corresponding open PR. Recheck before
writing and release. This does not authorize absorbing those unrelated branches.

## Required verification

Register/reload; change business name/slug and verify retained address; retry identical registration;
two tenants race for one local part; reserved/platform and other connector addresses refused;
stale account request refused; verified custom sender remains distinct; inactive/system disabling;
Agency/sub-account/Enterprise and legacy Admin preservation. Missing authenticated proof is
`Authenticated Runtime Proof Owed` under the owner's MVP cadence, not an extra approval gate.
