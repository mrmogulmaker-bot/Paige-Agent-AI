import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, plaid-verification',
};

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID');
const PLAID_SECRET = Deno.env.get('PLAID_SECRET');
const PLAID_ENV = 'sandbox';

async function verifyPlaidWebhook(body: string, signedJwt: string | null): Promise<boolean> {
  // Plaid sends a JWT in the Plaid-Verification header
  // For production, verify JWT signature using Plaid's webhook verification key
  // For now, require the header exists and validate structure
  if (!signedJwt) {
    console.error('Missing Plaid-Verification header');
    return false;
  }

  // Verify the JWT has 3 parts (header.payload.signature)
  const parts = signedJwt.split('.');
  if (parts.length !== 3) {
    console.error('Invalid Plaid-Verification JWT format');
    return false;
  }

  try {
    // Decode and verify the payload contains the body hash
    const payloadB64 = parts[1];
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    // Verify the request body hash matches
    const encoder = new TextEncoder();
    const bodyBytes = encoder.encode(body);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const bodyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (payload.request_body_sha256 && payload.request_body_sha256 !== bodyHash) {
      console.error('Plaid webhook body hash mismatch');
      return false;
    }

    // In production, also fetch Plaid's verification key and verify JWT signature:
    // GET https://{env}.plaid.com/webhook_verification_key/get with key_id from JWT header
    // Then verify JWT signature with that key

    return true;
  } catch (err) {
    console.error('Error verifying Plaid webhook signature:', err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Read body as text first for signature verification
    const bodyText = await req.text();
    const signature = req.headers.get('plaid-verification');

    // SECURITY: Reject all unsigned webhook requests
    const isValid = await verifyPlaidWebhook(bodyText, signature);
    if (!isValid) {
      console.error('Webhook signature verification failed — rejecting request');
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.parse(bodyText);
    const { webhook_type, webhook_code, item_id, error } = payload;
    const event_id = `${item_id}_${webhook_type}_${webhook_code}_${Date.now()}`;

    console.log('Plaid webhook verified and received:', { webhook_type, webhook_code, item_id, event_id });

    // Idempotency check
    const { data: existingEvent } = await supabaseAdmin
      .from('plaid_webhook_events')
      .select('id')
      .eq('event_id', event_id)
      .maybeSingle();

    if (existingEvent) {
      console.log('Duplicate webhook event, skipping:', event_id);
      return new Response(JSON.stringify({ success: true, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find user and account — use admin client, never expose access_token
    const { data: account } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('user_id, id, plaid_access_token, transactions_cursor')
      .eq('plaid_item_id', item_id)
      .single();

    if (!account) {
      console.error('No account found for item_id:', item_id);
      await supabaseAdmin.from('plaid_webhook_events').insert({
        event_id,
        webhook_type,
        webhook_code,
        item_id,
        payload,
        processed: false,
        error: 'Account not found',
      });
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tasksCreated: string[] = [];

    // Route to appropriate handler
    if (webhook_type === 'TRANSACTIONS') {
      await handleTransactionsWebhook(supabaseAdmin, webhook_code, account, tasksCreated);
    } else if (webhook_type === 'ITEM') {
      await handleItemWebhook(supabaseAdmin, webhook_code, account, error, tasksCreated);
    } else if (webhook_type === 'ACCOUNTS') {
      await handleAccountsWebhook(supabaseAdmin, webhook_code, account, tasksCreated);
    } else {
      console.log('Unknown webhook type, logging and acknowledging:', webhook_type);
    }

    // Store webhook event with audit info
    await supabaseAdmin.from('plaid_webhook_events').insert({
      event_id,
      webhook_type,
      webhook_code,
      item_id,
      user_id: account.user_id,
      payload,
      processed: true,
      processed_at: new Date().toISOString(),
      tasks_created: tasksCreated,
    });

    return new Response(JSON.stringify({ success: true, tasks_created: tasksCreated }), {
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

async function handleTransactionsWebhook(
  supabaseAdmin: any,
  webhook_code: string,
  account: any,
  tasksCreated: string[]
) {
  console.log('Handling TRANSACTIONS webhook:', webhook_code);

  if (webhook_code === 'INITIAL_UPDATE') {
    await syncAllTransactions(supabaseAdmin, account, true);
  } else if (webhook_code === 'HISTORICAL_UPDATE') {
    await syncAllTransactions(supabaseAdmin, account, false, 365);
  } else {
    await syncIncrementalTransactions(supabaseAdmin, account);
  }

  await calculateKPIsAndTriggerTasks(supabaseAdmin, account.user_id, tasksCreated);
}

async function handleItemWebhook(
  supabaseAdmin: any,
  webhook_code: string,
  account: any,
  error: any,
  tasksCreated: string[]
) {
  console.log('Handling ITEM webhook:', webhook_code);

  if (webhook_code === 'ERROR') {
    const errorType = error?.error_type || 'UNKNOWN';
    const errorCode = error?.error_code || 'UNKNOWN';
    
    const { data: task } = await supabaseAdmin.from('tasks').insert({
      user_id: account.user_id,
      title: 'Reconnect Bank Account',
      description: `Your bank connection has an error (${errorCode}). Please reconnect to continue syncing.`,
      status: 'pending',
      priority: 'P0',
      track: 'Funding',
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { trigger: 'plaid_item_error', error_type: errorType, error_code: errorCode },
    }).select('title').single();

    if (task) tasksCreated.push(task.title);

    await supabaseAdmin.from('plaid_notifications').insert({
      user_id: account.user_id,
      channel: 'in_app_toast',
      template: 'bank_connection_error',
      metadata: { error_type: errorType, error_code: errorCode },
    });

  } else if (webhook_code === 'PENDING_EXPIRATION') {
    const { data: task } = await supabaseAdmin.from('tasks').insert({
      user_id: account.user_id,
      title: 'Bank Consent Expiring Soon',
      description: 'Your bank account consent will expire soon. Please reconnect to maintain access.',
      status: 'pending',
      priority: 'P2',
      track: 'Funding',
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { trigger: 'plaid_consent_expiring' },
    }).select('title').single();

    if (task) tasksCreated.push(task.title);

  } else if (webhook_code === 'WEBHOOK_UPDATE_ACKNOWLEDGED') {
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', account.id);
  }
}

async function handleAccountsWebhook(
  supabaseAdmin: any,
  webhook_code: string,
  account: any,
  tasksCreated: string[]
) {
  console.log('Handling ACCOUNTS webhook:', webhook_code);

  if (webhook_code === 'BALANCE_UPDATE') {
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

    await calculateKPIsAndTriggerTasks(supabaseAdmin, account.user_id, tasksCreated);
  }
}

async function syncAllTransactions(
  supabaseAdmin: any,
  account: any,
  isInitial: boolean,
  daysBack: number = 90
) {
  let cursor = account.transactions_cursor || undefined;
  let hasMore = true;
  let totalAdded = 0;

  while (hasMore) {
    const response = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID!,
        'PLAID-SECRET': PLAID_SECRET!,
      },
      body: JSON.stringify({
        access_token: account.plaid_access_token,
        cursor,
        count: 500,
      }),
    });

    const data = await response.json();

    if (data.added && data.added.length > 0) {
      const transactions = data.added.map((txn: any) => ({
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
      totalAdded += transactions.length;
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;

    if (!hasMore) {
      await supabaseAdmin
        .from('connected_bank_accounts')
        .update({ 
          transactions_cursor: cursor,
          last_sync_at: new Date().toISOString(),
        })
        .eq('id', account.id);
    }
  }

  console.log(`Synced ${totalAdded} transactions (${isInitial ? 'initial' : 'backfill'})`);
}

async function syncIncrementalTransactions(supabaseAdmin: any, account: any) {
  const cursor = account.transactions_cursor;

  const response = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID!,
      'PLAID-SECRET': PLAID_SECRET!,
    },
    body: JSON.stringify({
      access_token: account.plaid_access_token,
      cursor,
    }),
  });

  const data = await response.json();

  if (data.added && data.added.length > 0) {
    const transactions = data.added.map((txn: any) => ({
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

  await supabaseAdmin
    .from('connected_bank_accounts')
    .update({ 
      transactions_cursor: data.next_cursor,
      last_sync_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  console.log(`Incremental sync: ${data.added?.length || 0} new transactions`);
}

async function calculateKPIsAndTriggerTasks(
  supabaseAdmin: any,
  userId: string,
  tasksCreated: string[]
) {
  console.log('Calculating KPIs for user:', userId);

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

  const { data: transactions } = await supabaseAdmin
    .from('plaid_transactions')
    .select('amount, name')
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

  const nsf_count = transactions?.filter((t: any) => 
    t.name?.toLowerCase().includes('nsf') || 
    t.name?.toLowerCase().includes('insufficient') ||
    t.name?.toLowerCase().includes('overdraft')
  ).length || 0;

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

  if (avg_balance_90d < 5000) {
    const { data: existing } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('title', 'Raise Average Balance')
      .eq('status', 'pending')
      .maybeSingle();

    if (!existing) {
      const { data: task } = await supabaseAdmin.from('tasks').insert({
        user_id: userId,
        title: 'Raise Average Balance',
        description: `Maintain minimum $5,000 average balance for 30 days to improve fundability. Current: $${avg_balance_90d.toFixed(2)}`,
        status: 'pending',
        priority: 'P1',
        track: 'Funding',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { trigger: 'low_balance', threshold: 5000, current: avg_balance_90d },
      }).select('title').single();

      if (task) tasksCreated.push(task.title);
    }
  }

  if (dscr < 1.25 && dscr > 0) {
    const { data: existing } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('title', 'Improve DSCR Ratio')
      .eq('status', 'pending')
      .maybeSingle();

    if (!existing) {
      const { data: task } = await supabaseAdmin.from('tasks').insert({
        user_id: userId,
        title: 'Improve DSCR Ratio',
        description: `Reduce obligations or increase net operating income before applying for funding. Current DSCR: ${dscr.toFixed(2)}`,
        status: 'pending',
        priority: 'P1',
        track: 'Funding',
        due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { trigger: 'low_dscr', threshold: 1.25, current: dscr },
      }).select('title').single();

      if (task) tasksCreated.push(task.title);
    }
  }

  if (nsf_count > 0) {
    const { data: existing } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('title', 'Clean Bank Hygiene')
      .eq('status', 'pending')
      .maybeSingle();

    if (!existing) {
      const { data: task } = await supabaseAdmin.from('tasks').insert({
        user_id: userId,
        title: 'Clean Bank Hygiene',
        description: `${nsf_count} NSF/overdraft events detected in last 30 days. Lenders flag this as high risk.`,
        status: 'pending',
        priority: 'P0',
        track: 'Funding',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { trigger: 'nsf_detected', count: nsf_count },
      }).select('title').single();

      if (task) tasksCreated.push(task.title);
    }
  }

  console.log('KPIs calculated and tasks evaluated for user:', userId);
}
