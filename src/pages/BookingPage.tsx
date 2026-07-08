/**
 * Public booking page — /book/:slug
 *
 * A GHL-style two-column booking widget: a branded panel on the left (logo,
 * optional company name, category, title, duration, selected date, description)
 * and the scheduler on the right (month grid → time slots → details form).
 * Every visual choice is owner-controlled per calendar: logo, company-name
 * visibility, accent color, light/dark theme, and the meeting location (phone /
 * Google Meet / Zoom / in-person / custom / ask-the-invitee). No login, no
 * external provider required — booking creates an internal_bookings appointment.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  format, startOfMonth, addMonths, startOfWeek, addDays, isSameMonth, isSameDay, parseISO,
} from "date-fns";
import {
  Clock, Loader2, Check, ArrowLeft, ChevronLeft, ChevronRight, CalendarDays,
  Video, Phone, MapPin, Link2, HelpCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaigeMark } from "@/components/brand/PaigeMark";

type Phase = "loading" | "pick" | "form" | "done" | "error";
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type LocationOption = { type: string; value: string | null };
type Brand = {
  name: string; logoUrl: string | null; accent: string; title: string | null; description: string | null;
  theme: "light" | "dark"; subtitle: string | null; showCompanyName: boolean;
  locationType: string; locationValue: string | null; locationOptions: LocationOption[]; durationMin?: number;
};
const DEFAULT_BRAND: Brand = {
  name: "Paige Agent AI", logoUrl: null, accent: "#EBB94C", title: null, description: null,
  theme: "light", subtitle: null, showCompanyName: true, locationType: "google_meet", locationValue: null,
  locationOptions: [{ type: "google_meet", value: null }],
};

const LOCATION_META: Record<string, { label: string; icon: typeof Video }> = {
  google_meet: { label: "Google Meet", icon: Video },
  zoom: { label: "Zoom", icon: Video },
  phone: { label: "Phone call", icon: Phone },
  in_person: { label: "In person", icon: MapPin },
  custom: { label: "Details", icon: Link2 },
  ask_invitee: { label: "Choose how to meet", icon: HelpCircle },
};

/** Readable text color over an arbitrary brand accent. */
function textOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "#1B1230";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1B1230" : "#FFFFFF";
}

