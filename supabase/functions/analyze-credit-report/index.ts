import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CREDIT_REPORT_SYSTEM_PROMPT = `You are a credit report analysis expert specializing in consumer tri-merge reports (MyFreeScoreNow, IdentityIQ, SmartCredit, and similar services). You will be given a credit report PDF. Your job is to extract ALL information into structured JSON.

=== TRI-MERGE FORMAT RECOGNITION ===
Tri-merge reports present each account in a three-column format: TransUnion (left), Experian (middle), Equifax (right). Each account section shows which bureaus report it. Dashes (--) in a column mean the account is NOT reported at that bureau. You MUST read each column independently and correctly identify which bureaus report each account. An account with data in one column and dashes in the other two reports to only ONE bureau. This bureau-specific reporting is critical for dispute targeting.

=== FRAUD ALERT & SECURITY FREEZE DETECTION (HIGHEST PRIORITY) ===
Check the Consumer Statement section at the top of the report FIRST.
- FRAUD ALERTS: If an Initial Fraud Alert, Extended Fraud Alert, or ID Security Alert is present, extract it immediately. Record: alert type, which bureaus have it active, expiration date if listed.
- SECURITY FREEZES: If a security freeze is noted on any bureau, extract it. A freeze prevents new credit from being opened at that bureau — any application will be auto-declined unless lifted.
These MUST appear in the output as top-level fields.

=== NEGATIVE ITEM EXTRACTION — ALL TYPES ===
Extract and categorize ALL of the following:
1. Collection/Charge-off accounts — current balance owed, original creditor name (from "Original Creditor" field), which bureaus report them
2. Late payment history — even if account is now current. Extract late dates from "Days Late" section and Two-Year Payment History grid. Record as separate items with late_payment type.
3. Collection accounts placed with agencies — extract original creditor from "Original Creditor" field
4. Derogatory remarks: "Profit and Loss Write-Off", "Unpaid Balance Reported as Loss", "Charged Off as Bad Debt" or similar creditor remarks
5. Public records: bankruptcies, tax liens, judgments, civil suits

=== CROSS-BUREAU DISCREPANCY DETECTION ===
After extracting all accounts, compare the same debt across bureaus. Flag as high-priority dispute targets:
- Same debt under different tradeline names at different bureaus (e.g., "JEFFERSON CAPITAL SYST" vs "JEFFCAPSYS")
- Same debt appearing at some bureaus but not others, especially large balances
- Same account showing different balances at different bureaus
- Same account showing different open dates or status at different bureaus
Each discrepancy is an FCRA Section 611 dispute target.

=== DISPUTE BASIS LANGUAGE — LEGITIMATE STATUTORY GROUNDS ONLY ===
- Charge-off accounts: "Requesting verification of accuracy and completeness pursuant to FCRA Section 611. Please provide original account agreement and payment history."
- Collection accounts: "Requesting full validation pursuant to FDCPA Section 809(b). Provide verification of original creditor, original amount, and authority to collect."
- Cross-bureau discrepancies: "Account reported inconsistently across bureaus in violation of FCRA Section 623(a)(1) accuracy requirements. Requesting correction."
- Not mine / unknown: "No knowledge of this account. Requesting removal pursuant to FCRA Section 611 and method of verification used."
- Unauthorized inquiries: "Did not authorize this inquiry. Requesting removal pursuant to FCRA Section 604."
NEVER fabricate creditor agreements or promises that do not exist in the report.

=== PRIORITY RANKING ===
Rank negative items for dispute priority:
1. Single-bureau items with large balances (highest success rate, isolated impact)
2. Cross-bureau discrepancies (strongest dispute basis under FCRA)
3. Most recent charge-offs with highest balances (suppress scores most)
4. Older items with smaller balances (less impact but cleanable)
5. Third-party collection accounts (disputable for validation)

Return ONLY valid JSON with this exact structure:
{
  "report_type": "consumer" | "business",
  "bureau_detected": "string — which bureau(s) the report is from",
  "fraud_alerts": [
    {
      "alert_type": "Initial Fraud Alert" | "Extended Fraud Alert" | "ID Security Alert" | "Active Duty Alert",
      "bureaus": ["TransUnion", "Experian", "Equifax"],
      "expiration_date": "YYYY-MM-DD or null",
      "note": "string — plain language explanation of impact"
    }
  ],
  "security_freezes": [
    {
      "bureau": "string",
      "status": "active" | "temporary_lift",
      "note": "string — freeze prevents new credit at this bureau"
    }
  ],
  "scores": {
    "equifax": number or null,
    "experian": number or null,
    "transunion": number or null
  },
  "profile_summary": "string — 2-3 sentence plain-language summary including score range, key issues, and funding implications",
  "estimated_total_score_impact": number,
  "negative_items": [
    {
      "category": "late_payment" | "collection" | "charge_off" | "hard_inquiry" | "public_record" | "repossession" | "foreclosure" | "bankruptcy" | "tax_lien" | "judgment" | "other",
      "creditor_name": "string",
      "original_creditor": "string or null",
      "account_number_masked": "string or null",
      "amount": number or null,
      "date_reported": "YYYY-MM-DD or null",
      "date_of_occurrence": "YYYY-MM-DD or null",
      "bureaus_reporting": ["TransUnion", "Experian", "Equifax"],
      "bureau": "string — primary bureau for this entry",
      "status": "string — current status from report",
      "creditor_remarks": "string or null — exact remark text from report",
      "estimated_score_impact": number,
      "is_disputable": boolean,
      "dispute_reason_suggestion": "string — legitimate FCRA/FDCPA statutory language only",
      "dispute_priority": number (1-5, 1 being highest),
      "notes": "string — additional context"
    }
  ],
  "cross_bureau_discrepancies": [
    {
      "account_name": "string",
      "issue": "string — describe the inconsistency",
      "bureaus_affected": ["string"],
      "dispute_basis": "FCRA Section 623(a)(1) — inconsistent reporting across bureaus"
    }
  ],
  "positive_accounts": [
    {
      "creditor": "string",
      "account_type": "revolving" | "installment" | "mortgage" | "auto_loan" | "student_loan" | "other",
      "balance": number or null,
      "credit_limit": number or null,
      "utilization": number or null,
      "payment_status": "string",
      "account_age_months": number or null,
      "is_open": boolean,
      "opened_date": "YYYY-MM-DD or null",
      "bureaus_reporting": ["string"]
    }
  ],
  "payment_history_summary": {
    "on_time_percentage": number or null,
    "total_accounts": number,
    "accounts_in_good_standing": number,
    "accounts_with_issues": number
  },
  "hard_inquiries": [
    {
      "creditor_name": "string",
      "date": "YYYY-MM-DD",
      "bureau": "string",
      "is_authorized": boolean
    }
  ],
  "public_records": [
    {
      "type": "string",
      "filed_date": "YYYY-MM-DD or null",
      "amount": number or null,
      "status": "string"
    }
  ],
  "credit_age": {
    "oldest_account_months": number or null,
    "average_account_age_months": number or null,
    "newest_account_months": number or null
  },
  "funding_strategy_summary": "string — 3-5 sentences explaining how the current profile affects funding options. Be specific to the actual scores and negatives found. Include realistic next milestones."
}

For BUSINESS reports, adapt the structure with business-specific fields (PAYDEX, Intelliscore, etc.).

Be thorough. Extract EVERY item. If a field is not available, use null. Always return valid JSON.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limit
    const { data: rateLimitOk } = await supabase.rpc('check_rate_limit', {
      _user_id: user.id,
      _function_name: 'analyze-credit-report',
      _max_requests: 10,
      _window_minutes: 60,
    });

    if (!rateLimitOk) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again in an hour.', retryAfter: 3600 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '3600' } }
      );
    }

    const { uploadId } = await req.json();
    if (!uploadId) {
      return new Response(JSON.stringify({ error: 'uploadId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get upload record
    const { data: upload, error: uploadError } = await supabase
      .from('credit_report_uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (uploadError || !upload) {
      return new Response(JSON.stringify({ error: 'Upload not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update status to processing
    await supabase
      .from('credit_report_uploads')
      .update({ analysis_status: 'processing' })
      .eq('id', uploadId);

    // Download the PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('credit-report-uploads')
      .download(upload.file_path);

    if (downloadError || !fileData) {
      await supabase
        .from('credit_report_uploads')
        .update({ analysis_status: 'failed', error_message: 'Failed to download file' })
        .eq('id', uploadId);
      return new Response(JSON.stringify({ error: 'Failed to download file' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert PDF to base64 for the AI
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    const userPrompt = `Analyze this credit report PDF thoroughly. This may be a tri-merge report from MyFreeScoreNow, IdentityIQ, or a similar service. Pay special attention to the three-column bureau layout. Extract every negative item, positive account, inquiry, public record, fraud alert, security freeze, and cross-bureau discrepancy you can find. Return structured JSON as specified.`;

    // Call Lovable AI with the PDF
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: CREDIT_REPORT_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorId = crypto.randomUUID();
      console.error(`[ANALYZE-REPORT-ERROR-${errorId}] AI gateway error:`, aiResponse.status);

      const statusMessage = aiResponse.status === 429
        ? "Rate limits exceeded, please try again later."
        : aiResponse.status === 402
          ? "Payment required, please add funds to your Lovable AI workspace."
          : "AI analysis failed. Please try again.";

      await supabase
        .from('credit_report_uploads')
        .update({ analysis_status: 'failed', error_message: statusMessage })
        .eq('id', uploadId);

      return new Response(
        JSON.stringify({ error: statusMessage, errorId }),
        { status: aiResponse.status === 429 || aiResponse.status === 402 ? aiResponse.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    let rawContent = aiData.choices?.[0]?.message?.content || '';

    // Clean markdown code fences if present
    rawContent = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysisResult;
    try {
      analysisResult = JSON.parse(rawContent);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', rawContent.substring(0, 500));
      await supabase
        .from('credit_report_uploads')
        .update({ analysis_status: 'failed', error_message: 'Failed to parse AI analysis result' })
        .eq('id', uploadId);
      return new Response(
        JSON.stringify({ error: 'Failed to parse analysis results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the upload record with results
    const { error: updateError } = await supabase
      .from('credit_report_uploads')
      .update({
        analysis_status: 'completed',
        report_type: analysisResult.report_type || 'consumer',
        bureau_detected: analysisResult.bureau_detected,
        analysis_result: analysisResult,
        negative_items_extracted: analysisResult.negative_items || [],
        positive_accounts_extracted: analysisResult.positive_accounts || [],
        profile_summary: analysisResult.profile_summary,
        estimated_score_impact: analysisResult.estimated_total_score_impact || 0,
      })
      .eq('id', uploadId);

    if (updateError) {
      console.error('Failed to save analysis:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to save analysis results' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log audit event
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      entity: 'credit_report_upload',
      action: 'ai_analysis_completed',
      entity_id: uploadId,
      data: {
        report_type: analysisResult.report_type,
        bureau_detected: analysisResult.bureau_detected,
        negative_items_count: analysisResult.negative_items?.length || 0,
        positive_accounts_count: analysisResult.positive_accounts?.length || 0,
        fraud_alerts_count: analysisResult.fraud_alerts?.length || 0,
        security_freezes_count: analysisResult.security_freezes?.length || 0,
        discrepancies_count: analysisResult.cross_bureau_discrepancies?.length || 0,
      },
    });

    console.log(`Successfully analyzed credit report ${uploadId}`);

    return new Response(
      JSON.stringify({ success: true, analysis: analysisResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorId = crypto.randomUUID();
    console.error(`[ANALYZE-REPORT-ERROR-${errorId}]`, error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request', errorId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
