import type { TaskMetadata } from "./taskSchema";

export interface TaskTemplate {
  id: string;
  title: string;
  category: "Personal Credit" | "Personal Finance";
  tags: string[];
  priority: "P0" | "P1" | "P2" | "P3";
  due_in_days: number;
  estimated_minutes: number;
  dependencies?: string[];
  checklist: string[];
  instructions: string;
  resources?: string[];
  metrics?: {
    target_utilization_pct?: number;
    target_score_gain?: number;
    target_savings_amount?: number;
  };
  track?: string;
}

/**
 * Pre-built Personal Credit task templates aligned with FCRA, FDCPA,
 * and credit repair best practices. These templates ensure compliance
 * and provide step-by-step guidance for users.
 */
export const personalCreditTaskTemplates: TaskTemplate[] = [
  {
    id: "pc-dispute-intake",
    title: "Pull and review all three consumer credit reports",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#ConsumerReports", "#Monitoring"],
    priority: "P1",
    due_in_days: 1,
    estimated_minutes: 25,
    track: "ACCEL-A",
    checklist: [
      "Download Experian/Equifax/TransUnion reports (PDF)",
      "Snapshot current scores",
      "Log negative items (collector, DOFD, balance, status)",
    ],
    instructions:
      "Collect current tri-merge or individual bureau reports and log all derogatories by bureau. Store PDFs and a summary in the client file.",
    resources: ["https://www.annualcreditreport.com"],
  },
  {
    id: "pc-fcra-dispute",
    title: "Draft and send FCRA dispute letters for inaccurate items",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#FCRA", "#CreditRepair"],
    priority: "P0",
    due_in_days: 3,
    estimated_minutes: 60,
    track: "ACCEL-C1",
    dependencies: ["pc-dispute-intake"],
    checklist: [
      "Identify inaccuracies (ownership, dates, balances, status)",
      "Generate dispute letters per bureau",
      "Mail certified; store receipts; set 30-day timer",
    ],
    instructions:
      "Cite FCRA §611(a). Challenge completeness/accuracy and request reinvestigation, method of verification, and deletion/correction.",
    resources: [],
  },
  {
    id: "pc-fdcpa-validate",
    title: "Send FDCPA validation to debt collectors (if applicable)",
    category: "Personal Credit",
    tags: ["#FDCPA", "#PersonalCredit", "#CreditRepair"],
    priority: "P1",
    due_in_days: 5,
    estimated_minutes: 45,
    track: "ACCEL-C1",
    checklist: [
      "List active collections and collector addresses",
      "Draft §809(b) validation letters",
      "Send CMRR; pause calls; diarize 30 days",
    ],
    instructions:
      "Request original contract, full accounting, chain of title, and collector's license where required.",
    resources: [],
  },
  {
    id: "pc-util-optimization",
    title: "Optimize revolving utilization to ≤30% (stretch: 10%)",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#CreditRepair"],
    priority: "P1",
    due_in_days: 14,
    estimated_minutes: 30,
    track: "ACCEL-E",
    checklist: [
      "Calculate total/individual utilization",
      "Time payments before statement cut",
      "Request soft-pull CLI on eligible cards",
    ],
    metrics: { target_utilization_pct: 30 },
    instructions:
      "Lower reported balances pre-statement and request CLIs on primary cards with 6+ months positive history.",
    resources: [],
  },
  {
    id: "pc-inquiry-audit",
    title: "Audit and address hard inquiries (last 24 months)",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#Monitoring"],
    priority: "P2",
    due_in_days: 7,
    estimated_minutes: 20,
    track: "ACCEL-C1",
    checklist: [
      "List all hard inquiries by bureau",
      "Identify unauthorized/duplicative pulls",
      "Dispute unauthorized pulls; request deletion",
    ],
    instructions:
      "Focus on unauthorized or non-permissible purpose inquiries; keep legitimate loan inquiries intact.",
    resources: [],
  },
  {
    id: "pf-budget-setup",
    title: "Build a monthly budget and automate savings",
    category: "Personal Finance",
    tags: ["#PersonalFinance", "#Budgeting", "#Savings"],
    priority: "P1",
    due_in_days: 5,
    estimated_minutes: 40,
    track: "ACCEL-E",
    checklist: [
      "List net income + fixed/variable expenses",
      "Apply 50/30/20 (or chosen) rule",
      "Set up auto-transfer to savings on payday",
    ],
    metrics: { target_savings_amount: 1000 },
    instructions:
      "Create a zero-based or 50/30/20 budget; automate transfers; track weekly.",
    resources: [],
  },
  {
    id: "pc-secured-card",
    title: "Open and use 1 secured credit card responsibly",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#CreditEducation"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 20,
    track: "ACCEL-E",
    checklist: [
      "Select low-fee secured card",
      "Charge 1–2 small recurring bills",
      "Pay in full before statement",
    ],
    instructions:
      "Keep utilization <10% on this line and pay early to build clean history.",
    resources: [],
  },
  {
    id: "pc-builder-loan",
    title: "Open a credit-builder loan (installment mix)",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#CreditEducation"],
    priority: "P2",
    due_in_days: 10,
    estimated_minutes: 20,
    track: "ACCEL-E",
    instructions:
      "Choose a builder loan with on-time reporting; schedule autopay; avoid early close until 6–12 months of history.",
    checklist: [
      "Compare options and fees",
      "Set autopay",
      "Monitor reporting after 60–90 days",
    ],
  },
  {
    id: "pc-goodwill",
    title: "Request goodwill/late-payment adjustments (if eligible)",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#CreditRepair"],
    priority: "P2",
    due_in_days: 12,
    estimated_minutes: 30,
    track: "ACCEL-C2",
    instructions:
      "For isolated late payments with long positive history, send goodwill letters citing hardship and restored behavior.",
    checklist: [
      "Identify tradelines with 1-off lates",
      "Draft goodwill request",
      "Follow up after 10 business days",
    ],
  },
  {
    id: "pc-id-protect",
    title: "Enable fraud alerts or freeze as needed",
    category: "Personal Credit",
    tags: ["#PersonalCredit", "#Monitoring"],
    priority: "P1",
    due_in_days: 2,
    estimated_minutes: 15,
    track: "ACCEL-L",
    instructions:
      "Set fraud alert or freeze/unfreeze with each bureau; document PINs; educate on thaw timing.",
    checklist: [
      "Place alert/freeze with EX/EQ/TU",
      "Store PINs securely",
      "Create thaw SOP",
    ],
  },
];

