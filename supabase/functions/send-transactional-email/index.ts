import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "Paige Agent AI"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "paigeagent.ai"
// FROM_DOMAIN is the domain shown in the From: header. It MUST align with SENDER_DOMAIN
// (same subdomain, or the SENDER_ROOT). A different subdomain (e.g., mail.example.com while
// SENDER_DOMAIN is notify.example.com) triggers a provider 400 sender_domain_mismatch.
const FROM_DOMAIN = "paigeagent.ai"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth note: this function uses verify_jwt = true in config.toml, so Supabase's
// gateway validates the caller's JWT (anon or service_role) before the request
// reaches this code. No in-function auth check is needed.

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let recipientUserId: string | null = null
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let tenantId: string | null = null
  let fromOverride: string | null = null
  let replyToOverride: string | null = null
  try {
    const body = await req.json()
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    recipientUserId = body.recipientUserId || body.recipient_user_id || null
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
    tenantId = body.tenantId || body.tenant_id || null
    fromOverride = body.fromOverride || body.from_override || null
    replyToOverride = body.replyToOverride || body.reply_to_override || null
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 1b. Affiliate-program preference gate.
  // Only enforced when caller passed recipientUserId (e.g., approved/conversion/paid/monthly).
  // Public submissions like elite-waitlist or application-received from anon visitors
  // skip this check because there is no authenticated user yet.
  const isAffiliateTemplate = templateName.startsWith('affiliate-') || templateName === 'elite-waitlist-confirmed'
  if (isAffiliateTemplate && recipientUserId) {
    try {
      const { data: prefs } = await supabase
        .from('communication_preferences')
        .select('email_enabled, email_affiliate_program, unsubscribed_all')
        .eq('user_id', recipientUserId)
        .maybeSingle()
      if (prefs && (prefs.unsubscribed_all || !prefs.email_enabled || prefs.email_affiliate_program === false)) {
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: templateName,
          recipient_email: effectiveRecipient,
          status: 'suppressed',
          error_message: 'Affiliate program emails disabled by user preference',
        })
        return new Response(
          JSON.stringify({ success: false, reason: 'affiliate_emails_disabled' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } catch (e) {
      console.warn('Affiliate prefs lookup failed (proceeding to send)', { error: String(e) })
    }
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Generate fresh unsubscribe token (stored hashed; plaintext only sent in email)
  const normalizedEmail = effectiveRecipient.toLowerCase()
  const unsubscribeToken = generateToken()
  const unsubscribeTokenHash = await sha256Hex(unsubscribeToken)

  const { error: tokenError } = await supabase
    .from('email_unsubscribe_tokens')
    .upsert(
      { token_hash: unsubscribeTokenHash, email: normalizedEmail, used_at: null },
      { onConflict: 'email' }
    )

  if (tokenError) {
    console.error('Failed to upsert unsubscribe token hash', { error: tokenError })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to create unsubscribe token',
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // 5. Resolve sender identity.
  // Default: shared Paige subdomain with the project's From name.
  // If a tenantId is provided, look up the tenant's sender identity so each
  // tenant's invites/notifications show their own name in the From header.
  // Explicit fromOverride / replyToOverride always win.
  //
  // SENDER-DOMAIN ALIGNMENT GUARD: the Lovable Email API rejects sends whose
  // From-address domain does not align with the verified sender_domain. A
  // tenant override pointing at an unregistered domain (e.g. portal.mogulmakeracademy.com
  // while sender_domain is paigeagent.ai) used to silently fail with
  // sender_domain_mismatch. We now validate alignment and fall back to the
  // safe default rather than enqueue a doomed send.
  const SENDER_ROOT = SENDER_DOMAIN.split('.').slice(-2).join('.') // paigeagent.ai -> paigeagent.ai
  const fromAddressAligns = (addr: string): boolean => {
    const m = addr.match(/<([^>]+)>|([^\s]+@[^\s]+)/)
    const email = (m?.[1] ?? m?.[2] ?? addr).trim()
    const domain = email.split('@')[1]?.toLowerCase() ?? ''
    if (!domain) return false
    return domain === SENDER_DOMAIN || domain === SENDER_ROOT || domain.endsWith('.' + SENDER_ROOT)
  }

  // Auto-resolve tenantId if not provided by caller.
  // Every enqueued email should reflect the recipient's tenant brand, not the
  // shared Paige default. Resolve via recipient user's profile / membership.
  if (!tenantId) {
    try {
      let uid = recipientUserId
      if (!uid) {
        const { data: u } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', effectiveRecipient)
          .maybeSingle()
        uid = (u as any)?.id ?? null
      }
      if (uid) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('active_tenant_id')
          .eq('id', uid)
          .maybeSingle()
        tenantId = (prof as any)?.active_tenant_id ?? null
        if (!tenantId) {
          const { data: mem } = await supabase
            .from('tenant_members')
            .select('tenant_id')
            .eq('user_id', uid)
            .eq('status', 'active')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle()
          tenantId = (mem as any)?.tenant_id ?? null
        }
      }
    } catch (e) {
      console.warn('tenant auto-resolve failed', e)
    }
  }

  let resolvedFrom = `${SITE_NAME} <notifications@${FROM_DOMAIN}>`
  let resolvedReplyTo: string | null = null
  if (tenantId) {
    const { data: senderRow } = await supabase.rpc('tenant_sender_identity', {
      _tenant_id: tenantId,
    })
    const sender = (senderRow ?? null) as
      | { from_name?: string; from_address?: string; reply_to?: string; tenant_name?: string }
      | null
    if (sender?.from_name && sender?.from_address) {
      const candidate = `${sender.from_name} <${sender.from_address}>`
      if (fromAddressAligns(candidate)) {
        resolvedFrom = candidate
        resolvedReplyTo = sender.reply_to ?? null
      } else {
        // Address domain isn't verified for sending, but we can still honor
        // the tenant's display name by swapping in the aligned fallback address.
        const displayName = sender.from_name || sender.tenant_name || SITE_NAME
        resolvedFrom = `${displayName} <notifications@${FROM_DOMAIN}>`
        resolvedReplyTo = sender.reply_to ?? null
        console.warn('tenant from-address unaligned — kept tenant display name with default address', {
          tenant_id: tenantId,
          tenant_from: sender.from_address,
          sender_domain: SENDER_DOMAIN,
        })
      }
    }
  }
  if (fromOverride && fromAddressAligns(fromOverride)) resolvedFrom = fromOverride
  if (replyToOverride) resolvedReplyTo = replyToOverride

  // 6. Send directly via Resend. The old async path (enqueue_email →
  // process-email-queue, which sent via Lovable) was never deployed, so
  // transactional email silently never left the building — "sent" only ever
  // meant "queued into a black hole." Send inline via Resend (same proven path
  // as send-message), record the REAL outcome, and retire the Lovable worker (#79).
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  // Log the attempt up front so there's always a record.
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
    tenant_id: tenantId,
    metadata: { from: resolvedFrom, reply_to: resolvedReplyTo },
  })

  if (!RESEND_API_KEY) {
    await supabase.from('email_send_log').update({ status: 'failed', error_message: 'RESEND_API_KEY not set' }).eq('message_id', messageId)
    return new Response(JSON.stringify({ error: 'email_provider_unconfigured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sendOk = false
  let vendorId: string | null = null
  let sendError: string | null = null
  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: resolvedFrom,
        to: [effectiveRecipient],
        subject: resolvedSubject,
        html,
        text: plainText,
        ...(resolvedReplyTo ? { reply_to: resolvedReplyTo } : {}),
      }),
    })
    const resendJson: any = await resendResp.json().catch(() => ({}))
    if (resendResp.ok && resendJson?.id) {
      sendOk = true
      vendorId = resendJson.id
    } else {
      sendError = `resend_${resendResp.status}: ${JSON.stringify(resendJson).slice(0, 300)}`
    }
  } catch (e) {
    sendError = (e as Error).message?.slice(0, 300) ?? 'resend_request_failed'
  }

  await supabase.from('email_send_log').update({
    status: sendOk ? 'sent' : 'failed',
    error_message: sendError,
    metadata: { from: resolvedFrom, reply_to: resolvedReplyTo, vendor_message_id: vendorId },
  }).eq('message_id', messageId)

  if (!sendOk) {
    console.error('Transactional email send failed', { templateName, effectiveRecipient, sendError })
    return new Response(JSON.stringify({ error: 'send_failed', detail: sendError }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Transactional email sent via Resend', { templateName, effectiveRecipient, vendorId })
  return new Response(
    JSON.stringify({ success: true, sent: true, id: vendorId }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
