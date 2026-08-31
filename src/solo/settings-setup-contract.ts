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
  representativeUserIds: string[];
  provenance: Partial<Record<SoloSetupTextField | "representatives", SetupFactProvenance>>;
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
    brief[field] = typeof raw === "string" ? raw.trim() : "";
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
  brief.representativeUserIds = Array.isArray(source.representativeUserIds)
    ? Array.from(new Set(source.representativeUserIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())))
    : [];
  const representativeProvenance = provenanceSource.representatives;
  if (isRecord(representativeProvenance) && ["owner_confirmed", "needs_confirmation"].includes(String(representativeProvenance.source))) {
    brief.provenance.representatives = {
      source: representativeProvenance.source as SetupFactSource,
      confidence: representativeProvenance.confidence === "confirmed" ? "confirmed" : "unknown",
      ...(typeof representativeProvenance.confirmedAt === "string" ? { confirmedAt: representativeProvenance.confirmedAt } : {}),
    };
  }
  if (typeof source.updatedAt === "string") brief.updatedAt = source.updatedAt;
  return brief;
}

export function validateSoloSetupBrief(brief: SoloSetupBrief): Partial<Record<SoloSetupTextField, string>> {
  const errors: Partial<Record<SoloSetupTextField, string>> = {};
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
  return errors;
}

export function prepareOwnerConfirmedBrief(brief: SoloSetupBrief, confirmedAt = new Date().toISOString()): SoloSetupBrief {
  const cleaned = cleanSoloSetupBrief(brief);
  const provenance: SoloSetupBrief["provenance"] = {};
  for (const field of SOLO_SETUP_TEXT_FIELDS) {
    if (cleaned[field]) provenance[field] = { source: "owner_confirmed", confidence: "confirmed", confirmedAt };
  }
  if (cleaned.representativeUserIds.length) {
    provenance.representatives = { source: "owner_confirmed", confidence: "confirmed", confirmedAt };
  }
  return { ...cleaned, provenance };
}

export function applySetupProposal(current: SoloSetupBrief, proposal: SoloSetupProposal): SoloSetupBrief {
  const next = { ...current };
  for (const field of SOLO_SETUP_TEXT_FIELDS) {
    const value = proposal.patch[field];
    if (typeof value === "string") next[field] = value;
  }
  return cleanSoloSetupBrief(next);
}

export function setupSourceLabel(source: SetupFactSource | undefined) {
  if (source === "owner_confirmed") return "Owner-confirmed";
  if (source === "connection_sourced") return "Connection-sourced";
  return "Needs confirmation";
}
