// broker-admin-action — admin-only entry point for managing broker accounts.
// Supported actions:
//   - approve         : flip a pending broker to approved, generate referral
//                       code + Stripe coupon, send broker-approved-welcome email
//   - decline         : mark broker declined with optional reason; optionally
//                       send a notification email
//   - grant_access    : manually onboard a known user as a broker (e.g. a
//                       realtor friend) — sets has_broker_access + creates
//                       approved broker_profiles row
//   - suspend         : flip status to suspended (loses workspace access)
//   - reinstate       : flip status back to approved
//
// All actions require the caller to have the 'admin' role. The function uses
// the service role key for writes so RLS is enforced via the in-code admin
// check rather than per-table policies.

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[broker-admin-action] ${step}${d}`);
};

function generateBrokerCode(seed: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const hash = `${seed}-${Date.now()}-${Math.random()}`;
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(
      ((hash.charCodeAt(i % hash.length) + i * 31 + Math.random() * 1000) >>> 0) %
        alphabet.length,
    );
    suffix += alphabet[idx];
  }
  return `BROK-${suffix}`;
}

const VALID_TYPES = new Set([
  "credit_coach",
  "mortgage_broker",
  "financial_advisor",
  "real_estate_agent",
  "insurance_agent",
  "other",
]);

interface BaseBody {
  action:
    | "approve"
    | "decline"
    | "grant_access"
    | "suspend"
    | "reinstate"
    | "update_profile";
  brokerId?: string;
  // Decline options
  reason?: string;
  notify?: boolean;
  // Grant access options
  email?: string;
  businessName?: string;
  brokerType?: string;
  firstName?: string;
  lastName?: string;
  // Update profile options
  updates?: {
    business_name?: string;
    broker_type?: string;
    specializations?: string[];
    website?: string | null;
    bio?: string | null;
    firm_description?: string | null;
    paige_context_notes?: string | null;
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ensureUniqueReferralCode(
  admin: ReturnType<typeof createClient>,
  seed: string,
): Promise<string> {
  let code = generateBrokerCode(seed);
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await admin
      .from("broker_profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!clash) return code;
    code = generateBrokerCode(seed + "-" + i);
  }
  return code;
}

async function createStripeCoupon(referralCode: string, userId: string): Promise<string | null> {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      log("STRIPE_SECRET_KEY not set — using shared coupon fallback");
      return Deno.env.get("STRIPE_BROKER_CLIENT_COUPON_CODE") ?? null;
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" as any });
    const coupon = await stripe.coupons.create({
      name: `Broker client discount — ${referralCode}`,
      amount_off: 1000,
      currency: "usd",
      duration: "forever",
      metadata: { broker_referral_code: referralCode, broker_user_id: userId },
    });
    log("Created Stripe coupon", { id: coupon.id });
    return coupon.id;
  } catch (err) {
    log("Stripe coupon creation failed", { error: String(err) });
    return Deno.env.get("STRIPE_BROKER_CLIENT_COUPON_CODE") ?? null;
  }
}

async function sendApprovedWelcome(
  admin: ReturnType<typeof createClient>,
  opts: {
    brokerId: string;
    email: string;
    firstName: string | null;
    businessName: string | null;
    referralCode: string;
    matchedUserId: string | null;
  },
) {
  try {
    await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "broker-approved-welcome",
        recipientEmail: opts.email,
        recipientUserId: opts.matchedUserId,
        idempotencyKey: `broker-approved-${opts.brokerId}-${opts.referralCode}`,
        templateData: {
          firstName: opts.firstName || undefined,
          businessName: opts.businessName || undefined,
          referralCode: opts.referralCode,
          brokerReferralLink: `https://paigeagent.ai/broker?ref=${opts.referralCode}`,
          clientSignupLink: `https://paigeagent.ai/auth?broker=${opts.referralCode}`,
          dashboardUrl: "https://paigeagent.ai/app",
        },
      },
    });
    return true;
  } catch (err) {
    log("welcome email send failed", { error: String(err) });
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth: require admin ────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthenticated" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden — admin only" }, 403);

    const body = (await req.json().catch(() => ({}))) as BaseBody;
    if (!body.action) return json({ error: "action is required" }, 400);

    // ─────────────────────────────────────────────────────────────
    // APPROVE
    // ─────────────────────────────────────────────────────────────
    if (body.action === "approve") {
      if (!body.brokerId) return json({ error: "brokerId required" }, 400);

      const { data: broker, error: bErr } = await admin
        .from("broker_profiles")
        .select(
          "id, user_id, business_name, referral_code, broker_client_discount_code, status",
        )
        .eq("id", body.brokerId)
        .maybeSingle();
      if (bErr || !broker) return json({ error: "Broker not found" }, 404);

      const { data: authUser } = await admin.auth.admin.getUserById(broker.user_id);
      const email = authUser?.user?.email || "";
      const firstName =
        (authUser?.user?.user_metadata as any)?.full_name?.split(" ")?.[0] || null;

      const referralCode =
        broker.referral_code ||
        (await ensureUniqueReferralCode(admin, broker.user_id));

      const couponCode =
        broker.broker_client_discount_code ||
        (await createStripeCoupon(referralCode, broker.user_id));

      const { error: updErr } = await admin
        .from("broker_profiles")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          referral_code: referralCode,
          broker_client_discount_code: couponCode,
          decline_reason: null,
          declined_at: null,
        })
        .eq("id", broker.id);
      if (updErr) return json({ error: updErr.message }, 500);

      // Grant broker role
      try {
        await admin
          .from("user_roles")
          .upsert(
            { user_id: broker.user_id, role: "broker" as any },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
      } catch (_) {}

      const emailSent = email
        ? await sendApprovedWelcome(admin, {
            brokerId: broker.id,
            email,
            firstName,
            businessName: broker.business_name,
            referralCode,
            matchedUserId: broker.user_id,
          })
        : false;

      return json({ success: true, referralCode, brokerClientDiscountCode: couponCode, emailSent });
    }

    // ─────────────────────────────────────────────────────────────
    // DECLINE
    // ─────────────────────────────────────────────────────────────
    if (body.action === "decline") {
      if (!body.brokerId) return json({ error: "brokerId required" }, 400);

      const { data: broker, error: bErr } = await admin
        .from("broker_profiles")
        .select("id, user_id, business_name")
        .eq("id", body.brokerId)
        .maybeSingle();
      if (bErr || !broker) return json({ error: "Broker not found" }, 404);

      const { error: updErr } = await admin
        .from("broker_profiles")
        .update({
          status: "declined",
          declined_at: new Date().toISOString(),
          decline_reason: body.reason?.trim() || null,
        })
        .eq("id", broker.id);
      if (updErr) return json({ error: updErr.message }, 500);

      let emailSent = false;
      if (body.notify) {
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(broker.user_id);
          const email = authUser?.user?.email;
          if (email) {
            await admin.functions.invoke("send-transactional-email", {
              body: {
                templateName: "broker-application-received",
                recipientEmail: email,
                recipientUserId: broker.user_id,
                idempotencyKey: `broker-declined-${broker.id}`,
                templateData: {
                  firstName:
                    (authUser?.user?.user_metadata as any)?.full_name?.split(" ")?.[0] ||
                    undefined,
                  businessName: broker.business_name,
                  declineNotice: true,
                  declineReason: body.reason || undefined,
                },
              },
            });
            emailSent = true;
          }
        } catch (err) {
          log("decline notify email failed", { error: String(err) });
        }
      }

      return json({ success: true, emailSent });
    }

    // ─────────────────────────────────────────────────────────────
    // GRANT ACCESS — manual broker onboarding by admin
    // ─────────────────────────────────────────────────────────────
    if (body.action === "grant_access") {
      const email = (body.email || "").trim().toLowerCase();
      const businessName = (body.businessName || "").trim();
      const brokerType = (body.brokerType || "").trim();

      if (!email) return json({ error: "email is required" }, 400);
      if (!businessName) return json({ error: "businessName is required" }, 400);
      if (!VALID_TYPES.has(brokerType)) return json({ error: "Invalid brokerType" }, 400);

      // Find the auth user
      let matchedUserId: string | null = null;
      let matchedUserName: string | null = null;
      const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = usersList?.users?.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        matchedUserId = existing.id;
        matchedUserName =
          (existing.user_metadata as any)?.full_name ||
          existing.email?.split("@")[0] ||
          null;
      }
      if (!matchedUserId) {
        return json(
          {
            error:
              "No PaigeAgent account exists for that email. Ask them to sign up first, then grant access.",
          },
          404,
        );
      }

      // Set has_broker_access on profile
      try {
        await admin
          .from("profiles")
          .update({ has_broker_access: true } as any)
          .eq("user_id", matchedUserId);
      } catch (err) {
        log("profile flag update failed", { error: String(err) });
      }

      // Existing broker_profiles row?
      const { data: existingBroker } = await admin
        .from("broker_profiles")
        .select("id, referral_code, broker_client_discount_code")
        .eq("user_id", matchedUserId)
        .maybeSingle();

      let brokerId: string;
      let referralCode: string;
      let couponCode: string | null;

      if (existingBroker?.id) {
        referralCode =
          existingBroker.referral_code ||
          (await ensureUniqueReferralCode(admin, matchedUserId));
        couponCode =
          existingBroker.broker_client_discount_code ||
          (await createStripeCoupon(referralCode, matchedUserId));

        const { error: updErr } = await admin
          .from("broker_profiles")
          .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            referral_code: referralCode,
            broker_client_discount_code: couponCode,
            business_name: businessName,
            broker_type: brokerType,
          })
          .eq("id", existingBroker.id);
        if (updErr) return json({ error: updErr.message }, 500);
        brokerId = existingBroker.id;
      } else {
        referralCode = await ensureUniqueReferralCode(admin, matchedUserId);
        couponCode = await createStripeCoupon(referralCode, matchedUserId);

        const { data: created, error: insErr } = await admin
          .from("broker_profiles")
          .insert({
            user_id: matchedUserId,
            business_name: businessName,
            broker_type: brokerType,
            referral_code: referralCode,
            broker_client_discount_code: couponCode,
            status: "approved",
            approved_at: new Date().toISOString(),
            use_case: "Manually granted by admin",
          } as any)
          .select("id")
          .single();
        if (insErr || !created) return json({ error: insErr?.message || "Insert failed" }, 500);
        brokerId = created.id;
      }

      // Grant broker role
      try {
        await admin
          .from("user_roles")
          .upsert(
            { user_id: matchedUserId, role: "broker" as any },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
      } catch (_) {}

      const emailSent = await sendApprovedWelcome(admin, {
        brokerId,
        email,
        firstName: body.firstName || matchedUserName?.split(" ")[0] || null,
        businessName,
        referralCode,
        matchedUserId,
      });

      return json({
        success: true,
        brokerId,
        referralCode,
        brokerClientDiscountCode: couponCode,
        emailSent,
        userName: matchedUserName,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // UPDATE PROFILE — admin edits broker business details
    // ─────────────────────────────────────────────────────────────
    if (body.action === "update_profile") {
      if (!body.brokerId) return json({ error: "brokerId required" }, 400);
      if (!body.updates || typeof body.updates !== "object") {
        return json({ error: "updates object required" }, 400);
      }

      const allowed: Record<string, any> = {};
      const u = body.updates;

      if (typeof u.business_name === "string") {
        const v = u.business_name.trim();
        if (!v) return json({ error: "business_name cannot be empty" }, 400);
        allowed.business_name = v;
      }
      if (typeof u.broker_type === "string") {
        if (!VALID_TYPES.has(u.broker_type)) {
          return json({ error: "Invalid broker_type" }, 400);
        }
        allowed.broker_type = u.broker_type;
      }
      if (Array.isArray(u.specializations)) {
        allowed.specializations = u.specializations
          .filter((s) => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean);
      }
      if (u.website !== undefined) {
        allowed.website = typeof u.website === "string" && u.website.trim()
          ? u.website.trim()
          : null;
      }
      if (u.bio !== undefined) {
        allowed.bio = typeof u.bio === "string" && u.bio.trim() ? u.bio.trim() : null;
      }
      if (u.firm_description !== undefined) {
        allowed.firm_description = typeof u.firm_description === "string" && u.firm_description.trim()
          ? u.firm_description.trim()
          : null;
      }
      if (u.paige_context_notes !== undefined) {
        allowed.paige_context_notes = typeof u.paige_context_notes === "string" && u.paige_context_notes.trim()
          ? u.paige_context_notes.trim()
          : null;
      }

      if (Object.keys(allowed).length === 0) {
        return json({ error: "No valid fields to update" }, 400);
      }

      allowed.updated_at = new Date().toISOString();

      const { error: updErr } = await admin
        .from("broker_profiles")
        .update(allowed)
        .eq("id", body.brokerId);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ success: true, updated: Object.keys(allowed).filter((k) => k !== "updated_at") });
    }

    // ─────────────────────────────────────────────────────────────
    // SUSPEND / REINSTATE
    // ─────────────────────────────────────────────────────────────
    if (body.action === "suspend" || body.action === "reinstate") {
      if (!body.brokerId) return json({ error: "brokerId required" }, 400);
      const nextStatus = body.action === "suspend" ? "suspended" : "approved";

      const updates: Record<string, any> = { status: nextStatus };
      if (nextStatus === "approved") {
        // Re-approval: ensure approved_at set if previously null
        const { data: cur } = await admin
          .from("broker_profiles")
          .select("approved_at")
          .eq("id", body.brokerId)
          .maybeSingle();
        if (!cur?.approved_at) updates.approved_at = new Date().toISOString();
      }

      const { error: updErr } = await admin
        .from("broker_profiles")
        .update(updates)
        .eq("id", body.brokerId);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ success: true });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (err) {
    log("UNCAUGHT", { error: String(err) });
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
