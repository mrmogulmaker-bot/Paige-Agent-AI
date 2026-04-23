// Admin-only HTML preview of the beta-launch-welcome email template.
// Renders the same React Email component used by the live send pipeline,
// substituting a caller-provided sample recipient name so Antonio can
// review the final inbox-ready output before triggering the broadcast.

import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const TEMPLATE_NAME = 'beta-launch-welcome'

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

  // Admin-only gate (mirrors send-beta-launch-email)
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

  // Parse optional sample name from the body (POST) or query string (GET).
  let sampleName: string | undefined
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const raw = typeof body?.name === 'string' ? body.name.trim() : ''
      if (raw.length > 0 && raw.length <= 80) sampleName = raw
    } catch {
      // ignore — empty/invalid body just means render with no name
    }
  } else {
    const url = new URL(req.url)
    const raw = (url.searchParams.get('name') ?? '').trim()
    if (raw.length > 0 && raw.length <= 80) sampleName = raw
  }

  const entry = TEMPLATES[TEMPLATE_NAME]
  if (!entry) {
    return new Response(
      JSON.stringify({ error: `Template '${TEMPLATE_NAME}' is not registered` }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const previewProps = {
    ...(entry.previewData ?? {}),
    ...(sampleName ? { name: sampleName } : {}),
  }

  try {
    const html = await renderAsync(
      React.createElement(entry.component, previewProps),
    )
    const subject =
      typeof entry.subject === 'function' ? entry.subject(previewProps) : entry.subject

    return new Response(
      JSON.stringify({
        templateName: TEMPLATE_NAME,
        displayName: entry.displayName ?? TEMPLATE_NAME,
        subject,
        sampleName: sampleName ?? null,
        html,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: 'Render failed', message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
