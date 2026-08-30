import { describe, expect, it } from "vitest";
import {
  addDays, findConflicts, foldClassSeats, rangeFor, rangeLabel, startOfWeek,
  type SoloBooking,
} from "./useSoloCalendar";

function booking(over: Partial<SoloBooking> & { id: string; start_at: string; end_at: string }): SoloBooking {
  return {
    title: "Consult", status: "scheduled", source: "manual",
    guest_name: null, guest_email: null, guest_phone: null, calendar_id: null,
    location_type: null, location_value: null, notes: null,
    booking_kind: "appointment", capacity: null, class_session_id: null,
    intake_answers: null, appointment_type: null,
    host_user_id: "host-a", host_full_name: null, timezone: null,
    ...over,
  };
}

describe("rangeLabel", () => {
  // The shipped label handed Intl a `{day, year}` skeleton whenever the week sat
  // inside one month. That skeleton has no CLDR pattern, so ICU emitted the
  // literal field name and the toolbar read "Aug 23 – 2026 (day: 29)".
  it("does not emit an Intl field-name fallback for a same-month week", () => {
    const label = rangeLabel("week", new Date(2026, 7, 26));
    expect(label).not.toMatch(/\(day:/);
    expect(label).not.toMatch(/\(month:/);
  });

  it("renders a same-month week as one month, two days and a year", () => {
    expect(rangeLabel("week", new Date(2026, 7, 26))).toBe("Aug 23 – 29, 2026");
  });

  it("names both months when the week straddles a boundary", () => {
    // Aug 30 2026 is a Sunday, so this week runs Aug 30 – Sep 5.
    expect(rangeLabel("week", new Date(2026, 7, 31))).toBe("Aug 30 – Sep 5, 2026");
  });

  it("labels a month view with the month and year alone", () => {
    expect(rangeLabel("month", new Date(2026, 7, 15))).toBe("August 2026");
  });

  it("labels the agenda as its real fourteen-day window", () => {
    expect(rangeLabel("agenda", new Date(2026, 7, 3))).toBe("Aug 3 – 16, 2026");
  });
});

describe("rangeFor", () => {
  it("asks for exactly the week that is drawn", () => {
    const cursor = new Date(2026, 7, 26);
    const [from, to] = rangeFor("week", cursor);
    expect(from.getTime()).toBe(startOfWeek(cursor).getTime());
    expect(to.getTime()).toBe(addDays(startOfWeek(cursor), 7).getTime());
  });

  it("covers the whole six-week month grid", () => {
    const [from, to] = rangeFor("month", new Date(2026, 7, 15));
    expect(Math.round((to.getTime() - from.getTime()) / 86400000)).toBe(42);
  });
});

describe("findConflicts", () => {
  it("reports nothing for an empty book — no invented conflicts", () => {
    expect(findConflicts([]).size).toBe(0);
  });

  it("flags two appointments that genuinely overlap on one host", () => {
    const c = findConflicts([
      booking({ id: "a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "b", start_at: "2026-08-24T14:30:00Z", end_at: "2026-08-24T15:30:00Z" }),
    ]);
    expect([...c].sort()).toEqual(["a", "b"]);
  });

  it("treats back-to-back appointments as clear, not overlapping", () => {
    const c = findConflicts([
      booking({ id: "a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "b", start_at: "2026-08-24T15:00:00Z", end_at: "2026-08-24T16:00:00Z" }),
    ]);
    expect(c.size).toBe(0);
  });

  it("does not flag an overlap across two different hosts", () => {
    const c = findConflicts([
      booking({ id: "a", host_user_id: "host-a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "b", host_user_id: "host-b", start_at: "2026-08-24T14:30:00Z", end_at: "2026-08-24T15:30:00Z" }),
    ]);
    expect(c.size).toBe(0);
  });

  it("ignores a cancelled appointment — it no longer holds the slot", () => {
    const c = findConflicts([
      booking({ id: "a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "b", status: "cancelled", start_at: "2026-08-24T14:30:00Z", end_at: "2026-08-24T15:30:00Z" }),
    ]);
    expect(c.size).toBe(0);
  });

  it("ignores a no-show for the same reason", () => {
    const c = findConflicts([
      booking({ id: "a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "b", status: "no_show", start_at: "2026-08-24T14:30:00Z", end_at: "2026-08-24T15:30:00Z" }),
    ]);
    expect(c.size).toBe(0);
  });

  it("flags every member of a three-way pile-up", () => {
    const c = findConflicts([
      booking({ id: "a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T16:00:00Z" }),
      booking({ id: "b", start_at: "2026-08-24T14:30:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "c", start_at: "2026-08-24T15:30:00Z", end_at: "2026-08-24T17:00:00Z" }),
    ]);
    expect([...c].sort()).toEqual(["a", "b", "c"]);
  });
});

/* ------------------------------------------------------ class seat folding --- */

/**
 * `list_team_bookings` returns a class as SEVERAL rows: one `class_session`
 * marker plus one `class_seat` per attendee, all sharing the session's host and
 * its exact start/end. Handing every one of those rows to the grid draws the
 * class N+1 times, and handing them to `findConflicts` marks every attendee as a
 * double-booking of the host — which is what shipped, and what these cover.
 */
const CLASS_START = "2026-08-24T18:00:00Z";
const CLASS_END = "2026-08-24T19:00:00Z";

function classRows() {
  return [
    booking({
      id: "class-1", title: "Group coaching", booking_kind: "class_session",
      capacity: 8, start_at: CLASS_START, end_at: CLASS_END,
    }),
    booking({
      id: "seat-1", booking_kind: "class_seat", class_session_id: "class-1",
      guest_name: "Attendee One", start_at: CLASS_START, end_at: CLASS_END,
    }),
    booking({
      id: "seat-2", booking_kind: "class_seat", class_session_id: "class-1",
      guest_name: "Attendee Two", start_at: CLASS_START, end_at: CLASS_END,
    }),
    booking({
      id: "seat-3", booking_kind: "class_seat", class_session_id: "class-1",
      guest_name: "Attendee Three", start_at: CLASS_START, end_at: CLASS_END,
    }),
  ];
}

describe("foldClassSeats", () => {
  it("draws a class with three attendees as ONE appointment, not four", () => {
    expect(foldClassSeats(classRows()).visible.map((b) => b.id)).toEqual(["class-1"]);
  });

  it("stops the attendees being reported as host conflicts", () => {
    // Every one of those four rows shares host-a and the same hour, so the
    // unfolded list is a four-way pile-up on the host.
    expect(findConflicts(classRows()).size).toBe(4);
    expect(findConflicts(foldClassSeats(classRows()).visible).size).toBe(0);
  });

  it("keeps every attendee record, filed under its session", () => {
    const seats = foldClassSeats(classRows()).seatsBySession.get("class-1") ?? [];
    expect(seats.map((s) => s.guest_name)).toEqual(["Attendee One", "Attendee Two", "Attendee Three"]);
  });

  it("counts only the seats that still hold a place", () => {
    const rows = classRows();
    rows[2] = { ...rows[2], status: "cancelled" };
    const seats = foldClassSeats(rows).seatsBySession.get("class-1") ?? [];
    // The cancelled attendee is KEPT as a record — the detail can say they
    // cancelled — but the surface must never count them as booked.
    expect(seats).toHaveLength(3);
    expect(seats.filter((s) => s.status !== "cancelled" && s.status !== "no_show")).toHaveLength(2);
  });

  it("reports no seats for a class nobody has joined — never an invented count", () => {
    const [session] = classRows();
    const { visible, seatsBySession } = foldClassSeats([session]);
    expect(visible.map((b) => b.id)).toEqual(["class-1"]);
    expect(seatsBySession.get("class-1")).toBeUndefined();
  });

  it("leaves a seat whose session is not in this range visible rather than dropping it", () => {
    // A seat that has nothing to fold into is still a real booking. Discarding
    // it would delete an appointment from the tenant's own schedule.
    const orphan = booking({
      id: "seat-orphan", booking_kind: "class_seat", class_session_id: "class-elsewhere",
      guest_name: "Attendee Four", start_at: CLASS_START, end_at: CLASS_END,
    });
    expect(foldClassSeats([orphan]).visible.map((b) => b.id)).toEqual(["seat-orphan"]);
  });

  it("leaves an ordinary appointment exactly as it found it", () => {
    const rows = [
      booking({ id: "a", start_at: "2026-08-24T14:00:00Z", end_at: "2026-08-24T15:00:00Z" }),
      booking({ id: "b", start_at: "2026-08-24T16:00:00Z", end_at: "2026-08-24T17:00:00Z" }),
    ];
    const { visible, seatsBySession } = foldClassSeats(rows);
    expect(visible).toEqual(rows);
    expect(seatsBySession.size).toBe(0);
  });

  it("still flags a REAL clash between a class and a separate appointment", () => {
    // Folding must not make the host look free: an unrelated booking that
    // genuinely overlaps the class is still a conflict.
    const rows = [
      ...classRows(),
      booking({ id: "solo", start_at: "2026-08-24T18:30:00Z", end_at: "2026-08-24T19:30:00Z" }),
    ];
    expect([...findConflicts(foldClassSeats(rows).visible)].sort()).toEqual(["class-1", "solo"]);
  });
});
