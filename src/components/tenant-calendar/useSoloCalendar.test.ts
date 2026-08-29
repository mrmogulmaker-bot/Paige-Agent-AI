import { describe, expect, it } from "vitest";
import { addDays, findConflicts, rangeFor, rangeLabel, startOfWeek, type SoloBooking } from "./useSoloCalendar";

function booking(over: Partial<SoloBooking> & { id: string; start_at: string; end_at: string }): SoloBooking {
  return {
    title: "Consult", status: "scheduled", source: "manual",
    guest_name: null, guest_email: null, guest_phone: null, calendar_id: null,
    location_type: null, location_value: null, notes: null,
    booking_kind: "appointment", capacity: null,
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
