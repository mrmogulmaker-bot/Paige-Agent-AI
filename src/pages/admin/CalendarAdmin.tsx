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
import { usePlanList, type PlanItem } from "@/hooks/usePlanList";
import { itemDate, bucketOf, isClosed } from "@/lib/planning";
import { QuickAddDialog } from "@/components/planning/QuickAddDialog";
import { PlanItemRow } from "@/components/planning/PlanItemRow";

interface IntakeQ { id: string; label: string; type: string; }
interface CalMeta { id: string; title: string | null; color: string | null; accent: string | null; tenant_id: string | null; type?: string; intake_questions?: IntakeQ[]; }
interface BookingRow {
  id: string; title: string; start_at: string; end_at: string; status: string;
  source: string; guest_name: string | null; guest_email: string | null; calendar_id: string | null;
  location_type: string | null; location_value: string | null;
  guest_phone: string | null; notes: string | null;
  intake_answers: Record<string, string | string[]> | null;
  booking_kind: string; class_session_id: string | null; capacity: number | null;
}
// A class_session tile carries a live "booked/capacity" readout computed
// from its sibling class_seat rows — the seats themselves are hidden from
// the grid/list (one row per registrant would otherwise draw N duplicate,
// fully-overlapping tiles for a single shared time slot).
type DisplayBooking = BookingRow & { seatLabel?: string };

