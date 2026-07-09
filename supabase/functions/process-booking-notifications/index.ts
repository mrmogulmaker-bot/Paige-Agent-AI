// Scheduled-send worker: booking reminders + post-meeting follow-ups.
// Invoked by pg_cron every ~5 min (guarded by a shared token). Reads each
// calendar-backed booking's notify_config, and for every due reminder offset
// or follow-up window sends a branded email from calendar@ — claimed in
// booking_notifications_sent first so nothing is ever sent twice.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CRON_TOKEN = "pcron-9f2a7c4b1e"; // shared guard; triggering only runs an idempotent scan
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("CALENDAR_EMAIL_FROM") ?? Deno.env.get("PLATFORM_DEFAULT_EMAIL_FROM") ?? "Paige Agent AI <calendar@paigeagent.ai>";

const MIN = 60_000;
const DAY = 86_400_000;

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function locationLabel(type: string, value: string | null): string {
  switch (type) {
    case "google_meet": return "Google Meet — link to follow";
    case "zoom": return "Zoom — link to follow";
    case "phone": return value ? `Phone call: ${value}` : "Phone call";
    case "in_person": return value ? `In person: ${value}` : "In person";
    case "custom": return value || "Details to follow";
    default: return "To be confirmed";
  }
}
function shell(brandName: string, accent: string, heading: string, lead: string, rows: [string, string][], footer: string): string {
  const rowHtml = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#98a0ae;width:88px;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#101828;">${esc(v)}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e8ec;border-radius:14px;overflow:hidden;">
      <tr><td style="height:5px;background:${esc(accent)};"></td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#98a0ae;font-weight:bold;">${esc(brandName)}</div>
        <h1 style="color:#101828;font-size:20px;margin:10px 0 4px;">${esc(heading)}</h1>
        <p style="color:#667085;font-size:14px;margin:0 0 18px;">${esc(lead)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${rowHtml}</table>
      </td></tr>
      <tr><td style="padding:18px 32px 26px;border-top:1px solid #eef0f3;">
        <p style="color:#98a0ae;font-size:12px;margin:0;">${esc(footer)}</p>
      </td></tr>
    </table></td></tr></table></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

interface Reminder { channel: string; offset_min: number }
interface Notify { reminders: Reminder[]; followup_guest: boolean; followup_offset_min: number }
function parseNotify(raw: unknown): Notify {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reminders = Array.isArray(o.reminders)
    ? (o.reminders as unknown[])
        .map((r) => (r && typeof r === "object" ? r : {}) as Record<string, unknown>)
        .filter((r) => typeof r.offset_min === "number")
        .map((r) => ({ channel: typeof r.channel === "string" ? r.channel : "email", offset_min: r.offset_min as number }))
    : [];
  return {
    reminders,
    followup_guest: o.followup_guest === true,
    followup_offset_min: typeof o.followup_offset_min === "number" ? o.followup_offset_min : 60,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if ((req.headers.get("x-cron-token") ?? new URL(req.url).searchParams.get("token")) !== CRON_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = Date.now();

  // Candidate window: reminders up to a week ahead, follow-ups up to 2 days back.
  const { data: rows } = await admin
    .from("internal_bookings")
    .select("id, guest_email, guest_name, title, start_at, end_at, timezone, location_type, location_value, status, calendar_id, collective_group_id")
    .not("calendar_id", "is", null)
    .neq("status", "cancelled")
    .neq("status", "no_show")
    .gte("start_at", new Date(now - 2 * DAY).toISOString())
    .lte("start_at", new Date(now + 8 * DAY).toISOString());
  const allRows = rows ?? [];
  // Collective bookings write one symmetric row per host, all sharing the same
  // guest_email/start_at/collective_group_id — without this, the shared guest
  // gets one duplicate reminder/follow-up per attending host. Keep a single
  // deterministic representative per group (lowest id) so repeated cron runs
  // always claim against the same booking_id and the unique claim table below
  // dedupes across runs, not just within one. class_seat rows need no such
  // dedup — each seat is already a different guest, by design (§ one row =
  // one person's relationship to one interval).
  const byGroupRep = new Map<string, (typeof allRows)[number]>();
  const singles: typeof allRows = [];
  for (const b of allRows) {
    const gid = b.collective_group_id as string | null;
    if (!gid) { singles.push(b); continue; }
    const cur = byGroupRep.get(gid);
    if (!cur || (b.id as string) < (cur.id as string)) byGroupRep.set(gid, b);
  }
  const bookings = [...singles, ...byGroupRep.values()];

  // Load the calendars referenced by these bookings (notify_config + branding).
  const calIds = Array.from(new Set(bookings.map((b) => b.calendar_id as string)));
  const calById = new Map<string, Record<string, unknown>>();
  const tenantIds = new Set<string>();
  if (calIds.length) {
    const { data: cals } = await admin.from("calendars")
      .select("id, tenant_id, title, description, accent, logo_url, notify_config").in("id", calIds);
    for (const c of (cals ?? [])) { calById.set(c.id as string, c); if (c.tenant_id) tenantIds.add(c.tenant_id as string); }
  }
  // Tenant brand names for the email header.
  const tenantName = new Map<string, string>();
  if (tenantIds.size) {
    const { data: ts } = await admin.from("tenants").select("id, name, brand").in("id", Array.from(tenantIds));
    for (const t of (ts ?? [])) {
      const brand = (t.brand ?? {}) as Record<string, string>;
      tenantName.set(t.id as string, brand.brand_name || brand.display_name || brand.name || (t.name as string) || "Paige Agent AI");
    }
  }

  // Claim a notification; returns true if we won the claim (idempotent gate).
  async function claim(bookingId: string, key: string, email: string): Promise<boolean> {
    const { error } = await admin.from("booking_notifications_sent")
      .insert({ booking_id: bookingId, notif_key: key, recipient_email: email, status: "sending" });
    return !error; // unique violation => already claimed
  }
  async function finish(bookingId: string, key: string, ok: boolean) {
    if (ok) await admin.from("booking_notifications_sent").update({ status: "sent" }).eq("booking_id", bookingId).eq("notif_key", key);
    else await admin.from("booking_notifications_sent").delete().eq("booking_id", bookingId).eq("notif_key", key); // let it retry
  }

  let reminders = 0, followups = 0;
  for (const b of bookings) {
    const cal = calById.get(b.calendar_id as string);
    if (!cal) continue;
    const email = String(b.guest_email ?? "");
    if (!email) continue;
    const notify = parseNotify(cal.notify_config);
    const startMs = Date.parse(b.start_at as string);
    const endMs = Date.parse(b.end_at as string);
    const tz = (b.timezone as string) || "America/New_York";
    const accent = (cal.accent as string) || "#EBB94C";
    const brandName = (cal.tenant_id && tenantName.get(cal.tenant_id as string)) || "Paige Agent AI";
    const title = (cal.title as string) || (b.title as string) || "Your session";
    const loc = locationLabel(String(b.location_type ?? ""), (b.location_value as string) ?? null);
    const whenLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "long", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(new Date(startMs));

    // Reminders: due when now is at/after (start - offset) and before start.
    for (const rem of notify.reminders) {
      const dueAt = startMs - rem.offset_min * MIN;
      if (dueAt <= now && now < startMs) {
        const key = `reminder:${rem.offset_min}`;
        if (await claim(b.id as string, key, email)) {
          const html = shell(brandName, accent, "Reminder: you're booked",
            "A quick heads-up — your session is coming up.",
            [["Session", title], ["When", whenLabel], ["Where", loc]],
            "Need to make a change? Just reply to this email.");
          const ok = await sendEmail(email, `Reminder: ${title} · ${whenLabel}`, html);
          await finish(b.id as string, key, ok);
          if (ok) reminders++;
        }
      }
    }

    // Follow-up: due when now is at/after (end + offset), meeting has ended.
    if (notify.followup_guest && endMs <= now && endMs + notify.followup_offset_min * MIN <= now) {
      const key = "followup";
      if (await claim(b.id as string, key, email)) {
        const html = shell(brandName, accent, "Thanks for the time",
          `Great connecting${b.guest_name ? `, ${esc(String(b.guest_name))}` : ""}. Here's a quick follow-up.`,
          [["Session", title], ["When", whenLabel]],
          "Want to book again or have a question? Just reply — we're here.");
        const ok = await sendEmail(email, `Following up on ${title}`, html);
        await finish(b.id as string, key, ok);
        if (ok) followups++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, scanned: bookings.length, reminders, followups }), {
    headers: { "Content-Type": "application/json" },
  });
});
