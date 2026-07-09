/**
 * Public self-serve page for a guest to reschedule or cancel their booking.
 * Reached from a signed link in the confirmation / reminder emails
 * (/booking/manage?token=…). No login — the token resolves to one booking via
 * the booking-manage edge function. Reschedule availability is fetched from the
 * same public-booking function the booking page uses.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Calendar as CalIcon, Check, X, ArrowLeft } from "lucide-react";

interface Booking {
  id: string; title: string; start_at: string; status: string;
  guest_name: string | null; timezone: string; slug: string | null;
  accent: string; durationMin: number; canModify: boolean;
}

const GOLD = "#EBB94C";

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

export default function ManageBooking() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "reschedule" | "cancelled" | "rescheduled">("view");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

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
    const { data } = await supabase.functions.invoke("public-booking", { body: { action: "availability", slug: booking.slug } });
    setSlots(((data as { slots?: string[] })?.slots ?? []).slice(0, 60));
    setSlotsLoading(false);
  }, [booking?.slug]);

  const startReschedule = () => { setMode("reschedule"); void loadSlots(); };

  const doReschedule = async (start: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("booking-manage", { body: { action: "reschedule", token, start } });
    setBusy(false);
    if (error || (data as { error?: string })?.error) { setError((data as { error?: string })?.error || "Couldn't reschedule. Try another time."); return; }
    setBooking((b) => b ? { ...b, start_at: (data as { start_at: string }).start_at } : b);
    setMode("rescheduled"); setError(null);
  };

  const doCancel = async () => {
    if (!window.confirm("Cancel this booking? This can't be undone.")) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("booking-manage", { body: { action: "cancel", token } });
    setBusy(false);
    if (error || (data as { error?: string })?.error) { setError((data as { error?: string })?.error || "Couldn't cancel."); return; }
    setMode("cancelled");
  };

  const slotsByDay = useMemo(() => {
    if (!booking) return [];
    const tz = booking.timezone;
    const groups: { day: string; times: string[] }[] = [];
    for (const s of slots) {
      const d = dayLabel(s, tz);
      const g = groups.find((x) => x.day === d);
      if (g) g.times.push(s); else groups.push({ day: d, times: [s] });
    }
    return groups;
  }, [slots, booking]);

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f7", display: "grid", placeItems: "center", padding: "28px 16px", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 520, background: "#fff", border: "1px solid #e7e8ec", borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" }}>
        <div style={{ height: 5, background: `linear-gradient(90deg, ${booking?.accent || GOLD}, #7A67E8)` }} />
        <div style={{ padding: "28px 32px 32px" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#98a0ae", fontWeight: 700, marginBottom: 14 }}>Manage your booking</div>

          {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#667085", fontSize: 14 }}><Loader2 className="animate-spin" size={16} /> Loading…</div>}

          {!loading && error && !booking && (
            <div style={{ color: "#b42318", fontSize: 14 }}>{error}</div>
          )}

          {!loading && booking && (
            <>
              <h1 style={{ color: "#101828", fontSize: 22, margin: "0 0 6px" }}>{booking.title}</h1>
              <p style={{ color: "#475467", fontSize: 15, margin: "0 0 20px" }}>{fmtWhen(booking.start_at, booking.timezone)}</p>

              {mode === "cancelled" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef3f2", color: "#b42318", padding: "12px 14px", borderRadius: 10, fontSize: 14 }}>
                  <X size={16} /> This booking is cancelled.
                </div>
              )}
              {mode === "rescheduled" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#ecfdf3", color: "#067647", padding: "12px 14px", borderRadius: 10, fontSize: 14 }}>
                  <Check size={16} /> Rescheduled — a fresh time is set. See you then.
                </div>
              )}

              {mode === "view" && booking.status === "cancelled" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef3f2", color: "#b42318", padding: "12px 14px", borderRadius: 10, fontSize: 14 }}>
                  <X size={16} /> This booking was cancelled.
                </div>
              )}

              {mode === "view" && booking.canModify && (
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  <button onClick={startReschedule} disabled={busy || !booking.slug}
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#fff", border: "1px solid #d0d5dd", color: "#344054", fontWeight: 600, padding: "12px", borderRadius: 10, cursor: "pointer", fontSize: 14 }}>
                    <CalIcon size={16} /> Reschedule
                  </button>
                  <button onClick={doCancel} disabled={busy}
                    style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#fff", border: "1px solid #fda29b", color: "#b42318", fontWeight: 600, padding: "12px", borderRadius: 10, cursor: "pointer", fontSize: 14 }}>
                    {busy ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />} Cancel
                  </button>
                </div>
              )}

              {mode === "reschedule" && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={() => setMode("view")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#667085", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
                    <ArrowLeft size={14} /> Back
                  </button>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#101828", marginBottom: 10 }}>Pick a new time</div>
                  {slotsLoading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#667085", fontSize: 14 }}><Loader2 className="animate-spin" size={16} /> Finding open times…</div>}
                  {!slotsLoading && slotsByDay.length === 0 && <div style={{ color: "#667085", fontSize: 14 }}>No open times right now.</div>}
                  <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 14 }}>
                    {slotsByDay.map((g) => (
                      <div key={g.day}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#98a0ae", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{g.day}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {g.times.map((t) => (
                            <button key={t} onClick={() => doReschedule(t)} disabled={busy}
                              style={{ background: "#fff", border: `1px solid ${booking.accent || GOLD}`, color: "#241645", fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13 }}>
                              {timeLabel(t, booking.timezone)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && booking && <div style={{ color: "#b42318", fontSize: 13, marginTop: 12 }}>{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