const UNASSIGNED = "__unassigned__";
const DEFAULT_COLOR = "#7A67E8";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date) { const x = startOfDay(d); return addDays(x, -x.getDay()); }
/** Local YYYY-MM-DD (no TZ shift) — the plan_list date-window params are `date`. */
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

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
  const [detail, setDetail] = useState<DisplayBooking | null>(null);
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
    const { data } = await supabase.from("calendars").select("id, title, color, accent, tenant_id, type, intake_questions");
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
      .select("id, title, start_at, end_at, status, source, guest_name, guest_email, calendar_id, location_type, location_value, guest_phone, notes, intake_answers, booking_kind, class_session_id, capacity")
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

  // class_seat rows (one per registrant) are folded into their class_session's
  // live "booked/capacity" count rather than rendered as their own tiles.
  const visibleBookings: DisplayBooking[] = useMemo(() => {
    const seatCounts = new Map<string, number>();
    for (const b of bookings) {
      if (b.booking_kind === "class_seat" && b.class_session_id && b.status !== "cancelled") {
        seatCounts.set(b.class_session_id, (seatCounts.get(b.class_session_id) ?? 0) + 1);
      }
    }
    return bookings
      .filter((b) => b.booking_kind !== "class_seat")
      .map((b) => b.booking_kind === "class_session"
        ? { ...b, seatLabel: `${seatCounts.get(b.id) ?? 0}/${b.capacity ?? "?"} booked` }
        : b);
  }, [bookings]);

  const events: GridEvent[] = useMemo(() => visibleBookings
    .filter((b) => !hidden.has(b.calendar_id ?? UNASSIGNED))
    .map((b) => ({
      id: b.id,
      title: b.seatLabel ? `${b.title || "Class"} · ${b.seatLabel}` : (b.title || b.guest_name || "Appointment"),
      start: new Date(b.start_at),
      end: new Date(b.end_at),
      color: colorFor(b.calendar_id),
      status: b.status,
      subtitle: b.seatLabel ?? (b.guest_name ?? b.guest_email),
      kind: "booking" as const,
    })), [visibleBookings, hidden, colorFor]);

  // Task/reminder overlay — the SAME plan_* items Paige and the Planning hub use
  // (§10), pulled for the visible date window by item date. They render as
  // dashed pills, distinct from bookings, and click through to the plan detail.
  const [planFrom, planTo] = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const planEnabled = tab === "calendar" || tab === "list";
  const { allItems: planItems, refresh: refreshPlans, userId: planUserId } = usePlanList({
    scope: "mine", byItemDate: true, from: ymd(planFrom), to: ymd(planTo), enabled: planEnabled,
  });
  const [showTasks, setShowTasks] = useState(true);
  const [planDetail, setPlanDetail] = useState<PlanItem | null>(null);

  const planById = useMemo(() => {
    const m = new Map<string, PlanItem>();
    for (const it of planItems) m.set(it.id, it);
    return m;
  }, [planItems]);

  const planEvents: GridEvent[] = useMemo(() => {
    if (!showTasks) return [];
    return planItems
      .map((it) => {
        const d = itemDate(it);
        if (!d) return null;
        const overdue = !isClosed(it) && bucketOf(it) === "overdue";
        const color = isClosed(it)
          ? "hsl(var(--muted-foreground))"
          : overdue ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))";
        return {
          id: it.id,
          title: it.title,
          start: d,
          end: new Date(d.getTime() + 30 * 60000),
          color,
          status: it.status,
          subtitle: it.item_type,
          kind: "plan" as const,
        } satisfies GridEvent;
      })
      .filter((e): e is GridEvent => e !== null);
  }, [planItems, showTasks]);

  const gridEvents = useMemo(() => [...events, ...planEvents], [events, planEvents]);

  const handleEventClick = useCallback((id: string) => {
    const plan = planById.get(id);
    if (plan) { setPlanDetail(plan); return; }
    setDetail(visibleBookings.find((b) => b.id === id) ?? null);
  }, [planById, visibleBookings]);

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
              <QuickAddDialog
                userId={planUserId}
                onCreated={() => refreshPlans({ silent: true })}
                defaultDate={ymd(cursor)}
                defaultKind="task"
                trigger={<Button size="sm" variant="outline"><ListChecks className="h-4 w-4 mr-1.5" /> Add task</Button>}
              />
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
              <CalendarGrid view={view} cursor={cursor} events={gridEvents} onEventClick={handleEventClick} />
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
                {/* Tasks & reminders overlay toggle — the plan_* items, shown as
                    dashed pills alongside bookings. */}
                <label className="flex items-center gap-2 cursor-pointer text-sm pt-1 border-t border-border/60 mt-1">
                  <input type="checkbox" checked={showTasks} onChange={() => setShowTasks((v) => !v)} className="rounded" />
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 border-[1.5px]" style={{ borderColor: "hsl(var(--muted-foreground))" }} />
                  <span className="text-muted-foreground">Tasks &amp; reminders</span>
                </label>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* APPOINTMENT LIST */}
        <TabsContent value="list" className="space-y-4">
          <AppointmentList bookings={visibleBookings} loading={loading} colorFor={colorFor} onSelect={setDetail} />
        </TabsContent>

        {/* CALENDAR SETTINGS */}
        <TabsContent value="settings" className="space-y-4">
          <CalendarsPanel />
        </TabsContent>
      </Tabs>

      <BookingDetailDialog
        booking={detail}
        calendars={calendars}
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

      {/* Task/reminder detail — same PlanItemRow actions (complete · snooze ·
          remove) the Planning hub uses, so the calendar drives the one seam. */}
      <Dialog open={planDetail !== null} onOpenChange={(v) => !v && setPlanDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {planDetail && (
            <>
              <DialogHeader>
                <DialogTitle>{planDetail.item_type === "reminder" ? "Reminder" : planDetail.item_type === "milestone" ? "Milestone" : "Task"}</DialogTitle>
                <DialogDescription>Update it here — it stays in sync with Planning and Paige.</DialogDescription>
              </DialogHeader>
              <PlanItemRow
                item={planDetail}
                onChanged={() => { void refreshPlans({ silent: true }); setPlanDetail(null); }}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const LOC_LABEL: Record<string, string> = {
  google_meet: "Google Meet", zoom: "Zoom", phone: "Phone call", in_person: "In person", custom: "Custom",
};
function BookingDetailDialog({ booking, calendars, onOpenChange, colorFor, onCancelBooking, onNoShow }: {
  booking: DisplayBooking | null;
  calendars: CalMeta[];
  onOpenChange: (v: boolean) => void;
  colorFor: (id: string | null) => string;
  onCancelBooking: (id: string) => void;
  onNoShow: (id: string) => void;
}) {
  const b = booking;
  // Map the booking's intake answers (id→value) to the calendar's question labels.
  const intakeRows: { label: string; value: string }[] = (() => {
    if (!b?.intake_answers) return [];
    const qs = calendars.find((c) => c.id === b.calendar_id)?.intake_questions ?? [];
    const labelById = new Map(qs.map((q) => [q.id, q.label]));
    return Object.entries(b.intake_answers).map(([id, val]) => ({
      label: labelById.get(id) || id,
      value: Array.isArray(val) ? val.join(", ") : String(val),
    })).filter((r) => r.value);
  })();
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
              {b.seatLabel && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Seats</span><span className="font-medium">{b.seatLabel}</span></div>
              )}
              {(b.guest_name || b.guest_email) && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Guest</span><span>{b.guest_name}{b.guest_email ? ` · ${b.guest_email}` : ""}</span></div>
              )}
              {b.guest_phone && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Phone</span><span>{b.guest_phone}</span></div>
              )}
              {b.location_type && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Where</span><span>{LOC_LABEL[b.location_type] ?? b.location_type}{b.location_value ? ` · ${b.location_value}` : ""}</span></div>
              )}
              {b.notes && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">Notes</span><span className="whitespace-pre-line">{b.notes}</span></div>
              )}
              {intakeRows.length > 0 && (
                <div className="pt-1.5 mt-1.5 border-t space-y-1.5">
                  {intakeRows.map((r, i) => (
                    <div key={i} className="flex gap-2"><span className="text-muted-foreground w-16 shrink-0">{r.label}</span><span className="whitespace-pre-line">{r.value}</span></div>
                  ))}
                </div>
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
              {/* A class_session is a shared container, not a person — "no-show"
                  only makes sense per registrant (their own seat), not the slot. */}
              {b.status !== "no_show" && b.status !== "cancelled" && b.booking_kind !== "class_session" && (
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
  bookings: DisplayBooking[]; loading: boolean; colorFor: (id: string | null) => string; onSelect: (b: DisplayBooking) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, DisplayBooking[]>();
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
                        {b.seatLabel ? ` · ${b.seatLabel}` : b.guest_name ? ` · ${b.guest_name}` : b.guest_email ? ` · ${b.guest_email}` : ""}
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
      // 23505 = exact-start clash; 23P01 = the GiST exclusion constraint
      // (overlapping time range, e.g. a mixed-duration booking) — both mean
      // the same thing: something's already on your schedule at that time.
      const code = (error as { code?: string }).code;
      if (code === "23505" || code === "23P01")
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
                {/* Collective (every host must attend) and Class (shared capacity)
                    calendars aren't supported by this quick-add — it always writes
                    a plain single booking under you as the sole host, which would
                    silently ignore the calendar's real host roster or capacity. */}
                {calendars.filter((c) => c.type !== "collective" && c.type !== "event")
                  .map((c) => <SelectItem key={c.id} value={c.id}>{c.title || "Untitled"}</SelectItem>)}
              </SelectContent>
            </Select>
            {calendars.some((c) => c.type === "collective" || c.type === "event") && (
              <p className="text-[11px] text-muted-foreground">
                Collective and Class calendars aren't listed here yet — book those from the calendar's own public page.
              </p>
            )}
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
