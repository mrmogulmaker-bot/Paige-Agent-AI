export type SetupFactSource = "owner_confirmed" | "connection_sourced" | "needs_confirmation";
export type SetupFactConfidence = "confirmed" | "observed" | "unknown";

export type SetupFactProvenance = {
  source: SetupFactSource;
  confidence: SetupFactConfidence;
  confirmedAt?: string;
};

export const SOLO_SETUP_TEXT_FIELDS = [
  "legalName",
  "publicName",
  "dbaName",
  "website",
  "address",
  "phone",
  "industry",
  "naicsCode",
  "sicCode",
  "entityType",
  "stateOfFormation",
  "businessRegistrationIdentifier",
  "regionsOfOperation",
  "registeredStreet",
  "registeredStreetSecondary",
  "registeredCity",
  "registeredRegion",
  "registeredPostalCode",
  "registeredIsoCountry",
  "authorizedRepresentativePhone",
  "authorizedRepresentativeJobPosition",
  "offers",
  "deliveryModel",
  "idealCustomer",
  "customerSegments",
  "serviceArea",
  "currentPriority",
  "goals90Day",
  "annualDirection",
  "successDefinition",
  "constraints",
  "brandVoice",
  "operatingPreferences",
  "doNotAssume",
] as const;

export type SoloSetupTextField = (typeof SOLO_SETUP_TEXT_FIELDS)[number];

export type SoloSetupBrief = Record<SoloSetupTextField, string> & {
  /** Write-only. The server removes this before saving the business brief and stores it in Vault. */
  businessRegistrationNumber: string;
  /** Read-only masked state returned by the Setup identity seam. */
  businessRegistrationNumberLast4: string;
  representativeUserIds: string[];
  authorizedRepresentativeUserId: string;
  provenance: Partial<Record<SoloSetupTextField | "representatives" | "authorizedRepresentative", SetupFactProvenance>>;
  updatedAt?: string;
};

export type SoloSetupProposal = {
  id: string;
  reason: string;
  proposedAt: string;
  patch: Partial<SoloSetupBrief>;
};

export const EMPTY_SOLO_SETUP_BRIEF: SoloSetupBrief = {
  legalName: "",
  publicName: "",
  dbaName: "",
  website: "",
  address: "",
  phone: "",
  industry: "",
  naicsCode: "",
  sicCode: "",
  entityType: "",
  stateOfFormation: "",
  businessRegistrationIdentifier: "EIN",
  businessRegistrationNumber: "",
  businessRegistrationNumberLast4: "",
  regionsOfOperation: "USA_AND_CANADA",
  registeredStreet: "",
  registeredStreetSecondary: "",
  registeredCity: "",
  registeredRegion: "",
  registeredPostalCode: "",
  registeredIsoCountry: "US",
  authorizedRepresentativePhone: "",
  authorizedRepresentativeJobPosition: "",
  offers: "",
  deliveryModel: "",
  idealCustomer: "",
  customerSegments: "",
  serviceArea: "",
  currentPriority: "",
  goals90Day: "",
  annualDirection: "",
  successDefinition: "",
  constraints: "",
  brandVoice: "",
  operatingPreferences: "",
  doNotAssume: "",
  representativeUserIds: [],
  authorizedRepresentativeUserId: "",
  provenance: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanSoloSetupBrief(value: unknown, fallbackName = ""): SoloSetupBrief {
  const source = isRecord(value) ? value : {};
  const provenanceSource = isRecord(source.provenance) ? source.provenance : {};
  const brief = { ...EMPTY_SOLO_SETUP_BRIEF, provenance: {} } as SoloSetupBrief;
  for (const field of SOLO_SETUP_TEXT_FIELDS) {
    const raw = source[field];
    brief[field] = typeof raw === "string" ? raw.trim() : EMPTY_SOLO_SETUP_BRIEF[field];
    const p = provenanceSource[field];
    if (isRecord(p) && ["owner_confirmed", "connection_sourced", "needs_confirmation"].includes(String(p.source))) {
      brief.provenance[field] = {
        source: p.source as SetupFactSource,
        confidence: ["confirmed", "observed", "unknown"].includes(String(p.confidence))
          ? (p.confidence as SetupFactConfidence)
          : "unknown",
        ...(typeof p.confirmedAt === "string" ? { confirmedAt: p.confirmedAt } : {}),
      };
    }
  }
  if (!brief.publicName) brief.publicName = fallbackName.trim();
  brief.businessRegistrationNumber = "";
  brief.businessRegistrationNumberLast4 = typeof source.businessRegistrationNumberLast4 === "string"
    ? source.businessRegistrationNumberLast4.trim().slice(-4)
    : "";
  brief.representativeUserIds = Array.isArray(source.representativeUserIds)
    ? Array.from(new Set(source.representativeUserIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())))
    : [];
  brief.authorizedRepresentativeUserId = typeof source.authorizedRepresentativeUserId === "string"
    ? source.authorizedRepresentativeUserId.trim()
    : "";
  for (const key of ["representatives", "authorizedRepresentative"] as const) {
    const p = provenanceSource[key];
    if (isRecord(p) && ["owner_confirmed", "needs_confirmation"].includes(String(p.source))) {
      brief.provenance[key] = {
        source: p.source as SetupFactSource,
        confidence: p.confidence === "confirmed" ? "confirmed" : "unknown",
        ...(typeof p.confirmedAt === "string" ? { confirmedAt: p.confirmedAt } : {}),
      };
    }
  }
  if (typeof source.updatedAt === "string") brief.updatedAt = source.updatedAt;
  return brief;
}

