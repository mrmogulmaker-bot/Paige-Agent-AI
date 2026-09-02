# Canonical Solo source law

This file governs `src/solo/**`. Read it with the root law and
`docs/brain/canonical-solo-tenant-contract.md` before changing a Solo route,
screen, shell, responsive rule, Settings destination, or PAIGE integration.

## One template

Current `main` is the Solo application baseline. Every authenticated top-level
tenant whose server-resolved `account_type` is literally `standalone` mounts the
same owner chain:

`SoloEntry -> SoloApp -> TenantCommandCenterShell -> one data-solo-screen-host`

The account number is an address, never authority. Tenant name, tenant ID,
account number, plan, entitlements, fixture/demo state, feature JSON, or copied
URL values must never choose a different shell, nav, layout, responsive system,
scroll owner, Settings taxonomy, or PAIGE workspace.

## Required delivery declaration

Every branch, routed subtab, and Settings destination has the invariant
`template: canonical_solo`. Delivery is a separate, orthogonal declaration:

- `global_template`: the owner/route exists for every Solo tenant immediately.
- `tenant_bootstrap`: a reusable, idempotent provisioner/backfill creates required
  tenant-scoped substrate. The change must include existing-tenant reconciliation.
- `tenant_truth`: the shared surface always exists, while authenticated tenant data,
  permission, connection, or lifecycle state determines its truthful content.

Never ship a per-account patch. Never gate the canonical shell on a mutable tenant
feature flag. Never infer capability from a customer name, UUID, plan, or fixture.

No delivery class may change or override the `canonical_solo` template invariant.

## Truthful differences

Tenant data, permissions, installed capabilities, connection health, setup state,
and empty/error/loading states may differ. They must be represented inside the
shared surface using the established truth labels; they do not authorize a second
template or silent unavailable-to-live claim.

## Verification

A Solo change must keep these layers distinct:

1. static/type/lint evidence;
2. behavioral route-owner tests with at least two contrasting tenant contexts;
3. rendered geometry at 1536x770, 1366x768, 1024x768, and 900x1000, including
   nav states, PAIGE closed/open, reachability, clipping, and actual scroll owner;
4. authenticated real-account proof for every capability claimed LIVE.

Missing authenticated or rendered evidence is `UNVERIFIED`, never PASS. Settings
Connections/Calendar and Integrations are the approved visible-scroll surfaces;
other design-locked surfaces remain form-fitting unless the owner rules otherwise.
