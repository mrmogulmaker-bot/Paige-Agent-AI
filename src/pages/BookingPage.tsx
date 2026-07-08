/**
 * Public booking page — /book/:slug
 * The native scheduling experience: a visitor sees a host's real open slots
 * (computed by the public-booking engine from availability + existing
 * appointments), picks a time, and books — creating an internal_bookings
 * appointment. No login, no external provider required.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { CalendarDays, Clock, Loader2, Check, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaigeMark } from "@/components/brand/PaigeMark";

type Phase = "loading" | "pick" | "form" | "done" | "error";
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [durationMin, setDurationMin] = useState(30);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.functions.invoke("public-booking", {
        body: { action: "availability", slug },
      });
      if (error || (data as any)?.error) {
        setErrorMsg((data as any)?.error ?? "This booking page isn't available.");
        setPhase("error");
        return;
      }
      setSlots((data as any).slots ?? []);
      setDurationMin((data as any).durationMin ?? 30);
      setPhase("pick");
    })();
  }, [slug]);

  // Group slot instants by the visitor's local calendar day.
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

  useEffect(() => {
    if (!selectedDay && days.length) setSelectedDay(days[0]);
  }, [days, selectedDay]);

  const book = async () => {
    if (!selectedSlot) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("public-booking", {
      body: { action: "create", slug, start: selectedSlot, guest: { name: form.name, email: form.email, phone: form.phone }, notes: form.notes },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      setErrorMsg((data as any)?.error ?? "Couldn't book that time.");
      // Re-fetch availability if the slot was taken.
      if ((data as any)?.error?.includes("no longer available")) {
        setPhase("loading");
        setSelectedSlot(null);
        const { data: fresh } = await supabase.functions.invoke("public-booking", { body: { action: "availability", slug } });
        setSlots((fresh as any)?.slots ?? []);
        setPhase("pick");
      }
      return;
    }
    setPhase("done");
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-gradient-to-b from-[#0B0912] to-[#140F22] text-[#EDE8F6] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <PaigeMark className="h-8 w-8" />
          <span className="font-semibold tracking-tight">Paige Agent</span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 shadow-2xl">{children}</div>
        <p className="text-center text-xs text-[#766E90] mt-4">Times shown in {browserTz}.</p>
      </div>
    </div>
  );

  if (phase === "loading") return shell(<div className="flex items-center gap-2 text-[#A79EC2]"><Loader2 className="h-4 w-4 animate-spin" /> Loading availability…</div>);

  if (phase === "error") return shell(
    <div className="text-center py-6">
      <CalendarDays className="h-8 w-8 mx-auto mb-3 text-[#766E90]" />
      <h1 className="text-lg font-semibold">Booking unavailable</h1>
      <p className="text-sm text-[#A79EC2] mt-1">{errorMsg}</p>
    </div>,
  );

  if (phase === "done") return shell(
    <div className="text-center py-6">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-bold">You're booked</h1>
      <p className="text-[#EDE8F6] mt-2">{selectedSlot && format(new Date(selectedSlot), "EEEE, MMMM d 'at' h:mm a")}</p>
      <p className="text-sm text-[#A79EC2] mt-1">Your time is reserved — saved under {form.email}.</p>
    </div>,
  );

  const times = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return shell(
    <div>
      <div className="flex items-center gap-2 mb-1 text-[#F0C86A]">
        <Clock className="h-4 w-4" />
        <span className="text-xs font-mono uppercase tracking-[0.16em]">{durationMin} min meeting</span>
      </div>
      <h1 className="text-xl font-bold mb-5">Pick a time</h1>

      {days.length === 0 ? (
        <p className="text-sm text-[#A79EC2]">No open times in the next two weeks. Please check back soon.</p>
      ) : phase === "form" ? (
        <div>
          <button onClick={() => setPhase("pick")} className="inline-flex items-center gap-1.5 text-sm text-[#A79EC2] hover:text-white mb-4">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <p className="mb-4 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
            {selectedSlot && format(new Date(selectedSlot), "EEEE, MMMM d 'at' h:mm a")}
          </p>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bk-name" className="text-xs text-[#A79EC2]">Name *</Label>
              <Input id="bk-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-white/5 border-white/10 text-[#EDE8F6]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-email" className="text-xs text-[#A79EC2]">Email *</Label>
              <Input id="bk-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="bg-white/5 border-white/10 text-[#EDE8F6]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-phone" className="text-xs text-[#A79EC2]">Phone</Label>
              <Input id="bk-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="bg-white/5 border-white/10 text-[#EDE8F6]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-notes" className="text-xs text-[#A79EC2]">Anything to share?</Label>
              <Textarea id="bk-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="bg-white/5 border-white/10 text-[#EDE8F6]" rows={2} />
            </div>
          </div>
          {errorMsg && <p className="text-sm text-red-400 mt-3" aria-live="polite">{errorMsg}</p>}
          <Button onClick={book} disabled={submitting || !form.name.trim() || !form.email.trim()}
            className="w-full mt-5 bg-gradient-to-r from-[#EBB94C] to-[#F2CE77] text-[#1B1230] font-semibold hover:opacity-95">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm booking
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          {/* Day rail */}
          <div className="flex sm:flex-col gap-2 overflow-x-auto sm:overflow-visible">
            {days.map((d) => {
              const dt = new Date(d + "T00:00:00");
              const active = d === selectedDay;
              return (
                <button key={d} onClick={() => setSelectedDay(d)}
                  className={`flex-shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active ? "border-[#EBB94C]/60 bg-[#EBB94C]/10 text-[#F2CE77]" : "border-white/10 text-[#A79EC2] hover:border-white/25"}`}>
                  <div className="font-medium">{format(dt, "EEE, MMM d")}</div>
                  <div className="text-[11px] opacity-70">{(byDay.get(d) ?? []).length} open</div>
                </button>
              );
            })}
          </div>
          {/* Times */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 content-start max-h-[360px] overflow-y-auto pr-1">
            {times.map((t) => (
              <button key={t} onClick={() => { setSelectedSlot(t); setErrorMsg(""); setPhase("form"); }}
                className="rounded-lg border border-white/12 py-2 text-sm font-medium text-[#EDE8F6] hover:border-[#EBB94C]/60 hover:bg-[#EBB94C]/10 transition-colors">
                {format(new Date(t), "h:mm a")}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
  );
}
