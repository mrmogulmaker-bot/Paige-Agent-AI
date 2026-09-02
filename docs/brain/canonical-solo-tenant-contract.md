# Canonical Solo tenant contract

Baseline source inventory was refreshed 2026-09-02 against `origin/main` at
`76bb3bbca74ff4214feba28995d5cd0b9196fb6b`. Production schema/configuration was
observed read-only the same day in Supabase project `xygzykjyynhzqytbqnzu`.
The proposed repair is represented by its review head, not that baseline SHA.
Customer-facing identifiers are intentionally omitted.

## Controlling invariant

Current `main` is the Solo application baseline. Every active top-level tenant
with server-resolved `account_type='standalone'` receives the same application
template. Tenant context may change truthful data, permissions, entitlements,
connection health, and lifecycle state; it may not fork the shell, information
architecture, navigation, responsive behavior, scroll ownership, Settings
taxonomy, or PAIGE workspace.

The canonical owner chain is:

`/solo/:account/* -> SoloEntry -> SoloApp -> TenantCommandCenterShell -> one data-solo-screen-host`

`src/solo/canonicalSoloTenant.ts` is the idempotent classifier/address resolver.
It accepts only server-resolved topology and the permanent account address. It
does not accept tenant name, plan, feature JSON, entitlement, fixture/demo state,
or a URL-supplied grant. `SoloEntry` fails closed before mounting the application
for a non-standalone or parented active tenant.

## Exact-main baseline inventory

The runtime navigation source is `src/lib/routing/tierBranches.ts`.
`SOLO_BRANCHES` is consumed by the shell. Its flattened registry covers every
branch and routed subtab; each retains `template='canonical_solo'` and a delivery
declaration. Settings destinations carry the same invariant.

- Command Center: Systems Check, Mind.
- PAIGE: Chat, Knowledge, Helpers, Capabilities.
- Trust Compass: one full-page owner, no Solo subtab fork.
- Automations: Library, Runs, Build.
- Clients: People, Conversations, Calendar, Portal; Pipeline and Delivery remain
  hidden compatibility addresses, not current navigation.
- Calendar: Week, Agenda, Tasks, Booking pages, Availability, Connections.
- Campaigns: Overview, Catalog, Sales, Pipeline, Social, Performance.
- Analytics: Brief, Sales funnel, Revenue and profit, Retention, Acquisition,
  Decisions.
- Marketplace: Today, Browse, Installed, Updates.
- Settings: Setup, Team, Connections, Integrations, Notifications, Security and
  data, Vault, Billing.

The current shell/layout baseline is one `TenantCommandCenterShell`, one
`SoloPaigeWorkspace`, and one `data-solo-screen-host`. Browser-owned nav and PAIGE
state alter geometry through the shared shell only. Settings owns its approved
visible-scroll behavior; Connections/Calendar and Integrations are the approved
visible-scroll surfaces. Command Center, Clients, Campaigns, and Analytics remain
form-fitting/design-locked unless the owner approves an exception.

The shared build supplies Solo CSS and PAIGE assets. No tenant-specific static
asset selects a different application template. A tenant-provided logo URL is
tenant truth rendered inside the shared Setup surface, not a shell fork.

## Delivery classes

Every future Solo route or Settings destination retains
`template='canonical_solo'` and declares one orthogonal delivery class:

- `global_template`: the owner and route are available to every Solo tenant from
  the shared build.
- `tenant_bootstrap`: an idempotent provisioner/backfill creates required scoped
  substrate for current and future tenants; reconciliation is part of delivery.
- `tenant_truth`: the shared owner exists everywhere, while authenticated data,
  permission, connection, or lifecycle state determines truthful content.

No delivery class authorizes a different template. Subtabs inherit their branch
declaration unless an explicit delivery override is required; the flattened
runtime registry still enforces the canonical template. A route is normally
`global_template`. Data-backed states inside that route are normally
`tenant_truth`. A feature that requires seeded tenant records
must use `tenant_bootstrap`; it may not become a customer-name, UUID, plan, demo,
or one-off SQL exception.

## Named baseline-evidence flow — Campaigns → Pipeline

Owner-supplied authenticated screenshots establish one real-tenant visual
baseline for three connected parts of Campaigns → Pipeline. They are attributed
evidence, not fixtures, cross-tenant proof, or authority to copy that tenant's
records into the product:

1. Pipeline board: stable pipeline references, stage lanes, and deal counts.
2. Pipeline configuration: name and purpose plus editable tenant-owned custom
   stages and move policy.
3. Folder organizer: same-name pipelines remain distinguishable by their stable
   references.

The runtime route `growth/pipeline` is `template='canonical_solo'` with
`delivery='global_template'`; Pipeline records are `tenant_truth`. Every active
top-level standalone tenant therefore receives the same Campaigns/Pipeline
owner, controls, empty/loading/error states, and governed contracts. Pipeline
names, purposes, stages, deals, folders, permissions, and lifecycle state may
truthfully differ by tenant.

