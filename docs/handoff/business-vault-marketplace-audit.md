# Business Vault and Marketplace — repository reconciliation

**Evidence date:** 2026-08-21  
**Scope:** repository implementation plus the supplied read-only production audit for Supabase project `xygzykjyynhzqytbqnzu`.

## Executive decision

Business Vault and Marketplace must not share the same maturity label.

- **Business Vault is a defined product territory with Solo and Agency UI, but not a unified connected product.** Its evidence is distributed across business, legal, domain, financial-document, document, and connection seams. The existing Vault surfaces contain representative/static composition and must not be treated as authenticated facts.
- **Marketplace has a live backend substrate.** Catalog, vendors, versions, manifests, tenant installs, pricing/Stripe references, ledger economics, visibility rules, and install/checkout functions exist. The complete authenticated install, update, rollback, uninstall, and publishing experience remains incompletely verified.
- **Installed Capabilities is distinct from Marketplace.** Marketplace is where a tenant discovers and acquires; Capabilities is where installed items are authorized, configured, monitored, updated, disabled, and removed.

Production row counts below are evidence supplied by the dated audit, not values fetched or embedded by the prototype. This environment did not independently query production.

## Repository evidence

### Business Vault

`src/solo/vault.tsx` and `src/agency/vault.tsx` establish the territory and experience direction. They do not establish a unified production domain service. Repository migrations show related tables, while secret migrations explicitly keep internal and connected-bank secrets outside ordinary authenticated access.

No `business_vault` table family or dedicated Vault/document storage bucket was identified. That absence is consequential: a finished Vault requires a fact/evidence/access model, not a dashboard laid over unrelated tables.

### Marketplace

`src/pages/admin/Marketplace.tsx` uses the existing catalog/install seams rather than a purely visual fixture. Repository migrations and Edge Functions cover catalog visibility, versions and manifests, install attribution, grants, cleanup, checkout, and ledger behavior. This is credible connected substrate, but code and rows alone do not prove the full browser lifecycle.

## Supplied production evidence

| Domain | Object | Supplied rows | Honest classification |
|---|---|---:|---|
| Vault source | `businesses` | 7 | Connected source, not a unified Vault |
| Vault source | `legal_documents` | 18 | Connected source, lifecycle integration unproven |
| Vault sources | certifications, financial docs, public presence, vendors, legal profile, domains, documents, client files | 0 each | Schema present; production use unproven |
| Marketplace | `marketplace_vendors` | 1 | Live substrate; ecosystem early |
| Marketplace | `marketplace_items` | 19 | Live catalog substrate |
| Marketplace | `marketplace_item_versions` | 15 | Live version/manifest substrate |
| Marketplace | `marketplace_installs` | 5 | Live installs observed; E2E verification owed |
| Marketplace | `marketplace_install_ledger` | 7 | Live economic ledger substrate |
| Marketplace | `marketplace_install_bundle_links` | 0 | Schema present; bundle use unproven |

`_internal_secrets` and `connected_bank_account_secrets` are infrastructure, **not Vault content**. A tenant UI may expose connection health, granted scope, last use, rotation, and revoke controls; it must never read or render secret values.

## Canonical Settings taxonomy

```text
Settings
├── Business Vault
│   ├── Overview and evidence-backed health
│   ├── Identity, ownership, legal, finance, compliance and domains
│   ├── Documents, sharing, permissions and audit
│   └── Connection status (never secret values)
├── Marketplace
│   ├── Discover, item detail and manifest inspection
│   ├── Install review, purchases and publisher console
│   └── Private/agency/public distribution review
└── Capabilities
    ├── Installed and updates
    ├── Permissions
    └── Usage, cost, health, disable and uninstall
```

This preserves one home per state. Studio may create a publisher package, but Marketplace owns review and distribution. Capabilities owns operation after installation.

## Product chain and Trust boundaries

```text
Business Vault → Vibe Studio → Marketplace review → Installed Capabilities
 verified context     creates       validates/distributes      operates
```

Trust Compass governs each boundary. External Vault sharing, Marketplace installation, autonomy elevation, publishing, billing, and destructive uninstall require consequence-specific review. Installation begins in the most restrictive reasonable lane and never silently grants broad autonomy.

## Business Vault integration gates

1. Confirm authoritative source tables and define the fact/evidence/access compatibility layer.
2. Model verification source, validity, expiration, sensitivity, fact-to-evidence links, shares/grants, access events, requests, and renewals.
3. Use private storage and short-lived signed URLs; log views, downloads, shares, exports, and PAIGE evidence use.
4. Derive health only from completeness, verification, freshness, and expiration. Until then, show `Not established` rather than an invented score.
5. Resolve tenant and role server-side; test finance/legal/admin/operator boundaries and tenant-switch cache/URL/link invalidation.

## Marketplace integration gates

1. Mount the real catalog under Settings and derive plain-language permissions from the actual manifest.
2. Show install impact: data access, actions, agents/skills/workflows, connectors, scheduled work, price, provider costs, tier, dependencies, and Trust defaults.
3. Authenticated-test visibility, checkout, install, contained test, activation, receipts, update, rollback, disable, uninstall, cleanup, and ledger entries.
4. Show publisher verification/security review and distinguish PAIGE-built, verified partner, private tenant, private agency, and public items.
5. Route Studio publishing through versioned Marketplace review and operator approval without exposing private source content.

## Prototype boundary

The `/tenant-redesign` Settings views now demonstrate the information and trust contract only. They make no Supabase calls, install nothing, calculate no Vault score, and expose no production tenant, catalog, secret, price, or ledger data. The one temporary connected-version bridge remains until each real component is adapted inside the shell and passes its recovery-matrix tests.