export function validateSoloSetupBrief(brief: SoloSetupBrief): Partial<Record<SoloSetupTextField | "businessRegistrationNumber" | "authorizedRepresentativeUserId", string>> {
  const errors: Partial<Record<SoloSetupTextField | "businessRegistrationNumber" | "authorizedRepresentativeUserId", string>> = {};
  if (![brief.legalName, brief.publicName, brief.dbaName].some((value) => value.trim())) {
    errors.publicName = "Add at least one legal, public, or doing-business-as business name.";
  }
  if (brief.website.trim()) {
    try {
      const url = new URL(brief.website.trim());
      if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("protocol");
    } catch {
      errors.website = "Use a complete http:// or https:// business website.";
    }
  }
  if (brief.naicsCode.trim() && !/^\d{2,6}$/.test(brief.naicsCode.trim())) {
    errors.naicsCode = "NAICS codes use 2–6 digits. Leave blank if the owner has not confirmed one.";
  }
  if (brief.sicCode.trim() && !/^\d{4}$/.test(brief.sicCode.trim())) {
    errors.sicCode = "SIC codes use 4 digits. Leave blank if the owner has not confirmed one.";
  }
  if (brief.businessRegistrationIdentifier === "EIN" && (brief.businessRegistrationNumber ?? "").trim()) {
    const digits = (brief.businessRegistrationNumber ?? "").replace(/\D/g, "");
    if (!/^\d{9}$/.test(digits)) errors.businessRegistrationNumber = "An EIN must contain exactly 9 digits.";
  }
  if ((brief.authorizedRepresentativePhone ?? "").trim() && !/^\+[1-9]\d{7,14}$/.test((brief.authorizedRepresentativePhone ?? "").trim())) {
    errors.authorizedRepresentativePhone = "Use a complete E.164 phone number, including + and country code.";
  }
  if ((brief.registeredRegion ?? "").trim() && (brief.registeredRegion ?? "").trim().length !== 2) {
    errors.registeredRegion = "Use the two-letter state or province abbreviation.";
  }
  if ((brief.registeredIsoCountry ?? "").trim() && !/^[A-Za-z]{2}$/.test((brief.registeredIsoCountry ?? "").trim())) {
    errors.registeredIsoCountry = "Use a two-letter ISO country code.";
  }
  if (brief.authorizedRepresentativeUserId && !(brief.representativeUserIds ?? []).includes(brief.authorizedRepresentativeUserId)) {
    errors.authorizedRepresentativeUserId = "Choose an authorized representative from the confirmed business representatives.";
  }
  return errors;
}

export function prepareOwnerConfirmedBrief(brief: SoloSetupBrief, confirmedAt = new Date().toISOString()): SoloSetupBrief {
  const cleaned = cleanSoloSetupBrief(brief);
  cleaned.businessRegistrationNumber = (brief.businessRegistrationNumber ?? "").trim();
  const provenance: SoloSetupBrief["provenance"] = {};
  for (const field of SOLO_SETUP_TEXT_FIELDS) {
    if (cleaned[field]) provenance[field] = { source: "owner_confirmed", confidence: "confirmed", confirmedAt };
  }
  if (cleaned.representativeUserIds.length) {
    provenance.representatives = { source: "owner_confirmed", confidence: "confirmed", confirmedAt };
  }
  if (cleaned.authorizedRepresentativeUserId) {
    provenance.authorizedRepresentative = { source: "owner_confirmed", confidence: "confirmed", confirmedAt };
  }
  return { ...cleaned, provenance };
}

export function applySetupProposal(current: SoloSetupBrief, proposal: SoloSetupProposal): SoloSetupBrief {
  const next = { ...current };
  for (const field of SOLO_SETUP_TEXT_FIELDS) {
    const value = proposal.patch[field];
    if (typeof value === "string") next[field] = value;
  }
  if (Array.isArray(proposal.patch.representativeUserIds)) {
    next.representativeUserIds = proposal.patch.representativeUserIds;
  }
  // PAIGE proposals never carry the full registration number or choose the legal
  // representative. Those are direct owner-confirmation fields.
  next.businessRegistrationNumber = current.businessRegistrationNumber;
  next.authorizedRepresentativeUserId = current.authorizedRepresentativeUserId;
  return cleanSoloSetupBrief(next);
}

export function setupSourceLabel(source: SetupFactSource | undefined) {
  if (source === "owner_confirmed") return "Owner-confirmed";
  if (source === "connection_sourced") return "Connection-sourced";
  return "Needs confirmation";
}
