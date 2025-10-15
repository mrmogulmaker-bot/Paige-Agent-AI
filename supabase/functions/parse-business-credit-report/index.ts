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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { userId } = await req.json();
    if (userId !== user.id) {
      throw new Error('User ID mismatch');
    }

    console.log('Parsing business credit report for user:', userId);

    // Fetch the most recent business credit report document
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .eq('document_type', 'business_credit_report')
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (docError || !documents || documents.length === 0) {
      throw new Error('No business credit report found');
    }

    const document = documents[0];
    console.log('Found document:', document.file_name);

    // Download the PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(document.bucket_name)
      .download(document.file_path);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    console.log('Downloaded file, size:', fileData.size);

    // Convert to base64 for AI parsing
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Use Lovable AI to parse the credit report
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://api.lovable.app/v1/ai/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Parse this business credit report PDF and extract all tradeline/account information. For each account found, provide:
- Creditor name
- Account type (credit_card, line_of_credit, loan, net_terms, utility, or other)
- Credit limit (if available)
- Current balance (if available)
- Account status (open, closed, delinquent, etc.)
- Date opened (if available)
- Utilization percentage (if calculable)

Return the results as a JSON array of accounts. Only include actual credit accounts, not inquiry or personal information sections.`
              },
              {
                type: 'file',
                file: {
                  data: base64,
                  mime_type: 'application/pdf'
                }
              }
            ]
          }
        ]
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('Failed to parse PDF with AI');
    }

    const aiResult = await aiResponse.json();
    console.log('AI parsing complete');

    // Extract the accounts from AI response
    const content = aiResult.choices[0].message.content;
    let accounts = [];
    
    try {
      // Try to find JSON in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        accounts = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON array found in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('Failed to extract account data from parsed report');
    }

    console.log(`Found ${accounts.length} accounts in report`);

    // Insert accounts into credit_accounts table
    let accountsAdded = 0;
    for (const account of accounts) {
      try {
        const { error: insertError } = await supabase
          .from('credit_accounts')
          .insert({
            user_id: userId,
            creditor: account.creditor || account.creditorName || 'Unknown',
            type: account.type || account.accountType || 'other',
            limit_amount: account.creditLimit || account.limit || null,
            balance: account.balance || account.currentBalance || null,
            status: account.status || 'open',
            opened_on: account.dateOpened || account.openedDate || null,
            utilization: account.utilization || null,
          });

        if (!insertError) {
          accountsAdded++;
        } else {
          console.error('Error inserting account:', insertError);
        }
      } catch (accountError) {
        console.error('Error processing account:', accountError);
      }
    }

    console.log(`Successfully added ${accountsAdded} accounts`);

    return new Response(
      JSON.stringify({
        success: true,
        accountsAdded,
        totalParsed: accounts.length,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error parsing business credit report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse business credit report';
    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
