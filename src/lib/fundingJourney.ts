/**
 * Shared types, labels, and helpers for the Funding Journey tracker.
 * Mirrors the funding_journey_status, denial_reason_category, and
 * funding_milestone_type Postgres enums.
 */

import type { Database } from "@/integrations/supabase/types";

export type FundingJourneyStatus = Database["public"]["Enums"]["funding_journey_status"];
export type DenialReasonCategory = Database["public"]["Enums"]["denial_reason_category"];
export type FundingMilestoneType = Database["public"]["Enums"]["funding_milestone_type"];

export type FundingJourneyApplication =
  Database["public"]["Tables"]["funding_journey_applications"]["Row"];

export const STATUS_LABELS: Record<FundingJourneyStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  denied: "Denied",
  withdrawn: "Withdrawn",
  funded: "Funded",
};

/** Semantic Tailwind classes — color-coded per spec. */
export const STATUS_BADGE_CLASS: Record<FundingJourneyStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  submitted: "bg-primary/15 text-primary-foreground border-primary/30",
  under_review: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  approved: "bg-accent/20 text-accent border-accent/40",
  funded: "bg-accent/30 text-accent border-accent/60",
  denied: "bg-destructive/15 text-destructive border-destructive/30",
  withdrawn: "bg-muted text-muted-foreground border-border",
};

export const DENIAL_REASON_LABELS: Record<DenialReasonCategory, string> = {
  credit_score_too_low: "Credit Score Too Low",
  insufficient_time_in_business: "Insufficient Time in Business",
  insufficient_revenue: "Insufficient Revenue",
  too_much_existing_debt: "Too Much Existing Debt",
  no_collateral: "No Collateral",
  incomplete_application: "Incomplete Application",
  industry_restriction: "Industry Restriction",
  too_many_recent_inquiries: "Too Many Recent Inquiries",
  derogatory_items: "Derogatory Items",
  insufficient_cash_flow: "Insufficient Cash Flow",
  personal_guarantee_declined: "Personal Guarantee Declined",
  entity_structure_issue: "Entity Structure Issue",
  other: "Other",
};

export const DENIAL_REASON_OPTIONS: DenialReasonCategory[] = [
  "credit_score_too_low",
  "insufficient_time_in_business",
  "insufficient_revenue",
  "too_much_existing_debt",
  "insufficient_cash_flow",
  "no_collateral",
  "incomplete_application",
  "industry_restriction",
  "too_many_recent_inquiries",
  "derogatory_items",
  "personal_guarantee_declined",
  "entity_structure_issue",
  "other",
];

export const STATUS_OPTIONS: FundingJourneyStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "denied",
  "withdrawn",
  "funded",
];

export const MILESTONE_LABELS: Record<FundingMilestoneType, string> = {
  first_application: "First Application Submitted",
  first_approval: "First Approval Received",
  first_funding: "First Funding Secured",
  score_threshold_crossed: "Credit Score Threshold Crossed",
  debt_cleared: "Debt Cleared",
  business_credit_established: "Business Credit Established",
  dscr_qualified: "DSCR Qualified",
  sba_eligible: "SBA Eligible",
};

/**
 * Paige's recommended next steps per denial reason.
 * Used both in the Next Steps drawer (UI) and to seed application.next_steps.
 */
export function nextStepsForDenial(reason: DenialReasonCategory | null): string {
  switch (reason) {
    case "credit_score_too_low":
      return "Your file was reviewed but the score fell short. Focus on the two highest-impact moves: pay down any revolving balances over 30% utilization and dispute any inaccurate negatives. Re-apply after 60-90 days when the new score has reported.";
    case "insufficient_time_in_business":
      return "Time in business denials are about the calendar — they are not about you. Use this window to keep clean books, build banker relationships, and prepare a complete loan package. Look at fintechs (BlueVine, Fundbox, OnDeck) that accept 6-12 months of operations.";
    case "insufficient_revenue":
      return "The lender's revenue floor was not met. Document 3-6 consecutive months of consistent deposits, then look at lenders with lower thresholds in this product category. Revenue-based financing and CDFIs are usually more flexible.";
    case "too_much_existing_debt":
      return "Two paths: (1) pay down existing obligations to improve the debt-service-coverage ratio, or (2) move to lenders that use alternative underwriting — DSCR lenders for real estate, revenue-based for operations.";
    case "no_collateral":
      return "Pivot to unsecured products: business credit cards, lines of credit, revenue-based financing. Or build collateral via equipment financing on assets you would have purchased anyway.";
    case "incomplete_application":
      return "This is the easiest fix. Pull together: 2 years tax returns, 6 months bank statements, P&L, balance sheet, debt schedule, and a clean application. Re-apply within 30-60 days.";
    case "industry_restriction":
      return "This lender has a restricted-industry list. Switch to industry-friendly lenders or CDFIs that explicitly serve your sector. I can pull a list of lenders who actively fund your NAICS.";
    case "too_many_recent_inquiries":
      return "Lenders saw a cluster of recent pulls and read it as distress. Pause new applications for 90-120 days. During that window, build banker relationships and pre-qualify (soft pull only) before submitting any new full application.";
    case "derogatory_items":
      return "Derogatory items are addressable. Our Mogul Credit AI team handles disputes. While they work, look at lenders more flexible on derogs: CDFIs, community lenders, and some online lenders have more lenient policies here.";
    case "insufficient_cash_flow":
      return "DSCR came up short. Either grow monthly inflows (longer banking history, larger deposits) or lower the debt service by reducing the requested amount or extending the term. Revenue-based financing is usually a better fit when cash flow is tight.";
    case "personal_guarantee_declined":
      return "The lender's PG underwriting found a gap. Strengthen the personal file: utilization under 30%, no recent late payments, and at least 2 open revolving accounts in good standing. Re-apply once the personal score has caught up.";
    case "entity_structure_issue":
      return "The entity is missing something underwriters expect — articles of incorporation, EIN documentation, a business bank account in the entity name, or properly listed officers. Address the gap, then re-apply.";
    case "other":
    default:
      return "Request a written denial reason from the lender (FCRA §615 entitles you to one). I can help interpret it and map the specific path forward.";
  }
}

/** Recommended re-application window in months for each denial reason. */
export function reapplicationWindowMonths(reason: DenialReasonCategory | null): number {
  switch (reason) {
    case "too_many_recent_inquiries":
      return 4;
    case "credit_score_too_low":
    case "derogatory_items":
    case "insufficient_revenue":
    case "insufficient_cash_flow":
      return 3;
    case "incomplete_application":
      return 1;
    case "insufficient_time_in_business":
      return 6;
    default:
      return 2;
  }
}

export function statusToBadgeProps(status: FundingJourneyStatus) {
  return {
    label: STATUS_LABELS[status],
    className: STATUS_BADGE_CLASS[status],
  };
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `$${Number(amount).toLocaleString()}`;
}
