import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CreditCard, DollarSign, Car, Home, Scale, Search, UserX, Info } from "lucide-react";

export const ACCOUNT_TYPES = {
  collection: { label: "Collection", icon: DollarSign, color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", statute: "FDCPA §809(b)" },
  "charge-off": { label: "Charge-Off", icon: CreditCard, color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", statute: "FCRA §611" },
  late_payment: { label: "Late Payment", icon: AlertTriangle, color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", statute: "FCRA §623(a)(1)" },
  repossession: { label: "Repossession", icon: Car, color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", statute: "FCRA §611" },
  foreclosure: { label: "Foreclosure", icon: Home, color: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300", statute: "FCRA §611" },
  bankruptcy: { label: "Bankruptcy", icon: Scale, color: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300", statute: "FCRA §611" },
  hard_inquiry: { label: "Hard Inquiry", icon: Search, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", statute: "FCRA §604" },
  soft_inquiry: { label: "Soft Inquiry", icon: Info, color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", statute: "N/A" },
  account_not_mine: { label: "Account Not Mine", icon: UserX, color: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300", statute: "FCRA §611" },
} as const;

export type AccountTypeKey = keyof typeof ACCOUNT_TYPES;

/**
 * Comprehensive account type classification.
 * Examines item_type, status, and remarks/notes to determine the correct dispute category.
 * Checks conditions in priority order and returns the first match.
 */
export function normalizeAccountType(
  itemType?: string | null,
  accountStatus?: string | null,
  remarks?: string | null
): AccountTypeKey {
  // Combine all fields for searching; normalize to lowercase with underscores
  const normalize = (s?: string | null) => (s || "").toLowerCase().replace(/[\s_-]+/g, "_");
  const t = normalize(itemType);
  const s = normalize(accountStatus);
  const r = normalize(remarks);
  const all = `${t} ${s} ${r}`;

  // 1. Account Not Mine / Fraud — check first as it overrides everything
  if (
    r.includes("not_mine") || r.includes("not mine") || r.includes("fraudulent") ||
    r.includes("identity_theft") || r.includes("unauthorized_account") ||
    t.includes("not_mine") || t.includes("unknown_account") || t.includes("fraud") ||
    t.includes("identity_theft")
  ) {
    return "account_not_mine";
  }

  // 2. Collections
  if (
    t.includes("collection") || s.includes("collection") ||
    all.includes("assigned_to_collection") || all.includes("placed_for_collection") ||
    all.includes("collection_agency")
  ) {
    return "collection";
  }

  // 3. Charge-Off
  if (
    t.includes("charge") || s.includes("charge") ||
    all.includes("charged_off") || all.includes("chargeoff") ||
    all.includes("bad_debt") || all.includes("writeoff") || all.includes("write_off") ||
    all.includes("written_off")
  ) {
    return "charge-off";
  }

  // 4. Repossession — must check BEFORE generic late payment
  if (
    t.includes("repo") || s.includes("repo") ||
    all.includes("repossession") || all.includes("voluntary_repo") || all.includes("involuntary_repo")
  ) {
    return "repossession";
  }

  // 5. Foreclosure
  if (
    t.includes("foreclos") || s.includes("foreclos") ||
    all.includes("deed_in_lieu") || all.includes("short_sale")
  ) {
    return "foreclosure";
  }

  // 6. Bankruptcy
  if (
    t.includes("bankrupt") || s.includes("bankrupt") ||
    all.includes("chapter_7") || all.includes("chapter_13") || all.includes("chapter_11") ||
    all.includes("discharged") || all.includes("included_in_bankruptcy")
  ) {
    return "bankruptcy";
  }

  // 7. Inquiries
  if (t.includes("inquir") || s.includes("inquir")) {
    if (r.includes("unauthorized") || r.includes("did_not_authorize") || t.includes("hard")) {
      return "hard_inquiry";
    }
    if (t.includes("soft")) return "soft_inquiry";
    // Default inquiry to hard (disputable)
    return "hard_inquiry";
  }

  // 8. Late Payment — only if not already classified as charge-off/collection above
  if (
    t.includes("late") || s.includes("late") ||
    all.includes("past_due") || all.includes("delinquen") ||
    all.includes("30_days") || all.includes("60_days") || all.includes("90_days") || all.includes("120_days")
  ) {
    return "late_payment";
  }

  // 9. Fallback: if the status suggests a negative account, default to charge-off
  if (
    s.includes("derogatory") || s.includes("negative") || s.includes("adverse") ||
    t.includes("installment") || t.includes("revolving") || t.includes("open_account")
  ) {
    console.warn(`[AccountType] Could not definitively classify: itemType="${itemType}", status="${accountStatus}". Defaulting to charge-off.`);
    return "charge-off";
  }

  // 10. Ultimate fallback — charge-off is safer than collection (collection implies FDCPA which may not apply)
  console.warn(`[AccountType] Unclassified account type: itemType="${itemType}", status="${accountStatus}", remarks="${remarks}". Defaulting to charge-off.`);
  return "charge-off";
}

export function getStatutoryLanguageByType(accountType: AccountTypeKey): string {
  switch (accountType) {
    case "collection":
      return "Requesting full validation of this debt pursuant to FDCPA Section 809(b). Please provide the name and address of the original creditor, the original balance owed, the date of first delinquency, and documentation of your authority to collect this debt.";
    case "charge-off":
      return "Requesting verification of accuracy and completeness of this account pursuant to FCRA Section 611. Please provide the original signed account agreement, complete payment history, and the method of verification used to confirm this information.";
    case "late_payment":
      return "Disputing the accuracy of the reported late payment pursuant to FCRA Section 623(a)(1). Please provide the complete payment history records and the method by which this late payment notation was verified as accurate.";
    case "repossession":
      return "Requesting verification of this repossession record pursuant to FCRA Section 611. Please provide the original account agreement, the deficiency balance calculation, auction records, and the method of verification.";
    case "foreclosure":
      return "Requesting verification of this foreclosure record pursuant to FCRA Section 611. Please provide the original mortgage agreement, default notification records, and the method of verification used.";
    case "bankruptcy":
      return "Requesting verification of this bankruptcy public record pursuant to FCRA Section 611. Please provide the case number, filing date, discharge date, and court documentation used to verify this entry.";
    case "hard_inquiry":
      return "This inquiry was not authorized by the consumer pursuant to FCRA Section 604. Please provide documentation of the permissible purpose for this inquiry or remove it from the consumer's credit file immediately.";
    case "soft_inquiry":
      return "Soft inquiries are informational and generally do not require dispute action.";
    case "account_not_mine":
      return "The consumer has no knowledge of this account pursuant to FCRA Section 611. This account does not belong to the consumer. Please provide the method of verification and the original signed application or agreement, or remove this account immediately.";
    default:
      return "Requesting verification of accuracy and completeness pursuant to FCRA Section 611.";
  }
}

export function AccountTypeBadge({ itemType, accountStatus, remarks }: { itemType?: string | null; accountStatus?: string | null; remarks?: string | null }) {
  const key = normalizeAccountType(itemType, accountStatus, remarks);
  const config = ACCOUNT_TYPES[key];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.color} border-0 gap-1 text-xs font-medium`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
