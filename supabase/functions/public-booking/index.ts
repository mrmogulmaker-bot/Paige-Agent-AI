// Native booking engine — public availability + appointment creation.
// Anon-callable (verify_jwt=false); all writes go through the service role after
// server-side validation, so the public never touches tables directly.
// Source of truth is internal_bookings + staff_calendar_settings — no external
// provider required (Google/Cal.com/Apple sync is optional, layered on later).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// --- Weekly availability contract -------------------------------------------
interface DayWindow { day: number; start: string; end: string } // day 0=Sun..6=Sat, "HH:MM"
const DEFAULT_AVAILABILITY: DayWindow[] = [1, 2, 3, 4, 5].map((day) => ({ day, start: "09:00", end: "17:00" }));

function parseAvailability(raw: unknown): DayWindow[] {
  if (!Array.isArray(raw)) return DEFAULT_AVAILABILITY;
  const out = raw.filter(
    (w): w is DayWindow =>
      w && typeof w === "object" &&
      typeof (w as DayWindow).day === "number" &&
      /^\d{2}:\d{2}$/.test((w as DayWindow).start ?? "") &&
      /^\d{2}:\d{2}$/.test((w as DayWindow).end ?? ""),
  );
  return out.length ? out : DEFAULT_AVAILABILITY;
}

// --- Timezone math (Intl-based; no external tz lib) -------------------------
function offsetMin(atUtcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(atUtcMs))) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second);
  return (asUtc - atUtcMs) / 60000;
}
/** A wall-clock time in `tz` → the UTC instant (ms). */
function zonedWallToUtcMs(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo, d, h, mi);
  return guess - offsetMin(guess, tz) * 60000;
}
/** The Y/M/D of a UTC instant as seen in `tz`. */
function ymdInTz(ms: number, tz: string): { y: number; mo: number; d: number; wd: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { y: +p.year, mo: +p.month, d: +p.day, wd };
}

interface HostSettings {
  user_id: string;
  tenant_id: string | null;
  calendarId: string | null; // set when the page is backed by a first-class calendar
  availability: DayWindow[];
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  timezone: string;
  minNoticeMin: number;
  title: string | null;
  description: string | null;
  accent: string | null;
  logoUrl: string | null; // per-calendar logo override (wins over tenant logo)
  theme: string; // 'light' | 'dark' booking page
  subtitle: string | null; // category line above the title
  showCompanyName: boolean; // render the brand/company name next to the logo
  locationType: string; // legacy single (fallback) — chosen method stored on booking
  locationValue: string | null;
  locationOptions: { type: string; value: string | null }[]; // owner-offered methods
  confirmGuest: boolean; // send guest a confirmation
  confirmHost: boolean; // notify the host of new bookings
}

function parseNotify(raw: unknown): { confirmGuest: boolean; confirmHost: boolean } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { confirmGuest: o.confirm_guest !== false, confirmHost: o.confirm_host !== false };
}
const KNOWN_LOCATIONS = ["google_meet", "zoom", "phone", "in_person", "custom"];
function parseLocationOptions(raw: unknown, fallbackType: string, fallbackValue: string | null): { type: string; value: string | null }[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((o) => (o && typeof o === "object" ? o : {}) as Record<string, unknown>)
    .map((o) => ({ type: String(o.type ?? ""), value: typeof o.value === "string" ? o.value : null }))
    .filter((o) => KNOWN_LOCATIONS.includes(o.type));
  if (out.length) return out;
  // Legacy fallback: a single method (or the old ask_invitee triple).
  if (fallbackType === "ask_invitee") return [{ type: "google_meet", value: null }, { type: "zoom", value: null }, { type: "phone", value: null }];
  return [{ type: KNOWN_LOCATIONS.includes(fallbackType) ? fallbackType : "google_meet", value: fallbackValue }];
}

interface Busy { start: number; end: number } // UTC ms

