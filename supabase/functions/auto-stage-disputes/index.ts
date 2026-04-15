import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id } = await req.json();
    if (!client_id) return new Response(JSON.stringify({ error: "client_id required" }), { status: 400 });

    const disputeReasonMap: Record<string, string> = {
      collection: "Under FDCPA Section 807 and FCRA Section 623(a)(1) I am requesting verification of this debt and correction of any inaccurate information.",
      collections: "Under FDCPA Section 807 and FCRA Section 623(a)(1) I am requesting verification of this debt and correction of any inaccurate information.",
      charge_off: "Under FCRA Section 623(a)(1) this creditor is required to report accurate information. I am disputing the accuracy of this charge-off and requesting the method of verification.",
      "charge-off": "Under FCRA Section 623(a)(1) this creditor is required to report accurate information. I am disputing the accuracy of this charge-off and requesting the method of verification.",
      late_payment: "Under FCRA Section 611 I am requesting investigation of this late payment notation as I believe it is being reported inaccurately.",
      repossession: "Under FCRA Section 623 I am disputing the accuracy of this repossession record and requesting complete verification including the date of first delinquency.",
    };

    const defaultReason = "Under FCRA Section 611 I am requesting an investigation into the accuracy of this account as reported on my credit file.";

    const { data: negativeItems } = await supabase
      .from("credit_negative_items")
      .select("*")
      .eq("user_id", client_id)
      .is("duplicate_of_id", null)
      .eq("is_disputed_ownership", false);

    if (!negativeItems || negativeItems.length === 0) {
      return new Response(JSON.stringify({ staged: 0 }), { headers: corsHeaders });
    }

    const { data: existingDisputes } = await supabase
      .from("disputes")
      .select("creditor_name, account_type, bureau")
      .eq("user_id", client_id);

    const existingKeys = new Set(
      (existingDisputes || []).map(d => `${d.creditor_name}|${d.account_type}|${d.bureau}`)
    );

    let staged = 0;
    for (const item of negativeItems) {
      const key = `${item.creditor_name}|${item.account_type}|${item.bureau_source}`;
      if (existingKeys.has(key)) continue;

      const accountType = (item.account_type || "").toLowerCase();
      const reason = disputeReasonMap[accountType] || defaultReason;

      await supabase.from("disputes").insert({
        user_id: client_id,
        creditor_name: item.creditor_name,
        account_type: item.account_type,
        bureau: item.bureau_source,
        amount: item.current_balance || item.original_amount || 0,
        status: "draft",
        is_auto_staged: true,
        dispute_reason: reason,
        created_at: new Date().toISOString(),
      });
      staged++;
    }

    return new Response(JSON.stringify({ staged }), { headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});
