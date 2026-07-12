// Shared booking-notification primitives — the ONE source of truth for the
// Twilio SMS path, merge-field templating, lifecycle-trigger parsing, and the
// branded lifecycle email shell, so the scheduled worker
// (process-booking-notifications), the create path (public-booking), and the
// self-serve reschedule/cancel path (booking-manage) all send the SAME way
// (§12 — organize/dedupe; §13 — no copy-paste forks). Pure Deno/TS: reads
// Twilio/Resend creds from env at call time, no other I/O.

// ── Twilio SMS ──────────────────────────────────────────────────────────────
// Reuse the platform's existing Twilio number env when TWILIO_FROM isn't set,
// so an SMS works with the same credentials the rest of the platform uses.
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM") ?? Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";

// Normalize a raw phone to E.164; keeps a leading '+', else assumes US (+1).
// Returns "" when there are no dialable digits so callers can skip cleanly.
export function toE164(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return plus ? `+${digits}` : `+1${digits}`;
}

// Minimal Twilio REST send. Returns true ONLY when Twilio accepted the message
// (§13 — a fire is not a delivery; the caller counts a send only on a true here).
export async function sendSms(to: string, message: string): Promise<boolean> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return false;
  const toNum = toE164(to);
  const fromNum = toE164(TWILIO_FROM);
  if (!toNum || !fromNum) return false;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      },
      body: new URLSearchParams({ To: toNum, From: fromNum, Body: message }),
    });
    return res.ok;
  } catch { return false; }
}

// ── Merge-field templating ──────────────────────────────────────────────────
// Config-as-data notification copy: substitute {{guest_name}} {{when}} {{where}}
// {{title}} {{service}} in an owner-/Paige-authored subject or body. Unknown
// tokens are left intact rather than blanked, so a typo is visible, not silent.
export const MERGE_FIELDS = ["guest_name", "when", "where", "title", "service"] as const;
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

// ── Lifecycle triggers ──────────────────────────────────────────────────────
// Owner-authored messages fired on a booking transition (beyond the built-in
// create/reschedule/cancel emails). Opt-in: absent array => nothing extra sends,
// so we never double-send the confirmation the create path already dispatches.
export type LifecycleEvent = "created" | "cancelled" | "rescheduled";
export type NotifyChannel = "email" | "sms" | "both";
export type NotifyTarget = "guest" | "host" | "both";
export interface Lifecycle {
  event: LifecycleEvent;
  channel: NotifyChannel;
  to: NotifyTarget;
  subject?: string;
  body?: string;
}

const LIFECYCLE_EVENTS: LifecycleEvent[] = ["created", "cancelled", "rescheduled"];
const CHANNELS: NotifyChannel[] = ["email", "sms", "both"];
const TARGETS: NotifyTarget[] = ["guest", "host", "both"];

// Coerce a possibly-partial/legacy notify_config.lifecycle jsonb into a safe,
// validated array. Anything malformed is dropped, never trusted.
export function parseLifecycle(raw: unknown): Lifecycle[] {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>).lifecycle : undefined;
  if (!Array.isArray(src)) return [];
  return src
    .map((r) => (r && typeof r === "object" ? r : {}) as Record<string, unknown>)
    .filter((r) => LIFECYCLE_EVENTS.includes(r.event as LifecycleEvent))
    .map((r) => ({
      event: r.event as LifecycleEvent,
      channel: CHANNELS.includes(r.channel as NotifyChannel) ? (r.channel as NotifyChannel) : "email",
      to: TARGETS.includes(r.to as NotifyTarget) ? (r.to as NotifyTarget) : "guest",
      subject: typeof r.subject === "string" && r.subject.trim() ? r.subject : undefined,
      body: typeof r.body === "string" && r.body.trim() ? r.body : undefined,
    }));
}

// Fan a channel/target selection out to the concrete channels/recipients.
export function channelsOf(channel: NotifyChannel): ("email" | "sms")[] {
  return channel === "both" ? ["email", "sms"] : [channel];
}
export function targetsOf(to: NotifyTarget): ("guest" | "host")[] {
  return to === "both" ? ["guest", "host"] : [to];
}

// ── Branded lifecycle email shell ───────────────────────────────────────────
// One shared card so a tenant-authored lifecycle email reads as the SAME system
// as the built-in confirmation/reminder emails (§6). Escapes all interpolated
// content; the body preserves author line breaks.
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function lifecycleEmailHtml(
  brandName: string, accent: string, heading: string, bodyText: string, manageLink?: string,
): string {
  const bodyHtml = esc(bodyText).replace(/\r?\n/g, "<br>");
  const footerHtml = manageLink
    ? `<p style="color:#667085;font-size:13px;margin:0 0 4px;">Need to make a change? <a href="${esc(manageLink)}" style="color:#7A67E8;font-weight:600;text-decoration:none;">Reschedule or cancel</a>.</p>
       <p style="color:#98a0ae;font-size:12px;margin:0;">Or just reply to this email.</p>`
    : `<p style="color:#98a0ae;font-size:12px;margin:0;">Or just reply to this email.</p>`;
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e8ec;border-radius:14px;overflow:hidden;">
      <tr><td style="height:5px;background:${esc(accent)};"></td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#98a0ae;font-weight:bold;">${esc(brandName)}</div>
        <h1 style="color:#101828;font-size:20px;margin:10px 0 12px;">${esc(heading)}</h1>
        <p style="color:#344054;font-size:14px;line-height:1.55;margin:0 0 18px;">${bodyHtml}</p>
      </td></tr>
      <tr><td style="padding:18px 32px 26px;border-top:1px solid #eef0f3;">
        ${footerHtml}
      </td></tr>
    </table></td></tr></table></body></html>`;
}
