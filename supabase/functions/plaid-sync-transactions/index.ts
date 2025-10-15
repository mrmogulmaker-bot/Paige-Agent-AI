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
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { account_id } = await req.json();

    if (!account_id) {
      return new Response(
        JSON.stringify({ error: 'account_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('*')
      .eq('id', account_id)
      .eq('user_id', user.id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
    const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
    const PLAID_ENV = 'sandbox';

    console.log('Syncing transactions for account:', account_id);

    // Sync transactions
    const transactionsResponse = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID!,
        'PLAID-SECRET': PLAID_SECRET!,
      },
      body: JSON.stringify({
        access_token: account.plaid_access_token,
      }),
    });

    const transactionsData = await transactionsResponse.json();

    if (!transactionsResponse.ok) {
      console.error('Plaid API error:', transactionsData);
      return new Response(
        JSON.stringify({ error: transactionsData }),
        { status: transactionsResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let addedCount = 0;

    if (transactionsData.added && transactionsData.added.length > 0) {
      const transactions = transactionsData.added.map((txn: any) => ({
        user_id: user.id,
        account_id: account.id,
        transaction_id: txn.transaction_id,
        amount: txn.amount,
        date: txn.date,
        name: txn.name,
        merchant_name: txn.merchant_name,
        category: txn.category,
        pending: txn.pending,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('plaid_transactions')
        .insert(transactions);

      if (insertError) {
        console.error('Error inserting transactions:', insertError);
      } else {
        addedCount = transactions.length;
      }
    }

    // Get balance
    const balanceResponse = await fetch(`https://${PLAID_ENV}.plaid.com/accounts/balance/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID!,
        'PLAID-SECRET': PLAID_SECRET!,
      },
      body: JSON.stringify({
        access_token: account.plaid_access_token,
      }),
    });

    const balanceData = await balanceResponse.json();

    if (balanceData.accounts && balanceData.accounts.length > 0) {
      const snapshots = balanceData.accounts.map((acc: any) => ({
        user_id: user.id,
        account_id: account.id,
        balance: acc.balances.current,
        available: acc.balances.available,
        snapshot_date: new Date().toISOString().split('T')[0],
      }));

      await supabaseAdmin.from('balance_snapshots').insert(snapshots);
    }

    return new Response(
      JSON.stringify({
        success: true,
        transactions_added: addedCount,
        has_more: transactionsData.has_more,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in plaid-sync-transactions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});