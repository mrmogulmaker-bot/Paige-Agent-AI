// MCC service request submission.
// Broker fires this from /broker/app/mcc. We:
//   1. Insert the row (RLS-scoped to the calling broker)
//   2. POST a structured payload to MCC_WEBHOOK_URL (Zapier/n8n inbound)
//   3. Email MCC_NOTIFICATION_EMAIL with the request details
//   4. Stamp webhook_dispatched_at + webhook_response on the row
// All side-effects are best-effort — the request row stays even if webhook fails.

import { createClient } from 'npm:@supabase/supabase-js@2.57.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : ''
  console.log(`[mcc-submit-request] ${step}${d}`)
}

interface Payload {
  clientRelationshipId: string
  serviceType: string
  priority?: 'standard' | 'rush' | 'low'
  notes: string
}

const VALID_SERVICES = new Set([
  'entity_setup',
  'business_credit_build',
  'funding_prep',
  'dispute_handling',
  'tradeline_strategy',
  'compliance_review',
  'other',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const { data: userRes } = await supabaseUser.auth.getUser()
    const user = userRes?.user
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as Payload
    if (
      !body.clientRelationshipId ||
      !body.serviceType ||
      !VALID_SERVICES.has(body.serviceType) ||
      !body.notes?.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Resolve broker for the caller
    const { data: broker } = await supabaseAdmin
      .from('broker_profiles')
      .select('id, business_name, referral_code')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!broker) {
      return new Response(JSON.stringify({ error: 'Broker profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve client relationship and confirm it belongs to this broker
    const { data: rel } = await supabaseAdmin
      .from('broker_client_relationships')
      .select('id, broker_id, client_first_name, client_last_name, client_email, client_goal')
      .eq('id', body.clientRelationshipId)
      .maybeSingle()
    if (!rel || rel.broker_id !== broker.id) {
      return new Response(JSON.stringify({ error: 'Client not found for this broker' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Insert request row
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('mcc_service_requests')
      .insert({
        broker_id: broker.id,
        client_relationship_id: rel.id,
        service_type: body.serviceType,
        priority: body.priority ?? 'standard',
        notes: body.notes.trim(),
        status: 'pending',
      })
      .select('id, created_at')
      .single()
    if (insertErr || !inserted) {
      log('Insert failed', { error: insertErr })
      return new Response(JSON.stringify({ error: insertErr?.message || 'Insert failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const webhookPayload = {
      event: 'mcc.service_request.created',
      requestId: inserted.id,
      createdAt: inserted.created_at,
      broker: {
        id: broker.id,
        businessName: broker.business_name,
        referralCode: broker.referral_code,
        userEmail: user.email,
      },
      client: {
        firstName: rel.client_first_name,
        lastName: rel.client_last_name,
        email: rel.client_email,
        goal: rel.client_goal,
      },
      serviceType: body.serviceType,
      priority: body.priority ?? 'standard',
      notes: body.notes.trim(),
    }

    // 2. POST to MCC webhook (best-effort)
    const webhookUrl = Deno.env.get('MCC_WEBHOOK_URL')
    let webhookOk = false
    let webhookResp: any = null
    if (webhookUrl) {
      try {
        const r = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload),
        })
        webhookOk = r.ok
        webhookResp = { status: r.status, body: (await r.text()).slice(0, 500) }
        log('Webhook posted', webhookResp)
      } catch (err) {
        webhookResp = { error: String(err) }
        log('Webhook failed', webhookResp)
      }
    } else {
      log('MCC_WEBHOOK_URL not configured — skipping outbound webhook')
    }

    // 3. Email MCC ops inbox (best-effort)
    const opsEmail = Deno.env.get('MCC_NOTIFICATION_EMAIL')
    if (opsEmail) {
      try {
        await supabaseAdmin.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'mcc-new-service-request',
            recipientEmail: opsEmail,
            idempotencyKey: `mcc-req-${inserted.id}`,
            templateData: {
              brokerBusinessName: broker.business_name,
              brokerEmail: user.email,
              clientName: `${rel.client_first_name} ${rel.client_last_name}`.trim(),
              clientEmail: rel.client_email,
              serviceType: body.serviceType,
              priority: body.priority ?? 'standard',
              notes: body.notes.trim(),
              requestId: inserted.id,
            },
          },
        })
      } catch (err) {
        log('Ops email failed', { error: String(err) })
      }
    }

    // 4. Stamp dispatch metadata
    if (webhookUrl) {
      await supabaseAdmin
        .from('mcc_service_requests')
        .update({
          webhook_dispatched_at: new Date().toISOString(),
          webhook_response: webhookResp,
          status: webhookOk ? 'submitted' : 'pending',
        })
        .eq('id', inserted.id)
    }

    return new Response(
      JSON.stringify({ requestId: inserted.id, webhookOk }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    log('UNCAUGHT', { error: String(err) })
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
