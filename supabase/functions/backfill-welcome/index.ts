// backfill-welcome — one-off sender for the branded Paige welcome email to the
// accounts that were created before the welcome build shipped. Targets a FIXED
// internal recipient list (the owner's own company accounts) and is gated by a
// static token so it can't be drive-by triggered. Returns the Resend per-email
// result so delivery is verifiable. Safe to remove once the backfill is done.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM =
  Deno.env.get("PLATFORM_DEFAULT_EMAIL_FROM") ?? "Paige Agent AI <hello@paigeagent.ai>";
const PUBLIC_BASE = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://paigeagent.ai").replace(/\/$/, "");
const GOLD = "#D4A752";
const TOKEN = "paige-welcome-backfill-2026";

const RECIPIENTS = [
  { email: "mrmogulmaker@gmail.com", name: "Mr. Mogul Maker" },
  { email: "mogulmakeracademy@gmail.com", name: "Mogul Maker Academy" },
  { email: "firststerlingcapital@gmail.com", name: "1st Sterling Capital" },
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function welcomeHtml(name: string): string {
  const hi = name ? `Welcome, ${esc(name)}.` : "Welcome to Paige.";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e8ec;border-radius:14px;overflow:hidden;">
      <tr><td style="height:5px;background:${GOLD};"></td></tr>
      <tr><td style="padding:30px 32px 6px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#98a0ae;font-weight:bold;">Paige Agent AI</div>
        <h1 style="color:#101828;font-size:22px;margin:12px 0 6px;">${hi}</h1>
        <p style="color:#475467;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Your account is live. Paige is your team — she runs the follow-ups, onboarding, and the
          daily brief so you get your time back. One more step: name your workspace and tell Paige
          what you do, and she starts working.
        </p>
      </td></tr>
      <tr><td style="padding:2px 32px 26px;">
        <a href="${PUBLIC_BASE}/onboarding"
           style="display:inline-block;background:${GOLD};color:#241645;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:9999px;">
          Set up your workspace
        </a>
      </td></tr>
      <tr><td style="padding:16px 32px 26px;border-top:1px solid #eef0f3;">
        <p style="color:#98a0ae;font-size:12px;margin:0;">You're receiving this because you have a Paige Agent AI account.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  if (!token && req.method === "POST") {
    try { token = (await req.json())?.token ?? ""; } catch { /* ignore */ }
  }
  if (token !== TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "no RESEND_API_KEY" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const r of RECIPIENTS) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [r.email],
          subject: "Welcome to Paige — your workspace is ready to build",
          html: welcomeHtml(r.name),
        }),
      });
      const jsonRes = await res.json().catch(() => ({}));
      results.push({ email: r.email, status: res.status, ok: res.ok, id: (jsonRes as { id?: string }).id ?? null, error: res.ok ? null : jsonRes });
    } catch (e) {
      results.push({ email: r.email, ok: false, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, from: EMAIL_FROM, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
