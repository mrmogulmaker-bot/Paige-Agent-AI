/**
 * Business Credit Task Templates v1.0.0
 * Categories: Business Credit, Funding, Business Compliance
 * Excludes: Data Furnishing (Metro 2, e-OSCAR - not supported)
 */

export interface BusinessTaskTemplate {
  id: string;
  title: string;
  category: "Business Credit" | "Funding" | "Business Compliance";
  tags: string[];
  priority: "P0" | "P1" | "P2" | "P3";
  due_in_days: number; // Between 3-10 days per system defaults
  estimated_minutes?: number;
  checklist: string[];
  instructions: string;
  dependencies?: string[];
  resources?: string[];
  metrics?: {
    target_paydex?: number;
    target_intelliscore?: number;
    target_dscr?: number;
    min_bank_balance?: number;
  };
  track?: string; // BUILD framework step
}

export const businessCreditTaskTemplates: BusinessTaskTemplate[] = [
  // Business Compliance Foundation
  {
    id: "bc-identity-consistency",
    title: "Verify business identity consistency",
    category: "Business Compliance",
    tags: ["#Compliance", "#GoodStanding"],
    priority: "P1",
    due_in_days: 3,
    estimated_minutes: 45,
    track: "BUILD-B",
    checklist: [
      "SOS record matches legal name",
      "IRS EIN letter on file",
      "Business address/phone/domain email consistent",
      "Website + 411 listing live",
      "NAICS selected and documented"
    ],
    instructions: "Audit all public records and internal docs for exact NAP+NAICS consistency across government, bank, and directory sources."
  },
  {
    id: "bc-annual-compliance",
    title: "Annual compliance health check",
    category: "Business Compliance",
    tags: ["#Compliance", "#Renewals"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 60,
    track: "BUILD-B",
    checklist: [
      "SOS good standing verified",
      "Licenses/permits renewed",
      "Registered agent active",
      "Address/phone/domain consistency reconfirmed"
    ],
    instructions: "Complete yearly compliance audit; fix any inconsistencies proactively."
  },

  // Business Credit - D-U-N-S & Paydex
  {
    id: "bc-duns-paydex-ready",
    title: "Request D-U-N-S and prep for Paydex",
    category: "Business Credit",
    tags: ["#DUNS", "#Paydex", "#BusinessCredit"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 40,
    track: "BUILD-B",
    checklist: [
      "Request/verify D-U-N-S",
      "Confirm industry classification",
      "Identify 3 trade references",
      "Set Net-30 payment SOP (<15 days actual)"
    ],
    instructions: "Create D-U-N-S, align NAICS, and set payment workflow to achieve Paydex ≥ 80.",
    metrics: { target_paydex: 80 }
  },
  {
    id: "bc-claim-biz-bureaus",
    title: "Claim Experian/Equifax Business profiles",
    category: "Business Credit",
    tags: ["#ExperianBiz", "#EquifaxBiz", "#Monitoring"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 35,
    track: "BUILD-U",
    checklist: [
      "Claim Experian Business profile and correct NAP",
      "Claim Equifax Business profile and correct NAP",
      "Enable bureau monitoring/alerts"
    ],
    instructions: "Claim and correct profiles; turn on monitoring for score/match changes.",
    metrics: { target_intelliscore: 76 }
  },

  // Vendor Credit Tiers
  {
    id: "bc-starter-vendors",
    title: "Open 3–5 starter Net-30 vendor accounts",
    category: "Business Credit",
    tags: ["#Vendors", "#TradeRefs", "#BusinessCredit"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 60,
    track: "BUILD-U",
    checklist: [
      "Select 3–5 vendors (Uline, Quill, Grainger)",
      "Place small orders invoiced to legal business",
      "Pay within 15 days"
    ],
    instructions: "Use vendors known to report; keep payments early to seed trade history."
  },
  {
    id: "bc-store-fleet-cards",
    title: "Apply for 2–3 store/fleet cards (Tier 2)",
    category: "Business Credit",
    tags: ["#Vendors", "#Fleet", "#PGPolicy"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 50,
    track: "BUILD-U",
    dependencies: ["bc-starter-vendors"],
    checklist: [
      "Evaluate PG/no-PG policy",
      "Map statement cut dates",
      "Apply to 2–3 targets; log decisions"
    ],
    instructions: "Sequence apps post vendor reporting; time payments pre-statement."
  },
  {
    id: "bc-corp-card-strategy",
    title: "Corporate card strategy & CLI cadence",
    category: "Business Credit",
    tags: ["#CorporateCard", "#CLI", "#Policy"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 45,
    track: "BUILD-D",
    checklist: [
      "Select issuers and products",
      "Document internal limit reallocation policy (if supported)",
      "Schedule CLI reviews every 90–120 days"
    ],
    instructions: "Codify PG/no-PG strategy; set quarterly CLI reviews with issuer rules."
  },
  {
    id: "bc-trade-ref-management",
    title: "Gather & verify trade references",
    category: "Business Credit",
    tags: ["#TradeRefs", "#Reporting"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 40,
    track: "BUILD-U",
    checklist: [
      "Collect invoices and payment proofs",
      "Verify vendor reporting behaviors",
      "Log on-time score impacts"
    ],
    instructions: "Maintain reference pack to accelerate bureau updates and tier jumps."
  },

  // Funding Preparation
  {
    id: "fund-profile-readiness",
    title: "Build fundability profile",
    category: "Funding",
    tags: ["#Funding", "#Readiness", "#Fundability"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 90,
    track: "BUILD-L",
    checklist: [
      "Upload EIN letter, operating docs, bank statements (3–6 mo)",
      "Prepare YTD P&L + last year tax return",
      "Document cash-flow and average balances"
    ],
    instructions: "Assemble lender-ready docs; ensure balances and cash-flow meet target thresholds.",
    metrics: { min_bank_balance: 5000 }
  },
  {
    id: "fund-choose-products",
    title: "Select funding products & targets",
    category: "Funding",
    tags: ["#Funding", "#Strategy"],
    priority: "P2",
    due_in_days: 5,
    estimated_minutes: 60,
    track: "BUILD-L",
    checklist: [
      "Match needs to LOC/term/SBA/MCA-alt",
      "Map lender criteria vs profile",
      "Create application sequence"
    ],
    instructions: "Choose 2–3 products and a phased app plan based on eligibility signals."
  },
  {
    id: "fund-apply-loc",
    title: "Apply for business line of credit",
    category: "Funding",
    tags: ["#Funding", "#LOC", "#Underwriting"],
    priority: "P1",
    due_in_days: 7,
    estimated_minutes: 75,
    track: "BUILD-L",
    dependencies: ["fund-profile-readiness"],
    checklist: [
      "Submit complete app + statements",
      "Confirm underwriting SLA and doc list",
      "Log decision; schedule follow-up"
    ],
    instructions: "Submit to target bank or CU; track underwriting milestones and conditions precedent."
  },
  {
    id: "fund-track-underwriting",
    title: "Track active underwriting & conditions",
    category: "Funding",
    tags: ["#Underwriting", "#FollowUp"],
    priority: "P1",
    due_in_days: 3,
    estimated_minutes: 30,
    track: "BUILD-L",
    checklist: [
      "Record assigned underwriter contact",
      "Upload requests (bank verif, tax transcripts, insurance)",
      "Set decision ETA reminders"
    ],
    instructions: "Maintain daily status until clear to close; escalate if SLA breached.",
    metrics: { target_dscr: 1.25 }
  },

  // Monitoring & Maintenance
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
      "Document Paydex/Intelliscore trends"
    ],
    instructions: "Monitor quarterly to catch errors early and track credit building progress. Dispute inaccuracies immediately."
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
    instructions: "Paydex ranges 1-100; 80+ is excellent. Monitor quarterly and ensure vendor accounts report on-time payments.",
    metrics: { target_paydex: 80 }
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
