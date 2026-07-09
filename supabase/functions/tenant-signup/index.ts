// tenant-signup — public front-door signup that creates a PRE-CONFIRMED account.
//
// Why this exists: Supabase Auth on this project requires email confirmation,
// but the confirmation-email delivery isn't wired yet (Task #52), so the normal
// auth.signUp path 500s ("Error sending confirmation email") and NO account is
// created. Per the owner's decision ("skip verification for now — build it"),
// we create the user with email_confirm:true via the service role so signup
// works immediately; the client then signs in and is routed into onboarding.
//
// To restore real email verification later: wire Auth SMTP (Resend), drop the
// email_confirm flag (or move it behind a config check), and let auth.signUp
// send the confirmation link again.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method", message: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid", message: "Bad request." }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = body.fullName ? String(body.fullName).trim() : null;
  const referralCode = body.referralCode ? String(body.referralCode) : null;
  const marketingOptIn = body.marketingOptIn === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, reason: "invalid", message: "Enter a valid email address." });
  }
  if (password.length < 8) {
    return json({ ok: false, reason: "weak", message: "Password must be at least 8 characters." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ ok: false, reason: "server", message: "Server not configured." }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pre-confirmed: no verification email needed to proceed
    user_metadata: {
      ...(fullName ? { full_name: fullName } : {}),
      ...(referralCode ? { referral_code: referralCode } : {}),
      consent_marketing: marketingOptIn,
    },
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return json({
        ok: false,
        reason: "exists",
        message: "An account with this email already exists — sign in instead.",
      });
    }
    return json({ ok: false, reason: "error", message: error.message || "Could not create your account." });
  }

  return json({ ok: true, user_id: data.user?.id ?? null });
});
