/**
 * Calendar — the independent, GHL-style calendar tab.
 *
 * Three views under one tab (mirrors GoHighLevel):
 *  • Calendar view    — Day/Week/Month grid, color-coded by calendar, "now" line
 *  • Appointment list — a chronological agenda of what's booked
 *  • Calendar settings — the Calendars manager (create/customize calendars)
 *
 * Toolbar: Today · date nav · Day/Week/Month · New appointment. A filter rail
 * toggles calendars on/off (color legend). Bookings are the host's own
 * (internal_bookings, RLS: bookings_host_all); each calendar carries its color.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Loader2, ListChecks, Settings2,
} from "lucide-react";
import CalendarsPanel from "@/components/admin/calendar/CalendarsPanel";
import { CalendarGrid, type GridEvent, type ViewMode } from "@/components/admin/calendar/CalendarGrid";
import { useTenantContext } from "@/hooks/useTenantContext";

interface CalMeta { id: string; title: string | null; color: string | null; accent: string | null; tenant_id: string | null; }
interface BookingRow {
  id: string; title: string; start_at: string; end_at: string; status: string;
  source: string; guest_name: string | null; guest_email: string | null; calendar_id: string | null;
  location_type: string | null; location_value: string | null;
}

const UNASSIGNED = "__unassigned__";
const DEFAULT_COLOR = "#7A67E8";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); return addDays(x, -x.getDay()); }

function rangeFor(view: ViewMode, cursor: Date): [Date, Date] {
  if (view === "day") return [startOfDay(cursor), addDays(startOfDay(cursor), 1)];
  if (view === "week") { const s = startOfWeek(cursor); return [s, addDays(s, 7)]; }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const s = startOfWeek(first);
  return [s, addDays(s, 42)];
}

function headerLabel(view: ViewMode, cursor: Date): string {
  if (view === "day") return cursor.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (view === "month") return cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const s = startOfWeek(cursor); const e = addDays(s, 6);
  const sameMonth = s.getMonth() === e.getMonth();
  return `${s.toLocaleDateString([], { month: "short", day: "numeric" })} – ${e.toLocaleDateString([], { month: sameMonth ? undefined : "short", day: "numeric", year: "numeric" })}`;
}

export default function CalendarAdmin() {
  const { activeTenantId } = useTenantContext();
  const [tab, setTab] = useState("calendar");
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [calendars, setCalendars] = useState<CalMeta[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<BookingRow | null>(null);
  const reqSeq = useRef(0);

  const setBookingStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("internal_bookings").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status } : b));
    setDetail((d) => d && d.id === id ? { ...d, status } : d);
    toast.success(status === "cancelled" ? "Booking cancelled" : status === "no_show" ? "Marked as no-show" : "Updated");
  };

  const colorFor = useCallback((calId: string | null) => {
    const c = calendars.find((x) => x.id === calId);
    return c?.color || c?.accent || DEFAULT_COLOR;
  }, [calendars]);

  const loadCalendars = useCallback(async () => {
    const { data } = await supabase.from("calendars").select("id, title, color, accent, tenant_id");
    setCalendars((data as CalMeta[]) ?? []);
  }, []);

  const loadBookings = useCallback(async () => {
    const seq = ++reqSeq.current; // guard against out-of-order responses
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { if (seq === reqSeq.current) setLoading(false); return; }
    const [from, to] = rangeFor(view, cursor);
    // Overlap-aware: catch events that START before the window but run into it.
    const { data } = await supabase
      .from("internal_bookings")
      .select("id, title, start_at, end_at, status, source, guest_name, guest_email, calendar_id, location_type, location_value")
      .eq("host_user_id", uid)
      .lt("start_at", to.toISOString())
      .gte("end_at", from.toISOString())
      .order("start_at", { ascending: true });
    if (seq !== reqSeq.current) return; // a newer request superseded this one
    setBookings((data as BookingRow[]) ?? []);
    setLoading(false);
  }, [view, cursor]);

  useEffect(() => { void loadCalendars(); }, [loadCalendars]);
  useEffect(() => { if (tab === "calendar" || tab === "list") void loadBookings(); }, [loadBookings, tab]);

  const events: GridEvent[] = useMemo(() => bookings
    .filter((b) => !hidden.has(b.calendar_id ?? UNASSIGNED))
    .map((b) => ({
      id: b.id,
      title: b.title || b.guest_name || "Appointment",
      start: new Date(b.start_at),
      end: new Date(b.end_at),
      color: colorFor(b.calendar_id),
      status: b.status,
      subtitle: b.guest_name ?? b.guest_email,
    })), [bookings, hidden, colorFor]);

  const nav = (dir: -1 | 0 | 1) => {
    if (dir === 0) { setCursor(new Date()); return; }
    setCursor((c) => {
      if (view === "day") return addDays(c, dir);
      if (view === "week") return addDays(c, dir * 7);
      return new Date(c.getFullYear(), c.getMonth() + dir, 1);
    });
  };

  const toggleCal = (id: string) =>
    setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="container mx-auto px-4 py-6 space-y-5 max-w-6xl">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-4 w-4" /> Calendar view</TabsTrigger>
          <TabsTrigger value="list" className="gap-1.5"><ListChecks className="h-4 w-4" /> Appointment list</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-4 w-4" /> Calendar settings</TabsTrigger>
        </TabsList>

        {/* CALENDAR VIEW */}
        <TabsContent value="calendar" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => nav(0)}>Today</Button>
              <div className="flex items-center">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)} aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)} aria-label="Next"><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <span className="text-sm font-medium min-w-[180px]">{headerLabel(view, cursor)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day view</SelectItem>
                  <SelectItem value="week">Week view</SelectItem>
                  <SelectItem value="month">Month view</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New</Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="min-w-0 relative">
              {loading && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-background/50">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <CalendarGrid view={view} cursor={cursor} events={events}
                onEventClick={(id) => setDetail(bookings.find((b) => b.id === id) ?? null)} />
            </div>

            {/* Filter rail — color legend + calendar toggles */}
            <Card className="h-fit">
              <CardContent className="p-3.5 space-y-2.5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendars</div>
                {calendars.length === 0 && <p className="text-xs text-muted-foreground">No calendars yet.</p>}
                {calendars.map((c) => {
                  const on = !hidden.has(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={on} onChange={() => toggleCal(c.id)} className="rounded" />
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color || c.accent || DEFAULT_COLOR }} />
                      <span className="truncate">{c.title || "Untitled"}</span>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 cursor-pointer text-sm pt-1 border-t border-border/60 mt-1">
                  <input type="checkbox" checked={!hidden.has(UNASSIGNED)} onChange={() => toggleCal(UNASSIGNED)} className="rounded" />
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DEFAULT_COLOR }} />
                  <span className="text-muted-foreground">Other / manual</span>
                </label>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* APPOINTMENT LIST */}
        <TabsContent value="list" className="space-y-4">
          <AppointmentList bookings={bookings} loading={loading} colorFor={colorFor} onSelect={setDetail} />
        </TabsContent>

        {/* CALENDAR SETTINGS */}
        <TabsContent value="settings" className="space-y-4">
          <CalendarsPanel />
        </TabsContent>
      </Tabs>

      <BookingDetailDialog
        booking={detail}
        onOpenChange={(v) => !v && setDetail(null)}
        colorFor={colorFor}
        onCancelBooking={(id) => setBookingStatus(id, "cancelled")}
        onNoShow={(id) => setBookingStatus(id, "no_show")}
      />

      <NewAppointmentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        calendars={calendars}
        activeTenantId={activeTenantId}
        onCreated={(startedAt) => {
          setNewOpen(false);
          // Jump to the new appointment's date so it's actually visible.
          if (startedAt) setCursor(startedAt); else void loadBookings();
        }}
      />
    </div>
  );
}

