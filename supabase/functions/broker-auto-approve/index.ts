// Broker auto-approval edge function.
// Phase 1 — instant approval on submit. Performs:
//   1. Validates the application payload
//   2. Creates / updates broker_profiles row (status=approved)
//   3. Generates BROK-XXXXXX referral code
//   4. Creates a per-broker $10-off forever Stripe coupon
//      (so each broker has their own attributable client discount code)
//   5. Grants 'broker' role if the applicant's email matches an existing user
//   6. Sends broker-application-received + broker-approved-welcome emails
// All errors are logged but the function still returns success when the broker
// row + referral code were created — emails and role assignment are best-effort.

import { createClient } from 'npm:@supabase/supabase-js@2.57.2'
import Stripe from 'https://esm.sh/stripe@18.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : ''
  console.log(`[broker-auto-approve] ${step}${d}`)
}

interface Payload {
  firstName: string
  lastName: string
  email: string
  businessName: string
  brokerType: string
  licenseNumber?: string | null
  website?: string | null
  currentClientCount?: string | null
  useCase: string
  brokerReferralCode?: string | null
}

const VALID_TYPES = new Set([
  'credit_coach',
  'mortgage_broker',
  'financial_advisor',
  'real_estate_agent',
  'insurance_agent',
  'other',
])

const CLIENT_COUNT_TO_INT: Record<string, number> = {
  '1-10': 5,
  '11-25': 18,
  '26-50': 38,
  '51-100': 75,
  '100+': 150,
}

