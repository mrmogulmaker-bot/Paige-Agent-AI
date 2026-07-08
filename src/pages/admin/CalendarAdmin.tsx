/**
 * Calendar — the workspace's calendars + a live view of what's booked.
 *
 * Two things live here now:
 *  1. Calendars manager (CalendarsPanel) — create/customize many calendars, each
 *     with its own schedule, branding, color, and PUBLIC /book/:slug web link.
 *  2. Upcoming bookings — an internal, real-time view of what's on the schedule.
 *
 * Personal calendar CONNECTORS (Google/Apple sync) moved to Settings › Connectors
 * so account connections live in one organized place. Per-calendar availability
 * now lives inside each calendar's builder, not as a separate section here.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Loader2 } from "lucide-react";
import CalendarsPanel from "@/components/admin/calendar/CalendarsPanel";

type Booking = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  guest_name: string | null;
  guest_email: string | null;
};

export default function CalendarAdmin() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase
      .from("internal_bookings")
      .select("id, title, start_at, end_at, status, source, guest_name, guest_email")
      .eq("host_user_id", uid)
      .gte("start_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("start_at", { ascending: true })
      .limit(50);
    setBookings((data as Booking[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = new Date(b.start_at).toLocaleDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return Array.from(m.entries());
  }, [bookings]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Calendars</h1>
      </div>

      {/* Multi-calendar manager (first-class `calendars` entity) — every tier. */}
      <CalendarsPanel />

      {/* Internal live schedule — what's actually booked. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming bookings</CardTitle>
          <CardDescription>What's on your schedule right now, across every calendar.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading schedule…
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.length === 0 && <p className="text-sm text-muted-foreground">No bookings yet.</p>}
              {grouped.map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{date}</div>
                  {items.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {" – "}
                          {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {b.guest_name ? ` · ${b.guest_name}` : b.guest_email ? ` · ${b.guest_email}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">{b.source.replace(/_/g, " ")}</Badge>
                        <Badge variant={b.status === "scheduled" ? "default" : "secondary"} className="capitalize">{b.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
