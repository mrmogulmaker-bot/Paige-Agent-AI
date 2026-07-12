/**
 * Calendar grid — GHL-style Day / Week / Month views with color-coded events.
 *
 * Presentational: the parent owns the view mode, the cursor date, and the event
 * fetch (filtered by calendar). Events are color-coded by their calendar; the
 * "now" line marks the current time in Day/Week. Overlapping events split the
 * column into lanes so nothing is hidden.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface GridEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: string;
  status: string;
  subtitle?: string | null;
  /** "booking" (default) draws a solid time block; "plan" draws a lighter,
   * dashed task/reminder pill so the two never read as the same thing. */
  kind?: "booking" | "plan";
}

export type ViewMode = "day" | "week" | "month";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_HEIGHT = 48; // px per hour in day/week
const DAY_START_SCROLL = 8; // auto-scroll to 8am

function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d: Date): Date { const x = startOfDay(d); return addDays(x, -x.getDay()); }
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function minutesSince(d: Date, base: Date): number { return (d.getTime() - base.getTime()) / 60000; }
function fmtHour(h: number): string {
  const ap = h < 12 ? "AM" : "PM"; const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ap}`;
}
function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Greedy lane assignment for a day's overlapping events → {lane, lanes}.
function layoutDay(events: GridEvent[]): Array<{ ev: GridEvent; lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
  const out: Array<{ ev: GridEvent; lane: number; lanes: number }> = [];
  let cluster: GridEvent[] = [];
  let clusterEnd = 0;
  const flush = () => {
    // assign lanes within the cluster
    const laneEnds: number[] = [];
    const placed = cluster.map((ev) => {
      let lane = laneEnds.findIndex((end) => end <= ev.start.getTime());
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = ev.end.getTime();
      return { ev, lane };
    });
    const lanes = laneEnds.length;
    for (const p of placed) out.push({ ...p, lanes });
    cluster = []; clusterEnd = 0;
  };
  for (const ev of sorted) {
    if (cluster.length && ev.start.getTime() >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}

function EventBlock({ ev, style, onClick }: { ev: GridEvent; style: React.CSSProperties; onClick?: () => void }) {
  const cancelled = ev.status === "cancelled";
  const blocked = ev.status === "blocked";
  const done = ev.status === "done";

  // A plan item (task/reminder) reads as a lighter, dashed pill — clearly not a
  // booked appointment. Overdue/normal color is carried in ev.color (a token).
  if (ev.kind === "plan") {
    return (
      <div
        onClick={onClick}
        className={`absolute rounded-md border border-dashed px-1.5 py-0.5 overflow-hidden text-[11px] leading-tight ${onClick ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
        style={{
          ...style,
          backgroundColor: `color-mix(in srgb, ${ev.color} 12%, transparent)`,
          borderColor: ev.color,
          opacity: done ? 0.55 : 1,
          textDecoration: done ? "line-through" : "none",
        }}
        title={`${ev.title} · ${fmtTime(ev.start)}`}
      >
        <div className="truncate font-medium" style={{ color: ev.color }}>{ev.title}</div>
      </div>
    );
  }

  // Blocked time reads as unavailable (neutral, hatched), not a real appointment.
  const hue = blocked ? "#94a3b8" : ev.color;
  return (
    <div
      onClick={onClick}
      className={`absolute rounded-md px-1.5 py-1 overflow-hidden text-[11px] leading-tight ${onClick ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
      style={{
        ...style,
        backgroundColor: blocked
          ? "repeating-linear-gradient(45deg, #94a3b81f, #94a3b81f 6px, #94a3b833 6px, #94a3b833 12px)"
          : `${ev.color}22`,
        borderLeft: `3px solid ${hue}`,
        opacity: cancelled ? 0.5 : 1,
        textDecoration: cancelled ? "line-through" : "none",
      }}
      title={`${ev.title} · ${fmtTime(ev.start)}–${fmtTime(ev.end)}`}
    >
      <div className="font-medium truncate" style={{ color: hue }}>{blocked ? "Blocked" : fmtTime(ev.start)}</div>
      {!blocked && <div className="truncate text-foreground/80">{ev.title}</div>}
    </div>
  );
}

function TimeGutter() {
  return (
    <div className="w-14 flex-shrink-0 relative" style={{ height: HOUR_HEIGHT * 24 }}>
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
          style={{ top: h * HOUR_HEIGHT }}>
          {h === 0 ? "" : fmtHour(h)}
        </div>
      ))}
    </div>
  );
}

function DayColumn({ day, events, isToday, onEventClick }: { day: Date; events: GridEvent[]; isToday: boolean; onEventClick?: (id: string) => void }) {
  const base = startOfDay(day);
  const laid = useMemo(() => layoutDay(events.filter((e) => isSameDay(e.start, day))), [events, day]);
  const now = useNowMinutes(isToday);
  return (
    <div className="flex-1 min-w-0 relative border-l border-border/60" style={{ height: HOUR_HEIGHT * 24 }}>
      {/* hour lines */}
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="absolute left-0 right-0 border-t border-border/40" style={{ top: h * HOUR_HEIGHT }} />
      ))}
      {/* events */}
      {laid.map(({ ev, lane, lanes }) => {
        const top = (minutesSince(ev.start, base) / 60) * HOUR_HEIGHT;
        const rawHeight = Math.max(18, (minutesSince(ev.end, ev.start) / 60) * HOUR_HEIGHT - 2);
        // Clamp so an event running past midnight doesn't overflow the 24h grid.
        const height = Math.min(rawHeight, HOUR_HEIGHT * 24 - top - 2);
        const widthPct = 100 / lanes;
        return (
          <EventBlock key={ev.id} ev={ev} onClick={onEventClick ? () => onEventClick(ev.id) : undefined} style={{
            top, height,
            left: `calc(${lane * widthPct}% + 2px)`,
            width: `calc(${widthPct}% - 4px)`,
          }} />
        );
      })}
      {/* now line */}
      {isToday && now !== null && (
        <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: (now / 60) * HOUR_HEIGHT }}>
          <div className="h-px bg-red-500" />
          <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
        </div>
      )}
    </div>
  );
}

// Minutes-since-midnight for the now-line, refreshed every 60s so it tracks time.
function useNowMinutes(active: boolean): number | null {
  const [mins, setMins] = useState<number | null>(null);
  useEffect(() => {
    if (!active) { setMins(null); return; }
    const tick = () => { const n = new Date(); setMins(n.getHours() * 60 + n.getMinutes()); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [active]);
  return mins;
}

export function CalendarGrid({ view, cursor, events, onEventClick }: { view: ViewMode; cursor: Date; events: GridEvent[]; onEventClick?: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (view !== "month" && scrollRef.current) {
      scrollRef.current.scrollTop = DAY_START_SCROLL * HOUR_HEIGHT;
    }
  }, [view, cursor]);

  if (view === "month") return <MonthView cursor={cursor} events={events} onEventClick={onEventClick} />;

  const days = view === "day" ? [startOfDay(cursor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i));
  const today = new Date();

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      {/* day headers */}
      <div className="flex border-b bg-muted/30">
        <div className="w-14 flex-shrink-0" />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div key={d.toISOString()} className={`flex-1 min-w-0 text-center py-2 border-l border-border/60 ${isToday ? "bg-primary/5" : ""}`}>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{DAY_LABELS[d.getDay()]}</div>
              <div className={`text-sm font-semibold tabular-nums ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      {/* scrollable grid */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 560 }}>
        <div className="flex">
          <TimeGutter />
          {days.map((d) => (
            <DayColumn key={d.toISOString()} day={d} events={events} isToday={isSameDay(d, today)} onEventClick={onEventClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthView({ cursor, events, onEventClick }: { cursor: Date; events: GridEvent[]; onEventClick?: (id: string) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const byDay = useMemo(() => {
    const m = new Map<string, GridEvent[]>();
    for (const e of events) {
      const k = startOfDay(e.start).toISOString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    for (const list of m.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime());
    return m;
  }, [events]);

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center py-2 text-[11px] uppercase tracking-wide text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, today);
          const list = byDay.get(startOfDay(d).toISOString()) ?? [];
          return (
            <div key={d.toISOString()} className={`min-h-[92px] border-b border-l border-border/50 p-1.5 ${inMonth ? "" : "bg-muted/20"}`}>
              <div className={`text-xs mb-1 tabular-nums ${isToday ? "font-bold text-primary" : inMonth ? "text-foreground" : "text-muted-foreground"}`}>
                {isToday
                  ? <span className="inline-grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground">{d.getDate()}</span>
                  : d.getDate()}
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((e) => (
                  <div key={e.id} onClick={onEventClick ? () => onEventClick(e.id) : undefined}
                    className={`flex items-center gap-1 text-[10px] truncate ${onEventClick ? "cursor-pointer hover:opacity-70" : ""} ${e.kind === "plan" && e.status === "done" ? "line-through opacity-60" : ""}`}
                    title={`${e.title} · ${fmtTime(e.start)}`}>
                    {/* Plan items get a hollow ring; bookings a solid dot. */}
                    <span className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={e.kind === "plan"
                        ? { border: `1.5px solid ${e.color}` }
                        : { backgroundColor: e.color }} />
                    <span className="text-muted-foreground tabular-nums">{e.start.getHours()}:{String(e.start.getMinutes()).padStart(2, "0")}</span>
                    <span className="truncate">{e.title}</span>
                  </div>
                ))}
                {list.length > 3 && <div className="text-[10px] text-muted-foreground pl-2.5">+{list.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarGrid;
