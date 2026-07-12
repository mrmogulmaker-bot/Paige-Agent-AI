/**
 * Public self-serve page for a guest to reschedule or cancel their booking.
 * Reached from a signed link in the confirmation / reminder emails
 * (/booking/manage?token=…). No login — the token resolves to one booking via
 * the booking-manage edge function. Reschedule availability is fetched from the
 * same public-booking function the booking page uses, sized to the booked
 * service so per-type-duration calendars return correctly-sized openings.
 *
 * The page renders under the tenant's brand accent and is theme-aware (light +
 * dark, driven by the visitor's system preference) so it reads as one
 * continuous system with the booking page. Reschedule is a two-step
 * pick → confirm flow, and cancelling goes through a crafted confirmation
 * dialog — never an instant commit and never a native window.confirm.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Calendar as CalIcon, Check, X, ArrowLeft, Clock, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** The booked service. Returned by booking-manage action='manage'; absent on
 *  calendars with no service menu, so every read is guarded. */
interface AppointmentType { id?: string; name?: string; duration_min?: number }

interface Booking {
  id: string; title: string; start_at: string; status: string;
  guest_name: string | null; timezone: string; slug: string | null;
  accent: string; durationMin: number; canModify: boolean;
  with?: string; // Collective only: every attending host's name.
  appointmentType?: AppointmentType | null; // Drives per-type slot duration.
}

type Mode = "view" | "reschedule" | "confirm" | "cancelled" | "rescheduled";

function fmtWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}
function dayLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));
}
function timeLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function durationLabel(min: number): string {
  if (!min) return "";
  return min >= 60 ? `${min % 60 === 0 ? min / 60 : (min / 60).toFixed(1)} hr` : `${min} min`;
}
/** Readable text color over the tenant's brand accent, falling back to design
 *  tokens (deep-indigo ink for light accents, near-white for dark ones) so
 *  nothing hardcodes a hex when the accent can't be parsed. */
function textOn(hex: string): string {
  const h = (hex || "").replace("#", "");
  if (h.length < 6) return "hsl(var(--accent-foreground))";
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "hsl(var(--accent-foreground))" : "hsl(var(--primary-foreground))";
}