/** Compute open slot start instants (UTC ms) over [fromMs, toMs]. */
function computeSlots(h: HostSettings, busy: Busy[], fromMs: number, toMs: number, nowMs: number): number[] {
  const slots: number[] = [];
  const durMs = h.durationMin * 60000;
  const earliest = nowMs + h.minNoticeMin * 60000;
  const dayMs = 86_400_000;
  // Walk each calendar day in the host's timezone across the window.
  for (let cursor = fromMs - dayMs; cursor <= toMs + dayMs; cursor += dayMs) {
    const { y, mo, d, wd } = ymdInTz(cursor, h.timezone);
    const windows = h.availability.filter((w) => w.day === wd);
    for (const w of windows) {
      const [sh, sm] = w.start.split(":").map(Number);
      const [eh, em] = w.end.split(":").map(Number);
      const winStart = zonedWallToUtcMs(y, mo - 1, d, sh, sm, h.timezone);
      const winEnd = zonedWallToUtcMs(y, mo - 1, d, eh, em, h.timezone);
      for (let s = winStart; s + durMs <= winEnd; s += durMs) {
        const e = s + durMs;
        if (s < fromMs || s > toMs) continue;
        if (s < earliest) continue;
        // Buffer-padded conflict against existing bookings.
        const blocked = busy.some(
          (b) => s < b.end + h.bufferAfterMin * 60000 && e + h.bufferBeforeMin * 60000 > b.start,
        );
        if (!blocked) slots.push(s);
      }
    }
  }
  return Array.from(new Set(slots)).sort((a, b) => a - b);
}

// First-class calendar (the `calendars` entity) resolved by slug. This is the
// path created via the Calendars manager — many branded calendars per tenant.
// The availability owner is the calendar's top-priority host.
async function loadCalendar(admin: ReturnType<typeof createClient>, slug: string): Promise<HostSettings | null> {
  const { data: cal } = await admin
    .from("calendars")
    .select("id, tenant_id, title, description, logo_url, accent, duration_min, buffer_before_min, buffer_after_min, min_notice_min, timezone, availability_json, enabled, theme, subtitle, show_company_name, location_type, location_value, notify_config, location_options")
    .eq("slug", slug)
    .maybeSingle();
  if (!cal || cal.enabled !== true) return null;
  const { data: hosts } = await admin
    .from("calendar_hosts")
    .select("user_id, priority")
    .eq("calendar_id", cal.id)
    .order("priority", { ascending: true })
    .limit(1);
  const hostId = hosts?.[0]?.user_id as string | undefined;
  if (!hostId) return null; // no host = nobody to book with yet
  return {
    user_id: hostId,
    tenant_id: cal.tenant_id ?? null,
    calendarId: cal.id,
    availability: parseAvailability(cal.availability_json),
    durationMin: Math.max(5, cal.duration_min ?? 30),
    bufferBeforeMin: Math.max(0, cal.buffer_before_min ?? 0),
    bufferAfterMin: Math.max(0, cal.buffer_after_min ?? 0),
    timezone: cal.timezone || "America/New_York",
    minNoticeMin: Math.max(0, cal.min_notice_min ?? 60),
    title: cal.title ?? null,
    description: cal.description ?? null,
    accent: cal.accent ?? null,
    logoUrl: cal.logo_url ?? null,
    theme: cal.theme === "dark" ? "dark" : "light",
    subtitle: cal.subtitle ?? null,
    showCompanyName: cal.show_company_name !== false,
    locationType: cal.location_type ?? "google_meet",
    locationValue: cal.location_value ?? null,
    locationOptions: parseLocationOptions(cal.location_options, cal.location_type ?? "google_meet", cal.location_value ?? null),
    ...parseNotify(cal.notify_config),
  };
}

// Legacy per-staff booking page (staff_calendar_settings) — kept for back-compat.
async function loadHost(admin: ReturnType<typeof createClient>, slug: string): Promise<HostSettings | null> {
  const { data } = await admin
    .from("staff_calendar_settings")
    .select("user_id, tenant_id, availability_json, default_meeting_duration_min, buffer_before_min, buffer_after_min, timezone, booking_page_enabled, booking_page_title, booking_page_description, booking_page_accent")
    .eq("booking_page_slug", slug)
    .maybeSingle();
  if (!data || data.booking_page_enabled !== true) return null;
  return {
    user_id: data.user_id,
    tenant_id: data.tenant_id ?? null,
    calendarId: null,
    availability: parseAvailability(data.availability_json),
    durationMin: Math.max(5, data.default_meeting_duration_min ?? 30),
    bufferBeforeMin: Math.max(0, data.buffer_before_min ?? 0),
    bufferAfterMin: Math.max(0, data.buffer_after_min ?? 0),
    timezone: data.timezone || "America/New_York",
    minNoticeMin: 60,
    title: data.booking_page_title ?? null,
    description: data.booking_page_description ?? null,
    accent: data.booking_page_accent ?? null,
    logoUrl: null,
    theme: "light",
    subtitle: null,
    showCompanyName: true,
    locationType: "google_meet",
    locationValue: null,
    locationOptions: [{ type: "google_meet", value: null }],
    confirmGuest: true,
    confirmHost: true,
  };
}

