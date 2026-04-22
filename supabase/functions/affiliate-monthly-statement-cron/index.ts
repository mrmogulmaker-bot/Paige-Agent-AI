// supabase/functions/affiliate-monthly-statement-cron/index.ts
// Sends monthly affiliate statement emails on the 1st of every month.
// For each ACTIVE affiliate (with email_affiliate_program enabled), aggregate
// last month's clicks, signups, conversions, commission earned, paid, pending,
// and YTD totals, then invoke send-transactional-email.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[AFFILIATE-MONTHLY-STATEMENT-CRON] ${step}${d}`);
};

const fmtCents = (cents: number) =>
  `$${((cents ?? 0) / 100).toFixed(2)}`;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    log("Starting monthly statement run");

    // Compute "last month" window (UTC)
    const now = new Date();
    const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(
      Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth() - 1, 1),
    );
    const monthLabel = `${MONTH_NAMES[lastMonthStart.getUTCMonth()]} ${lastMonthStart.getUTCFullYear()}`;
    const ytdStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

    log("Window", {
      lastMonthStart: lastMonthStart.toISOString(),
      lastMonthEnd: lastMonthEnd.toISOString(),
      monthLabel,
    });

    // Load active affiliates
    const { data: affiliates, error: affErr } = await supabase
      .from("affiliate_profiles")
      .select("id, user_id, referral_code")
      .eq("active", true);

    if (affErr) throw affErr;
    log("Active affiliates", { count: affiliates?.length ?? 0 });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const aff of affiliates ?? []) {
      try {
        // Pref + email check
        const { data: prefs } = await supabase
          .from("communication_preferences")
          .select("email_enabled, email_affiliate_program, unsubscribed_all")
          .eq("user_id", aff.user_id)
          .maybeSingle();

        if (
          prefs &&
          (prefs.unsubscribed_all ||
            !prefs.email_enabled ||
            (prefs as any).email_affiliate_program === false)
        ) {
          skipped++;
          continue;
        }

        // Look up email + name
        const { data: userRes } = await supabase.auth.admin.getUserById(aff.user_id);
        const recipientEmail = userRes?.user?.email;
        if (!recipientEmail) {
          skipped++;
          continue;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", aff.user_id)
          .maybeSingle();
        const firstName = (profile?.full_name ?? "").split(" ")[0] || "Partner";

        // Clicks last month
        const { count: clicks } = await supabase
          .from("referral_clicks")
          .select("*", { count: "exact", head: true })
          .eq("referral_code", aff.referral_code)
          .gte("clicked_at", lastMonthStart.toISOString())
          .lt("clicked_at", lastMonthEnd.toISOString());

        // Conversions last month
        const { data: convs } = await supabase
          .from("referral_conversions")
          .select("amount_cents, commission_cents, status, converted_at")
          .eq("affiliate_id", aff.id)
          .gte("converted_at", lastMonthStart.toISOString())
          .lt("converted_at", lastMonthEnd.toISOString());

        const lastMonthAttributed = (convs ?? []).filter(
          (c: any) => c.status === "attributed",
        );
        const conversionsCount = lastMonthAttributed.length;
        const commissionEarnedCents = lastMonthAttributed.reduce(
          (s: number, c: any) => s + (c.commission_cents ?? 0),
          0,
        );

        // Signups (unique referred users) last month — proxy via conversions referred_user_id distinct
        const { data: signupRows } = await supabase
          .from("referral_conversions")
          .select("referred_user_id")
          .eq("affiliate_id", aff.id)
          .gte("converted_at", lastMonthStart.toISOString())
          .lt("converted_at", lastMonthEnd.toISOString());
        const signupsCount = new Set(
          (signupRows ?? []).map((r: any) => r.referred_user_id),
        ).size;

        // Commission paid last month
        const { data: paidLastMonth } = await supabase
          .from("commission_payments")
          .select("amount_cents")
          .eq("affiliate_id", aff.id)
          .eq("status", "paid")
          .gte("paid_at", lastMonthStart.toISOString())
          .lt("paid_at", lastMonthEnd.toISOString());
        const commissionPaidCents = (paidLastMonth ?? []).reduce(
          (s: number, r: any) => s + (r.amount_cents ?? 0),
          0,
        );

        // Pending balance: total attributed all-time - total paid all-time
        const { data: allConv } = await supabase
          .from("referral_conversions")
          .select("commission_cents, status")
          .eq("affiliate_id", aff.id);
        const totalEarnedCents = (allConv ?? [])
          .filter((c: any) => c.status === "attributed")
          .reduce((s: number, c: any) => s + (c.commission_cents ?? 0), 0);
        const { data: allPaid } = await supabase
          .from("commission_payments")
          .select("amount_cents")
          .eq("affiliate_id", aff.id)
          .eq("status", "paid");
        const totalPaidCents = (allPaid ?? []).reduce(
          (s: number, r: any) => s + (r.amount_cents ?? 0),
          0,
        );
        const pendingCents = Math.max(totalEarnedCents - totalPaidCents, 0);

        // YTD commission earned
        const { data: ytdRows } = await supabase
          .from("referral_conversions")
          .select("commission_cents")
          .eq("affiliate_id", aff.id)
          .eq("status", "attributed")
          .gte("converted_at", ytdStart.toISOString());
        const ytdCents = (ytdRows ?? []).reduce(
          (s: number, r: any) => s + (r.commission_cents ?? 0),
          0,
        );

        // Skip silent months (no activity, no balance)
        const hasActivity =
          (clicks ?? 0) > 0 ||
          conversionsCount > 0 ||
          commissionPaidCents > 0 ||
          pendingCents > 0;
        if (!hasActivity) {
          skipped++;
          continue;
        }

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "affiliate-monthly-statement",
            recipientEmail,
            recipientUserId: aff.user_id,
            idempotencyKey: `aff-stmt-${aff.id}-${lastMonthStart.toISOString().slice(0, 7)}`,
            templateData: {
              monthLabel,
              firstName,
              referralLink: `https://paigeagent.ai?ref=${aff.referral_code}`,
              clicks: clicks ?? 0,
              signups: signupsCount,
              conversions: conversionsCount,
              earned: fmtCents(commissionEarnedCents),
              paid: fmtCents(commissionPaidCents),
              pending: fmtCents(pendingCents),
              ytdTotal: fmtCents(ytdCents),
            },
          },
        });

        sent++;
      } catch (e) {
        failed++;
        log("Error sending statement", { affiliateId: aff.id, error: String(e) });
      }
    }

    log("Run complete", { sent, skipped, failed });

    return new Response(
      JSON.stringify({ success: true, sent, skipped, failed, monthLabel }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    log("FATAL", { error: e?.message });
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
