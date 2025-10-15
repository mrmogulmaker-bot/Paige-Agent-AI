/**
 * Business Credit Task Templates
 * Categories: Business Credit, Funding, Business Compliance
 * Excludes: Data Furnishing (not supported)
 */

export interface BusinessTaskTemplate {
  id: string;
  title: string;
  category: "Business Credit" | "Funding" | "Business Compliance";
  tags: string[];
  priority: "P0" | "P1" | "P2";
  due_in_days: number; // Between 3-10 days
  estimated_minutes: number;
  checklist: string[];
  instructions: string;
  dependencies?: string[];
  resources?: string[];
  metrics?: Record<string, any>;
  track?: string; // BUILD framework step
}

export const businessCreditTaskTemplates: BusinessTaskTemplate[] = [
  // Business Formation & Setup
  {
    id: "bc-duns-setup",
    title: "Obtain D-U-N-S number for business",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#Formation", "#DUNS"],
    priority: "P0",
    due_in_days: 5,
    estimated_minutes: 30,
    track: "BUILD-B",
    checklist: [
      "Verify business is registered with state",
      "Apply for D-U-N-S via Dun & Bradstreet",
      "Confirm D-U-N-S issuance (7-10 business days)",
      "Document D-U-N-S number in business profile"
    ],
    instructions: "D-U-N-S number is required for business credit building. Apply free via D&B website using your EIN, business name, and address."
  },
  {
    id: "bc-paydex-monitor",
    title: "Monitor Paydex score and payment history",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#Monitoring", "#Paydex"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 20,
    track: "BUILD-U",
    checklist: [
      "Access D&B business credit report",
      "Review Paydex score (target: 80+)",
      "Verify vendor payment reporting",
      "Document score and identify improvement areas"
    ],
    instructions: "Paydex ranges 1-100; 80+ is excellent. Monitor quarterly and ensure vendor accounts report on-time payments."
  },

  // Vendor Credit Tiers
  {
    id: "bc-tier1-vendors",
    title: "Establish Tier 1 vendor accounts (net-30 starter)",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#VendorCredit", "#Tier1"],
    priority: "P1",
    due_in_days: 5,
    estimated_minutes: 45,
    track: "BUILD-U",
    checklist: [
      "Apply to Uline, Quill, Grainger (starter vendors)",
      "Make small purchases ($50-$200)",
      "Pay invoices 5-7 days early",
      "Verify reporting to D&B after 60-90 days"
    ],
    instructions: "Tier 1 vendors report to D&B and don't require PG. Start with 3-5 accounts, use regularly, pay early to build Paydex."
  },
  {
    id: "bc-tier2-vendors",
    title: "Graduate to Tier 2 vendor accounts (higher limits)",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#VendorCredit", "#Tier2"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 40,
    track: "BUILD-U",
    dependencies: ["bc-tier1-vendors"],
    checklist: [
      "Ensure 3+ Tier 1 tradelines on D&B report",
      "Apply to Amazon Business, Office Depot, FedEx",
      "Request credit limits $1K-$5K",
      "Maintain on-time payment record"
    ],
    instructions: "Tier 2 vendors offer higher limits and often report faster. Requires established Tier 1 history (3+ months)."
  },
  {
    id: "bc-tier3-vendors",
    title: "Obtain Tier 3 vendor credit (fleet/telecom)",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#VendorCredit", "#Tier3"],
    priority: "P2",
    due_in_days: 8,
    estimated_minutes: 50,
    track: "BUILD-D",
    dependencies: ["bc-tier2-vendors"],
    checklist: [
      "Confirm Paydex 75+, 5+ tradelines on report",
      "Apply to fleet cards (WEX, Shell) or telecom (AT&T)",
      "Request $5K-$10K limits",
      "Use and pay on-time to boost Paydex"
    ],
    instructions: "Tier 3 vendors report high-limit tradelines. Requires strong Paydex and established payment history."
  },

  // Funding Preparation
  {
    id: "fund-credit-readiness",
    title: "Prepare business credit profile for funding",
    category: "Funding",
    tags: ["#Funding", "#CreditReadiness"],
    priority: "P0",
    due_in_days: 7,
    estimated_minutes: 60,
    track: "BUILD-L",
    checklist: [
      "Verify 5+ vendor tradelines reporting",
      "Ensure Paydex 75+ and clean payment history",
      "Pull business credit reports (D&B, Experian, Equifax)",
      "Correct any inaccuracies via dispute process"
    ],
    instructions: "Lenders review business credit before approval. Target: 5+ tradelines, Paydex 75+, no delinquencies."
  },
  {
    id: "fund-revenue-docs",
    title: "Organize revenue documentation for funding applications",
    category: "Funding",
    tags: ["#Funding", "#Documentation", "#Revenue"],
    priority: "P1",
    due_in_days: 5,
    estimated_minutes: 45,
    track: "BUILD-I",
    checklist: [
      "Gather 3-6 months business bank statements",
      "Prepare profit & loss statements",
      "Collect invoices/AR aging if applicable",
      "Document revenue sources and trends"
    ],
    instructions: "Revenue verification is critical for funding. Organize clean, accurate financials showing consistent income."
  },
  {
    id: "fund-application-prep",
    title: "Complete funding application checklist",
    category: "Funding",
    tags: ["#Funding", "#ApplicationPrep"],
    priority: "P0",
    due_in_days: 6,
    estimated_minutes: 90,
    track: "BUILD-L",
    dependencies: ["fund-credit-readiness", "fund-revenue-docs"],
    checklist: [
      "EIN, business license, formation docs ready",
      "Business credit reports pulled and reviewed",
      "Revenue docs organized and accessible",
      "Personal credit score verified (if PG required)",
      "Funding purpose and amount defined"
    ],
    instructions: "Prepare complete application package before applying. Missing docs delay approval and hurt credibility."
  },
  {
    id: "fund-terms-review",
    title: "Review and compare funding offers/terms",
    category: "Funding",
    tags: ["#Funding", "#TermsReview"],
    priority: "P1",
    due_in_days: 4,
    estimated_minutes: 40,
    checklist: [
      "Compare APR/factor rates across offers",
      "Review payment terms and frequency",
      "Check for prepayment penalties or fees",
      "Calculate total cost of capital",
      "Verify personal guarantee requirements"
    ],
    instructions: "Always compare multiple offers. Understand total cost, not just approval amount. Avoid predatory terms."
  },

  // Business Compliance
  {
    id: "comp-annual-report",
    title: "File annual report with state (if required)",
    category: "Business Compliance",
    tags: ["#Compliance", "#AnnualReport"],
    priority: "P0",
    due_in_days: 10,
    estimated_minutes: 30,
    track: "BUILD-B",
    checklist: [
      "Verify state annual report deadline",
      "Update business address/officers if changed",
      "Pay filing fee",
      "Retain confirmation/receipt"
    ],
    instructions: "Most states require annual reports. Missing deadline can result in penalties or administrative dissolution."
  },
  {
    id: "comp-licenses-renewal",
    title: "Renew business licenses and permits",
    category: "Business Compliance",
    tags: ["#Compliance", "#Licenses"],
    priority: "P1",
    due_in_days: 8,
    estimated_minutes: 35,
    checklist: [
      "Inventory all required licenses/permits",
      "Check expiration dates",
      "Renew 30+ days before expiration",
      "Update business records with new dates"
    ],
    instructions: "Operating with expired licenses can void insurance and incur fines. Set renewal reminders 60 days in advance."
  },
  {
    id: "comp-registered-agent",
    title: "Verify registered agent service is current",
    category: "Business Compliance",
    tags: ["#Compliance", "#RegisteredAgent"],
    priority: "P2",
    due_in_days: 6,
    estimated_minutes: 15,
    checklist: [
      "Confirm registered agent renewal date",
      "Verify service address is current",
      "Update if moving or changing providers",
      "Ensure compliance documents are forwarded"
    ],
    instructions: "Registered agent receives legal/tax documents. Lapsed service can result in missed notices and default judgments."
  },
  {
    id: "comp-ein-verify",
    title: "Verify EIN and business structure accuracy",
    category: "Business Compliance",
    tags: ["#Compliance", "#EIN", "#BusinessStructure"],
    priority: "P1",
    due_in_days: 5,
    estimated_minutes: 20,
    track: "BUILD-B",
    checklist: [
      "Confirm EIN matches IRS records",
      "Verify business name and structure (LLC, Corp, etc.)",
      "Ensure EIN is used consistently across accounts",
      "Update if business structure changed"
    ],
    instructions: "Mismatched EIN or structure can block credit applications and create tax issues. Verify annually."
  },

  // Credit Monitoring
  {
    id: "bc-quarterly-review",
    title: "Quarterly business credit report review",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#Monitoring", "#Quarterly"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 45,
    track: "BUILD-U",
    checklist: [
      "Pull D&B, Experian Business, Equifax Business reports",
      "Review tradelines for accuracy",
      "Check for unauthorized inquiries",
      "Dispute errors within 30 days",
      "Document score trends"
    ],
    instructions: "Monitor quarterly to catch errors early and track credit building progress. Dispute inaccuracies immediately."
  },
  {
    id: "bc-utilization-check",
    title: "Optimize business credit utilization",
    category: "Business Credit",
    tags: ["#BusinessCredit", "#Utilization"],
    priority: "P1",
    due_in_days: 5,
    estimated_minutes: 30,
    track: "BUILD-U",
    checklist: [
      "Calculate utilization across all vendor/credit lines",
      "Target <30% utilization per account",
      "Pay down high-balance accounts",
      "Request credit limit increases on established accounts"
    ],
    instructions: "Keep utilization low to maximize Paydex and credit scores. Pay before statement dates when possible."
  }
];

