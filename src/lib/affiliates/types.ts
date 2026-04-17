// src/lib/affiliates/types.ts
export interface CommissionTier {
  id: string;
  tier_key: "admin" | "coach" | "external" | string;
  display_name: string;
  commission_rate: number;       // 0.40 = 40%
  is_recurring: boolean;
  duration_months: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateStatRow {
  affiliate_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  referral_code: string;
  tier_key: string;
  tier_name: string;
  commission_rate: number;
  active: boolean;
  clicks: number;
  signups: number;
  paid_conversions: number;
  commission_owed_cents: number;
  commission_paid_ytd_cents: number;
}

export interface FunnelDay {
  day: string;       // ISO date
  clicks: number;
  signups: number;
  paid: number;
}

export interface ConversionRow {
  id: string;
  affiliate_id: string;
  converted_user_id: string;
  referral_code: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  amount_cents: number;
  commission_cents: number;
  status: "attributed" | "expired" | "reversed" | string;
  converted_at: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export type LeaderboardSortKey =
  | "full_name"
  | "tier_name"
  | "clicks"
  | "signups"
  | "paid_conversions"
  | "commission_owed_cents"
  | "commission_paid_ytd_cents";

export type SortDir = "asc" | "desc";
