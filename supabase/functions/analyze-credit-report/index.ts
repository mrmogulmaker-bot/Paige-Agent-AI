import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const systemPrompt = `You are a credit report analysis expert. You will be given a credit report PDF (as an image or text). 
Your job is to extract ALL information into structured JSON. You must detect whether this is a CONSUMER report (Equifax, Experian, TransUnion) or BUSINESS report (D&B, Experian Business, Equifax Business).

Return ONLY valid JSON with this exact structure:
{
  "report_type": "consumer" | "business",
  "bureau_detected": "string — which bureau(s) the report is from",
  "profile_summary": "string — 2-3 sentence plain-language summary of overall credit health",
  "estimated_total_score_impact": number (estimated total negative score impact),
  "negative_items": [
    {
      "category": "late_payment" | "collection" | "charge_off" | "hard_inquiry" | "public_record" | "repossession" | "foreclosure" | "bankruptcy" | "tax_lien" | "judgment" | "other",
      "creditor_name": "string",
      "account_number_masked": "string or null",
      "amount": number or null,
      "date_reported": "YYYY-MM-DD or null",
      "date_of_occurrence": "YYYY-MM-DD or null",
      "bureau": "string",
      "status": "string — current status",
      "estimated_score_impact": number (negative number, e.g. -25),
      "is_disputable": boolean,
      "dispute_reason_suggestion": "string — suggested dispute approach",
      "notes": "string — any additional context"
    }
  ],
  "positive_accounts": [
    {
      "creditor": "string",
      "account_type": "revolving" | "installment" | "mortgage" | "auto_loan" | "student_loan" | "other",
      "balance": number or null,
      "credit_limit": number or null,
      "utilization": number or null (percentage),
      "payment_status": "string",
      "account_age_months": number or null,
      "is_open": boolean,
      "opened_date": "YYYY-MM-DD or null"
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
      "bureau": "string"
    }
  ],
  "public_records": [
    {
      "type": "string",
      "filed_date": "YYYY-MM-DD or null",
      "amount": number or null,
      "status": "string"
    }
  ]
}

For BUSINESS reports, adapt the structure:
- Use business-specific fields (PAYDEX, Intelliscore, etc.)
- Include trade lines as positive_accounts
- Include payment trends and risk factors

Be thorough. Extract EVERY item you can find. If a field is not available, use null. Always return valid JSON.`;

    const userPrompt = `Analyze this credit report PDF and extract all data into the structured JSON format described. Be thorough and extract every negative item, positive account, inquiry, and public record you can find.`;

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
          { role: "system", content: systemPrompt },
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
