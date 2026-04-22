// recalculate-fundability-scores
// ------------------------------------------------------------
// Recomputes the three fundability scores for a given user using
// fresh negative-account ages, persists the snapshot, and fires a
// score_milestone analytics event when any score improves >=5 pts.
// Safe to call from the in-app "Refresh Scores" button or from a
// biannual pg_cron job.
// ------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------- Inline scoring (mirrors src/lib/fundabilityScores.ts) ----------

type ScoreType = "personal" | "small_business" | "commercial";

interface NegativeAccountInput {
  date?: string | null;
  isActive?: boolean;
}

interface ProfileInputs {
  ficoEq?: number | null;
  ficoEx?: number | null;
  ficoTu?: number | null;
  paymentHistoryScore?: number | null;
  utilizationScore?: number | null;
  inquiryScore?: number | null;
  creditMixScore?: number | null;
  negativeAccounts?: NegativeAccountInput[] | null;
  hasPersonalCreditFile: boolean;
  hasBusiness: boolean;
  entityType?: string | null;
  formationDate?: string | null;
  ein?: string | null;
  hasBusinessBankAccount?: boolean | null;
  bankAccountOpenedDate?: string | null;
  estimatedAnnualRevenue?: number | null;
  paydex?: number | null;
  intelliscore?: number | null;
  hasBusinessCreditDataPoint: boolean;
}

function monthsBetween(d: string | null | undefined, now = new Date()): number {
  if (!d) return 0;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return 0;
  return (
    (now.getFullYear() - dt.getFullYear()) * 12 +
    (now.getMonth() - dt.getMonth())
  );
}

function negWeight(date: string | null | undefined): number {
  const m = monthsBetween(date);
  if (m <= 6) return 1.0;
  if (m <= 12) return 0.75;
  if (m <= 18) return 0.5;
  if (m <= 24) return 0.25;
  if (m <= 48) return 0.1;
  if (m <= 84) return 0.05;
  return 0.01;
}

function totalWeightedNeg(negs: NegativeAccountInput[] | null | undefined): number {
  if (!negs) return 0;
  return negs
    .filter((n) => n.isActive !== false)
    .reduce((s, n) => s + negWeight(n.date), 0);
}

function avgFico(p: ProfileInputs): number | null {
  const arr = [p.ficoEq, p.ficoEx, p.ficoTu].filter(
    (x): x is number => typeof x === "number" && x > 0,
  );
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function ficoToPct(fico: number): number {
  if (fico >= 800) return 100;
  if (fico >= 760) return 92;
  if (fico >= 740) return 85;
  if (fico >= 720) return 78;
  if (fico >= 700) return 70;
  if (fico >= 680) return 60;
  if (fico >= 660) return 50;
  if (fico >= 640) return 40;
  if (fico >= 620) return 30;
  if (fico >= 580) return 20;
  return 10;
}

function tibMonths(p: ProfileInputs): number {
  if (!p.formationDate) return 0;
  return monthsBetween(p.formationDate);
}

function scorePersonal(p: ProfileInputs): number | null {
  const fico = avgFico(p);
  if (!p.hasPersonalCreditFile || fico == null) return null;
  const ficoPct = ficoToPct(fico);
  const adj =
    (p.utilizationScore ?? 70) * 0.1 +
    (p.paymentHistoryScore ?? 70) * 0.1 +
    (p.inquiryScore ?? 70) * 0.05 +
    (p.creditMixScore ?? 70) * 0.05;
  const penalty = Math.min(15, totalWeightedNeg(p.negativeAccounts) * 3);
  return Math.max(0, Math.min(100, Math.round(ficoPct * 0.7 + adj * 0.3 - penalty)));
}

function scoreSmallBusiness(p: ProfileInputs): number | null {
  const fico = avgFico(p);
  if (!p.hasPersonalCreditFile || fico == null) return null;
  if (!p.hasBusiness || !p.entityType || !p.formationDate || !p.ein) return null;

  const ficoPct = ficoToPct(fico);
  const tib = tibMonths(p);
  const tibPct = tib < 12 ? 0 : tib < 24 ? 50 : 100;
  const ent = (p.entityType || "").toLowerCase();
  let entityPct = 20;
  if (ent.includes("llc")) entityPct = 70;
  else if (ent.includes("corp")) entityPct = 100;
  const bankPct = p.hasBusinessBankAccount ? 100 : 0;
  let bizCreditPct = 0;
  if (p.hasBusinessCreditDataPoint) {
    const paydex = p.paydex ?? 0;
    const intel = p.intelliscore ?? 0;
    if (paydex >= 80 || intel >= 76) bizCreditPct = 100;
    else if (paydex >= 70 || intel >= 50) bizCreditPct = 70;
    else bizCreditPct = 40;
  }
  const penalty = Math.min(20, totalWeightedNeg(p.negativeAccounts) * 4);
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ficoPct * 0.5 +
          tibPct * 0.15 +
          entityPct * 0.1 +
          bankPct * 0.1 +
          bizCreditPct * 0.15 -
          penalty,
      ),
    ),
  );
}

