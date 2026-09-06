export type VaultAccessState = "loading" | "allowed" | "denied" | "error";
export type VaultHandlingMode = "store_only" | "classify" | "approved_context";
export type VaultSourceState = "current" | "missing" | "stale" | "superseded";
export type VaultObligationState =
  | "proposed"
  | "awaiting_review"
  | "confirmed"
  | "due_soon"
  | "in_progress"
  | "completed"
  | "renewed"
  | "waived"
  | "overdue"
  | "retired"
  | "unavailable";

export type VaultObligation = {
  id: string;
  title: string;
  category: string;
  state: VaultObligationState;
  dueAt: string | null;
  sourceState: VaultSourceState;
  ownerAssigned: boolean;
  cadence?: string | null;
  nextAction?: string | null;
  sourceRecordId?: string | null;
  contractId?: string | null;
  timezone?: string | null;
  noticeDays?: number | null;
};

export type VaultRecord = {
  id: string;
  title: string;
  section: string;
  recordType: string;
  handlingMode: VaultHandlingMode;
  lifecycleState: string;
  truthState: string;
  sourceState: VaultSourceState;
  originalFilename: string | null;
  versionId?: string | null;
  validationState?: string | null;
  validationDetail?: string | null;
  inspectionState?: "passed" | "unavailable";
  inspectedAt?: string | null;
  inspectionAdapter?: string | null;
  visibility?: "owner_only" | "owner_admin";
  interpretationState?: string;
  createdAt: string;
  updatedAt: string;
  retentionUntil?: string | null;
};

export type VaultSnapshot = {
  records: VaultRecord[];
  obligations: VaultObligation[];
  contracts?: VaultContract[];
  facts?: VaultFact[];
  contractsNeedingAttention: number;
  awaitingReview: number;
  recentlyReviewed: number;
  uploadCapability?: { available: boolean; state: "live" | "unavailable" };
};

export type VaultFact = {
  id: string;
  recordId: string;
  versionId: string;
  factKey: string;
  factValue: string | number | boolean;
  provenance: "owner_entered" | "reviewed_extraction";
  state:
    | "proposed"
    | "approved"
    | "stale"
    | "corrected"
    | "rejected"
    | "revoked"
    | "retired";
  freshUntil: string | null;
  reviewedAt: string | null;
};

export type VaultContract = {
  id: string;
  recordId: string;
  contractType: string;
  counterpartyName: string | null;
  effectiveDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  noticeDays: number | null;
  paymentTerms: string | null;
  state: string;
  reviewState: string;
  ownerAssigned: boolean;
};

export function buildVaultContractMutation(
  initial: VaultContract | null | undefined,
  values: {
    recordId: string;
    contractType: string;
    counterpartyName: string;
    effectiveDate: string;
    endDate: string;
    renewalDate: string;
    noticeDays: string;
    paymentTerms: string;
  },
) {
  return {
    id: initial?.id || "",
    ...values,
    state: initial?.state || "draft",
  };
}

export function getVaultAccessPresentation(state: VaultAccessState) {
  return { canRender: state === "allowed", state };
}

export function summarizeContinuityPulse(
  obligations: VaultObligation[],
  now = new Date(),
) {
  const current = obligations.filter((item) => item.sourceState === "current");
  const dueSoon = current.filter((item) => {
    if (item.state !== "confirmed" && item.state !== "due_soon") return false;
    if (!item.dueAt) return false;
    const days = (new Date(item.dueAt).getTime() - now.getTime()) / 86_400_000;
    return days >= 0 && days <= 30;
  }).length;
  return {
    dueSoon,
    overdue: current.filter((item) => item.state === "overdue").length,
    withoutOwner: current.filter(
      (item) =>
        !item.ownerAssigned &&
        ["confirmed", "due_soon", "overdue", "in_progress"].includes(
          item.state,
        ),
    ).length,
    unavailable: obligations.filter(
      (item) => item.sourceState !== "current" || item.state === "unavailable",
    ).length,
  };
}

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SECRET_NAME =
  /(password|passwd|api[-_ ]?key|secret|recovery[-_ ]?code|private[-_ ]?key|seed[-_ ]?phrase|wallet|credential|token)/i;

export function validateVaultUpload(
  file: Pick<File, "name" | "size" | "type">,
  noSecretsAttested: boolean,
): string | null {
  if (!noSecretsAttested) {
    return "Confirm that this file contains no passwords, keys, recovery codes, or banking secrets.";
  }
  if (SECRET_NAME.test(file.name))
    return "Credential and secret files cannot be stored in the Business Vault.";
  if (!ACCEPTED_MIME.has(file.type)) return "This file type is not supported.";
  if (file.size > 15 * 1024 * 1024) return "Files must be 15 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  return null;
}
