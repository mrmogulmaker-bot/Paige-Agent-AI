/**
 * Calendar — the independent, GHL-style team calendar tab.
 *
 * Three views under one tab (mirrors GoHighLevel):
 *  • Calendar view    — Day/Week/Month grid, color-coded by calendar or host, "now" line
 *  • Appointment list — a chronological agenda of what's booked
 *  • Calendar settings — the Calendars manager (create/customize calendars)
 *
 * The schedule is LIVE and TEAM-WIDE: bookings come from list_team_bookings
 * (every host in the tenant for admins; own-host fallback otherwise), and a
 * realtime subscription refetches on insert/update/delete so the board stays in
 * sync as teammates book. A host filter narrows to All / Just mine / one host,
 * and events can be colored by calendar or by host so a shared board stays
 * legible. Bookings are tenant-isolated server-side.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageShell, PageHeader, SectionCard, StatRow, StatTile, EmptyState, FilterChip,
} from "@/components/ui/page";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarDays, CalendarRange, CalendarX2, ChevronLeft, ChevronRight, Clock,
  Plus, Loader2, ListChecks, Users, Cable, AlertCircle, Settings,
} from "lucide-react";
import CalendarsPanel from "@/components/admin/calendar/CalendarsPanel";
import { CalendarGrid, type GridEvent, type ViewMode } from "@/components/admin/calendar/CalendarGrid";
import { Link } from "react-router-dom";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { usePlanList, type PlanItem } from "@/hooks/usePlanList";
import { itemDate, bucketOf, isClosed } from "@/lib/planning";
import { QuickAddDialog } from "@/components/planning/QuickAddDialog";
import { PlanItemRow } from "@/components/planning/PlanItemRow";
import "@/components/tenant-calendar/tenant-canonical-calendar.css";

interface IntakeQ { id: string; label: string; type: string; }
interface CalMeta { id: string; title: string | null; color: string | null; accent: string | null; tenant_id: string | null; type?: string; intake_questions?: IntakeQ[]; }
interface AppointmentType { name?: string | null; label?: string | null; duration_min?: number | null; }
interface BookingRow {
  id: string; title: string; start_at: string; end_at: string; status: string;
  source: string; guest_name: string | null; guest_email: string | null; calendar_id: string | null;
  location_type: string | null; location_value: string | null;
  guest_phone: string | null; notes: string | null;
  intake_answers: Record<string, string | string[]> | null;
  booking_kind: string; class_session_id: string | null; capacity: number | null;
  host_user_id: string | null; host_full_name: string | null; timezone: string | null;
  appointment_type: AppointmentType | null;
}
/** Host filter mode: "all" · "mine" · a specific host user_id. */
type HostFilter = "all" | "mine" | string;
/** Which dimension colors the event blocks. */
type ColorBy = "calendar" | "host";
// A class_session tile carries a live "booked/capacity" readout computed
// from its sibling class_seat rows — the seats themselves are hidden from
// the grid/list (one row per registrant would otherwise draw N duplicate,
// fully-overlapping tiles for a single shared time slot).
type DisplayBooking = BookingRow & { seatLabel?: string };

const UNASSIGNED = "__unassigned__";
const DEFAULT_COLOR = "#7A67E8";

// Color-by-host: hosts have no stored color, so we derive a stable, well-spread
// hue from the user_id. Returned as an hsl() string the grid consumes exactly
// like a stored calendar color (it color-mixes the fill and uses it for the
// border/text), keeping fixed S/L for AA legibility in light and dark.
function hostHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 24) * 15; // 24 evenly spaced hues
}
function hostColor(id: string | null): string {
  return id ? `hsl(${hostHue(id)} 62% 48%)` : DEFAULT_COLOR;
}

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

export type TenantCalendarTab = "calendar" | "agenda" | "tasks" | "booking" | "availability" | "connections" | "settings";

interface CalendarAdminProps {
  /** Server-resolved tenant authority supplied by a tenant route owner. */
  activeTenantId?: string | null;
  activeTab?: TenantCalendarTab;
  onTabChange?: (tab: TenantCalendarTab) => void;
  connectionsHref?: string;
  openPaige?: () => void;
  tenantMode?: boolean;
  /** Solo-only approved coordinator; defaults off so shared tiers remain unchanged. */
  soloSettings?: boolean;
}

