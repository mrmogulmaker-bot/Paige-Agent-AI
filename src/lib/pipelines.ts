// Shared types + helpers for the customizable pipeline system.
import { supabase } from "@/integrations/supabase/client";

export type Pipeline = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PipelineStage = {
  id: string;
  pipeline_id: string;
  label: string;
  color: string;
  order_index: number;
  probability: number;
  stage_type: "open" | "won" | "lost";
};

export type Deal = {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  contact_client_id: string | null;
  owner_user_id: string | null;
  value_cents: number;
  currency: string;
  expected_close_date: string | null;
  actual_close_date: string | null;
  status: "open" | "won" | "lost";
  lost_reason: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  offer_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const formatMoney = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((cents || 0) / 100);

export const dollarsToCents = (dollars: number | string) => {
  const n = typeof dollars === "string" ? parseFloat(dollars) : dollars;
  return Math.round((isNaN(n) ? 0 : n) * 100);
};

export async function logDealActivity(
  dealId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown> = {},
) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("deal_activities").insert([{
    deal_id: dealId,
    type,
    summary,
    actor_user_id: user?.id ?? null,
    payload: payload as never,
  }]);
}
