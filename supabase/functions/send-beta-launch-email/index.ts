// One-time admin-triggered fan-out: sends the Beta launch welcome email to
// every user with an email on profiles. Per-recipient guards:
//   1. Skip if communication_preferences.unsubscribed_all = true
//   2. Skip if a communication_log row already exists with
//      message_type = 'beta_launch' for this user (prevents duplicate sends)
// Each send goes through the standard send-transactional-email function so
// suppression list, unsubscribe footer, and queue retries all apply.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface ProfileRow {
  user_id: string
  email: string | null
  full_name: string | null
}

interface CommPrefRow {
  user_id: string
  unsubscribed_all: boolean | null
}

interface CommLogRow {
  user_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Admin-only gate
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const callerId = userData.user.id

  const { data: roleRows, error: roleErr } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', callerId)
  if (roleErr) {
    return new Response(JSON.stringify({ error: 'Role lookup failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === 'admin')
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin role required' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Pull all eligible profiles
  const { data: profiles, error: profilesErr } = await adminClient
    .from('profiles')
    .select('user_id, email, full_name')
    .not('email', 'is', null)
  if (profilesErr) {
    return new Response(JSON.stringify({ error: profilesErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const profileRows = (profiles ?? []) as ProfileRow[]
  const userIds = profileRows.map((p) => p.user_id)

  // Bulk pull communication_preferences for all candidates
  const prefsByUser = new Map<string, boolean>()
  if (userIds.length > 0) {
    const { data: prefs } = await adminClient
      .from('communication_preferences')
      .select('user_id, unsubscribed_all')
      .in('user_id', userIds)
    for (const row of (prefs ?? []) as CommPrefRow[]) {
      prefsByUser.set(row.user_id, row.unsubscribed_all === true)
    }
  }

  // Bulk pull existing beta_launch communication_log entries to dedupe
  const alreadySent = new Set<string>()
  if (userIds.length > 0) {
    const { data: sentRows } = await adminClient
      .from('communication_log')
      .select('user_id')
      .eq('message_type', 'beta_launch')
      .in('user_id', userIds)
    for (const row of (sentRows ?? []) as CommLogRow[]) {
      alreadySent.add(row.user_id)
    }
  }

  let sent = 0
  let skippedUnsubscribed = 0
  let skippedAlreadySent = 0
  let failed = 0
  const errors: Array<{ user_id: string; error: string }> = []

  for (const profile of profileRows) {
    if (!profile.email) continue

    if (alreadySent.has(profile.user_id)) {
      skippedAlreadySent++
      continue
    }
    if (prefsByUser.get(profile.user_id) === true) {
      skippedUnsubscribed++
      continue
    }

    const firstName =
      profile.full_name && profile.full_name.trim().length > 0
        ? profile.full_name.trim().split(/\s+/)[0]
        : undefined

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          templateName: 'beta-launch-welcome',
          recipientEmail: profile.email,
          recipientUserId: profile.user_id,
          idempotencyKey: `beta-launch-${profile.user_id}`,
          templateData: { name: firstName },
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text()
        failed++
        errors.push({ user_id: profile.user_id, error: errText.slice(0, 200) })
        await adminClient.from('communication_log').insert({
          user_id: profile.user_id,
          channel: 'email',
          message_type: 'beta_launch',
          status: 'failed',
          subject: 'You are in — PaigeAgent AI Beta is officially live 🎉',
          error_message: errText.slice(0, 500),
        })
        continue
      }

      sent++
      await adminClient.from('communication_log').insert({
        user_id: profile.user_id,
        channel: 'email',
        message_type: 'beta_launch',
        status: 'queued',
        subject: 'You are in — PaigeAgent AI Beta is officially live 🎉',
        preview: 'Welcome to the PaigeAgent Beta — and thank you for being one of our founding members.',
      })
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ user_id: profile.user_id, error: msg.slice(0, 200) })
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      total_profiles: profileRows.length,
      sent,
      skipped_already_sent: skippedAlreadySent,
      skipped_unsubscribed: skippedUnsubscribed,
      failed,
      errors: errors.slice(0, 20),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
