import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock } from "lucide-react";

type Booking = {
  id: string;
  cal_event_id: string;
  event_type: string;
  scheduled_at: string;
  duration_min: number | null;
  status: string;
  attendee_email: string | null;
  attendee_name: string | null;
  title: string | null;
  contact_id: string | null;
};

const EVENT_TYPES = ["all", "vip_intro", "dfy_discovery", "coffee_hour", "workshop", "other"];

export default function BookingsAdmin() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [eventType, setEventType] = useState("all");
  const [view, setView] = useState<"upcoming" | "past">("upcoming");

  const load = async () => {
    const now = new Date().toISOString();
    let q = supabase.from("paige_bookings").select("*").limit(200);
    if (view === "upcoming") q = q.gte("scheduled_at", now).order("scheduled_at", { ascending: true });
    else q = q.lt("scheduled_at", now).order("scheduled_at", { ascending: false });
    if (eventType !== "all") q = q.eq("event_type", eventType as any);
    const { data } = await q;
    setRows((data ?? []) as Booking[]);
  };

  useEffect(() => { void load(); }, [view, eventType]);

  const cancel = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("cal-cancel-booking", { body: { cal_event_id: id } });
    if (error || (data as any)?.error) toast.error((data as any)?.error ?? error?.message ?? "Failed");
    else { toast.success("Canceled"); void load(); }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const r of rows) {
      const k = new Date(r.scheduled_at).toLocaleDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [rows]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Cal.com bookings</CardTitle>
              <CardDescription>Sourced from the Cal.com webhook. Linked to contacts by email when possible.</CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border p-1 text-sm">
              <button className={`px-3 py-1 rounded ${view === "upcoming" ? "bg-muted" : ""}`} onClick={() => setView("upcoming")}>Upcoming</button>
              <button className={`px-3 py-1 rounded ${view === "past" ? "bg-muted" : ""}`} onClick={() => setView("past")}>Past</button>
            </div>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {grouped.length === 0 && <p className="text-sm text-muted-foreground">No bookings.</p>}
            {grouped.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{date}</div>
                {items.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div className="space-y-1 min-w-0">
                      <div className="font-medium truncate">{b.title ?? b.event_type}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {b.duration_min ? ` · ${b.duration_min} min` : ""} · {b.attendee_name ?? b.attendee_email ?? "—"}
                        {!b.contact_id && b.attendee_email && <span className="ml-2 text-amber-600">unmatched</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>{b.status}</Badge>
                      {b.status === "confirmed" && view === "upcoming" && (
                        <Button size="sm" variant="outline" onClick={() => cancel(b.cal_event_id)}>Cancel</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