function scoreCommercial(p: ProfileInputs): number | null {
  const tib = tibMonths(p);
  if (!p.hasBusiness || tib < 12 || !p.hasBusinessCreditDataPoint) return null;

  const paydex = p.paydex ?? 0;
  let paydexPct = 0;
  if (paydex >= 80) paydexPct = paydex > 80 ? 100 : 80;
  else if (paydex >= 70) paydexPct = 50;

  const intelPct = Math.max(0, Math.min(100, p.intelliscore ?? 0));
  let tibPct = 0;
  if (tib >= 36) tibPct = 100;
  else if (tib >= 24) tibPct = 70;
  else if (tib >= 12) tibPct = 30;

  const rev = p.estimatedAnnualRevenue ?? 0;
  let revPct = 20;
  if (rev >= 500_000) revPct = 100;
  else if (rev >= 100_000) revPct = 60;

  const bankM = monthsBetween(p.bankAccountOpenedDate);
  let bankPct = 0;
  if (bankM >= 12) bankPct = 100;
  else if (bankM >= 6) bankPct = 50;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        paydexPct * 0.35 +
          intelPct * 0.25 +
          tibPct * 0.2 +
          revPct * 0.15 +
          bankPct * 0.05,
      ),
    ),
  );
}

// ---------- Handler ----------

const MILESTONE_THRESHOLDS = [580, 620, 680, 720];

function crossedMilestone(prev: number | null, next: number | null): number | null {
  if (prev == null || next == null) return null;
  for (const t of MILESTONE_THRESHOLDS) {
    if (prev < t && next >= t) return t;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Resolve user_id from JWT or body (cron path)
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }
    let body: { user_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* no body is fine */
    }
    if (!userId && body.user_id) userId = body.user_id;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all inputs in parallel
    const [profileRes, factorsRes, bizRes, negRes, reportRes, snapshotRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, last_fundability_calculated, last_fundability_snapshot")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("credit_factor_scores")
          .select("payment_history_score, utilization_score, inquiry_score, credit_mix_score")
          .eq("user_id", userId)
          .order("calculated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("businesses")
          .select(
            "id, entity_type, formation_date, ein, has_bank_account, bank_account_opened_date, estimated_annual_revenue, dnb_paydex, experian_intelliscore, equifax_payment_index",
          )
          .eq("owner_user_id", userId)
          .order("display_order", { ascending: true, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("credit_negative_items")
          .select("date_of_occurrence, date_reported, status")
          .eq("user_id", userId),
        supabase
          .from("credit_report_personal_info")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        Promise.resolve(null),
      ]);

    const profile = profileRes.data;
    const factors = factorsRes.data;
    const biz = bizRes.data;
    const negatives = (negRes.data ?? []) as Array<{
      date_of_occurrence: string | null;
      date_reported: string | null;
      status: string | null;
    }>;
    const personalReportCount = reportRes.count ?? 0;

    const inputs: ProfileInputs = {
      ficoEq: profile?.estimated_fico_eq ?? null,
      ficoEx: profile?.estimated_fico_ex ?? null,
      ficoTu: profile?.estimated_fico_tu ?? null,
      paymentHistoryScore: factors?.payment_history_score ?? null,
      utilizationScore: factors?.utilization_score ?? null,
      inquiryScore: factors?.inquiry_score ?? null,
      creditMixScore: factors?.credit_mix_score ?? null,
      negativeAccounts: negatives.map((n) => ({
        date: n.date_of_occurrence ?? n.date_reported ?? null,
        isActive: (n.status ?? "active") !== "removed",
      })),
      hasPersonalCreditFile: personalReportCount > 0,
      hasBusiness: Boolean(biz?.id),
      entityType: biz?.entity_type ?? null,
      formationDate: biz?.formation_date ?? null,
      ein: biz?.ein ?? null,
      hasBusinessBankAccount: biz?.has_bank_account ?? null,
      bankAccountOpenedDate: biz?.bank_account_opened_date ?? null,
      estimatedAnnualRevenue: biz?.estimated_annual_revenue ?? null,
      paydex: biz?.dnb_paydex ?? null,
      intelliscore: biz?.experian_intelliscore ?? null,
      hasBusinessCreditDataPoint: Boolean(
        biz &&
          ((biz.dnb_paydex != null && biz.dnb_paydex > 0) ||
            (biz.experian_intelliscore != null && biz.experian_intelliscore > 0) ||
            (biz.equifax_payment_index != null && biz.equifax_payment_index > 0)),
      ),
    };

    const newScores = {
      personal: scorePersonal(inputs),
      small_business: scoreSmallBusiness(inputs),
      commercial: scoreCommercial(inputs),
    };

    const prevSnapshot = (profile?.last_fundability_snapshot ?? null) as
      | { personal?: number | null; small_business?: number | null; commercial?: number | null }
      | null;

    // Milestone detection — fire one event per score that improved by >=5
    const milestones: Array<{ score: string; prev: number | null; next: number | null; threshold?: number | null }> = [];
    (["personal", "small_business", "commercial"] as const).forEach((key) => {
      const prev = prevSnapshot?.[key] ?? null;
      const next = newScores[key];
      if (prev != null && next != null && next - prev >= 5) {
        milestones.push({
          score: key,
          prev,
          next,
          threshold: crossedMilestone(prev, next),
        });
      }
    });

    // Persist snapshot
    await supabase
      .from("profiles")
      .update({
        last_fundability_calculated: new Date().toISOString(),
        last_fundability_snapshot: newScores,
      })
      .eq("user_id", userId);

    // Fire analytics events for milestones (best-effort)
    for (const m of milestones) {
      try {
        await supabase.from("analytics_events").insert({
          event_name: "score_milestone",
          event_category: "credit",
          user_id: userId,
          properties: {
            score_type: m.score,
            previous_score: m.prev,
            new_score: m.next,
            improvement: (m.next ?? 0) - (m.prev ?? 0),
            crossed_threshold: m.threshold,
          },
        });
      } catch {
        /* never block */
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scores: newScores,
        previous: prevSnapshot,
        milestones,
        last_calculated: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[recalculate-fundability-scores] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