function generateBrokerCode(seed: string): string {
  // Format: BROK-XXXXXX (uppercase alphanumeric, no I/O/0/1 to avoid confusion)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const hash = `${seed}-${Date.now()}-${Math.random()}`
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(
      ((hash.charCodeAt(i % hash.length) + i * 31 + Math.random() * 1000) >>> 0) %
        alphabet.length,
    )
    suffix += alphabet[idx]
  }
  return `BROK-${suffix}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as Payload

    // ── Validation ─────────────────────────────────────────────
    if (
      !body.firstName?.trim() ||
      !body.lastName?.trim() ||
      !body.email?.trim() ||
      !body.businessName?.trim() ||
      !body.brokerType ||
      !body.useCase?.trim()
    ) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (!VALID_TYPES.has(body.brokerType)) {
      return new Response(
        JSON.stringify({ error: `Invalid brokerType: ${body.brokerType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    )

    const email = body.email.trim().toLowerCase()
    const fullName = `${body.firstName.trim()} ${body.lastName.trim()}`.trim()
    const clientCountQuoted = body.currentClientCount
      ? CLIENT_COUNT_TO_INT[body.currentClientCount] ?? null
      : null

    // ── Match to existing auth user (by email) ─────────────────
    let matchedUserId: string | null = null
    {
      const { data: usersList } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      })
      const existing = usersList?.users?.find((u) => u.email?.toLowerCase() === email)
      if (existing) {
        matchedUserId = existing.id
        log('Matched existing user', { matchedUserId })
      } else {
        log('No existing user — application stored without user_id link')
      }
    }

    // For Phase 1 we require an existing account because broker_profiles.user_id
    // is NOT NULL UNIQUE. If there's no match, ask them to sign up first.
    if (!matchedUserId) {
      return new Response(
        JSON.stringify({
          error:
            'Please create your PaigeAgent account first (sign up with this email), then submit your broker application again.',
          requiresSignup: true,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Existing broker profile? Idempotency. ──────────────────
    const { data: existingBroker } = await supabase
      .from('broker_profiles')
      .select('id, referral_code, broker_client_discount_code')
      .eq('user_id', matchedUserId)
      .maybeSingle()

    if (existingBroker?.id && existingBroker.referral_code) {
      log('Broker already exists — returning existing record', existingBroker)
      const code = existingBroker.referral_code
      return new Response(
        JSON.stringify({
          brokerId: existingBroker.id,
          referralCode: code,
          brokerClientDiscountCode: existingBroker.broker_client_discount_code,
          signupClientLink: `https://paigeagent.ai/auth?broker=${code}`,
          alreadyExisted: true,
          emailSent: false,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Generate unique referral code ──────────────────────────
    let referralCode = generateBrokerCode(matchedUserId)
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase
        .from('broker_profiles')
        .select('id')
        .eq('referral_code', referralCode)
        .maybeSingle()
      if (!clash) break
      referralCode = generateBrokerCode(matchedUserId + '-' + i)
    }

    // ── Create per-broker Stripe coupon ($10 off forever) ──────
    let brokerCouponId: string | null = null
    try {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' as any })
        const coupon = await stripe.coupons.create({
          name: `Broker client discount — ${referralCode}`,
          amount_off: 1000,
          currency: 'usd',
          duration: 'forever',
          metadata: {
            broker_referral_code: referralCode,
            broker_user_id: matchedUserId,
          },
        })
        brokerCouponId = coupon.id
        log('Created Stripe coupon', { id: brokerCouponId })
      } else {
        log('STRIPE_SECRET_KEY not set — skipping coupon creation')
      }
    } catch (err) {
      log('Stripe coupon creation failed', { error: String(err) })
    }

    // ── Insert broker profile ──────────────────────────────────
    const { data: broker, error: insertError } = await supabase
      .from('broker_profiles')
      .insert({
        user_id: matchedUserId,
        business_name: body.businessName.trim(),
        broker_type: body.brokerType,
        license_number: body.licenseNumber || null,
        website: body.website || null,
        referral_code: referralCode,
        broker_referral_code: body.brokerReferralCode || null,
        broker_client_discount_code: brokerCouponId,
        status: 'approved',
        approved_at: new Date().toISOString(),
        client_count_quoted: clientCountQuoted,
        use_case: body.useCase.trim(),
      } as any)
      .select('id, referral_code, broker_client_discount_code')
      .single()

    if (insertError || !broker) {
      log('Broker insert failed', { error: insertError })
      return new Response(
        JSON.stringify({
          error: insertError?.message || 'Failed to create broker profile',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Grant broker role ──────────────────────────────────────
    try {
      await supabase
        .from('user_roles')
        .upsert(
          { user_id: matchedUserId, role: 'broker' as any },
          { onConflict: 'user_id,role', ignoreDuplicates: true },
        )
    } catch (err) {
      log('Role grant failed', { error: String(err) })
    }

    const code = broker.referral_code!
    const signupClientLink = `https://paigeagent.ai/auth?broker=${code}`
    const brokerReferralLink = `https://paigeagent.ai/broker?ref=${code}`
    const dashboardUrl = 'https://paigeagent.ai/app'

    // ── Fire welcome emails (best-effort, non-blocking) ────────
    let emailSent = false
    try {
      await Promise.all([
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'broker-application-received',
            recipientEmail: email,
            idempotencyKey: `broker-app-received-${broker.id}`,
            recipientUserId: matchedUserId,
            templateData: {
              firstName: body.firstName,
              businessName: body.businessName,
            },
          },
        }),
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'broker-approved-welcome',
            recipientEmail: email,
            idempotencyKey: `broker-approved-${broker.id}`,
            recipientUserId: matchedUserId,
            templateData: {
              firstName: body.firstName,
              businessName: body.businessName,
              referralCode: code,
              brokerReferralLink,
              clientSignupLink,
              dashboardUrl,
            },
          },
        }),
      ])
      emailSent = true
    } catch (err) {
      log('Email send failed', { error: String(err) })
    }

    return new Response(
      JSON.stringify({
        brokerId: broker.id,
        referralCode: code,
        brokerClientDiscountCode: broker.broker_client_discount_code,
        signupClientLink,
        emailSent,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    log('UNCAUGHT ERROR', { error: String(err) })
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
