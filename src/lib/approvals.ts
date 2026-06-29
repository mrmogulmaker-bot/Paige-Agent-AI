// Shared client-side helper for submitting approvals from anywhere in the app.
// Keeps a single shape so the policy engine + Approvals Hub UI always have
// the metadata they need (category, summary, source, client linkage).
import { supabase } from "@/integrations/supabase/client";

export type ApprovalCategory =
  | "ai_draft"
  | "field_ingest"
  | "compliance"
  | "legal"
  | "financial"
  | "dispute_letter"
  | "campaign"
  | "contract"
  | "refund"
  | "tier_change"
  | "workflow_action"
  | "other";

export interface CreateApprovalInput {
  category: ApprovalCategory;
  summary: string;                   // One-line human description
  draft_content: Record<string, unknown> | string;
  contact_id?: string | null;        // Always link to a client when one exists
  conversation_id?: string | null;
  source?: string;                   // e.g. "manual:coach_console", "paige_ai"
  priority?: 1 | 2 | 3 | 4 | 5;
  risk_level?: "low" | "medium" | "high" | "blocker";
  metadata?: Record<string, unknown>;
  type?: string;                     // legacy "type" column — defaults to category
}

export async function createApproval(input: CreateApprovalInput) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("active_tenant_id").eq("user_id", user.id).maybeSingle()
    : { data: null };

  const row = {
    type: (input.type ?? input.category) as string,
    category: input.category,
    summary: input.summary,
    draft_content: input.draft_content as never,
    contact_id: input.contact_id ?? null,
    conversation_id: input.conversation_id ?? null,
    source: input.source ?? "manual",
    priority: input.priority ?? null,
    risk_level: input.risk_level ?? null,
    metadata: (input.metadata ?? {}) as never,
    status: "pending" as const,
    submitted_by_user_id: user?.id ?? null,
    tenant_id: profile?.active_tenant_id ?? null,
  };

  return supabase.from("paige_pending_approvals").insert(row).select("id").single();
}

export const CATEGORY_LABEL: Record<ApprovalCategory, string> = {
  ai_draft: "AI Draft",
  field_ingest: "Field Ingest",
  compliance: "Compliance",
  legal: "Legal",
  financial: "Financial",
  dispute_letter: "Dispute Letter",
  campaign: "Campaign",
  contract: "Contract",
  refund: "Refund",
  tier_change: "Tier Change",
  workflow_action: "Workflow",
  other: "Other",
};

export const RISK_COLOR: Record<string, string> = {
  blocker: "bg-red-500/15 text-red-600 border-red-500/30",
  high: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  low: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
};

export const SLA_COLOR: Record<string, string> = {
  overdue: "bg-red-500 text-white",
  due_soon: "bg-amber-500 text-white",
  on_track: "bg-emerald-500 text-white",
  closed: "bg-muted text-muted-foreground",
  unscheduled: "bg-muted text-muted-foreground",
};
