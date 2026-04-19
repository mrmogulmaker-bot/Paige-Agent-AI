// Category metadata for the unified lender database.
// Color tokens use semantic Tailwind classes that map to design system HSL vars.

export type ProductCategoryKey =
  | "business_credit_card"
  | "business_line_of_credit"
  | "term_loan"
  | "sba_loan"
  | "equipment_financing"
  | "invoice_factoring"
  | "merchant_cash_advance"
  | "revenue_based_financing"
  | "commercial_real_estate"
  | "hard_money_loan"
  | "microfinance"
  | "cdfi_loan"
  | "grant"
  | "personal_loan_for_business"
  | "personal_credit_card"
  | "personal_line_of_credit";

export interface CategoryMeta {
  key: ProductCategoryKey;
  label: string;
  shortLabel: string;
  /** Semantic accent class for badges */
  badgeClass: string;
  /** Description shown in tab bar tooltips / empty states */
  description: string;
}

export const CATEGORY_ORDER: ProductCategoryKey[] = [
  "business_credit_card",
  "business_line_of_credit",
  "term_loan",
  "sba_loan",
  "equipment_financing",
  "invoice_factoring",
  "merchant_cash_advance",
  "revenue_based_financing",
  "commercial_real_estate",
  "hard_money_loan",
  "cdfi_loan",
  "microfinance",
  "grant",
  "personal_loan_for_business",
];

export const CATEGORIES: Record<ProductCategoryKey, CategoryMeta> = {
  business_credit_card: {
    key: "business_credit_card",
    label: "Business Credit Cards",
    shortLabel: "Credit Cards",
    badgeClass: "bg-gold/15 text-gold border-gold/30",
    description: "Revolving business credit lines — the foundation of business credit",
  },
  business_line_of_credit: {
    key: "business_line_of_credit",
    label: "Lines of Credit",
    shortLabel: "Lines of Credit",
    badgeClass: "bg-accent/15 text-accent border-accent/30",
    description: "Flexible draw-as-needed working capital",
  },
  term_loan: {
    key: "term_loan",
    label: "Term Loans",
    shortLabel: "Term Loans",
    badgeClass: "bg-primary/15 text-primary border-primary/30",
    description: "Fixed-amount loans repaid over a set period",
  },
  sba_loan: {
    key: "sba_loan",
    label: "SBA Loans",
    shortLabel: "SBA",
    badgeClass: "bg-fundability-excellent/15 text-fundability-excellent border-fundability-excellent/30",
    description: "Government-backed loans with the lowest rates",
  },
  equipment_financing: {
    key: "equipment_financing",
    label: "Equipment Financing",
    shortLabel: "Equipment",
    badgeClass: "bg-secondary/30 text-secondary-foreground border-secondary",
    description: "Equipment serves as collateral",
  },
  invoice_factoring: {
    key: "invoice_factoring",
    label: "Invoice Factoring",
    shortLabel: "Factoring",
    badgeClass: "bg-muted text-muted-foreground border-border",
    description: "Convert outstanding invoices into immediate cash",
  },
  merchant_cash_advance: {
    key: "merchant_cash_advance",
    label: "Merchant Cash Advance",
    shortLabel: "MCA",
    badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
    description: "Fast capital from future card sales — high cost",
  },
  revenue_based_financing: {
    key: "revenue_based_financing",
    label: "Revenue-Based Financing",
    shortLabel: "Revenue-Based",
    badgeClass: "bg-fundability-fair/15 text-fundability-fair border-fundability-fair/30",
    description: "Repayment scales with monthly revenue",
  },
  commercial_real_estate: {
    key: "commercial_real_estate",
    label: "Commercial Real Estate",
    shortLabel: "CRE",
    badgeClass: "bg-primary/15 text-primary border-primary/30",
    description: "Property purchase, refinance, and construction",
  },
  hard_money_loan: {
    key: "hard_money_loan",
    label: "Hard Money Loans",
    shortLabel: "Hard Money",
    badgeClass: "bg-accent/15 text-accent border-accent/30",
    description: "Asset-based loans for fix-and-flip and bridge financing",
  },
  microfinance: {
    key: "microfinance",
    label: "Microfinance",
    shortLabel: "Micro",
    badgeClass: "bg-fundability-excellent/15 text-fundability-excellent border-fundability-excellent/30",
    description: "Small-dollar loans for early-stage businesses",
  },
  cdfi_loan: {
    key: "cdfi_loan",
    label: "CDFI & Mission Lenders",
    shortLabel: "CDFI",
    badgeClass: "bg-fundability-excellent/15 text-fundability-excellent border-fundability-excellent/30",
    description: "Community-focused lenders serving underserved entrepreneurs",
  },
  grant: {
    key: "grant",
    label: "Grants",
    shortLabel: "Grants",
    badgeClass: "bg-gold/15 text-gold border-gold/30",
    description: "Non-dilutive funding — no repayment required",
  },
  personal_loan_for_business: {
    key: "personal_loan_for_business",
    label: "Personal Loans for Business",
    shortLabel: "Personal",
    badgeClass: "bg-muted text-muted-foreground border-border",
    description: "Personal credit-based loans deployed for business use",
  },
  personal_credit_card: {
    key: "personal_credit_card",
    label: "Personal Credit Cards",
    shortLabel: "Personal Cards",
    badgeClass: "bg-muted text-muted-foreground border-border",
    description: "Personal credit cards usable for business expenses",
  },
  personal_line_of_credit: {
    key: "personal_line_of_credit",
    label: "Personal Lines of Credit",
    shortLabel: "Personal LOC",
    badgeClass: "bg-muted text-muted-foreground border-border",
    description: "Personal credit lines deployed for business use",
  },
};

export function getCategoryMeta(category: string | null | undefined): CategoryMeta {
  if (!category) return CATEGORIES.term_loan;
  return CATEGORIES[category as ProductCategoryKey] ?? {
    key: "term_loan",
    label: category.replace(/_/g, " "),
    shortLabel: category.replace(/_/g, " "),
    badgeClass: "bg-muted text-muted-foreground border-border",
    description: "",
  };
}

/** Funding speed colors — communicates urgency vs cost trade-off */
export function getSpeedClass(speed: string | null | undefined): string {
  if (!speed) return "text-muted-foreground";
  const s = speed.toLowerCase();
  if (s.includes("same day") || s.includes("24")) return "text-fundability-excellent";
  if (s.includes("1-3 days") || s.includes("1-2 weeks")) return "text-fundability-fair";
  return "text-muted-foreground";
}
