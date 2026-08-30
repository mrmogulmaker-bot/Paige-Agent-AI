/**
 * The calendar configuration contract.
 *
 * These rules used to live inside CalendarsPanel and were never covered, which
 * was survivable while one screen applied them. Two screens now save the same
 * rows, so a silent divergence here would mean a booking page that behaves
 * differently depending on which surface last touched it. Each case below is a
 * rule that prevents an unbookable page, not a formatting preference.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVAIL, availToJson, buildCalendarPatch, draftFromRow, jsonToAvail,
  normalizeLocationOptions, normalizeNotify, slugify, type CalendarDraft, type CalendarRow,
} from "./config";

const draft = (over: Partial<CalendarDraft> = {}): CalendarDraft => ({
  type: "personal", title: "Discovery call", description: null, color: "#EBB94C", accent: null,
  logo_url: null, duration_min: 30, buffer_before_min: 15, buffer_after_min: 15, min_notice_min: 240,
  booking_horizon_days: 30, capacity: 1, redirect_url: "", timezone: "America/New_York",
  group_id: null, theme: "light", subtitle: "", show_company_name: true,
  location_options: [{ type: "google_meet", value: null }],
  intake_questions: [], appointment_types: [], date_overrides: [],
  notify_config: normalizeNotify(null), assignment_strategy: { mode: "balanced" }, ...over,
});

describe("buildCalendarPatch — the drops that keep a page bookable", () => {
  it("drops a choice question with no options, because a guest could never answer it", () => {
    const patch = buildCalendarPatch(draft({
      intake_questions: [
        { id: "a", label: "How did you hear about us?", type: "select", required: false, options: [], placeholder: null },
        { id: "b", label: "Anything to read first?", type: "text", required: false, options: [], placeholder: null },
      ],
    }), DEFAULT_AVAIL);
    expect(patch.intake_questions.map((q) => q.id)).toEqual(["b"]);
  });

  it("keeps a choice question once it has at least one real option, and trims the blanks", () => {
    const patch = buildCalendarPatch(draft({
      intake_questions: [{ id: "a", label: "Referral source", type: "select", required: true, options: ["  Search  ", "", "  "], placeholder: null }],
    }), DEFAULT_AVAIL);
    expect(patch.intake_questions).toHaveLength(1);
    expect(patch.intake_questions[0].options).toEqual(["Search"]);
  });

  it("drops an unnamed service, because it cannot be picked", () => {
    const patch = buildCalendarPatch(draft({
      appointment_types: [
        { id: "s1", name: "  ", description: "", duration_min: 30, price_cents: null },
        { id: "s2", name: "Strategy review", description: "", duration_min: 60, price_cents: null },
      ],
    }), DEFAULT_AVAIL);
    expect(patch.appointment_types.map((s) => s.id)).toEqual(["s2"]);
  });

  it("drops a non-blocked date override with no usable window, which would close the day silently", () => {
    const patch = buildCalendarPatch(draft({
      date_overrides: [
        { date: "2026-12-24", blocked: false, windows: [{ start: "17:00", end: "09:00" }] },
        { date: "2026-12-25", blocked: true, windows: [] },
        { date: "not-a-date", blocked: true, windows: [] },
      ],
    }), DEFAULT_AVAIL);
    expect(patch.date_overrides.map((o) => o.date)).toEqual(["2026-12-25"]);
  });

  it("clamps the numbers rather than persisting a value the booking engine cannot honour", () => {
    const patch = buildCalendarPatch(draft({
      duration_min: 0, buffer_before_min: -5, min_notice_min: -1, booking_horizon_days: 5000, capacity: 0,
    }), DEFAULT_AVAIL);
    expect(patch.duration_min).toBe(30);
    expect(patch.buffer_before_min).toBe(0);
    expect(patch.min_notice_min).toBe(0);
    expect(patch.booking_horizon_days).toBe(730);
    expect(patch.capacity).toBe(8);
  });

  it("treats 15 as an ordinary buffer value — the column is a free integer, not a preset list", () => {
    const patch = buildCalendarPatch(draft({ buffer_before_min: 15, buffer_after_min: 15 }), DEFAULT_AVAIL);
    expect([patch.buffer_before_min, patch.buffer_after_min]).toEqual([15, 15]);
  });

  it("keeps the legacy single location columns in step with the options array", () => {
    const one = buildCalendarPatch(draft({ location_options: [{ type: "in_person", value: "12 Main St" }] }), DEFAULT_AVAIL);
    expect(one.location_type).toBe("in_person");
    expect(one.location_value).toBe("12 Main St");

    const many = buildCalendarPatch(draft({
      location_options: [{ type: "zoom", value: null }, { type: "phone", value: null }],
    }), DEFAULT_AVAIL);
    expect(many.location_type).toBe("ask_invitee");
    expect(many.location_value).toBeNull();
  });

  it("never persists an empty location list — a page with no way to meet is unbookable", () => {
    const patch = buildCalendarPatch(draft({ location_options: [] }), DEFAULT_AVAIL);
    expect(patch.location_options).toEqual([{ type: "phone", value: null }]);
  });

  it("persists an empty redirect as null rather than an empty string", () => {
    expect(buildCalendarPatch(draft({ redirect_url: "   " }), DEFAULT_AVAIL).redirect_url).toBeNull();
  });
});

describe("availability round-trip", () => {
  it("keeps only days that are on and have an end after their start", () => {
    const state = { ...DEFAULT_AVAIL, 3: { enabled: true, start: "17:00", end: "09:00" } };
    expect(availToJson(state).some((w) => w.day === 3)).toBe(false);
  });

  it("survives a round trip through the stored shape", () => {
    const stored = availToJson(DEFAULT_AVAIL);
    expect(availToJson(jsonToAvail(stored))).toEqual(stored);
  });

  it("reads a stored row as closed on every day it does not mention", () => {
    const state = jsonToAvail([{ day: 2, start: "10:00", end: "12:00" }]);
    expect(state[2]).toEqual({ enabled: true, start: "10:00", end: "12:00" });
    expect(Object.values(state).filter((d) => d.enabled)).toHaveLength(1);
  });
});

describe("normalizeNotify — a legacy or partial jsonb is coerced, never trusted", () => {
  it("supplies the default reminder when the column has none", () => {
    expect(normalizeNotify(null).reminders).toEqual([{ channel: "email", offset_min: 1440 }]);
  });

  it("drops a reminder with no numeric offset instead of scheduling it at zero", () => {
    const n = normalizeNotify({ reminders: [{ channel: "sms" }, { channel: "email", offset_min: 60 }] });
    expect(n.reminders).toHaveLength(1);
    expect(n.reminders[0].offset_min).toBe(60);
  });

  it("keeps only the three real lifecycle events", () => {
    const n = normalizeNotify({ lifecycle: [{ event: "created" }, { event: "exploded" }, { event: "cancelled" }] });
    expect(n.lifecycle.map((l) => l.event)).toEqual(["created", "cancelled"]);
  });

  it("defaults an unrecognised recipient to the guest", () => {
    const n = normalizeNotify({ reminders: [{ channel: "email", offset_min: 60, to: "everyone" }] });
    expect(n.reminders[0].to).toBe("guest");
  });

  it("turns an empty subject into undefined so the engine's own default is used", () => {
    const n = normalizeNotify({ reminders: [{ channel: "email", offset_min: 60, subject: "   " }] });
    expect(n.reminders[0].subject).toBeUndefined();
  });
});

describe("normalizeLocationOptions", () => {
  it("discards a method the platform does not offer", () => {
    expect(normalizeLocationOptions([{ type: "carrier_pigeon" }, { type: "zoom" }])).toEqual([{ type: "zoom", value: null }]);
  });

  it("falls back to a real method rather than returning nothing", () => {
    expect(normalizeLocationOptions([])).toEqual([{ type: "google_meet", value: null }]);
  });
});

describe("slugify", () => {
  it("produces a link-safe slug and caps its length", () => {
    expect(slugify("  Discovery Call — 30 min!  ")).toBe("discovery-call-30-min");
    expect(slugify("x".repeat(80))).toHaveLength(40);
  });
});

describe("draftFromRow", () => {
  it("hydrates a row whose jsonb columns are null without throwing", () => {
    const row = {
      id: "c1", tenant_id: "t1", slug: "discovery", type: "personal", title: null, description: null,
      logo_url: null, accent: null, color: null, duration_min: 30, buffer_before_min: 0, buffer_after_min: 0,
      min_notice_min: 0, booking_horizon_days: 60, capacity: 1, redirect_url: "", timezone: "UTC",
      availability_json: null, enabled: true, group_id: null, created_by: null, theme: "",
      subtitle: null, show_company_name: true, location_type: "phone", location_value: null,
      location_options: null, intake_questions: null, appointment_types: null, date_overrides: null,
      notify_config: null, assignment_strategy: null,
    } as unknown as CalendarRow;
    const d = draftFromRow(row);
    expect(d.title).toBe("");
    expect(d.theme).toBe("light");
    expect(d.assignment_strategy.mode).toBe("balanced");
    expect(d.location_options).toEqual([{ type: "google_meet", value: null }]);
    expect(() => buildCalendarPatch(d, jsonToAvail(row.availability_json))).not.toThrow();
  });
});