/**
 * Get a specific task template by ID
 */
export function getTaskTemplate(id: string): TaskTemplate | undefined {
  return personalCreditTaskTemplates.find((t) => t.id === id);
}

/**
 * Get all templates for a specific category
 */
export function getTemplatesByCategory(
  category: "Personal Credit" | "Personal Finance"
): TaskTemplate[] {
  return personalCreditTaskTemplates.filter((t) => t.category === category);
}

/**
 * Get templates by priority level
 */
export function getTemplatesByPriority(
  priority: "P0" | "P1" | "P2" | "P3"
): TaskTemplate[] {
  return personalCreditTaskTemplates.filter((t) => t.priority === priority);
}

/**
 * Get templates by tag
 */
export function getTemplatesByTag(tag: string): TaskTemplate[] {
  return personalCreditTaskTemplates.filter((t) => t.tags.includes(tag));
}

/**
 * Convert template to task data ready for database insertion
 */
export function templateToTaskData(template: TaskTemplate) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + template.due_in_days);

  const metadata: TaskMetadata = {
    tags: template.tags,
    priority: template.priority,
    estimated_minutes: template.estimated_minutes,
    dependencies: template.dependencies,
    checklist: template.checklist,
    resources: template.resources,
    metrics: template.metrics,
    category: template.category,
    instructions: template.instructions,
  };

  return {
    title: template.title,
    description: template.instructions,
    track: template.track || "ACCEL-A",
    due_date: dueDate.toISOString(),
    metadata,
  };
}

/**
 * Get recommended starter tasks for new users
 */
export function getStarterTasks(): TaskTemplate[] {
  return [
    getTaskTemplate("pc-dispute-intake"),
    getTaskTemplate("pc-id-protect"),
    getTaskTemplate("pf-budget-setup"),
    getTaskTemplate("pc-util-optimization"),
  ].filter((t): t is TaskTemplate => t !== undefined);
}

/**
 * Get high-priority FCRA compliance tasks
 */
export function getFCRAComplianceTasks(): TaskTemplate[] {
  return personalCreditTaskTemplates.filter(
    (t) =>
      t.tags.includes("#FCRA") ||
      t.tags.includes("#FDCPA") ||
      t.tags.includes("#ConsumerReports")
  );
}
