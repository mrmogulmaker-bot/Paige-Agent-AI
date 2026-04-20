/**
 * Catalog of funding programs unlocked by client demographics & certifications.
 * Purely additive — used by Paige to surface targeted opportunities.
 * Nothing is hidden from clients based on these answers.
 */

export type DemographicProfile = {
  gender_identity?: string | null;
  ethnicity?: string[] | null;
  is_veteran?: boolean | null;
  is_service_disabled_veteran?: boolean | null;
  is_us_citizen?: boolean | null;
  is_minority_owned?: boolean | null;
  is_women_owned?: boolean | null;
  is_veteran_owned?: boolean | null;
  is_service_disabled_veteran_owned?: boolean | null;
  is_hubzone_located?: boolean | null;
  has_8a_certification?: boolean | null;
  has_wosb_certification?: boolean | null;
  has_vetcert_certification?: boolean | null;
};

export interface UnlockedProgram {
  key: string;
  name: string;
  category:
    | "federal_certification"
    | "federal_contracting"
    | "cdfi"
    | "sba_program"
    | "grant"
    | "training"
    | "lender";
  benefit: string;
  applyUrl?: string;
}

const NON_WHITE_ETHNICITIES = [
  "black_african_american",
  "hispanic_latino",
  "asian",
  "native_american_alaska_native",
  "native_hawaiian_pacific_islander",
  "middle_eastern_north_african",
  "multiracial",
];

export function isMinority(p: DemographicProfile): boolean {
  if (p.is_minority_owned === true) return true;
  return (p.ethnicity || []).some((e) => NON_WHITE_ETHNICITIES.includes(e));
}

export function isWomen(p: DemographicProfile): boolean {
  return p.is_women_owned === true || p.gender_identity === "female";
}

export function isVeteran(p: DemographicProfile): boolean {
  return p.is_veteran === true || p.is_veteran_owned === true;
}

export function isServiceDisabledVet(p: DemographicProfile): boolean {
  return (
    p.is_service_disabled_veteran === true ||
    p.is_service_disabled_veteran_owned === true
  );
}

const PROGRAMS: Array<UnlockedProgram & { eligible: (p: DemographicProfile) => boolean }> = [
  // Minority-owned
  {
    key: "sba_8a",
    name: "SBA 8(a) Business Development Program",
    category: "federal_certification",
    benefit:
      "9-year federal contracting set-aside program. Up to $7M in sole-source contracts and $4M for goods/services per award.",
    applyUrl: "https://certify.sba.gov/",
    eligible: (p) => isMinority(p) && p.has_8a_certification !== true,
  },
  {
    key: "mbda_centers",
    name: "MBDA Business Centers",
    category: "training",
    benefit:
      "Free consulting, capital access support, and contract opportunities for minority-owned businesses through 40+ federally-funded centers.",
    applyUrl: "https://www.mbda.gov/business-centers",
    eligible: (p) => isMinority(p),
  },
  {
    key: "liftfund",
    name: "LiftFund Small Business Loans",
    category: "cdfi",
    benefit:
      "CDFI lender focused on minority and underserved entrepreneurs. Loans $500–$1M with flexible underwriting.",
    applyUrl: "https://www.liftfund.com/",
    eligible: (p) => isMinority(p),
  },
  {
    key: "accion_opportunity_fund",
    name: "Accion Opportunity Fund",
    category: "cdfi",
    benefit:
      "Mission-driven CDFI offering $5K–$250K loans to women- and minority-owned businesses with FICO as low as 580.",
    applyUrl: "https://aofund.org/",
    eligible: (p) => isMinority(p) || isWomen(p),
  },

  // Women-owned
  {
    key: "wosb_certification",
    name: "WOSB / EDWOSB Federal Certification",
    category: "federal_certification",
    benefit:
      "Set-aside contracts for women-owned small businesses. 5% of all federal contract dollars target WOSB firms.",
    applyUrl: "https://certify.sba.gov/",
    eligible: (p) => isWomen(p) && p.has_wosb_certification !== true,
  },
  {
    key: "grameen_america",
    name: "Grameen America",
    category: "cdfi",
    benefit:
      "Microloans starting at $2,000 for low-income women entrepreneurs. No collateral or credit score required.",
    applyUrl: "https://www.grameenamerica.org/",
    eligible: (p) => isWomen(p),
  },
  {
    key: "wbenc",
    name: "WBENC Certification",
    category: "federal_certification",
    benefit:
      "Third-party women-owned business certification accepted by Fortune 500 corporate supply chains.",
    applyUrl: "https://www.wbenc.org/certification/",
    eligible: (p) => isWomen(p),
  },
  {
    key: "wbc_centers",
    name: "Women's Business Centers (WBC)",
    category: "training",
    benefit:
      "100+ SBA-funded centers offering business training, counseling, and access to capital for women entrepreneurs.",
    applyUrl: "https://www.sba.gov/local-assistance/find/?type=Women%27s%20Business%20Center",
    eligible: (p) => isWomen(p),
  },

  // Veteran
  {
    key: "vetcert",
    name: "VetCert (VOSB Certification)",
    category: "federal_certification",
    benefit:
      "Federal Veteran-Owned Small Business certification — required for VA contracting set-asides.",
    applyUrl: "https://veterans.certify.sba.gov/",
    eligible: (p) => isVeteran(p) && p.has_vetcert_certification !== true,
  },
  {
    key: "sdvosb",
    name: "SDVOSB Certification",
    category: "federal_contracting",
    benefit:
      "Service-Disabled Veteran-Owned Small Business set-asides. 3% of federal contracts target SDVOSB firms.",
    applyUrl: "https://veterans.certify.sba.gov/",
    eligible: (p) => isServiceDisabledVet(p),
  },
  {
    key: "boots_to_business",
    name: "Boots to Business",
    category: "training",
    benefit:
      "Free SBA entrepreneurship training for veterans and military spouses. Includes follow-on B2B Reboot programs.",
    applyUrl: "https://veterans.sba.gov/training-programs/",
    eligible: (p) => isVeteran(p),
  },
  {
    key: "vboc",
    name: "Veterans Business Outreach Centers",
    category: "training",
    benefit:
      "22 SBA-funded centers offering free business counseling, workshops, and mentoring exclusively for veterans.",
    applyUrl: "https://www.sba.gov/local-assistance/find/?type=Veterans%20Business%20Outreach%20Center",
    eligible: (p) => isVeteran(p),
  },
  {
    key: "sba_veterans_advantage",
    name: "SBA Veterans Advantage / Express Loans",
    category: "sba_program",
    benefit:
      "Reduced or zero guaranty fees on SBA Express loans up to $500K for veteran-owned businesses.",
    applyUrl: "https://www.sba.gov/funding-programs/loans/sba-express-loan-program",
    eligible: (p) => isVeteran(p),
  },
  {
    key: "streetshares",
    name: "StreetShares (Veteran-Focused Lender)",
    category: "lender",
    benefit:
      "Veteran-led online lender offering term loans, lines of credit, and contract financing with veteran-friendly underwriting.",
    applyUrl: "https://www.streetshares.com/",
    eligible: (p) => isVeteran(p),
  },
  {
    key: "hivers_strivers",
    name: "Hivers and Strivers",
    category: "lender",
    benefit:
      "Angel investment group focused exclusively on early-stage veteran-founded companies — typical investment $250K–$1M.",
    applyUrl: "https://hiversandstrivers.com/",
    eligible: (p) => isVeteran(p),
  },

  // HUBZone
  {
    key: "hubzone_certification",
    name: "HUBZone Certification",
    category: "federal_certification",
    benefit:
      "10% price preference on federal contract bids and 3% federal contracting set-aside for businesses in Historically Underutilized Business Zones.",
    applyUrl: "https://certify.sba.gov/",
    eligible: (p) => p.is_hubzone_located === true,
  },
];