// Helper functions
export function getBusinessTaskTemplate(id: string): BusinessTaskTemplate | undefined {
  return businessCreditTaskTemplates.find(t => t.id === id);
}

export function getBusinessTemplatesByCategory(category: BusinessTaskTemplate["category"]): BusinessTaskTemplate[] {
  return businessCreditTaskTemplates.filter(t => t.category === category);
}

export function getBusinessTemplatesByPriority(priority: BusinessTaskTemplate["priority"]): BusinessTaskTemplate[] {
  return businessCreditTaskTemplates.filter(t => t.priority === priority);
}

export function getBusinessTemplatesByTag(tag: string): BusinessTaskTemplate[] {
  return businessCreditTaskTemplates.filter(t => t.tags.includes(tag));
}

export function businessTemplateToTaskData(template: BusinessTaskTemplate) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + template.due_in_days);

  return {
    title: template.title,
    description: template.instructions,
    track: template.track || "BUILD-B",
    due_date: dueDate.toISOString().split('T')[0],
    metadata: {
      category: template.category,
      tags: template.tags,
      priority: template.priority,
      estimated_minutes: template.estimated_minutes,
      checklist: template.checklist,
      resources: template.resources || [],
      metrics: template.metrics || {},
      template_id: template.id
    }
  };
}

// Starter task suggestions for new business credit users
export function getBusinessStarterTasks(): BusinessTaskTemplate[] {
  return [
    getBusinessTaskTemplate("bc-duns-setup")!,
    getBusinessTaskTemplate("comp-ein-verify")!,
    getBusinessTaskTemplate("bc-tier1-vendors")!,
    getBusinessTaskTemplate("fund-credit-readiness")!
  ].filter(Boolean);
}

// Compliance-focused tasks
export function getComplianceTasks(): BusinessTaskTemplate[] {
  return businessCreditTaskTemplates.filter(t => t.category === "Business Compliance");
}

// Funding readiness tasks
export function getFundingReadinessTasks(): BusinessTaskTemplate[] {
  return businessCreditTaskTemplates.filter(t => t.category === "Funding");
}
