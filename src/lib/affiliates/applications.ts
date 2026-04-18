// src/lib/affiliates/applications.ts
// Queries + mutations for the affiliate_applications table.

import { supabase } from "@/integrations/supabase/client";

export type AffiliateApplicationStatus = "pending" | "approved" | "rejected";
export type RequestedTierKey = "external" | "coach" | "admin";

export interface AffiliateApplication {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  website_url: string | null;
  social_links: string | null;
  audience_description: string | null;
  why_join: string | null;
  requested_tier_key: RequestedTierKey;
  status: AffiliateApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  resulting_affiliate_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAffiliateApplication {
  full_name: string;
  email: string;
  phone?: string | null;
  website_url?: string | null;
  social_links?: string | null;
  audience_description?: string | null;
  why_join?: string | null;
  requested_tier_key?: RequestedTierKey;
  user_id?: string | null;
}

export async function submitAffiliateApplication(
  input: NewAffiliateApplication,
): Promise<AffiliateApplication> {
  const { data, error } = await supabase
    .from("affiliate_applications")
    .insert({
      full_name: input.full_name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      website_url: input.website_url?.trim() || null,
      social_links: input.social_links?.trim() || null,
      audience_description: input.audience_description?.trim() || null,
      why_join: input.why_join?.trim() || null,
      requested_tier_key: input.requested_tier_key ?? "external",
      user_id: input.user_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AffiliateApplication;
}

export async function fetchAffiliateApplications(
  status?: AffiliateApplicationStatus,
): Promise<AffiliateApplication[]> {
  let q = supabase
    .from("affiliate_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AffiliateApplication[];
}

export async function approveAffiliateApplication(
  applicationId: string,
  tierKey?: RequestedTierKey,
  notes?: string,
): Promise<{ affiliate_id: string; matched_user_id: string | null }> {
  const { data, error } = await supabase.rpc("approve_affiliate_application", {
    _application_id: applicationId,
    _tier_key: tierKey ?? null,
    _notes: notes ?? null,
  });
  if (error) throw error;
  return data as { affiliate_id: string; matched_user_id: string | null };
}

export async function rejectAffiliateApplication(
  applicationId: string,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc("reject_affiliate_application", {
    _application_id: applicationId,
    _notes: notes ?? null,
  });
  if (error) throw error;
}

export async function fetchMyAffiliateApplication(
  userId: string,
): Promise<AffiliateApplication | null> {
  const { data, error } = await supabase
    .from("affiliate_applications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AffiliateApplication) ?? null;
}
