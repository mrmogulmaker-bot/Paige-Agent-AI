/**
 * Personal / Business Separation Audit
 *
 * Detects commingling between a client's personal identity and their business
 * identity. Funders, bureaus, and risk engines (LexisNexis, Equifax SBFE, D&B)
 * penalize files where the business shares its phone, address, email, or
 * domain with the owner — it signals an unestablished sole-prop and a
 * higher-risk applicant.
 *
 * This module is the single source of truth for the audit. It is consumed by:
 *   • <SeparationAuditCard> on the Business Profile page
 *   • The Dashboard "Next Best Action" widget
 *   • The Funding Intelligence warning banner
 *   • Paige's chat context (so she can flag overlap conversationally)
 */

export type SeparationSeverity = "high" | "medium" | "low";

export interface SeparationIssue {
  id: string;
  severity: SeparationSeverity;
  field: string;            // human label of what's wrong
  detail: string;           // short explanation for the user
  fixHint: string;          // what to do about it
}

export interface SeparationInput {
  // Personal
  personalAddress?: string | null;
  personalCity?: string | null;
  personalState?: string | null;
  personalZip?: string | null;
  personalPhone?: string | null;
  personalEmail?: string | null;

  // Business (single business — caller picks which one to audit)
  businessName?: string | null;
  businessStreetAddress?: string | null;
  businessCity?: string | null;
  businessState?: string | null;
  businessZip?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  businessAddressType?: string | null;     // e.g. "Home Address", "Commercial Office"
  phone411Listed?: boolean | null;

  // Public presence (business_public_presence row)
  websiteUrl?: string | null;
  websiteLive?: boolean | null;
}

export interface SeparationResult {
  issues: SeparationIssue[];
  score: number;            // 0-100, higher is better separation
  status: "clean" | "minor" | "needs_work" | "critical";
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

// Common consumer / free email providers. If a client uses any of these as
// their BUSINESS email, funders and bureaus treat the file as unestablished.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com",
  "proton.me", "protonmail.com",
  "gmx.com", "gmx.us",
  "mail.com", "yandex.com", "zoho.com",
]);