export default function ManageBooking() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reduce = useReducedMotion();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [pendingSlot, setPendingSlot] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Public page: honor the visitor's system light/dark preference by scoping the
  // token theme onto <html> (so portaled dialogs match too), and cleanly restore
  // it on unmount. Only toggles the class we added — never clobbers an existing one.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const root = document.documentElement;
    let added = false;
    const apply = () => {
      if (mq.matches && !root.classList.contains("dark")) { root.classList.add("dark"); added = true; }
      else if (!mq.matches && added) { root.classList.remove("dark"); added = false; }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => { mq.removeEventListener("change", apply); if (added) root.classList.remove("dark"); };
  }, []);

  const load = useCallback(async () => {
    if (!token) { setError("This link is missing its token."); setLoading(false); return; }
    setLoading(true); setError(null);
    const { data, error } = await supabase.functions.invoke("booking-manage", { body: { action: "manage", token } });
    if (error || (data as { error?: string })?.error) {
      setError((data as { error?: string })?.error || "This link is invalid or has expired.");
    } else {
      setBooking((data as { booking: Booking }).booking);
    }
    setLoading(false);
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const loadSlots = useCallback(async () => {
    if (!booking?.slug) return;
    setSlotsLoading(true);
    const body: Record<string, unknown> = { action: "availability", slug: booking.slug };
    // Size the openings to the booked service so per-type-duration calendars
    // offer the same slot length the guest originally booked.
    if (booking.appointmentType?.id) body.appointmentTypeId = booking.appointmentType.id;
    const { data } = await supabase.functions.invoke("public-booking", { body });
    // No arbitrary cap: the availability function already bounds results at the
    // calendar's booking horizon; we group by day and scroll, so every open
    // time is reachable instead of silently truncated at 60.
    setSlots((data as { slots?: string[] })?.slots ?? []);
    setSlotsLoading(false);
  }, [booking?.slug, booking?.appointmentType?.id]);

  const startReschedule = () => { setPendingSlot(null); setError(null); setMode("reschedule"); void loadSlots(); };
  const pickSlot = (start: string) => { setPendingSlot(start); setError(null); setMode("confirm"); };

  const confirmReschedule = async () => {
    if (!pendingSlot) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("booking-manage", { body: { action: "reschedule", token, start: pendingSlot } });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      setError((data as { error?: string })?.error || "That time was just taken. Please pick another.");
      setMode("reschedule");
      void loadSlots();
      return;
    }
    setBooking((b) => b ? { ...b, start_at: (data as { start_at: string }).start_at } : b);
    setError(null); setPendingSlot(null); setMode("rescheduled");
  };

  const doCancel = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("booking-manage", { body: { action: "cancel", token } });
    setBusy(false);
    if (error || (data as { error?: string })?.error) {
      setError((data as { error?: string })?.error || "Couldn't cancel. Please try again.");
      return;
    }
    setError(null); setCancelOpen(false); setMode("cancelled");
  };

  const slotsByDay = useMemo(() => {
    if (!booking) return [] as { day: string; times: string[] }[];
    const tz = booking.timezone;
    const groups: { day: string; times: string[] }[] = [];
    for (const s of slots) {
      const d = dayLabel(s, tz);
      const g = groups.find((x) => x.day === d);
      if (g) g.times.push(s); else groups.push({ day: d, times: [s] });
    }
    return groups;
  }, [slots, booking]);

  const accent = booking?.accent || "hsl(var(--accent))";
  const accentText = textOn(booking?.accent ?? "");
  const serviceMin = booking?.appointmentType?.duration_min ?? booking?.durationMin ?? 0;
  const serviceLabel = [booking?.appointmentType?.name, durationLabel(serviceMin)].filter(Boolean).join(" · ");

  return (
    <div className="min-h-dvh grid place-items-center bg-background px-4 py-8">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        {/* Brand accent tint — the tenant's color, not a resting platform gold. */}
        <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${accent}, hsl(var(--ring)))` }} />
        <div className="px-6 py-7 sm:px-8">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Manage your booking
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {!loading && error && !booking && (
            <p className="text-sm text-destructive" aria-live="polite">{error}</p>
          )}

          {!loading && booking && (
            <>
              <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">{booking.title}</h1>

              {serviceLabel && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" style={{ color: accent }} /> {serviceLabel}
                </span>
              )}

              <p className="mt-3 text-sm text-muted-foreground">{fmtWhen(booking.start_at, booking.timezone)}</p>
              {booking.with && <p className="mt-1 text-sm text-muted-foreground">With {booking.with}</p>}

              <div className="mt-5">
                {mode === "cancelled" && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
                    <X className="h-4 w-4 shrink-0" /> This booking is cancelled.
                  </div>
                )}

                {mode === "rescheduled" && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3.5 py-3 text-sm text-success">
                    <Check className="h-4 w-4 shrink-0" /> Rescheduled — your new time is set. See you then.
                  </div>
                )}

                {mode === "view" && booking.status === "cancelled" && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
                    <X className="h-4 w-4 shrink-0" /> This booking was cancelled.
                  </div>
                )}

                {mode === "view" && booking.canModify && (
                  <div className="flex gap-2.5">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={startReschedule}
                      disabled={busy || !booking.slug}
                    >
                      <CalIcon className="h-4 w-4" /> Reschedule
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setError(null); setCancelOpen(true); }}
                      disabled={busy}
                    >
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                )}

                {mode === "reschedule" && (
                  <div>
                    <button
                      onClick={() => setMode("view")}
                      className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <ArrowLeft className="h-4 w-4" /> Back
                    </button>
                    <div className="mb-3 text-sm font-semibold text-foreground">Pick a new time</div>

                    {slotsLoading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Finding open times…
                      </div>
                    )}
                    {!slotsLoading && slotsByDay.length === 0 && (
                      <p className="text-sm text-muted-foreground">No open times right now. Please check back soon.</p>
                    )}

                    <div className="grid max-h-80 gap-4 overflow-y-auto pr-1">
                      {slotsByDay.map((g) => (
                        <div key={g.day}>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.day}</div>
                          <div className="flex flex-wrap gap-2">
                            {g.times.map((t) => (
                              <button
                                key={t}
                                onClick={() => pickSlot(t)}
                                disabled={busy}
                                className="rounded-full px-3.5 py-2 text-sm font-semibold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                                style={{ border: `1px solid ${accent}`, background: "transparent" }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = accentText; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "hsl(var(--foreground))"; }}
                              >
                                {timeLabel(t, booking.timezone)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mode === "confirm" && pendingSlot && (
                  <div>
                    <button
                      onClick={() => { setMode("reschedule"); setError(null); }}
                      className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <ArrowLeft className="h-4 w-4" /> Pick a different time
                    </button>
                    <div className="mb-3 text-sm font-semibold text-foreground">Confirm your new time</div>

                    <div className="rounded-xl border border-border bg-muted/50 p-4">
                      <div className="text-xs text-muted-foreground line-through">{fmtWhen(booking.start_at, booking.timezone)}</div>
                      <div className="mt-1.5 flex items-start gap-2 text-sm font-semibold text-foreground">
                        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                        {fmtWhen(pendingSlot, booking.timezone)}
                      </div>
                    </div>

                    <button
                      onClick={confirmReschedule}
                      disabled={busy}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                      style={{ background: accent, color: accentText }}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm reschedule
                    </button>
                  </div>
                )}

                {error && booking && !cancelOpen && (
                  <p className="mt-3 text-sm text-destructive" aria-live="polite">{error}</p>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Crafted cancel confirmation — replaces the native window.confirm. */}
      <AlertDialog open={cancelOpen} onOpenChange={(o) => { if (!busy) setCancelOpen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {booking
                ? `This releases your ${fmtWhen(booking.start_at, booking.timezone)} time and can't be undone.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && cancelOpen && <p className="text-sm text-destructive" aria-live="polite">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void doCancel(); }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Cancel booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
