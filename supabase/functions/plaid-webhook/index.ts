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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    const { webhook_type, webhook_code, item_id } = payload;

    console.log('Plaid webhook received:', { webhook_type, webhook_code, item_id });

    // Store webhook event
    await supabaseAdmin.from('plaid_webhook_events').insert({
      webhook_type,
      webhook_code,
      item_id,
      payload,
      processed: false,
    });

    // Find user by item_id
    const { data: account } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('user_id, id, plaid_access_token')
      .eq('plaid_item_id', item_id)
      .single();

    if (!account) {
      console.error('No account found for item_id:', item_id);
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
    const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
    const PLAID_ENV = 'sandbox';

    // Handle different webhook types
    if (webhook_type === 'TRANSACTIONS') {
      console.log('Processing TRANSACTIONS webhook');
      
      // Get transactions from Plaid
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

      if (transactionsData.added && transactionsData.added.length > 0) {
        // Insert new transactions
        const transactions = transactionsData.added.map((txn: any) => ({
          user_id: account.user_id,
          account_id: account.id,
          transaction_id: txn.transaction_id,
          amount: txn.amount,
          date: txn.date,
          name: txn.name,
          merchant_name: txn.merchant_name,
          category: txn.category,
          pending: txn.pending,
        }));

        await supabaseAdmin.from('plaid_transactions').insert(transactions);
      }

      // Calculate and update KPIs in background
      calculateKPIs(supabaseAdmin, account.user_id).catch(console.error);
    }

    if (webhook_type === 'ITEM') {
      if (webhook_code === 'ERROR') {
        // Create task to reconnect account
        await supabaseAdmin.from('tasks').insert({
          user_id: account.user_id,
          title: 'Reconnect Bank Account',
          description: 'Your bank connection has an error and needs to be reconnected.',
          status: 'pending',
          priority: 'P1',
          track: 'Funding',
          due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      if (webhook_code === 'PENDING_EXPIRATION') {
        await supabaseAdmin.from('tasks').insert({
          user_id: account.user_id,
          title: 'Bank Consent Expiring Soon',
          description: 'Your bank account consent will expire soon. Please reconnect.',
          status: 'pending',
          priority: 'P2',
          track: 'Funding',
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    if (webhook_type === 'ACCOUNTS') {
      // Refresh balance
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
          user_id: account.user_id,
          account_id: account.id,
          balance: acc.balances.current,
          available: acc.balances.available,
          snapshot_date: new Date().toISOString().split('T')[0],
        }));

        await supabaseAdmin.from('balance_snapshots').insert(snapshots);
      }

      // Calculate KPIs in background
      calculateKPIs(supabaseAdmin, account.user_id).catch(console.error);
    }

    // Mark webhook as processed
    await supabaseAdmin
      .from('plaid_webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('item_id', item_id)
      .eq('webhook_type', webhook_type)
      .eq('webhook_code', webhook_code);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in plaid-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function calculateKPIs(supabaseAdmin: any, userId: string) {
  try {
    console.log('Calculating KPIs for user:', userId);

    // Get balance snapshots for last 90 days
    const { data: snapshots90 } = await supabaseAdmin
      .from('balance_snapshots')
      .select('balance')
      .eq('user_id', userId)
      .gte('snapshot_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('snapshot_date', { ascending: false });

    const { data: snapshots30 } = await supabaseAdmin
      .from('balance_snapshots')
      .select('balance')
      .eq('user_id', userId)
      .gte('snapshot_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('snapshot_date', { ascending: false });

    // Get transactions for last 30 days
    const { data: transactions } = await supabaseAdmin
      .from('plaid_transactions')
      .select('amount')
      .eq('user_id', userId)
      .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    const avg_balance_90d = snapshots90?.length 
      ? snapshots90.reduce((sum: number, s: any) => sum + Number(s.balance), 0) / snapshots90.length
      : 0;

    const avg_balance_30d = snapshots30?.length
      ? snapshots30.reduce((sum: number, s: any) => sum + Number(s.balance), 0) / snapshots30.length
      : 0;

    const monthly_inflow = transactions?.filter((t: any) => t.amount < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount)), 0) || 0;

    const monthly_outflow = transactions?.filter((t: any) => t.amount > 0)
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;

    const dscr = monthly_outflow > 0 ? monthly_inflow / monthly_outflow : 0;

    // Count NSF transactions
    const nsf_count = transactions?.filter((t: any) => 
      t.name?.toLowerCase().includes('nsf') || 
      t.name?.toLowerCase().includes('insufficient')
    ).length || 0;

    // Upsert KPIs
    await supabaseAdmin.from('financial_kpis').upsert({
      user_id: userId,
      avg_balance_90d,
      avg_balance_30d,
      monthly_inflow,
      monthly_outflow,
      dscr,
      nsf_count,
      last_calculated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // Auto-create tasks based on thresholds
    if (avg_balance_90d < 5000) {
      await supabaseAdmin.from('tasks').insert({
        user_id: userId,
        title: 'Raise Average Balance',
        description: 'Maintain minimum $5,000 average balance for 30 days to improve fundability.',
        status: 'pending',
        priority: 'P1',
        track: 'Funding',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { trigger: 'low_balance', threshold: 5000, current: avg_balance_90d },
      });
    }

    if (dscr < 1.25) {
      await supabaseAdmin.from('tasks').insert({
        user_id: userId,
        title: 'Improve DSCR Ratio',
        description: 'Reduce obligations or increase net operating income before applying for funding.',
        status: 'pending',
        priority: 'P1',
        track: 'Funding',
        due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { trigger: 'low_dscr', threshold: 1.25, current: dscr },
      });
    }

    if (nsf_count > 0) {
      await supabaseAdmin.from('tasks').insert({
        user_id: userId,
        title: 'Clean Bank Hygiene',
        description: `Avoid NSF/insufficient fund charges for 90 days. Current count: ${nsf_count}`,
        status: 'pending',
        priority: 'P0',
        track: 'Business Compliance',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { trigger: 'nsf_detected', count: nsf_count },
      });
    }

    console.log('KPIs calculated successfully');
  } catch (error) {
    console.error('Error calculating KPIs:', error);
  }
}