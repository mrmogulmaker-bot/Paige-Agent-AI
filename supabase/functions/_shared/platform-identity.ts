// _shared/platform-identity.ts — the PLATFORM issuer identity, edge-side (F2).
//
// Paige Agent AI is the PLATFORM itself — the master/super-admin above every tenant.
// On platform-owned surfaces (platform-subscription invoices/receipts, platform
// emails) the biller/issuer is "Paige Agent AI," NOT any one tenant's brand. Those
// surfaces read THIS constant — never resolve_operator_identity / a tenant resolver,
// which would stamp a coach's brand onto a Paige platform document (the §38/§9 blur).
//
// This mirrors src/lib/platform/identity.ts `PLATFORM`. Edge functions cannot import
// from src/, so this is a deliberate, justified duplicate (§18 exception). KEEP THE
// TWO IN SYNC: if the platform's legal/product identity changes, update BOTH
//   - src/lib/platform/identity.ts   (frontend / app-shell / platform surfaces)
//   - supabase/functions/_shared/platform-identity.ts   (edge / generated documents)
//
// OWNER-DECISION (§9/§38): legal_entity_name is the legal entity that issues platform
// invoices/receipts. "Paige Agent AI LLC" matches src/pages/Terms.tsx (the platform's
// own legal terms); confirm before the F2 invoice slice ships the issuer line.

export const PLATFORM_IDENTITY = {
  /** Platform product + company name (invoice logo, platform email from-name). */
  name: "Paige Agent AI",
  /** Legal entity that issues platform invoices/receipts (§38 L1 rail, Paige is MoR). */
  legal_entity_name: "Paige Agent AI LLC",
  /** Platform support address for platform-owned communications. */
  support_email: "support@paigeagent.ai",
} as const;

export type PlatformIdentity = typeof PLATFORM_IDENTITY;
