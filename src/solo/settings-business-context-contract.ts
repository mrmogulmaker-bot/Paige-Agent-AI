import type {
  SetupFactProvenance,
  SoloSetupBrief,
} from "./settings-setup-contract";

export const SOLO_SETUP_TABS = [
  "business-profile",
  "public-presence",
  "people-email",
  "knowledge-bucket",
  "direction",
  "paige-brief",
] as const;

export type SoloSetupTab = (typeof SOLO_SETUP_TABS)[number];

export const SOLO_SETUP_TAB_LABELS: Record<SoloSetupTab, string> = {
  "business-profile": "Business profile",
  "public-presence": "Public Presence",
  "people-email": "People & email",
  "knowledge-bucket": "Knowledge bucket",
  direction: "Direction",
  "paige-brief": "Paige brief",
};

export type SetupKnowledgeSourceType = "link" | "document" | "catalog" | "note";
export type SetupKnowledgeReviewStatus = "ready" | "needs_review";

export type SetupKnowledgeSource = {
  id: string;
  sourceType: SetupKnowledgeSourceType;
  title: string;
  category:
    | "business"
    | "owners"
    | "coaches"
    | "consultants"
    | "representatives"
    | "offers";
  sourceUrl: string;
  reference: string;
  notes: string;
  reviewStatus: SetupKnowledgeReviewStatus;
  provenance: SetupFactProvenance;
  updatedAt?: string;
};

export const SOLO_PAIGE_PROFILE_FIELDS = [
  "voiceCharacter",
  "audienceRelationship",
  "messageStructure",
  "useMoreOften",
  "avoid",
  "channelDifferences",
  "workingStyleBoundaries",
] as const;

export type SoloPaigeProfileField = (typeof SOLO_PAIGE_PROFILE_FIELDS)[number];
export type SoloPaigeProfile = Record<SoloPaigeProfileField, string> & {
  provenance: Partial<Record<SoloPaigeProfileField, SetupFactProvenance>>;
};

export type SetupVoiceExample = {
  id: string;
  channel: "general" | "website" | "email" | "social" | "sales" | "support";
  kind: "sounds_like" | "avoid";
  example: string;
  note: string;
  provenance: SetupFactProvenance;
  updatedAt?: string;
};

export type ManagedEmailIdentity = {
  localPart: string;
  domain: string;
  address: string;
  available: boolean | null;
  registrationAvailable: boolean;
};

export type SoloBusinessContext = {
  brief: SoloSetupBrief;
  primaryBusinessEmail: string;
  knowledgeSources: SetupKnowledgeSource[];
  paigeProfile: SoloPaigeProfile;
  voiceExamples: SetupVoiceExample[];
  contextRevision: number;
};

export const EMPTY_PAIGE_PROFILE: SoloPaigeProfile = {
  voiceCharacter: "",
  audienceRelationship: "",
  messageStructure: "",
  useMoreOften: "",
  avoid: "",
  channelDifferences: "",
  workingStyleBoundaries: "",
  provenance: {},
};

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function provenanceOf(value: unknown): SetupFactProvenance {
  const source = recordOf(value);
  return {
    source: [
      "owner_confirmed",
      "connection_sourced",
      "needs_confirmation",
    ].includes(String(source.source))
      ? (source.source as SetupFactProvenance["source"])
      : "needs_confirmation",
    confidence: ["confirmed", "observed", "unknown"].includes(
      String(source.confidence),
    )
      ? (source.confidence as SetupFactProvenance["confidence"])
      : "unknown",
    ...(typeof source.confirmedAt === "string"
      ? { confirmedAt: source.confirmedAt }
      : {}),
  };
}

export function cleanSetupKnowledgeSources(
  value: unknown,
): SetupKnowledgeSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = recordOf(item);
    if (
      !["link", "document", "catalog", "note"].includes(String(row.sourceType))
    )
      return [];
    return [
      {
        id: typeof row.id === "string" ? row.id : "",
        sourceType: row.sourceType as SetupKnowledgeSourceType,
        title: typeof row.title === "string" ? row.title.trim() : "",
        category: [
          "business",
          "owners",
          "coaches",
          "consultants",
          "representatives",
          "offers",
        ].includes(String(row.category))
          ? (row.category as SetupKnowledgeSource["category"])
          : "business",
        sourceUrl:
          typeof row.sourceUrl === "string" ? row.sourceUrl.trim() : "",
        reference:
          typeof row.reference === "string" ? row.reference.trim() : "",
        notes: typeof row.notes === "string" ? row.notes.trim() : "",
        reviewStatus: row.reviewStatus === "ready" ? "ready" : "needs_review",
        provenance: provenanceOf(row.provenance),
        ...(typeof row.updatedAt === "string"
          ? { updatedAt: row.updatedAt }
          : {}),
      },
    ];
  });
}

export function cleanSoloPaigeProfile(value: unknown): SoloPaigeProfile {
  const row = recordOf(value);
  const provenance = recordOf(row.provenance);
  const result = { ...EMPTY_PAIGE_PROFILE, provenance: {} } as SoloPaigeProfile;
  for (const field of SOLO_PAIGE_PROFILE_FIELDS) {
    result[field] = typeof row[field] === "string" ? row[field].trim() : "";
    if (provenance[field])
      result.provenance[field] = provenanceOf(provenance[field]);
  }
  return result;
}

export function cleanSetupVoiceExamples(value: unknown): SetupVoiceExample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = recordOf(item);
    if (!["sounds_like", "avoid"].includes(String(row.kind))) return [];
    return [
      {
        id: typeof row.id === "string" ? row.id : "",
        channel: [
          "general",
          "website",
          "email",
          "social",
          "sales",
          "support",
        ].includes(String(row.channel))
          ? (row.channel as SetupVoiceExample["channel"])
          : "general",
        kind: row.kind as SetupVoiceExample["kind"],
        example: typeof row.example === "string" ? row.example.trim() : "",
        note: typeof row.note === "string" ? row.note.trim() : "",
        provenance: provenanceOf(row.provenance),
        ...(typeof row.updatedAt === "string"
          ? { updatedAt: row.updatedAt }
          : {}),
      },
    ];
  });
}

export function validateKnowledgeSource(source: SetupKnowledgeSource) {
  const errors: Partial<Record<keyof SetupKnowledgeSource, string>> = {};
  if (!source.title.trim()) errors.title = "Add a clear title for this source.";
  if (source.title.length > 240) errors.title = "Use 240 characters or fewer.";
  if (source.sourceUrl.length > 2048)
    errors.sourceUrl = "Use a link of 2,048 characters or fewer.";
  if (source.reference.length > 1000)
    errors.reference = "Use 1,000 characters or fewer.";
  if (source.notes.length > 4000)
    errors.notes = "Use 4,000 characters or fewer.";
  if (source.sourceType === "link" || source.sourceUrl.trim()) {
    try {
      const url = new URL(source.sourceUrl);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("protocol");
    } catch {
      errors.sourceUrl =
        "Use a complete https:// link. Setup stores the link but does not fetch it.";
    }
  }
  if (
    !source.sourceUrl.trim() &&
    !source.reference.trim() &&
    !source.notes.trim()
  )
    errors.reference = "Add a link, reference, or note.";
  return errors;
}

export function validateManagedEmailLocalPart(value: string) {
  const cleaned = value.trim().toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(cleaned) ||
    cleaned.includes("..")
  ) {
    return "Use 1–64 lowercase letters, numbers, periods, underscores, or hyphens.";
  }
  return null;
}
