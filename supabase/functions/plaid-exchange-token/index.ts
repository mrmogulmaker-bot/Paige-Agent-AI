import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { public_token, institution } = await req.json();

    if (!public_token || !institution) {
      return new Response(
        JSON.stringify({ error: 'Missing public_token or institution data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Exchanging public token for user:', user.id);

    // Use admin client for all server-side operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Check rate limit
    const { data: rateLimitCheck } = await supabaseAdmin.rpc('check_rate_limit', {
      _user_id: user.id,
      _function_name: 'plaid-exchange-token',
      _max_requests: 60,
      _window_minutes: 1
    });

    if (!rateLimitCheck) {
      console.log('Rate limit exceeded for user:', user.id);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.', retryAfter: 60 }),
        { 
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' }
        }
      );
    }

    const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
    const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
    const PLAID_ENV = 'sandbox';

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.error('Plaid credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Plaid credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Exchange public token for access token — server-side only
    const tokenResponse = await fetch(`https://${PLAID_ENV}.plaid.com/item/public_token/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
      body: JSON.stringify({ public_token }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Plaid token exchange error:', tokenData);
      return new Response(
        JSON.stringify({ error: 'Failed to exchange token' }),
        { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get account details — server-side only, using the access token
    const accountsResponse = await fetch(`https://${PLAID_ENV}.plaid.com/accounts/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
      body: JSON.stringify({ access_token: tokenData.access_token }),
    });

    const accountsData = await accountsResponse.json();

    if (!accountsResponse.ok) {
      console.error('Plaid accounts fetch error:', accountsData);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch account details' }),
        { status: accountsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Insert account metadata WITHOUT the access token. The token
    // is stored separately in `connected_bank_account_secrets` which is
    // accessible only via the service role.
    const accountInserts = accountsData.accounts.map((account: any) => ({
      user_id: user.id,
      plaid_item_id: tokenData.item_id,
      institution_id: institution.institution_id,
      institution_name: institution.name,
      account_id: account.account_id,
      account_name: account.name,
      account_mask: account.mask,
      account_type: account.type,
      account_subtype: account.subtype,
    }));

    const { data: insertedRows, error: insertError } = await supabaseAdmin
      .from('connected_bank_accounts')
      .insert(accountInserts)
      .select('id');

    if (insertError || !insertedRows) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save account data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store the Plaid access token in the server-only secrets table
    const secretRows = insertedRows.map((row: any) => ({
      account_row_id: row.id,
      plaid_access_token: tokenData.access_token,
    }));

    const { error: secretError } = await supabaseAdmin
      .from('connected_bank_account_secrets')
      .insert(secretRows);

    if (secretError) {
      console.error('Failed to store Plaid access token:', secretError);
      // Roll back the account inserts so we don't end up with token-less rows
      await supabaseAdmin
        .from('connected_bank_accounts')
        .delete()
        .in('id', insertedRows.map((r: any) => r.id));
      return new Response(
        JSON.stringify({ error: 'Failed to save account credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully stored connected accounts for user:', user.id);

    // SECURITY: Only return safe, non-sensitive account metadata to client
    // Never return access_token, item_id, or other Plaid secrets
    const safeAccounts = accountsData.accounts.map((account: any) => ({
      account_id: account.account_id,
      name: account.name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
    }));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Bank account connected successfully',
        accounts: safeAccounts 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in plaid-exchange-token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