/** White-label branding for the booking page: tenant brand + host overrides. */
async function loadBranding(admin: ReturnType<typeof createClient>, host: HostSettings) {
  let name: string | null = null;
  let logoUrl: string | null = host.logoUrl; // per-calendar logo wins
  let accent = host.accent;
  if (host.tenant_id) {
    const { data: t } = await admin.from("tenants").select("name, brand").eq("id", host.tenant_id).maybeSingle();
    const brand = (t?.brand ?? {}) as Record<string, string>;
    name = brand.brand_name ?? brand.display_name ?? brand.name ?? (t?.name as string | undefined) ?? null;
    logoUrl = logoUrl || brand.logo_url || null;
    accent = accent || brand.accent_color || brand.primary_color || null;
  }
  return {
    name: name || "Paige Agent AI",
    logoUrl,
    accent: accent || "#EBB94C",
    title: host.title,
    description: host.description,
    theme: host.theme,
    subtitle: host.subtitle,
    showCompanyName: host.showCompanyName,
    durationMin: host.durationMin,
    locationType: host.locationType,
    locationValue: host.locationValue,
    locationOptions: host.locationOptions,
  };
}

async function loadBusy(admin: ReturnType<typeof createClient>, userId: string, fromMs: number, toMs: number): Promise<Busy[]> {
  const { data } = await admin
    .from("internal_bookings")
    .select("start_at, end_at, status")
    .eq("host_user_id", userId)
    .neq("status", "cancelled")
    .gte("start_at", new Date(fromMs - 86_400_000).toISOString())
    .lte("start_at", new Date(toMs + 86_400_000).toISOString());
  return (data ?? []).map((b) => ({ start: Date.parse(b.start_at), end: Date.parse(b.end_at) }));
}

