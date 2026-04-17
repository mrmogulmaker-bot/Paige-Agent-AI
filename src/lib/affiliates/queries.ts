// src/lib/affiliates/queries.ts
// Typed Supabase queries for the referral/affiliate system.
// All queries respect RLS, so the same functions work for both admins
// (sees all rows) and staff (sees only their own).

import { supabase } from "@/integrations/supabase/client"; // ADJUST-IF-NEEDED
import type {
  AffiliateStatRow,
  CommissionTier,
  ConversionRow,
  DateRange,
  FunnelDay,
} from "./types";

function toIsoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Leaderboard / stat cards
// -----------------------------------------------------------------------------
export async function fetchAffiliateStats(): Promise<AffiliateStatRow[]> {
  const { data, error } = await supabase
    .from("v_affiliate_stats")
    .select("*")
    .order("commission_owed_cents", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AffiliateStatRow[];
}

export async function fetchMyAffiliateStats(
  userId: string,
): Promise<AffiliateStatRow | null> {
  const { data, error } = await supabase
    .from("v_affiliate_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as AffiliateStatRow) ?? null;
}

// -----------------------------------------------------------------------------
// Funnel chart
// -----------------------------------------------------------------------------
export async function fetchFunnel(range: DateRange): Promise<FunnelDay[]> {
  const { data, error } = await supabase
    .from("v_referral_funnel_daily")
    .select("*")
    .gte("day", toIsoDateOnly(range.from))
    .lte("day", toIsoDateOnly(range.to))
    .order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FunnelDay[];
}

// -----------------------------------------------------------------------------
// Per-affiliate drill-down
// -----------------------------------------------------------------------------
export async function fetchAffiliateConversions(
  affiliateId: string,
  range?: DateRange,
): Promise<ConversionRow[]> {
  let q = supabase
    .from("referral_conversions")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("converted_at", { ascending: false })
    .limit(200);

  if (range) {
    q = q.gte("converted_at", range.from.toISOString())
         .lte("converted_at", range.to.toISOString());
  }

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown) as ConversionRow[];
}

export async function fetchMyRecentConversions(
  affiliateId: string,
  limit = 10,
): Promise<ConversionRow[]> {
  const { data, error } = await supabase
    .from("referral_conversions")
    .select("*")
    .eq("affiliate_id", affiliateId)
    .order("converted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown) as ConversionRow[];
}

// -----------------------------------------------------------------------------
// Commission tiers
// -----------------------------------------------------------------------------
export async function fetchCommissionTiers(): Promise<CommissionTier[]> {
  const { data, error } = await supabase
    .from("affiliate_commission_tiers")
    .select("*")
    .order("commission_rate", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CommissionTier[];
}

export async function updateCommissionTier(
  id: string,
  patch: Partial<
    Pick<
      CommissionTier,
      "commission_rate" | "is_recurring" | "duration_months" | "display_name" | "notes"
    >
  >,
): Promise<CommissionTier> {
  const { data, error } = await supabase
    .from("affiliate_commission_tiers")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CommissionTier;
}
