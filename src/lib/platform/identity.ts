// ---------------------------------------------------------------------------
// Platform identity — the master account is "Paige Agent AI".
// ---------------------------------------------------------------------------
// Paige Agent AI is the *platform itself* — the master/super-admin above every
// tenant. It owns billing, config, and the cross-tenant view; it is never a
// customer. Individual businesses (e.g. an academy, an agency, an enterprise)
// are *tenants* under it, each with its own brand, clients, knowledge base, and
// tenant-authored Paige (see src/lib/playbook).
//
// This module is the single source of truth for the master identity so the
// platform/master surfaces (admin shell, the platform-owner "all tenants" view,
// platform emails) read as "Paige Agent AI" — not any one tenant's brand. A
// tenant's own name/brand comes from its tenant row (useTenantBrand), never
// from here.

export const PLATFORM = {
  /** The platform's product + company name. */
  name: "Paige Agent AI",
  /** Compact form for tight chrome (nav pills, badges). */
  shortName: "Paige Agent AI",
  /** Master/super-admin surface label. */
  adminName: "Paige Agent AI",
  /** One-line positioning, mogul-founder voice (doctrine §3). */
  tagline: "The intelligent client portal that runs your practice.",
  /** How the platform-owner's cross-tenant ("no filter") view is labeled. */
  allTenantsLabel: "Paige Agent AI",
  /** Sub-label under the master identity in the tenant switcher. */
  platformScopeLabel: "Platform · all tenants",
} as const;

export type PlatformIdentity = typeof PLATFORM;