const norm = (s?: string | null) =>
  (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const normPhone = (s?: string | null) =>
  (s || "").replace(/\D/g, "");

const normZip = (s?: string | null) =>
  (s || "").replace(/\D/g, "").slice(0, 5);

const emailDomain = (email?: string | null): string | null => {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase();
};

const websiteDomain = (url?: string | null): string | null => {
  if (!url) return null;
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const u = new URL(withProto);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
};

const sameAddress = (i: SeparationInput): boolean => {
  if (!i.personalAddress || !i.businessStreetAddress) return false;
  if (norm(i.personalAddress) !== norm(i.businessStreetAddress)) return false;
  // Require at least one of city / zip to also match to avoid false positives
  // on common street names.
  const cityMatch = i.personalCity && i.businessCity &&
    norm(i.personalCity) === norm(i.businessCity);
  const zipMatch = i.personalZip && i.businessZip &&
    normZip(i.personalZip) === normZip(i.businessZip);
  return Boolean(cityMatch || zipMatch);
};

export function runSeparationAudit(i: SeparationInput): SeparationResult {
  const issues: SeparationIssue[] = [];

  // ── 1. Same physical address ───────────────────────────────────────────
  if (sameAddress(i)) {
    issues.push({
      id: "address-match",
      severity: "high",
      field: "Address",
      detail: "Your business address matches your personal home address.",
      fixHint:
        "Set up a commercial address, virtual office, or registered-agent address for the business and update it everywhere your business is listed (Google, Yelp, LexisNexis, the bureaus).",
    });
  } else if (
    i.businessAddressType &&
    norm(i.businessAddressType) === "home address"
  ) {
    issues.push({
      id: "address-home-type",
      severity: "medium",
      field: "Address type",
      detail: "Your business address is flagged as a home address.",
      fixHint:
        "A non-residential address signals an established business to underwriters. A virtual office runs $25–$50/mo and resolves this.",
    });
  }

  // ── 2. Same phone number ───────────────────────────────────────────────
  const pPhone = normPhone(i.personalPhone);
  const bPhone = normPhone(i.businessPhone);
  if (pPhone && bPhone && pPhone === bPhone) {
    issues.push({
      id: "phone-match",
      severity: "high",
      field: "Phone",
      detail: "Your business phone is the same as your personal phone.",
      fixHint:
        "Get a dedicated business line (a VoIP number through OpenPhone, Grasshopper, or RingCentral works) and list it on 411 so the bureaus can verify it.",
    });
  } else if (bPhone && i.phone411Listed === false) {
    issues.push({
      id: "phone-not-411",
      severity: "low",
      field: "Phone (411)",
      detail: "Your business phone is not listed on 411 / directory assistance.",
      fixHint:
        "Submit your business phone to 411 (free via ListYourself.net). D&B and Equifax SBFE check this when verifying your file.",
    });
  }

  // ── 3. Email overlap ───────────────────────────────────────────────────
  const pEmail = norm(i.personalEmail);
  const bEmail = norm(i.businessEmail);

  if (pEmail && bEmail && pEmail === bEmail) {
    issues.push({
      id: "email-match",
      severity: "high",
      field: "Email",
      detail: "Your business email is the same as your personal email.",
      fixHint:
        "Create a dedicated business email on your own domain (e.g. you@yourbusiness.com) using Google Workspace or Microsoft 365.",
    });
  }

  // Free-domain business email
  const bDomain = emailDomain(i.businessEmail);
  if (bDomain && FREE_EMAIL_DOMAINS.has(bDomain)) {
    issues.push({
      id: "email-free-domain",
      severity: "high",
      field: "Business email domain",
      detail: `Your business email uses a free domain (${bDomain}). Funders treat this as a personal address.`,
      fixHint:
        "Switch to an email on a domain your business owns. Google Workspace at $7/user/mo gives you you@yourbusiness.com — required by SBA lenders and most underwriters.",
    });
  }

  // Email domain doesn't match website domain
  const wDomain = websiteDomain(i.websiteUrl);
  if (bDomain && wDomain && !FREE_EMAIL_DOMAINS.has(bDomain) && bDomain !== wDomain) {
    issues.push({
      id: "email-domain-mismatch",
      severity: "medium",
      field: "Email / website domain",
      detail: `Your business email domain (${bDomain}) does not match your website domain (${wDomain}).`,
      fixHint:
        "Use email on the same domain as your website so Google, LexisNexis, and the bureaus can verify the two are the same business.",
    });
  }

  // ── 4. Website ─────────────────────────────────────────────────────────
  if (!i.websiteUrl) {
    issues.push({
      id: "no-website",
      severity: "medium",
      field: "Website",
      detail: "Your business does not have a website on file.",
      fixHint:
        "A simple one-page site on your own domain is a baseline funder expectation. Carrd or Squarespace can be live in a day.",
    });
  } else if (i.websiteLive === false) {
    issues.push({
      id: "website-not-live",
      severity: "medium",
      field: "Website",
      detail: "Your business website is on file but not currently live.",
      fixHint:
        "Restore the site or update the URL — a dead link on bureau records hurts more than no link at all.",
    });
  }

  // ── 5. No business email at all ────────────────────────────────────────
  if (!bEmail) {
    issues.push({
      id: "no-business-email",
      severity: "medium",
      field: "Business email",
      detail: "No dedicated business email is on file.",
      fixHint:
        "Add a business email on your own domain. It is one of the first fields underwriters and bureaus pull.",
    });
  }

  // ── Score & status ────────────────────────────────────────────────────
  // Start at 100, deduct per issue weight.
  const weight: Record<SeparationSeverity, number> = { high: 25, medium: 12, low: 5 };
  const totalDeduction = issues.reduce((s, x) => s + weight[x.severity], 0);
  const score = Math.max(0, 100 - totalDeduction);

  const highCount = issues.filter(x => x.severity === "high").length;
  const mediumCount = issues.filter(x => x.severity === "medium").length;
  const lowCount = issues.filter(x => x.severity === "low").length;

  let status: SeparationResult["status"];
  if (highCount > 0) status = "critical";
  else if (mediumCount >= 2) status = "needs_work";
  else if (issues.length > 0) status = "minor";
  else status = "clean";

  return { issues, score, status, highCount, mediumCount, lowCount };
}

/**
 * Compact one-line summary safe to inject into Paige's context block or to
 * render as a banner subtitle.
 */
export function summarizeSeparation(r: SeparationResult): string {
  if (r.issues.length === 0) {
    return "Personal/business separation: clean — no commingling detected.";
  }
  const labels = r.issues.slice(0, 3).map(i => i.field).join(", ");
  const more = r.issues.length > 3 ? ` (+${r.issues.length - 3} more)` : "";
  return `Personal/business separation: ${r.status.replace("_", " ")} — ${r.highCount} high, ${r.mediumCount} medium, ${r.lowCount} low. Issues: ${labels}${more}.`;
}
