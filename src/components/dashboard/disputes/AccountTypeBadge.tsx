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

export function normalizeAccountType(itemType?: string | null): AccountTypeKey {
  if (!itemType) return "collection";
  const t = itemType.toLowerCase().replace(/[\s_-]+/g, "_");
  if (t.includes("collection")) return "collection";
  if (t.includes("charge") && t.includes("off")) return "charge-off";
  if (t.includes("charge_off") || t.includes("chargeoff")) return "charge-off";
  if (t.includes("late") || t.includes("delinquen")) return "late_payment";
  if (t.includes("repo")) return "repossession";
  if (t.includes("foreclos")) return "foreclosure";
  if (t.includes("bankrupt")) return "bankruptcy";
  if (t.includes("hard") && t.includes("inquir")) return "hard_inquiry";
  if (t.includes("soft") && t.includes("inquir")) return "soft_inquiry";
  if (t.includes("not_mine") || t.includes("not mine") || t.includes("unknown_account") || t.includes("fraud")) return "account_not_mine";
  return "collection";
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

export function AccountTypeBadge({ itemType }: { itemType?: string | null }) {
  const key = normalizeAccountType(itemType);
  const config = ACCOUNT_TYPES[key];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.color} border-0 gap-1 text-xs font-medium`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}