export function getUnlockedPrograms(p: DemographicProfile): UnlockedProgram[] {
  if (!p) return [];
  return PROGRAMS.filter((prog) => prog.eligible(p)).map(
    ({ eligible: _eligible, ...rest }) => rest,
  );
}

export function summarizeDemographics(p: DemographicProfile): string {
  const parts: string[] = [];
  if (p.gender_identity && p.gender_identity !== "prefer_not_to_say") {
    const map: Record<string, string> = {
      male: "Man",
      female: "Woman",
      non_binary: "Non-binary",
    };
    parts.push(map[p.gender_identity] || p.gender_identity);
  }
  if (p.ethnicity && p.ethnicity.length > 0) {
    const filtered = p.ethnicity.filter((e) => e !== "prefer_not_to_say");
    if (filtered.length) {
      parts.push(`Ethnicity: ${filtered.join(", ").replace(/_/g, " ")}`);
    }
  }
  if (p.is_service_disabled_veteran) parts.push("Service-disabled veteran");
  else if (p.is_veteran) parts.push("Veteran");

  const certs: string[] = [];
  if (p.has_8a_certification) certs.push("8(a)");
  if (p.has_wosb_certification) certs.push("WOSB");
  if (p.has_vetcert_certification) certs.push("VetCert");
  if (p.is_hubzone_located) certs.push("HUBZone-located");

  if (certs.length) parts.push(`Certifications: ${certs.join(", ")}`);
  else parts.push("Certifications: none");

  return parts.length ? parts.join(" — ") : "No demographic data on file";
}

export const ETHNICITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "black_african_american", label: "Black or African American" },
  { value: "hispanic_latino", label: "Hispanic or Latino" },
  { value: "asian", label: "Asian" },
  { value: "native_american_alaska_native", label: "Native American or Alaska Native" },
  { value: "native_hawaiian_pacific_islander", label: "Native Hawaiian or Pacific Islander" },
  { value: "middle_eastern_north_african", label: "Middle Eastern or North African" },
  { value: "white_caucasian", label: "White or Caucasian" },
  { value: "multiracial", label: "Multiracial" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "male", label: "Man" },
  { value: "female", label: "Woman" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const CERTIFICATION_TYPES: Array<{
  key: "8a" | "wosb" | "hubzone" | "vetcert" | "sdvosb";
  name: string;
  description: string;
  url: string;
}> = [
  {
    key: "8a",
    name: "8(a) Business Development",
    description: "9-year federal contracting program for socially & economically disadvantaged businesses",
    url: "https://certify.sba.gov/",
  },
  {
    key: "wosb",
    name: "WOSB / EDWOSB",
    description: "Women-Owned Small Business federal certification for set-aside contracting",
    url: "https://certify.sba.gov/",
  },
  {
    key: "hubzone",
    name: "HUBZone",
    description: "10% price preference on federal contracts for businesses in underutilized zones",
    url: "https://certify.sba.gov/",
  },
  {
    key: "vetcert",
    name: "VetCert (VOSB)",
    description: "Veteran-Owned Small Business certification for VA contracting",
    url: "https://veterans.certify.sba.gov/",
  },
  {
    key: "sdvosb",
    name: "SDVOSB",
    description: "Service-Disabled Veteran-Owned Small Business — 3% federal contract set-aside",
    url: "https://veterans.certify.sba.gov/",
  },
];
