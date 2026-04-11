import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ScoreSchema = z.object({
  equifax: z.number().nullable().optional(),
  experian: z.number().nullable().optional(),
  transunion: z.number().nullable().optional(),
});

const NegativeItemSchema = z.object({
  creditor_name: z.string(),
  account_number_masked: z.string().nullable().optional(),
  bureau: z.string(),
  item_type: z.string(),
  amount: z.number().nullable().optional(),
  date_of_occurrence: z.string().nullable().optional(),
  date_reported: z.string().nullable().optional(),
  dispute_basis: z.string().nullable().optional(),
  estimated_score_impact: z.number().nullable().optional(),
  status: z.string().optional().default("active"),
});

const InquirySchema = z.object({
  creditor_name: z.string(),
  inquiry_date: z.string(),
  bureau: z.string(),
  is_authorized: z.boolean().optional().default(true),
});

const PositiveAccountSchema = z.object({
  creditor: z.string(),
  account_type: z.string(),
  balance: z.number().nullable().optional(),
  credit_limit: z.number().nullable().optional(),
  utilization: z.number().nullable().optional(),
  status: z.string().optional().default("current"),
  account_open_date: z.string().nullable().optional(),
  is_open: z.boolean().optional().default(true),
});

const DiscrepancySchema = z.object({
  account_name: z.string(),
  issue: z.string(),
  bureaus_affected: z.array(z.string()),
});

