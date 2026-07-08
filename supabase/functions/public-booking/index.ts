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
  locationType: string; // in_person | phone | google_meet | zoom | custom | ask_invitee
  locationValue: string | null; // address / phone / link / instructions
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
    .select("id, tenant_id, title, description, logo_url, accent, duration_min, buffer_before_min, buffer_after_min, min_notice_min, timezone, availability_json, enabled, theme, subtitle, show_company_name, location_type, location_value")
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

      // Resolve the meeting location. When the calendar asks the invitee, take
      // their validated choice (phone uses their number); otherwise the owner's
      // fixed type/value travels onto the booking.
      const INVITEE_CHOICES = ["phone", "google_meet", "zoom"];
      let locationType = host.locationType;
      let locationValue = host.locationValue;
      if (host.locationType === "ask_invitee") {
        const chosen = String(body?.location ?? "").trim();
        locationType = INVITEE_CHOICES.includes(chosen) ? chosen : "phone";
        locationValue = locationType === "phone" ? (phone ?? null) : null;
      } else if (host.locationType === "phone" && !locationValue) {
        locationValue = phone ?? null; // host wants a call but stored no number → use theirs
      }

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
      return json({ ok: true, booking: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