function palette(theme: "light" | "dark") {
  return theme === "dark"
    ? { page: "#0B0912", card: "#14101F", border: "rgba(255,255,255,0.10)", panel: "rgba(255,255,255,0.03)",
        text: "#EDE8F6", sub: "#A79EC2", faint: "#5B5570", hover: "rgba(255,255,255,0.06)", field: "rgba(255,255,255,0.05)" }
    : { page: "#F4F5F7", card: "#FFFFFF", border: "#E7E8EC", panel: "#FBFBFC",
        text: "#101828", sub: "#667085", faint: "#B4B8C2", hover: "#F5F6F8", field: "#FFFFFF" };
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [durationMin, setDurationMin] = useState(30);
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [inviteeLocation, setInviteeLocation] = useState("google_meet");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("public-booking", { body: { action: "availability", slug } });
      const res = data as (Partial<Brand> & { error?: string; slots?: string[]; durationMin?: number; branding?: Partial<Brand> }) | null;
      if (error || res?.error) { setErrorMsg(res?.error ?? "This booking page isn't available."); setPhase("error"); return; }
      const b = { ...DEFAULT_BRAND, ...(res?.branding ?? {}) } as Brand;
      setSlots(res?.slots ?? []);
      setDurationMin(res?.durationMin ?? b.durationMin ?? 30);
      setBrand(b);
      setPhase("pick");
    })();
  }, [slug]);

  const c = palette(brand.theme);
  const accentText = textOn(brand.accent);
  // Owner-offered meeting methods. One → fixed; several → the invitee chooses.
  const meetOptions = brand.locationOptions?.length ? brand.locationOptions : [{ type: brand.locationType, value: brand.locationValue }];
  const meetMulti = meetOptions.length > 1;
  const fixedMeet = meetOptions[0];
  const meetLabel = (o: LocationOption) => o.type === "custom" ? (o.value || "Details to follow")
    : o.type === "in_person" ? (o.value || "In person") : (LOCATION_META[o.type]?.label ?? o.type);

  // Slot instants grouped by the visitor's local day; the set of bookable days.
  const byDay = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slots) {
      const key = format(new Date(s), "yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [slots]);
  const days = useMemo(() => Array.from(byDay.keys()).sort(), [byDay]);

  // Land the month view + selected day on the first available day.
  useEffect(() => {
    if (days.length && !selectedDay) {
      setSelectedDay(days[0]);
      setMonthCursor(startOfMonth(parseISO(days[0])));
    }
  }, [days, selectedDay]);

  const monthCells = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthCursor]);

  const book = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("public-booking", {
      body: {
        action: "create", slug, start: selectedSlot,
        guest: { name: form.name, email: form.email, phone: form.phone }, notes: form.notes,
        ...(meetMulti ? { location: inviteeLocation } : {}),
      },
    });
    setSubmitting(false);
    const res = data as { error?: string } | null;
    if (error || res?.error) {
      setErrorMsg(res?.error ?? "Couldn't book that time.");
      if (res?.error?.includes("no longer available")) {
        setSelectedSlot(null); setPhase("pick");
        const { data: fresh } = await supabase.functions.invoke("public-booking", { body: { action: "availability", slug } });
        setSlots((fresh as { slots?: string[] } | null)?.slots ?? []);
      }
      return;
    }
    setPhase("done");
  };

  // ---- Left brand panel (persists across steps) ----
  const brandPanel = (
    <div className="p-6 sm:p-7 flex flex-col" style={{ borderRight: `1px solid ${c.border}` }}>
      <div className="flex items-center gap-2.5 mb-5">
        {brand.logoUrl
          ? <img src={brand.logoUrl} alt={brand.name} className="h-11 w-11 rounded-xl object-cover" style={{ border: `1px solid ${c.border}` }} />
          : <span className="h-11 w-11 rounded-xl grid place-items-center" style={{ background: brand.accent + "1f" }}><PaigeMark className="h-6 w-6" /></span>}
        {brand.showCompanyName && <span className="font-semibold tracking-tight" style={{ color: c.text }}>{brand.name}</span>}
      </div>
      {brand.subtitle && <div className="text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: c.sub }}>{brand.subtitle}</div>}
      <h1 className="text-2xl font-bold leading-tight mb-4" style={{ color: c.text }}>{brand.title || "Book a time"}</h1>
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm" style={{ color: c.sub }}>
          <Clock className="h-4 w-4" style={{ color: brand.accent }} /> {durationMin >= 60 ? `${durationMin / 60} hr` : `${durationMin} min`}
        </div>
        {(() => { const Icon = meetMulti ? HelpCircle : (LOCATION_META[fixedMeet.type]?.icon ?? Link2); return (
          <div className="flex items-center gap-2 text-sm" style={{ color: c.sub }}>
            <Icon className="h-4 w-4" style={{ color: brand.accent }} />
            {meetMulti ? "Choose how to meet" : meetLabel(fixedMeet)}
          </div>
        ); })()}
        {selectedSlot && (
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: c.text }}>
            <CalendarDays className="h-4 w-4" style={{ color: brand.accent }} />
            {format(new Date(selectedSlot), "EEE, MMM d, yyyy · h:mm a")}
          </div>
        )}
      </div>
      {brand.description && (
        <p className="text-sm leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto pr-1" style={{ color: c.sub }}>
          {brand.description}
        </p>
      )}
    </div>
  );

  // ---- Right: date+time picker ----
  const picker = (
    <div className="p-6 sm:p-7">
      <h2 className="text-base font-semibold mb-4" style={{ color: c.text }}>Select Date &amp; Time</h2>
      {days.length === 0 ? (
        <p className="text-sm" style={{ color: c.sub }}>No open times in the next two weeks. Please check back soon.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_170px]">
          {/* Month grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setMonthCursor((m) => addMonths(m, -1))} className="h-8 w-8 grid place-items-center rounded-full" style={{ color: c.sub }} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-semibold" style={{ color: c.text }}>{format(monthCursor, "MMMM yyyy")}</span>
              <button onClick={() => setMonthCursor((m) => addMonths(m, 1))} className="h-8 w-8 grid place-items-center rounded-full" style={{ color: c.sub }} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d) => <div key={d} className="text-center text-[11px] font-medium py-1" style={{ color: c.sub }}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {monthCells.map((cell) => {
                const key = format(cell, "yyyy-MM-dd");
                const inMonth = isSameMonth(cell, monthCursor);
                const available = byDay.has(key);
                const selected = selectedDay === key;
                const today = isSameDay(cell, new Date());
                return (
                  <div key={cell.toISOString()} className="flex justify-center">
                    <button
                      disabled={!available}
                      onClick={() => setSelectedDay(key)}
                      className="relative h-9 w-9 rounded-full text-sm transition-colors grid place-items-center"
                      style={
                        selected ? { background: brand.accent, color: accentText, fontWeight: 700 }
                        : available ? { background: brand.accent + "1f", color: brand.accent, fontWeight: 600 }
                        : { color: inMonth ? c.faint : "transparent", cursor: "default" }
                      }
                    >
                      {inMonth ? cell.getDate() : ""}
                      {today && !selected && available && <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: brand.accent }} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Time slots */}
          <div className="max-h-[360px] overflow-y-auto pr-1 space-y-2">
            {selectedDay && (byDay.get(selectedDay) ?? []).length === 0 && <p className="text-sm" style={{ color: c.sub }}>No times.</p>}
            {(selectedDay ? byDay.get(selectedDay) ?? [] : []).map((t) => (
              <button key={t}
                onClick={() => { setSelectedSlot(t); setErrorMsg(""); setInviteeLocation(meetOptions[0].type); setPhase("form"); }}
                className="w-full rounded-lg py-2.5 text-sm font-semibold transition-colors"
                style={{ border: `1px solid ${brand.accent}`, color: brand.accent, background: "transparent" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = brand.accent; e.currentTarget.style.color = accentText; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = brand.accent; }}>
                {format(new Date(t), "h:mm a")}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 pt-4 text-xs flex items-center gap-1.5" style={{ borderTop: `1px solid ${c.border}`, color: c.sub }}>
        <CalendarDays className="h-3.5 w-3.5" /> Time zone: {browserTz}
      </div>
    </div>
  );

  // ---- Right: details form (location chosen here, after a time is picked) ----
  const detailsForm = (
    <div className="p-6 sm:p-7">
      <button onClick={() => setPhase("pick")} className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: c.sub }}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="text-base font-semibold mb-4" style={{ color: c.text }}>Enter Details</h2>
      <div className="space-y-3">
        <Field label="Name *" c={c}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={fieldStyle(c)} /></Field>
        <Field label="Email *" c={c}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={fieldStyle(c)} /></Field>
        <Field label={meetMulti && inviteeLocation === "phone" ? "Phone *" : "Phone"} c={c}>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={fieldStyle(c)} />
        </Field>

        {/* How to meet — the invitee chooses when the owner offers several methods */}
        {meetMulti ? (
          <div className="space-y-1.5">
            <Label className="text-xs" style={{ color: c.sub }}>How would you like to meet?</Label>
            <div className="grid grid-cols-3 gap-2">
              {meetOptions.map((opt) => {
                const Icon = LOCATION_META[opt.type]?.icon ?? Link2; const on = inviteeLocation === opt.type;
                return (
                  <button key={opt.type} type="button" onClick={() => setInviteeLocation(opt.type)}
                    className="rounded-lg py-2 text-xs font-medium flex flex-col items-center gap-1 transition-colors"
                    style={on ? { border: `1.5px solid ${brand.accent}`, color: brand.accent, background: brand.accent + "14" } : { border: `1px solid ${c.border}`, color: c.sub }}>
                    <Icon className="h-4 w-4" /> {meetLabel(opt)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ background: c.panel, border: `1px solid ${c.border}`, color: c.text }}>
            {(() => { const Icon = LOCATION_META[fixedMeet.type]?.icon ?? Link2; return <Icon className="h-4 w-4" style={{ color: brand.accent }} />; })()}
            <span>
              {fixedMeet.type === "custom" ? (fixedMeet.value || "Details will be shared after booking")
                : fixedMeet.type === "in_person" ? (fixedMeet.value || "In person")
                : fixedMeet.type === "phone" ? "We'll call the number you provide"
                : `${LOCATION_META[fixedMeet.type]?.label ?? "Meeting"} — link sent after you book`}
            </span>
          </div>
        )}

        <Field label="Anything to share?" c={c}><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={fieldStyle(c)} /></Field>
      </div>
      {errorMsg && <p className="text-sm mt-3" style={{ color: "#ef4444" }} aria-live="polite">{errorMsg}</p>}
      <button onClick={book}
        disabled={submitting || !form.name.trim() || !form.email.trim() || (meetMulti && inviteeLocation === "phone" && !form.phone.trim())}
        className="w-full mt-5 rounded-lg py-2.5 font-semibold transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
        style={{ background: brand.accent, color: accentText }}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirm booking
      </button>
    </div>
  );

  // ---- Right: confirmation ----
  const confirmation = (
    <div className="p-8 text-center flex flex-col items-center justify-center min-h-[320px]">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: brand.accent + "22", color: brand.accent }}>
        <Check className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold" style={{ color: c.text }}>You're booked</h2>
      <p className="mt-2" style={{ color: c.text }}>{selectedSlot && format(new Date(selectedSlot), "EEEE, MMMM d 'at' h:mm a")}</p>
      <p className="text-sm mt-1" style={{ color: c.sub }}>A confirmation is saved under {form.email}.</p>
    </div>
  );

  const rightContent =
    phase === "loading" ? <div className="p-8 flex items-center gap-2" style={{ color: c.sub }}><Loader2 className="h-4 w-4 animate-spin" /> Loading availability…</div>
    : phase === "error" ? (
      <div className="p-8 text-center min-h-[280px] flex flex-col items-center justify-center">
        <CalendarDays className="h-8 w-8 mb-3" style={{ color: c.faint }} />
        <h2 className="text-lg font-semibold" style={{ color: c.text }}>Booking unavailable</h2>
        <p className="text-sm mt-1" style={{ color: c.sub }}>{errorMsg}</p>
      </div>
    )
    : phase === "done" ? confirmation
    : phase === "form" ? detailsForm
    : picker;

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10" style={{ background: c.page }}>
      <div className="w-full max-w-4xl rounded-2xl overflow-hidden grid md:grid-cols-[minmax(0,320px)_1fr]"
        style={{ background: c.card, border: `1px solid ${c.border}`, boxShadow: brand.theme === "dark" ? "0 24px 60px rgba(0,0,0,0.5)" : "0 12px 40px rgba(16,24,40,0.10)" }}>
        {brandPanel}
        <div>{rightContent}</div>
      </div>
    </div>
  );
}

function fieldStyle(c: ReturnType<typeof palette>): React.CSSProperties {
  return { background: c.field, borderColor: c.border, color: c.text };
}
function Field({ label, c, children }: { label: string; c: ReturnType<typeof palette>; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs" style={{ color: c.sub }}>{label}</Label>
      {children}
    </div>
  );
}
