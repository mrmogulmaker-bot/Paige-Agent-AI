// Per-tenant email branding + sender + provider resolution.
//
// Resolves the branding tokens ("fill in the blank" values) and the sending
// identity/provider for a given tenant. The platform default is Paige Agent AI
// (gold + indigo, doctrine §6) — platform-originated mail (tenantId=null) wears
// the platform brand. A tenant that HAS set its own brand overrides these
// tokens; a tenant that HASN'T inherits the platform look but is still stamped
// with ITS OWN name ("brand it with their name" — owner directive), so it never
// reads as a generic system email. No tenant is hardcoded (doctrine §7/§200):
// each tenant is just a row in `tenants.brand`.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildProvider, type EmailProvider, type TenantEmailProviderConfig } from "./providers.ts";

export type EmailBranding = {
  brandName: string; // e.g. "Paige Agent AI", "Acme Coaching"
  wordmark: string; // short uppercase mark shown in the header band
  tagline: string | null; // sub-line under the wordmark / footer
  logoUrl: string | null; // optional hosted logo; shell falls back to wordmark
  primaryColor: string; // header/footer ground (dark)
  accentColor: string; // CTA + rule (brand accent)
  onAccentColor: string; // text color that sits on the accent (button label)
  bgColor: string; // outer canvas
  supportEmail: string | null;
  siteUrl: string;
  from: string; // "Display Name <local@domain>"
};

// PLATFORM DEFAULT — Paige Agent AI's own brand (gold + indigo, doctrine §6).
// This is what platform-originated mail wears, and the look a tenant inherits
// until it sets its own brand tokens (its NAME is still merged in below).
export const PLATFORM_DEFAULT_BRANDING: EmailBranding = {
  brandName: "Paige Agent AI",
  wordmark: "PAIGE",
  tagline: null,
  logoUrl: null,
  primaryColor: "#1B1230", // deep indigo (header/footer band)
  accentColor: "#EBB94C", // gold (CTA + rule + wordmark)
  onAccentColor: "#1B1230", // dark text on the gold button
  bgColor: "#0B0912", // near-black canvas
  supportEmail: null,
  siteUrl: "https://paigeagent.ai",
};

function platformDefaultFrom(): string {
  return Deno.env.get("PLATFORM_DEFAULT_EMAIL_FROM") ?? "Paige Agent AI <team@notify.paigeagent.ai>";
}

// Read the tenant brand jsonb defensively — any subset of keys may be present.
function mergeBrand(base: EmailBranding, brand: Record<string, unknown> | null | undefined): EmailBranding {
  const b = brand ?? {};
  const str = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string) : undefined);
  const brandName = str("brand_name") ?? str("display_name") ?? base.brandName;
  return {
    brandName,
    wordmark: str("wordmark") ?? brandName.toUpperCase().slice(0, 18),
    tagline: str("tagline") ?? base.tagline,
    logoUrl: str("logo_url") ?? base.logoUrl,
    primaryColor: str("primary_color") ?? base.primaryColor,
    accentColor: str("accent_color") ?? base.accentColor,
    onAccentColor: str("on_accent_color") ?? base.onAccentColor,
    bgColor: str("bg_color") ?? base.bgColor,
    supportEmail: str("support_email") ?? base.supportEmail,
    siteUrl: str("site_url") ?? base.siteUrl,
    from: base.from, // sender resolved separately from tenant_email_domains
  };
}

export type EmailContext = {
  branding: EmailBranding;
  provider: EmailProvider;
  tenantId: string | null;
};

/**
 * Resolve branding + sender + provider for a tenant. Pass tenantId=null (or an
 * unresolved user) to get the Paige Agent AI platform default on the platform
 * Resend account.
 */
export async function resolveTenantEmailContext(
  admin: SupabaseClient,
  tenantId: string | null,
): Promise<EmailContext> {
  const base: EmailBranding = { ...PLATFORM_DEFAULT_BRANDING, from: platformDefaultFrom() };
  if (!tenantId) {
    return { branding: base, provider: buildProvider(null), tenantId: null };
  }

  const [{ data: tenant }, { data: domain }] = await Promise.all([
    admin.from("tenants").select("name, brand").eq("id", tenantId).maybeSingle(),
    admin
      .from("tenant_email_domains")
      .select("domain, from_name, from_email_local, status, is_default, verified_at")
      .eq("tenant_id", tenantId)
      .eq("is_default", true)
      .maybeSingle(),
  ]);

  const brand = ((tenant?.brand as Record<string, unknown> | null) ?? null);
  // Fall the tenant display name back to the tenants.name column when brand has
  // none — so even an unbranded tenant is stamped with its own name.
  const withName = mergeBrand(base, {
    ...(brand ?? {}),
    display_name: (brand?.display_name as string) ?? (brand?.brand_name as string) ?? tenant?.name,
  });

  // Sending identity: a VERIFIED default tenant domain, else platform default.
  let from = base.from;
  if (domain && domain.status === "verified" && domain.verified_at) {
    from = `${domain.from_name} <${domain.from_email_local}@${domain.domain}>`;
  }

  const providerConfig = (brand?.email_provider as TenantEmailProviderConfig | undefined) ?? null;

  return {
    branding: { ...withName, from },
    provider: buildProvider(providerConfig),
    tenantId,
  };
}