export default function CalendarAdmin({
  activeTenantId: suppliedTenantId,
  activeTab,
  onTabChange,
  connectionsHref = "/admin/setup/integrations",
  openPaige,
  tenantMode = false,
  soloSettings = false,
}: CalendarAdminProps = {}) {
  const tenantContext = useTenantContext();
  const activeTenantId = suppliedTenantId ?? tenantContext.activeTenantId;
  const [localTab, setLocalTab] = useState<TenantCalendarTab>("calendar");
  const tab = activeTab ?? localTab;
  const setTab = (next: string) => {
    const tenantTab = next as TenantCalendarTab;
    if (onTabChange) onTabChange(tenantTab);
    else setLocalTab(tenantTab);
  };
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [calendars, setCalendars] = useState<CalMeta[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<DisplayBooking | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [hostFilter, setHostFilter] = useState<HostFilter>("all");
  // Calendar coloring by default (the established look); flip to Host to tell
  // teammates apart on a shared team board.
  const [colorBy, setColorBy] = useState<ColorBy>("calendar");
  // Accumulated roster of hosts seen in loaded bookings (id → name). It only
  // grows within a session so narrowing to one host never empties the picker.
  const [hostDir, setHostDir] = useState<Map<string, string>>(new Map());
  const reqSeq = useRef(0);
  const calendarReqSeq = useRef(0);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setCurrentUid(data.user?.id ?? null));
  }, []);

  const setBookingStatus = async (id: string, status: string) => {
    // Route through the tenant-gated RPC — the team board shows every host's
    // bookings, but a raw table UPDATE is RLS-scoped to own rows, so cancelling
    // a teammate's booking would silently no-op and falsely report success.
    // The RPC performs the change server-side and errors truthfully if refused.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pre-existing (untyped RPC name cast); unrelated to #257's one-line backHref repoint; CI whole-file-lints changed files
    const { error } = await supabase.rpc("admin_set_booking_status" as any, { _booking_id: id, _status: status });
    if (error) {
      toast.error(/FORBIDDEN/.test(error.message) ? "You can't change that booking" : error.message);
      return;
    }
    setBookings((bs) => bs.map((b) => b.id === id ? { ...b, status } : b));
    setDetail((d) => d && d.id === id ? { ...d, status } : d);
    toast.success(status === "cancelled" ? "Booking cancelled" : status === "no_show" ? "Marked as no-show" : "Updated");
  };

  const colorFor = useCallback((calId: string | null) => {
    const c = calendars.find((x) => x.id === calId);
    return c?.color || c?.accent || DEFAULT_COLOR;
  }, [calendars]);

  // The event's on-grid color: by calendar (stored hex) or by host (derived hue).
  const eventColor = useCallback((b: BookingRow) => (
    colorBy === "host" ? hostColor(b.host_user_id) : colorFor(b.calendar_id)
  ), [colorBy, colorFor]);

  const loadCalendars = useCallback(async () => {
    const seq = ++calendarReqSeq.current;
    setCalendars([]);
    setCalendarsError(null);
    if (!activeTenantId) return;
    const { data, error } = await supabase
      .from("calendars")
      .select("id, title, color, accent, tenant_id, type, intake_questions")
      .eq("tenant_id", activeTenantId);
    if (seq !== calendarReqSeq.current) return;
    if (error) {
      setCalendarsError(error.message);
      return;
    }
    setCalendars((data as CalMeta[] | null) ?? []);
  }, [activeTenantId]);

  const loadBookings = useCallback(async () => {
    const seq = ++reqSeq.current; // guard against out-of-order responses
    setLoading(true);
    setBookings([]);
    setBookingsError(null);
    if (!activeTenantId) { if (seq === reqSeq.current) setLoading(false); return; }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id ?? null;
    if (!uid) {
      if (seq === reqSeq.current) {
        setBookingsError("Your session could not be confirmed.");
        setLoading(false);
      }
      return;
    }
    const [from, to] = rangeFor(view, cursor);
    // Server-side host filter: null = whole team (admins) or own host (fallback);
    // ["mine"] = just me; [id] = one teammate. list_team_bookings is overlap-aware
    // and tenant-isolated, and returns host_full_name + every column we render.
    const hostIds = hostFilter === "all" ? null : hostFilter === "mine" ? [uid] : [hostFilter];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase.rpc("list_team_bookings" as any, {
      _from: from.toISOString(),
      _to: to.toISOString(),
      _host_ids: hostIds,
      _tenant_id: activeTenantId,
    });
    if (seq !== reqSeq.current) return; // a newer request superseded this one
    if (error) {
      setBookingsError(error.message);
      setLoading(false);
      return;
    }
    setBookings((data as BookingRow[] | null) ?? []);
    setLoading(false);
  }, [view, cursor, hostFilter, activeTenantId]);

  useEffect(() => { void loadCalendars(); }, [loadCalendars]);
  useEffect(() => {
    if (tab === "calendar" || tab === "agenda") void loadBookings();
  }, [loadBookings, tab]);

  // Grow the host roster from whatever loaded (never shrinks mid-session).
  useEffect(() => {
    setHostDir((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const b of bookings) {
        if (b.host_user_id && !next.has(b.host_user_id)) {
          next.set(b.host_user_id, b.host_full_name?.trim() || "Teammate");
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [bookings]);

  // Live team schedule — refetch (debounced) on any booking change in this
  // tenant so teammates' new/moved/cancelled bookings appear without a reload.
  const loadRef = useRef(loadBookings);
  useEffect(() => { loadRef.current = loadBookings; }, [loadBookings]);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRealtime = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => { void loadRef.current(); }, 400);
  }, []);
  useEffect(() => () => { if (refetchTimer.current) clearTimeout(refetchTimer.current); }, []);
  useRealtimeTable("internal_bookings", handleRealtime, {
    filter: activeTenantId ? `tenant_id=eq.${activeTenantId}` : undefined,
    enabled: Boolean(activeTenantId) && (tab === "calendar" || tab === "agenda"),
  });

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
      color: eventColor(b),
      status: b.status,
      subtitle: b.seatLabel ?? (b.guest_name ?? b.guest_email),
      kind: "booking" as const,
    })), [visibleBookings, hidden, eventColor]);

  // KPI summary of what's loaded in the current range. Blocked time isn't an
  // appointment, so it's excluded from the working counts.
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now), todayEnd = addDays(todayStart, 1);
    const weekStart = startOfWeek(now), weekEnd = addDays(weekStart, 7);
    let today = 0, week = 0, upcoming = 0, off = 0;
    for (const b of visibleBookings) {
      const s = new Date(b.start_at);
      if (b.status === "cancelled" || b.status === "no_show") { off++; continue; }
      if (b.status === "blocked") continue;
      if (s >= todayStart && s < todayEnd) today++;
      if (s >= weekStart && s < weekEnd) week++;
      if (s >= now) upcoming++;
    }
    return { today, week, upcoming, off };
  }, [visibleBookings]);

  // Hosts for the picker/legend — the current user first ("You"), then the rest.
  const hostList = useMemo(() => {
    const rows = Array.from(hostDir.entries())
      .map(([id, name]) => ({ id, name, isMe: id === currentUid }))
      .sort((a, b) => (a.isMe === b.isMe ? a.name.localeCompare(b.name) : a.isMe ? -1 : 1));
    return rows;
  }, [hostDir, currentUid]);

  // Task/reminder overlay — the SAME plan_* items Paige and the Planning hub use
  // (§10), pulled for the visible date window by item date. They render as
  // dashed pills, distinct from bookings, and click through to the plan detail.
  const [planFrom, planTo] = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const planEnabled = Boolean(activeTenantId) && (tab === "calendar" || tab === "agenda" || tab === "tasks");
  // Widen the fetch window ±1 day: plan_list compares item date in the DB tz
  // (UTC) against these date bounds, but the grid renders in the viewer's local
  // zone. The extra day on each side prevents a positive-UTC-offset viewer from
  // dropping an in-window item; the grid only draws events on days it renders.
  const {
    allItems: planItems,
    refresh: refreshPlans,
    userId: planUserId,
    loading: plansLoading,
    error: plansError,
    forbidden: plansForbidden,
  } = usePlanList({
    scope: "mine", byItemDate: true,
    from: ymd(addDays(planFrom, -1)), to: ymd(addDays(planTo, 1)), enabled: planEnabled,
    tenantScopeKey: activeTenantId,
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
      .map((it): GridEvent | null => {
        // itemDate() returns the ISO string (due_at/remind_at) or null — parse
        // it to a real Date before using date math or the grid.
        const iso = itemDate(it);
        if (!iso) return null;
        const start = new Date(iso);
        const overdue = !isClosed(it) && bucketOf(it) === "overdue";
        // Open/upcoming items read at full strength (foreground) so they don't
        // look disabled; overdue is destructive; only done/closed goes muted.
        const color = isClosed(it)
          ? "hsl(var(--muted-foreground))"
          : overdue ? "hsl(var(--destructive))" : "hsl(var(--foreground))";
        return {
          id: it.id,
          title: it.title,
          start,
          end: new Date(start.getTime() + 30 * 60000),
          color,
          status: it.status,
          subtitle: it.item_type,
          kind: "plan",
        };
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
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- pre-existing (ternary-as-statement); unrelated to #257; CI whole-file-lints changed files
    setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const statsLoading = loading && bookings.length === 0;
  const requiredReadError = bookingsError || calendarsError;

  return (
    <PageShell
      width="wide"
      fill={tenantMode}
      className={tenantMode ? "tcal-shell !space-y-0" : undefined}
    >
      <PageHeader
        variant="plain"
        eyebrow="Time & commitments"
        title="Calendar"
        description={tenantMode
          ? "One canonical home for appointments, dated tasks, bookings, reminders, and protected time."
          : "Your team's live schedule — every booking, block, and task on one board, in sync the moment it changes."}
        actions={
          <Button variant="gold" size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New appointment
          </Button>
        }
        className={tenantMode ? "tcal-header" : undefined}
      />

      {(tab === "calendar" || tab === "agenda") && (
        <div className={tenantMode ? "tcal-summary" : undefined}>
          <StatRow>
            <StatTile className={tenantMode ? "tcal-stat" : undefined} label="Today" value={stats.today} icon={CalendarDays} hint="scheduled" loading={statsLoading} />
            <StatTile className={tenantMode ? "tcal-stat" : undefined} label="This week" value={stats.week} icon={CalendarRange} hint="in range" loading={statsLoading} />
            <StatTile className={tenantMode ? "tcal-stat" : undefined} label="Upcoming" value={stats.upcoming} icon={Clock} hint="still to come" loading={statsLoading} />
            <StatTile className={tenantMode ? "tcal-stat" : undefined} label="Cancelled / no-show" value={stats.off} icon={CalendarX2} intent={stats.off > 0 ? "negative" : "neutral"} loading={statsLoading} />
          </StatRow>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className={tenantMode ? "tcal-tabs-root" : "space-y-4"}>
        <TabsList className={tenantMode ? "tcal-tablist h-auto max-w-full justify-start overflow-x-auto" : "h-auto max-w-full justify-start overflow-x-auto"} aria-label="Calendar views">
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-4 w-4" /> Calendar</TabsTrigger>
          <TabsTrigger value="agenda" className="gap-1.5"><ListChecks className="h-4 w-4" /> Agenda</TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5"><ListChecks className="h-4 w-4" /> Tasks</TabsTrigger>
          <TabsTrigger value="booking" className="gap-1.5"><CalendarRange className="h-4 w-4" /> Booking pages</TabsTrigger>
          <TabsTrigger value="availability" className="gap-1.5"><Clock className="h-4 w-4" /> Availability</TabsTrigger>
          <TabsTrigger value="connections" className="gap-1.5"><Cable className="h-4 w-4" /> Connections</TabsTrigger>
          {soloSettings && <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-4 w-4" /> Settings</TabsTrigger>}
        </TabsList>

        {/* CALENDAR VIEW */}
        <TabsContent value="calendar" className={tenantMode ? "tcal-calendar-panel" : "space-y-4"}>
          <div className={tenantMode ? "tcal-truth-stack" : "contents"}>
            <DataTruthNotice
              label="LIVE"
              detail="Bookings come from the tenant-scoped booking service. Dated tasks are a distinct plan overlay for the signed-in user."
            />
            {plansError && !requiredReadError && (
              <DataTruthNotice
                label={plansForbidden ? "UNAVAILABLE" : "PARTIAL"}
                detail="Bookings remain live. The dated task overlay is unavailable for this view."
              />
            )}
          </div>
          {requiredReadError ? (
            <CalendarReadState
              title="Calendar couldn't load"
              description="No events or counts are inferred from a failed required read."
              onRetry={() => { void loadCalendars(); void loadBookings(); }}
              className={tenantMode ? "tcal-read-state" : undefined}
            />
          ) : (
          <>
          <div className={tenantMode ? "tcal-toolbar" : "flex flex-wrap items-center justify-between gap-3"}>
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
            </div>
          </div>

          <div className={tenantMode ? "tcal-board" : "grid gap-4 lg:grid-cols-[1fr_240px]"}>
            <div className={tenantMode ? "tcal-canvas" : "min-w-0 relative"}>
              {loading && (
                <div className="absolute inset-0 z-20 rounded-lg bg-background/60 p-4 backdrop-blur-[1px]" aria-hidden>
                  <div className="space-y-2.5">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="ml-14 h-20 w-1/2" />
                    <Skeleton className="ml-28 h-14 w-2/5" />
                    <Skeleton className="ml-14 h-16 w-1/2" />
                  </div>
                </div>
              )}
              <CalendarGrid view={view} cursor={cursor} events={gridEvents} onEventClick={handleEventClick} workWeek={tenantMode} />
            </div>

            {/* Filter rail — host filter · color mode · legend · calendar toggles */}
            <SectionCard className={tenantMode ? "tcal-filters" : "h-fit"} padded={false}>
              <div className="space-y-4 p-4">
                {/* Whose schedule to show — drives the server-side host filter. */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Host</div>
                  <Select value={hostFilter} onValueChange={(v) => setHostFilter(v as HostFilter)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All hosts</SelectItem>
                      <SelectItem value="mine">Just mine</SelectItem>
                      {hostList.filter((h) => !h.isMe).map((h) => (
                        <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* How to color the blocks so a shared board stays legible. */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color by</div>
                  <div className="flex gap-1.5">
                    <FilterChip active={colorBy === "host"} onClick={() => setColorBy("host")}><Users className="h-3 w-3" /> Host</FilterChip>
                    <FilterChip active={colorBy === "calendar"} onClick={() => setColorBy("calendar")}><CalendarDays className="h-3 w-3" /> Calendar</FilterChip>
                  </div>
                </div>

                {/* Host legend — only meaningful when coloring by host. */}
                {colorBy === "host" && hostList.length > 0 && (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team</div>
                    {hostList.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-sm">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: hostColor(h.id) }} />
                        <span className="truncate">{h.isMe ? "You" : h.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Calendar visibility toggles (color dots are the calendar's own). */}
                <div className="space-y-2.5 border-t border-border/60 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calendars</div>
                  {calendars.length === 0 && <p className="text-xs text-muted-foreground">No calendars yet.</p>}
                  {calendars.map((c) => {
                    const on = !hidden.has(c.id);
                    return (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox checked={on} onCheckedChange={() => toggleCal(c.id)} />
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: c.color || c.accent || DEFAULT_COLOR }} />
                        <span className="truncate">{c.title || "Untitled"}</span>
                      </label>
                    );
                  })}
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={!hidden.has(UNASSIGNED)} onCheckedChange={() => toggleCal(UNASSIGNED)} />
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: DEFAULT_COLOR }} />
                    <span className="text-muted-foreground">Other / manual</span>
                  </label>
                </div>

                {/* Tasks & reminders overlay toggle — the plan_* items, shown as
                    dashed pills alongside bookings (overdue in red). */}
                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox checked={showTasks} onCheckedChange={() => setShowTasks((v) => !v)} />
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full border-[1.5px]" style={{ borderColor: "hsl(var(--foreground))" }} />
                    <span className="text-muted-foreground">Tasks &amp; reminders</span>
                  </label>
                  {showTasks && (
                    <p className="pl-6 text-[11px] text-muted-foreground">Overdue shown in red.</p>
                  )}
                </div>
              </div>
            </SectionCard>
            {tenantMode && (
              <TenantCalendarInspector
                booking={detail}
                nextItem={planItems.find((item) => !isClosed(item)) ?? null}
                loading={loading || plansLoading}
                onOpenPlan={setPlanDetail}
                openPaige={openPaige}
              />
            )}
          </div>
          </>
          )}
        </TabsContent>

        {/* AGENDA — another view of the same booking + plan seams. */}
        <TabsContent value="agenda" className="space-y-4">
          <DataTruthNotice
            label="LIVE"
            detail="Appointments and dated tasks are read from their canonical booking and plan records; they are not copied into an agenda store."
          />
          {requiredReadError ? (
            <CalendarReadState
              title="Agenda couldn't load"
              description="No agenda rows are inferred from a failed booking read."
              onRetry={() => { void loadCalendars(); void loadBookings(); }}
            />
          ) : (
          <>
          <AppointmentList
            bookings={visibleBookings}
            loading={loading}
            colorFor={colorFor}
            colorBy={colorBy}
            onSelect={setDetail}
            onNew={() => setNewOpen(true)}
          />
          <PlanItemsList
            items={planItems}
            loading={plansLoading}
            error={plansError}
            forbidden={plansForbidden}
            onChanged={() => void refreshPlans({ silent: true })}
            heading="Dated tasks & reminders"
          />
          </>
          )}
        </TabsContent>

        {/* TASKS — plan_items is the canonical task/reminder seam. */}
        <TabsContent value="tasks" className="space-y-4">
          <DataTruthNotice
            label="LIVE"
            detail="This view uses plan items. Older task experiences are not merged or presented as a second task store."
          />
          <PlanItemsList
            items={planItems}
            loading={plansLoading}
            error={plansError}
            forbidden={plansForbidden}
            onChanged={() => void refreshPlans({ silent: true })}
            heading="Tasks & reminders"
          />
        </TabsContent>

        {/* BOOKING PAGES — the existing canonical calendar manager. */}
        <TabsContent value="booking" className="space-y-4">
          <DataTruthNotice
            label="LIVE"
            detail="Internal booking pages and rules use the existing Calendar configuration owner. External provider imports remain unavailable unless explicitly connected."
          />
          <CalendarsPanel activeTenantId={activeTenantId} />
        </TabsContent>

        {/* AVAILABILITY — a lens into the same manager, never another rules store. */}
        <TabsContent value="availability" className="space-y-4">
          <DataTruthNotice
            label="PARTIAL"
            detail="Stored Calendar availability rules are editable here. Provider free/busy coverage depends on the signed-in user's connected provider."
          />
          <CalendarsPanel activeTenantId={activeTenantId} />
        </TabsContent>

        {/* CONNECTIONS — signpost only. Calendar/meeting connect flows live in the
            ONE integrations home (Automation → Integrations, §6/§12), so we don't
            keep a rival management surface here — just a path to it, no dead end. */}
        <TabsContent value="connections" className="space-y-4">
          <DataTruthNotice
            label="UNAVAILABLE"
            detail="This Calendar does not infer provider status. Connection management remains in the account's Settings and reports its own live state."
          />
          <SectionCard
            icon={Cable}
            title="Manage Calendar connections in Settings"
            description="Provider authorization stays in one integrations home. This link preserves the active account tree."
            className="border-primary/30"
          >
            <Button asChild variant="outline" size="sm">
              <Link to={connectionsHref}>
                Go to Integrations <ChevronRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </SectionCard>
        </TabsContent>

        {soloSettings && (
          <TabsContent value="settings" className="space-y-4" data-calendar-settings>
            <DataTruthNotice
              label="PARTIAL"
              detail="Scheduling calendars use the existing tenant-scoped manager. Richer lifecycle, payments, Service, and hostless Event types remain proposed or unavailable rather than being simulated."
            />
            <section className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-3" aria-label="Calendar settings owners">
              <button type="button" className="rounded-lg border p-3 text-left hover:bg-muted/40" onClick={() => setTab("availability")}>
                <strong className="block text-sm">Availability</strong>
                <span className="mt-1 block text-xs text-muted-foreground">Reusable hours and date exceptions remain with Availability.</span>
              </button>
              <button type="button" className="rounded-lg border p-3 text-left hover:bg-muted/40" onClick={() => setTab("booking")}>
                <strong className="block text-sm">Booking pages</strong>
                <span className="mt-1 block text-xs text-muted-foreground">Public page, form, branding, and URL remain with Booking pages.</span>
              </button>
              <button type="button" className="rounded-lg border p-3 text-left hover:bg-muted/40" onClick={() => setTab("connections")}>
                <strong className="block text-sm">Connections</strong>
                <span className="mt-1 block text-xs text-muted-foreground">Provider authorization and conflict calendars remain in Settings.</span>
              </button>
            </section>
            <CalendarsPanel activeTenantId={activeTenantId} />
          </TabsContent>
        )}
      </Tabs>

      {!tenantMode && <BookingDetailDialog
        booking={detail}
        calendars={calendars}
        onOpenChange={(v) => !v && setDetail(null)}
        colorFor={colorFor}
        onCancelBooking={(id) => setBookingStatus(id, "cancelled")}
        onNoShow={(id) => setBookingStatus(id, "no_show")}
      />}

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
    </PageShell>
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
  const serviceName = b?.appointment_type
    ? (b.appointment_type.name || b.appointment_type.label || null)
    : null;
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
              {b.host_full_name && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Host</span><span>{b.host_full_name}</span></div>
              )}
              {serviceName && (
                <div className="flex gap-2"><span className="text-muted-foreground w-16">Service</span><span>{serviceName}</span></div>
              )}
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

function TenantCalendarInspector({ booking, nextItem, loading, onOpenPlan, openPaige }: {
  booking: DisplayBooking | null;
  nextItem: PlanItem | null;
  loading: boolean;
  onOpenPlan: (item: PlanItem) => void;
  openPaige?: () => void;
}) {
  return (
    <aside className="tcal-inspector" aria-label="Calendar inspector">
      <p className="tcal-kicker">Needs you today</p>
      {booking ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{booking.title || booking.guest_name || "Appointment"}</h2>
          <p className="text-sm text-muted-foreground">
            {new Date(booking.start_at).toLocaleString([], {
              weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
            })}
          </p>
          <Badge variant="secondary" className="capitalize">{booking.status.replace(/_/g, " ")}</Badge>
          {booking.guest_name && <p className="text-sm">With {booking.guest_name}</p>}
        </div>
      ) : loading ? (
        <div className="space-y-2" aria-label="Calendar inspector loading">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : nextItem ? (
        <button type="button" className="tcal-inspector-item" onClick={() => onOpenPlan(nextItem)}>
          <span>{nextItem.item_type}</span>
          <strong>{nextItem.title}</strong>
          <small>{nextItem.due_at ? new Date(nextItem.due_at).toLocaleString() : "Reminder"}</small>
        </button>
      ) : (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">Nothing needs you now</h2>
          <p className="text-sm text-muted-foreground">No open dated plan item was returned for this range.</p>
        </div>
      )}
      {openPaige && (
        <Button type="button" variant="outline" size="sm" className="mt-5 w-full" onClick={openPaige}>
          Ask PAIGE in this Calendar
        </Button>
      )}
      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        PAIGE uses the existing workspace. This inspector never starts a second chat surface.
      </p>
    </aside>
  );
}

function DataTruthNotice({ label, detail }: { label: "LIVE" | "PARTIAL" | "UNAVAILABLE"; detail: string }) {
  const variant = label === "LIVE" ? "default" : "secondary";
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground">
      <Badge variant={variant} className="shrink-0 text-[10px] tracking-wide">{label}</Badge>
      <span className="min-w-0 flex-1 leading-5">{detail}</span>
    </div>
  );
}

function CalendarReadState({ title, description, onRetry, className }: {
  title: string;
  description: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <SectionCard className={className}>
      <EmptyState
        icon={AlertCircle}
        title={title}
        description={description}
        action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
      />
    </SectionCard>
  );
}

function PlanItemsList({ items, loading, error, forbidden, onChanged, heading }: {
  items: PlanItem[];
  loading: boolean;
  error: string | null;
  forbidden: boolean;
  onChanged: () => void;
  heading: string;
}) {
  if (loading) {
    return (
      <SectionCard title={heading}>
        <div className="space-y-3" aria-label={`${heading} loading`}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </SectionCard>
    );
  }
  if (error) {
    return (
      <SectionCard title={heading}>
        <EmptyState
          icon={forbidden ? CalendarX2 : AlertCircle}
          title={forbidden ? "Tasks are unavailable here" : "Tasks couldn't load"}
          description={forbidden
            ? "This identity cannot read plan items in the active account. No other account is substituted."
            : "No task rows are inferred from a failed plan read."}
        />
      </SectionCard>
    );
  }
  if (items.length === 0) {
    return (
      <SectionCard title={heading}>
        <EmptyState
          icon={ListChecks}
          title="No dated tasks in this range"
          description="The active account returned no dated plan items for the selected window."
        />
      </SectionCard>
    );
  }
  return (
    <SectionCard title={heading}>
      <div className="space-y-2">
        {items.map((item) => <PlanItemRow key={item.id} item={item} onChanged={onChanged} />)}
      </div>
    </SectionCard>
  );
}

function AppointmentList({ bookings, loading, colorFor, colorBy, onSelect, onNew }: {
  bookings: DisplayBooking[];
  loading: boolean;
  colorFor: (id: string | null) => string;
  colorBy: ColorBy;
  onSelect: (b: DisplayBooking) => void;
  onNew: () => void;
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

  if (loading && bookings.length === 0) {
    return (
      <SectionCard>
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border border-border p-3">
              <Skeleton className="h-8 w-1 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </SectionCard>
    );
  }

  if (grouped.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={CalendarDays}
          title="Nothing booked in this range"
          description="Move the date window, widen the host filter, or add an appointment to fill the board."
          action={<Button variant="gold" size="sm" onClick={onNew}><Plus className="h-4 w-4 mr-1.5" /> New appointment</Button>}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      <div className="space-y-5">
        {grouped.map(([date, items]) => (
          <div key={date} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{date}</div>
            {items.map((b) => {
              const stripe = colorBy === "host" ? hostColor(b.host_user_id) : colorFor(b.calendar_id);
              const who = b.host_full_name ? `${b.host_full_name}` : null;
              return (
                <div key={b.id} onClick={() => onSelect(b)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(b); }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${b.title || b.guest_name || "appointment"}`}
                  className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm transition-colors hover:bg-muted/50">
                  <span className="h-8 w-1 flex-shrink-0 rounded-full" style={{ backgroundColor: stripe }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{b.title || b.guest_name || "Appointment"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {who ? ` · ${who}` : ""}
                      {b.seatLabel ? ` · ${b.seatLabel}` : b.guest_name ? ` · ${b.guest_name}` : b.guest_email ? ` · ${b.guest_email}` : ""}
                    </div>
                  </div>
                  <Badge variant="secondary" className="flex-shrink-0 capitalize">{b.source.replace(/_/g, " ")}</Badge>
                  <Badge variant={b.status === "scheduled" ? "default" : "secondary"} className="flex-shrink-0 capitalize">{b.status.replace(/_/g, " ")}</Badge>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </SectionCard>
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
    if (!activeTenantId) { setSaving(false); toast.error("Calendar account scope is unavailable"); return; }
    const cal = calendars.find((c) => c.id === calendarId && c.tenant_id === activeTenantId);
    if (calendarId !== UNASSIGNED && !cal) {
      setSaving(false);
      toast.error("That calendar is not available in the active account");
      return;
    }
    const end = new Date(start.getTime() + Math.max(5, duration) * 60000);
    // Route through the RPC seam (§10) so the same create path is callable by
    // Paige, not trapped in this component. v2 enforces the overlap guard and
    // returns the new booking id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.rpc("create_internal_booking" as any, {
      _title: blocked ? "Blocked" : title.trim(),
      _start_at: start.toISOString(),
      _end_at: end.toISOString(),
      _timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      _host_user_id: uid,
      _guest_name: guestName.trim() || null,
      _tenant_id: activeTenantId,
      _calendar_id: calendarId === UNASSIGNED ? null : calendarId,
      _status: blocked ? "blocked" : "scheduled",
      _source: "manual",
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