// --- Confirmation emails (guest + host) + .ics invite -----------------------
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("CALENDAR_EMAIL_FROM") ?? Deno.env.get("PLATFORM_DEFAULT_EMAIL_FROM") ?? "Paige Agent AI <calendar@paigeagent.ai>";
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function textOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#1B1230";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1B1230" : "#FFFFFF";
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
function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function buildIcs(o: { uid: string; startMs: number; endMs: number; title: string; desc: string; location: string; organizer: string; attendee: string; attendeeName: string }): string {
  const clean = (s: string) => String(s ?? "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Paige Agent AI//Booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${o.uid}`, `DTSTAMP:${icsStamp(Date.now())}`, `DTSTART:${icsStamp(o.startMs)}`, `DTEND:${icsStamp(o.endMs)}`,
    `SUMMARY:${clean(o.title)}`, `DESCRIPTION:${clean(o.desc)}`, `LOCATION:${clean(o.location)}`,
    `ORGANIZER;CN=${clean(o.organizer)}:mailto:noreply@paigeagent.ai`,
    `ATTENDEE;CN=${clean(o.attendeeName)};RSVP=TRUE:mailto:${o.attendee}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
async function sendEmail(to: string, subject: string, html: string, ics?: string): Promise<boolean> {
  if (!RESEND_KEY) return false;
  const body: Record<string, unknown> = { from: EMAIL_FROM, to: [to], subject, html };
  if (ics) body.attachments = [{ filename: "invite.ics", content: btoa(ics) }];
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
}
function guestEmailHtml(brandName: string, accent: string, title: string, whenLabel: string, location: string, host: string | null): string {
  const on = textOn(accent);
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e8ec;border-radius:14px;overflow:hidden;">
      <tr><td style="height:5px;background:${esc(accent)};"></td></tr>
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#98a0ae;font-weight:bold;">${esc(brandName)}</div>
        <h1 style="color:#101828;font-size:20px;margin:10px 0 4px;">You're booked</h1>
        <p style="color:#667085;font-size:14px;margin:0 0 18px;">Your time is reserved. Details are below and an invite is attached.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#101828;">
          <tr><td style="padding:6px 0;color:#98a0ae;width:88px;">Session</td><td style="padding:6px 0;font-weight:600;">${esc(title)}</td></tr>
          <tr><td style="padding:6px 0;color:#98a0ae;">When</td><td style="padding:6px 0;font-weight:600;">${esc(whenLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#98a0ae;">Where</td><td style="padding:6px 0;">${esc(location)}</td></tr>
          ${host ? `<tr><td style="padding:6px 0;color:#98a0ae;">With</td><td style="padding:6px 0;">${esc(host)}</td></tr>` : ""}
        </table>
      </td></tr>
      <tr><td style="padding:18px 32px 26px;border-top:1px solid #eef0f3;">
        <p style="color:#98a0ae;font-size:12px;margin:0;">Need to make a change? Just reply to this email.</p>
      </td></tr>
    </table></td></tr></table></body></html>`;
}
function hostEmailHtml(accent: string, title: string, whenLabel: string, guestName: string, guestEmail: string, guestPhone: string | null, location: string, notes: string | null): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fff;border:1px solid #e7e8ec;border-radius:14px;overflow:hidden;">
      <tr><td style="height:5px;background:${esc(accent)};"></td></tr>
      <tr><td style="padding:28px 32px;">
        <h1 style="color:#101828;font-size:19px;margin:0 0 14px;">New booking</h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#101828;">
          <tr><td style="padding:6px 0;color:#98a0ae;width:88px;">Session</td><td style="padding:6px 0;font-weight:600;">${esc(title)}</td></tr>
          <tr><td style="padding:6px 0;color:#98a0ae;">When</td><td style="padding:6px 0;font-weight:600;">${esc(whenLabel)}</td></tr>
          <tr><td style="padding:6px 0;color:#98a0ae;">Guest</td><td style="padding:6px 0;">${esc(guestName)} &lt;${esc(guestEmail)}&gt;</td></tr>
          ${guestPhone ? `<tr><td style="padding:6px 0;color:#98a0ae;">Phone</td><td style="padding:6px 0;">${esc(guestPhone)}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#98a0ae;">Where</td><td style="padding:6px 0;">${esc(location)}</td></tr>
          ${notes ? `<tr><td style="padding:6px 0;color:#98a0ae;vertical-align:top;">Notes</td><td style="padding:6px 0;">${esc(notes)}</td></tr>` : ""}
        </table>
      </td></tr>
    </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const slug = typeof body?.slug === "string" ? body.slug.toLowerCase() : "";
    if (!slug) return json({ error: "slug required" }, 400);

    // Prefer a first-class calendar; fall back to the legacy per-staff page.
    const host = (await loadCalendar(admin, slug)) ?? (await loadHost(admin, slug));
    if (!host) return json({ error: "This booking page isn't available." }, 404);

    const now = Date.now();

    if (action === "availability") {
      const fromMs = Math.max(now, Date.parse(body?.from) || now);
      const toMs = Math.min(now + 30 * 86_400_000, Date.parse(body?.to) || now + 14 * 86_400_000);
      const busy = await loadBusy(admin, host.user_id, fromMs, toMs);
      const slots = computeSlots(host, busy, fromMs, toMs, now);
      return json({
        durationMin: host.durationMin,
        timezone: host.timezone,
        branding: await loadBranding(admin, host),
        slots: slots.map((s) => new Date(s).toISOString()),
      });
    }

    if (action === "create") {
      const startMs = Date.parse(body?.start);
      const name = String(body?.guest?.name ?? "").trim().slice(0, 120);
      const email = String(body?.guest?.email ?? "").trim().toLowerCase().slice(0, 200);
      const phone = String(body?.guest?.phone ?? "").trim().slice(0, 40) || null;
      const notes = String(body?.notes ?? "").trim().slice(0, 1000) || null;
      if (!Number.isFinite(startMs)) return json({ error: "Invalid time." }, 400);
      if (startMs > now + 60 * 86_400_000) return json({ error: "That time is too far out." }, 400);
      if (!name) return json({ error: "Name is required." }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "A valid email is required." }, 400);

      // Lightweight abuse control: cap booking_page creates per host per minute.
      const { count: recent } = await admin
        .from("internal_bookings")
        .select("id", { count: "exact", head: true })
        .eq("host_user_id", host.user_id)
        .eq("source", "booking_page")
        .gte("created_at", new Date(now - 60_000).toISOString());
      if ((recent ?? 0) >= 5) return json({ error: "Too many requests — please try again shortly." }, 429);

      // Re-validate the slot server-side against live availability + bookings.
      const busy = await loadBusy(admin, host.user_id, startMs - 86_400_000, startMs + 86_400_000);
      const valid = computeSlots(host, busy, startMs - 60000, startMs + 60000, now).some((s) => s === startMs);
      if (!valid) return json({ error: "That time is no longer available. Please pick another." }, 409);

      // Resolve the meeting method from the owner's offered options. One option →
      // fixed; several → the invitee's validated choice. Phone uses their number.
      const opts = host.locationOptions.length ? host.locationOptions : [{ type: host.locationType, value: host.locationValue }];
      const chosenType = String(body?.location ?? "").trim();
      const picked = opts.length === 1 ? opts[0] : (opts.find((o) => o.type === chosenType) ?? opts[0]);
      const locationType = picked.type;
      const locationValue = picked.type === "phone" ? (picked.value ?? phone ?? null) : (picked.value ?? null);

      const endMs = startMs + host.durationMin * 60000;
      const { data, error } = await admin.from("internal_bookings").insert({
        tenant_id: host.tenant_id,
        host_user_id: host.user_id,
        calendar_id: host.calendarId,
        guest_name: name,
        guest_email: email,
        guest_phone: phone,
        title: `Meeting with ${name}`,
        notes,
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(endMs).toISOString(),
        timezone: host.timezone,
        status: "scheduled",
        source: "booking_page",
        location_type: locationType,
        location_value: locationValue,
      }).select("id, start_at, end_at, title").single();
      if (error) {
        // Unique/exclusion violation = the slot was just taken in a race.
        if ((error as { code?: string }).code === "23505")
          return json({ error: "That time was just booked. Please pick another." }, 409);
        return json({ error: error.message }, 500);
      }

      // Confirmation emails (guest + host) with an .ics invite — non-blocking:
      // a mail failure must never fail a booking that's already committed.
      try {
        const brand = await loadBranding(admin, host);
        const whenLabel = new Intl.DateTimeFormat("en-US", {
          timeZone: host.timezone, weekday: "long", month: "long", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        }).format(new Date(startMs));
        const loc = locationLabel(locationType, locationValue);
        const title = host.title || "Your session";
        const ics = buildIcs({
          uid: `${(data as { id: string }).id}@paigeagent.ai`, startMs, endMs, title,
          desc: host.description || "", location: loc, organizer: brand.name, attendee: email, attendeeName: name,
        });
        const guestOk = host.confirmGuest
          ? await sendEmail(email, `Confirmed: ${title} · ${whenLabel}`,
              guestEmailHtml(brand.name, brand.accent, title, whenLabel, loc, brand.name), ics)
          : false;

        let hostOk = false;
        let hostEmail: string | undefined;
        if (host.confirmHost) {
          const { data: hostUser } = await admin.auth.admin.getUserById(host.user_id);
          hostEmail = (hostUser as { user?: { email?: string } } | null)?.user?.email;
          if (hostEmail) {
            hostOk = await sendEmail(hostEmail, `New booking: ${name} · ${whenLabel}`,
              hostEmailHtml(brand.accent, title, whenLabel, name, email, phone, loc, notes), ics);
          }
        }
        await admin.from("email_send_log").insert([
          { template_name: "booking_confirmation", recipient_email: email, status: guestOk ? "sent" : "skipped", sender_account: "platform", metadata: { via: "public-booking", slug } },
          ...(hostEmail ? [{ template_name: "booking_host_notify", recipient_email: hostEmail, status: hostOk ? "sent" : "skipped", sender_account: "platform", metadata: { via: "public-booking", slug } }] : []),
        ]).then(() => {}, () => {});
      } catch (_e) { /* email is best-effort */ }

      return json({ ok: true, booking: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