const SyncPayloadSchema = z.object({
  target_user_id: z.string().uuid(),
  report_type: z.string().optional().default("consumer"),
  scores: ScoreSchema.optional(),
  negative_items: z.array(NegativeItemSchema).optional().default([]),
  hard_inquiries: z.array(InquirySchema).optional().default([]),
  positive_accounts: z.array(PositiveAccountSchema).optional().default([]),
  oldest_account_date: z.string().nullable().optional(),
  average_account_age_months: z.number().nullable().optional(),
  oldest_account_age_months: z.number().nullable().optional(),
  discrepancies: z.array(DiscrepancySchema).optional().default([]),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawData = await req.json();
    let payload;
    try {
      payload = SyncPayloadSchema.parse(rawData);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return new Response(JSON.stringify({ error: "Invalid payload", details: err.issues }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const targetUserId = payload.target_user_id;

    // === Authorization check: user must be self, coach of client, or admin ===
    if (user.id !== targetUserId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        const { data: isCoach } = await supabase
          .from("coach_clients")
          .select("id")
          .eq("coach_user_id", user.id)
          .eq("client_user_id", targetUserId)
          .eq("status", "active")
          .maybeSingle();
        if (!isCoach) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const results: Record<string, any> = {};

    // 1. === CREDIT SCORES ===
    if (payload.scores) {
      const { equifax, experian, transunion } = payload.scores;

      // Get previous scores for audit log
      const { data: prevProfile } = await supabase
        .from("profiles")
        .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu")
        .eq("user_id", targetUserId)
        .maybeSingle();

      const updateFields: Record<string, any> = { updated_at: new Date().toISOString() };
      if (equifax != null) updateFields.estimated_fico_eq = equifax;
      if (experian != null) updateFields.estimated_fico_ex = experian;
      if (transunion != null) updateFields.estimated_fico_tu = transunion;

      const { error: scoreErr } = await supabase
        .from("profiles")
        .update(updateFields)
        .eq("user_id", targetUserId);

      if (scoreErr) {
        console.error("Score update error:", scoreErr);
      } else {
        results.scores_updated = true;

        // Log previous scores
        if (prevProfile) {
          await supabase.from("audit_logs").insert({
            user_id: targetUserId,
            entity: "credit_scores",
            action: "scores_updated_via_chat_upload",
            data: {
              previous: {
                equifax: prevProfile.estimated_fico_eq,
                experian: prevProfile.estimated_fico_ex,
                transunion: prevProfile.estimated_fico_tu,
              },
              new: { equifax, experian, transunion },
              source: "chat_report_upload",
              updated_by: user.id,
            },
          });
        }
      }
    }

    // 2. === NEGATIVE ITEMS ===
    let negativeItemsInserted = 0;
    let negativeItemsUpdated = 0;
    for (const item of payload.negative_items) {
      // Check for existing match
      const { data: existing } = await supabase
        .from("credit_negative_items")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("creditor_name", item.creditor_name)
        .eq("bureau", item.bureau)
        .ilike("account_number_masked", item.account_number_masked || "")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("credit_negative_items")
          .update({
            status: item.status,
            amount: item.amount,
            notes: item.dispute_basis,
            removal_probability: item.estimated_score_impact,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        negativeItemsUpdated++;
      } else {
        await supabase.from("credit_negative_items").insert({
          user_id: targetUserId,
          creditor_name: item.creditor_name,
          account_number_masked: item.account_number_masked,
          bureau: item.bureau,
          item_type: item.item_type,
          amount: item.amount,
          date_of_occurrence: item.date_of_occurrence || null,
          date_reported: item.date_reported || null,
          status: item.status || "active",
          notes: item.dispute_basis,
          removal_probability: item.estimated_score_impact,
          is_removable: true,
        });
        negativeItemsInserted++;
      }
    }
    results.negative_items = { inserted: negativeItemsInserted, updated: negativeItemsUpdated };

    // 3. === HARD INQUIRIES ===
    let inquiriesInserted = 0;
    let inquiriesUpdated = 0;
    for (const inq of payload.hard_inquiries) {
      const { data: existing } = await supabase
        .from("credit_inquiries")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("creditor_name", inq.creditor_name)
        .eq("inquiry_date", inq.inquiry_date)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("credit_inquiries")
          .update({
            bureau: inq.bureau,
            is_authorized: inq.is_authorized,
          })
          .eq("id", existing.id);
        inquiriesUpdated++;
      } else {
        await supabase.from("credit_inquiries").insert({
          user_id: targetUserId,
          creditor_name: inq.creditor_name,
          inquiry_date: inq.inquiry_date,
          bureau: inq.bureau,
          is_authorized: inq.is_authorized,
          status: inq.is_authorized ? "active" : "disputed",
        });
        inquiriesInserted++;
      }
    }
    results.hard_inquiries = { inserted: inquiriesInserted, updated: inquiriesUpdated };

    // 4. === POSITIVE ACCOUNTS ===
    let accountsInserted = 0;
    let accountsUpdated = 0;
    for (const acct of payload.positive_accounts) {
      const { data: existing } = await supabase
        .from("credit_accounts")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("creditor", acct.creditor)
        .maybeSingle();

      const accountTypeMap: Record<string, string> = {
        revolving: "revolving",
        installment: "installment",
        mortgage: "mortgage",
        open: "open",
      };
      const mappedType = accountTypeMap[acct.account_type?.toLowerCase()] || "revolving";

      if (existing) {
        await supabase
          .from("credit_accounts")
          .update({
            balance: acct.balance,
            current_balance: acct.balance,
            credit_limit: acct.credit_limit,
            limit_amount: acct.credit_limit,
            utilization: acct.utilization,
            status: acct.status,
            is_open: acct.is_open,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        accountsUpdated++;
      } else {
        await supabase.from("credit_accounts").insert({
          user_id: targetUserId,
          creditor: acct.creditor,
          type: mappedType,
          balance: acct.balance,
          current_balance: acct.balance,
          credit_limit: acct.credit_limit,
          limit_amount: acct.credit_limit,
          utilization: acct.utilization,
          status: acct.status || "current",
          is_open: acct.is_open ?? true,
          account_open_date: acct.account_open_date || null,
        });
        accountsInserted++;
      }
    }
    results.positive_accounts = { inserted: accountsInserted, updated: accountsUpdated };

    // 5. === CREDIT AGE METRICS ===
    if (payload.average_account_age_months != null || payload.oldest_account_age_months != null) {
      const updateData: Record<string, any> = {};
      if (payload.average_account_age_months != null) updateData.average_account_age_months = payload.average_account_age_months;
      if (payload.oldest_account_age_months != null) updateData.oldest_account_age_months = payload.oldest_account_age_months;
      updateData.data_sources = { chat_report_upload: new Date().toISOString() };
      updateData.calculated_at = new Date().toISOString();

      // Upsert credit_factor_scores
      const { data: existingFactors } = await supabase
        .from("credit_factor_scores")
        .select("id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existingFactors) {
        await supabase.from("credit_factor_scores").update(updateData).eq("id", existingFactors.id);
      } else {
        await supabase.from("credit_factor_scores").insert({ user_id: targetUserId, ...updateData });
      }
      results.credit_age_updated = true;
    }

    // 6. === CROSS-BUREAU DISCREPANCIES ===
    const hasDiscrepancies = payload.discrepancies.length > 0;
    await supabase
      .from("profiles")
      .update({
        has_discrepancies: hasDiscrepancies,
        cross_bureau_discrepancies: hasDiscrepancies ? payload.discrepancies : null,
        last_report_source: "chat_upload",
        last_report_analyzed_at: new Date().toISOString(),
      })
      .eq("user_id", targetUserId);
    results.discrepancies_flagged = hasDiscrepancies;

    // 7. === PME FUNDING READINESS RECALCULATION ===
    try {
      // Get current scores to calculate personal credit component
      const { data: profile } = await supabase
        .from("profiles")
        .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (profile) {
        const scores = [profile.estimated_fico_eq, profile.estimated_fico_ex, profile.estimated_fico_tu].filter(Boolean) as number[];
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        // Scale: 300-850 → 0-250 (25% of 1000)
        const personalCreditScore = avgScore > 0 ? Math.round(((avgScore - 300) / 550) * 250) : 0;

        const { data: existingReadiness } = await supabase
          .from("funding_readiness_scores")
          .select("id, business_credit_score, entity_structure_score, banking_history_score, revenue_documentation_score, lender_alignment_score")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (existingReadiness) {
          const overall = personalCreditScore +
            (existingReadiness.business_credit_score || 0) +
            (existingReadiness.entity_structure_score || 0) +
            (existingReadiness.banking_history_score || 0) +
            (existingReadiness.revenue_documentation_score || 0) +
            (existingReadiness.lender_alignment_score || 0);

          await supabase
            .from("funding_readiness_scores")
            .update({
              personal_credit_score: personalCreditScore,
              overall_score: overall,
              last_calculated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingReadiness.id);
        } else {
          await supabase.from("funding_readiness_scores").insert({
            user_id: targetUserId,
            personal_credit_score: personalCreditScore,
            overall_score: personalCreditScore,
            last_calculated_at: new Date().toISOString(),
          });
        }
        results.funding_readiness_recalculated = true;
      }
    } catch (frErr) {
      console.error("Funding readiness recalc error:", frErr);
    }

    // 8. === ACTIVITY LOG ===
    await supabase.from("audit_logs").insert({
      user_id: targetUserId,
      entity: "credit_report",
      action: "chat_report_analyzed",
      data: {
        report_type: payload.report_type,
        scores: payload.scores || null,
        negative_items_count: payload.negative_items.length,
        hard_inquiries_count: payload.hard_inquiries.length,
        positive_accounts_count: payload.positive_accounts.length,
        discrepancies_count: payload.discrepancies.length,
        synced_by: user.id,
        source: "chat_document_upload",
        sync_results: results,
      },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