Read-only production aggregation on 2026-09-02 found 4 active top-level
standalone tenants and Pipeline records for all 4. All pipeline records had
stable references. Across the cohort there were 6 pipelines, 33 stages with a
declared move policy, 1 deal linked to a pipeline, and 0 folder records. One
tenant had same-name pipelines, validating the stable-reference requirement.
The shared `get_pipeline_workspace`, `get_pipeline_catalogue`,
`configure_tenant_pipeline`, and `configure_tenant_pipeline_as_paige` contracts
were present. No tenant name, account address, tenant identifier, pipeline name,
reference, stage label, deal, screenshot, or per-row result is retained here.

This proves shared code/schema exposure and aggregate substrate coverage. The
owner-supplied screenshots prove the named flow for one authenticated tenant.
Authenticated UI proof across every active standalone tenant remains
`UNVERIFIED`.

## Read-only tenant-configuration snapshot — 2026-09-02

Privacy-safe read-only SQL returned:

- active standalone Solo tenants: 4;
- top-level: 4/4;
- permanent account address present: 4/4;
- selected by the former `solo_shell_enabled` canary: 4/4;
- agency marker present: 0/4;
- Setup playbook signal present: 4/4;
- configuration exceptions to the exact-main structural prerequisites: 0/4.
The same lifecycle aggregate also contained two `trial` and one `canceled`
standalone rows; all three were top-level, permanently addressed, and lacked the
former canary. Lifecycle is tenant truth, not authority for an alternate shell.

The two owner-named verification tenants were included and matched the same
aggregate contract. No names, account addresses, tenant identifiers, stable
hashes, or per-tenant rows are retained in this repository. No account-specific
implementation was found in the inspected canonical-shell source or this diff.

Observed tenant feature-key differences were playbook/configuration, enabled
skills, finance scope, portal configuration, and ownership metadata. Those are
truthful per-tenant state. None is a valid shell/template selector.

The database migration ledger and repository both contained 910 migrations;
production maximum was `20261040000000`. The permanent account-address trigger
and the current Setup/A2P substrate migrations were applied. Main's governed
Pipeline-folders migration `20260901144648` was also applied and introduces no
tenant-specific seed. This is schema-ledger
evidence, not exact deployed-frontend-SHA or authenticated UI proof. No production
migration or backfill is required by the proposed alignment code: routing derives
from tenant topology, and the former canary would no longer be read after this code
is deployed. No data was changed during verification.

## Root cause categories

1. Confirmed architectural fork: `/admin` required a mutable
   `features.solo_shell_enabled` canary even though provisioning had no producer
   for it. Current configuration satisfied the exact-main prerequisites for all
   four inspected rows; without this repair, a future tenant could fall into the
   legacy Admin shell.
2. Intended first-use state: the Setup gate requires a chosen playbook/config.
   Canonical Solo first use resolves to `/solo/{account}/settings/setup`; a
   regression test prevents the former Admin/Solo redirect loop. It changes
   reachability until setup is complete, not the template.
3. Truthful tenant state: permissions, connected accounts, installed capabilities,
   and data availability change content/status labels inside shared owners.
4. Current-main visual defect: the exact-head structural drive passed 1,384/1,392
   checks; Setup alone clipped in all four required viewports in both themes. This
   geometry predates the repair, but canonical first use reaches it. Authenticated
   same-browser parity remains `UNVERIFIED`.

## Guard and proof contract

`src/solo/canonicalSoloTenant.test.ts` proves that contrasting standalone
contexts resolve to the same template without reading plan or feature state,
rejects unresolved/parented/manager contexts, fails Admin closed while identity
is resolving or unavailable, and walks the flattened runtime route registry to
require `canonical_solo` across branches and subtabs. The rendered Admin handoff
test proves contrasting tenant redirects, resolving/error retry, and the
blocked-address state; the Setup-gate test proves first-use reachability without
a loop. Existing owner-chain and route-owner integration tests remain required.

The exact-head structural drive covered 1536x770, 1366x768, 1024x768, and
900x1000 in light and dark themes. Connections/Calendar and Integrations passed
scroll ownership, reachability, keyboard focus, nav fold/expand, reduced motion,
and one-workspace PAIGE open/fold/reopen checks. Command Center, Clients,
Campaigns, and Analytics retained their form-fitting containment. Setup failed
the no-clipping assertion in all eight viewport/theme cases and has no
owner-authorized visible-scroll contract; its reachability is `UNVERIFIED`.
Real authenticated edit/save, permission, retry, abandonment, account-switch,
and regression proof remains required for every capability claimed LIVE.

## Release boundary

The owner supplied final go-live authorization on 2026-09-01. That authorization
cannot be exercised over a known acceptance defect: Gate 2, merge, promotion,
deployment, and production data changes remain blocked by the confirmed Setup
visual defect. Release may proceed only after Setup is repaired under the
existing form-fit law, or the owner explicitly approves a different design
contract, and fresh exact-head verification clears the resulting implementation.