const LOC_LABEL: Record<string, string> = {
  google_meet: "Google Meet", zoom: "Zoom", phone: "Phone call", in_person: "In person", custom: "Custom",
};
function BookingDetailDialog({ booking, onOpenChange, colorFor, onCancelBooking, onNoShow }: {
  booking: BookingRow | null;
  onOpenChange: (v: boolean) => void;
  colorFor: (id: string | null) => string;
  onCancelBooking: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  const b = booking;
  return (
    <Dialog open={b !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {b && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: colorFor(b.calendar_id) }} />
                <DialogTitle>{b.title || b.guest_name || "Appointment"}</DialogTitle>
              </div>
              <DialogDescription>
                {new Date(b.start_at).toLocaleString([], { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {" – "}
                {new Date(b.end_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </DialogDescription>
            </DialogHeader>
            <div className="text-sm space-y-1.5 py-1">
              {(b.guest_name || b.guest_email) && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Guest</span><span>{b.guest_name}{b.guest_email ? ` · ${b.guest_email}` : ""}</span></div>
              )}
              {b.location_type && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Where</span><span>{LOC_LABEL[b.location_type] ?? b.location_type}{b.location_value ? ` · ${b.location_value}` : ""}</span></div>
              )}
              <div className="flex gap-2 items-center"><span className="text-muted-foreground w-16">Status</span>
                <Badge variant={b.status === "scheduled" ? "default" : "secondary"} className="capitalize">{b.status.replace(/_/g, " ")}</Badge>
                <Badge variant="secondary" className="capitalize">{b.source.replace(/_/g, " ")}</Badge>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              {b.status !== "cancelled" && (
                <Button variant="outline" size="sm" onClick={() => onCancelBooking(b.id)}>Cancel booking</Button>
              )}
              {b.status !== "no_show" && b.status !== "cancelled" && (
                <Button variant="outline" size="sm" onClick={() => onNoShow(b.id)}>Mark no-show</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AppointmentList({ bookings, loading, colorFor, onSelect }: {
  bookings: BookingRow[]; loading: boolean; colorFor: (id: string | null) => string; onSelect: (b: BookingRow) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const k = new Date(b.start_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return Array.from(m.entries());
  }, [bookings]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No appointments in this range.</p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{date}</div>
                {items.map((b) => (
                  <div key={b.id} onClick={() => onSelect(b)}
                    className="flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                    <span className="h-8 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: colorFor(b.calendar_id) }} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{b.title || b.guest_name || "Appointment"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {b.guest_name ? ` · ${b.guest_name}` : b.guest_email ? ` · ${b.guest_email}` : ""}
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize flex-shrink-0">{b.source.replace(/_/g, " ")}</Badge>
                    <Badge variant={b.status === "scheduled" ? "default" : "secondary"} className="capitalize flex-shrink-0">{b.status}</Badge>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewAppointmentDialog({ open, onOpenChange, calendars, activeTenantId, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  calendars: CalMeta[];
  activeTenantId: string | null;
  onCreated: (startedAt: Date) => void;
}) {
  const [title, setTitle] = useState("");
  const [calendarId, setCalendarId] = useState<string>(UNASSIGNED);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [guestName, setGuestName] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const now = new Date();
      setTitle(""); setCalendarId(UNASSIGNED);
      setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
      setTime("09:00"); setDuration(30); setGuestName(""); setBlocked(false);
    }
  }, [open]);

  const save = async () => {
    if (!blocked && !title.trim()) { toast.error("Give the appointment a title"); return; }
    if (!date) { toast.error("Pick a date"); return; }
    const start = new Date(`${date}T${time}:00`);
    if (isNaN(start.getTime())) { toast.error("Invalid date/time"); return; }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setSaving(false); toast.error("Session expired"); return; }
    const cal = calendars.find((c) => c.id === calendarId);
    const end = new Date(start.getTime() + Math.max(5, duration) * 60000);
    const { error } = await supabase.from("internal_bookings").insert({
      host_user_id: uid,
      tenant_id: cal?.tenant_id ?? activeTenantId,
      calendar_id: calendarId === UNASSIGNED ? null : calendarId,
      title: blocked ? "Blocked" : title.trim(),
      guest_name: guestName.trim() || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: blocked ? "blocked" : "scheduled",
      source: "manual",
    });
    setSaving(false);
    if (error) {
      if ((error as { code?: string }).code === "23505")
        toast.error("You already have something at that time — pick another slot.");
      else toast.error(error.message);
      return;
    }
    toast.success(blocked ? "Time blocked" : "Appointment added");
    onCreated(start);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New appointment</DialogTitle>
          <DialogDescription>Add a booking or block time on your schedule.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setBlocked(false)}
              className={`px-3 h-8 rounded-md border text-sm ${!blocked ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>Appointment</button>
            <button type="button" onClick={() => setBlocked(true)}
              className={`px-3 h-8 rounded-md border text-sm ${blocked ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>Block time</button>
          </div>
          {!blocked && (
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Strategy call" autoFocus />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Calendar</Label>
            <Select value={calendarId} onValueChange={setCalendarId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>None (personal)</SelectItem>
                {calendars.map((c) => <SelectItem key={c.id} value={c.id}>{c.title || "Untitled"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5 col-span-1">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mins</Label>
              <Input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 30))} />
            </div>
          </div>
          {!blocked && (
            <div className="space-y-1.5">
              <Label>Guest name (optional)</Label>
              <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Jane Doe" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {blocked ? "Block time" : "Add appointment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
