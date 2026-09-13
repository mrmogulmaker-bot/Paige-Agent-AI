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
  DEFAULT_AVAIL, availToJson, blankDraft, buildCalendarPatch, draftFromRow, jsonToAvail,
  willSaveDateOverride, willSaveQuestion, willSaveAppointmentType,
  normalizeLocationOptions, normalizeNotify, slugify, type CalendarDraft, type CalendarRow,
  PRESET_CATALOG, draftForTemplate, presetLifecycle, publishReadiness,
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

describe("blankDraft — the defaults a brand-new preset ships with", () => {
  it("offers phone, not Google Meet, as the meeting method", () => {
    // `public-booking` mints a real join URL for Zoom only; its Google Meet
    // branch formats the null value as "link to follow". A new preset is meant
    // to be shareable immediately, so defaulting to Meet would let it take a
    // booking and give the guest no way in. Phone is also `public-booking`'s
    // own fallback, so the two agree.
    expect(blankDraft("Discovery call").location_options).toEqual([{ type: "phone", value: null }]);
  });

  it("produces a patch that survives every clamp and drop rule", () => {
    const d = blankDraft("Discovery call");
    const patch = buildCalendarPatch(d, DEFAULT_AVAIL);
    expect(patch.title).toBe("Discovery call");
    expect(patch.location_type).toBe("phone");
    // A single method means it is stored as that method, not as "ask_invitee".
    expect(patch.location_options).toEqual([{ type: "phone", value: null }]);
    // Nothing a clamp would silently drop: no unanswerable question, no unnamed
    // service, no date override that closes a day.
    expect(patch.intake_questions).toEqual([]);
    expect(patch.appointment_types).toEqual([]);
    expect(patch.date_overrides).toEqual([]);
  });

  it("opens the week it ships with, so the first booking page can be booked", () => {
    // `createCalendar` writes DEFAULT_AVAIL alongside this patch; a preset with
    // every day closed would be a live link that never offers a slot.
    const open = Object.values(jsonToAvail(availToJson(DEFAULT_AVAIL))).filter((day) => day.enabled);
    expect(open.length).toBe(5);
  });
});

describe("the drop predicates agree with what the save actually keeps", () => {
  // These exist so a surface can warn BEFORE the save discards something. That
  // only works while the two say the same thing, so this pins the equivalence
  // rather than trusting that two hand-written rules stay in step.
  const cases = [
    { label: "a real date with a usable window", o: { date: "2026-09-01", blocked: false, windows: [{ start: "09:00", end: "12:00" }] } },
    { label: "a real date whose window is inverted", o: { date: "2026-09-01", blocked: false, windows: [{ start: "14:00", end: "10:00" }] } },
    { label: "a real date with no windows at all", o: { date: "2026-09-01", blocked: false, windows: [] } },
    { label: "a blocked real date", o: { date: "2026-09-01", blocked: true, windows: [] } },
    // "Add a date" creates exactly this, and it used to be counted as kept.
    { label: "a blocked override with no date yet", o: { date: "", blocked: true, windows: [] } },
    { label: "a malformed date", o: { date: "1/9/26", blocked: true, windows: [] } },
  ];
  for (const { label, o } of cases) {
    it(`agrees on ${label}`, () => {
      const patch = buildCalendarPatch(draft({ date_overrides: [o] }), DEFAULT_AVAIL);
      expect(patch.date_overrides.length > 0).toBe(willSaveDateOverride(o));
    });
  }

  it("agrees on an unnamed question, which the save discards", () => {
    const q = { id: "q1", type: "short_text" as const, label: "  ", required: false, options: [], placeholder: null };
    const patch = buildCalendarPatch(draft({ intake_questions: [q] }), DEFAULT_AVAIL);
    expect(patch.intake_questions.length > 0).toBe(willSaveQuestion(q));
    expect(willSaveQuestion(q)).toBe(false);
  });

  it("agrees on an unnamed service, which the save discards", () => {
    const t = { id: "t1", name: "", description: "", duration_min: 30, price_cents: null };
    const patch = buildCalendarPatch(draft({ appointment_types: [t] }), DEFAULT_AVAIL);
    expect(patch.appointment_types.length > 0).toBe(willSaveAppointmentType(t));
    expect(willSaveAppointmentType(t)).toBe(false);
  });
});

/* --------------------------------------------------------------- lifecycle */

describe("presetLifecycle — derived from enabled + published_at, never a third stored column", () => {
  it("an enabled preset is Live regardless of published_at", () => {
    expect(presetLifecycle({ enabled: true, published_at: null })).toBe("live");
    expect(presetLifecycle({ enabled: true, published_at: "2027-01-01T00:00:00Z" })).toBe("live");
  });
  it("a disabled preset that has NEVER been published is a Draft", () => {
    expect(presetLifecycle({ enabled: false, published_at: null })).toBe("draft");
  });
  it("a disabled preset that HAS been published is Paused, not a Draft", () => {
    expect(presetLifecycle({ enabled: false, published_at: "2027-01-01T00:00:00Z" })).toBe("paused");
  });
});

describe("publishReadiness — the client mirror of the server publish gate", () => {
  const win = [{ day: 1, start: "09:00", end: "17:00" }];
  const phone = [{ type: "phone", value: null }];

  it("a personal preset with a host, an open window and a method is ready", () => {
    expect(publishReadiness({ type: "personal", availability_json: win, date_overrides: [], location_options: phone, hostCount: 1 }).ready).toBe(true);
  });
  it("refuses a personal preset with NO host", () => {
    const r = publishReadiness({ type: "personal", availability_json: win, date_overrides: [], location_options: phone, hostCount: 0 });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/host/i);
  });
  it("refuses round_robin / collective with fewer than two hosts (the honesty floor)", () => {
    expect(publishReadiness({ type: "round_robin", availability_json: win, date_overrides: [], location_options: phone, hostCount: 1 }).ready).toBe(false);
    expect(publishReadiness({ type: "collective", availability_json: win, date_overrides: [], location_options: phone, hostCount: 1 }).ready).toBe(false);
    expect(publishReadiness({ type: "round_robin", availability_json: win, date_overrides: [], location_options: phone, hostCount: 2 }).ready).toBe(true);
  });
  it("refuses when there is no open window (weekly or override)", () => {
    const r = publishReadiness({ type: "personal", availability_json: [], date_overrides: [], location_options: phone, hostCount: 1 });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/window/i);
  });
  it("accepts a date-override window when there is no weekly window", () => {
    const r = publishReadiness({
      type: "personal", availability_json: [], hostCount: 1, location_options: phone,
      date_overrides: [{ date: "2027-03-01", blocked: false, windows: [{ start: "10:00", end: "12:00" }] }],
    });
    expect(r.ready).toBe(true);
  });
  it("refuses when there is no usable method", () => {
    const r = publishReadiness({ type: "personal", availability_json: win, date_overrides: [], location_options: [], location_type: null, hostCount: 1 });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/meeting|method|happens/i);
  });
  it("refuses a bare ask_invitee with no concrete option — matches the stricter server bar", () => {
    // The server helper (_calendar_preset_block_reason) does not count `ask_invitee`
    // as a usable method by itself; the client mirror must not either, or it would
    // enable Publish for a page the server then refuses (a false 'ready', §13).
    const r = publishReadiness({ type: "personal", availability_json: win, date_overrides: [], location_options: [], location_type: "ask_invitee", hostCount: 1 });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/meeting|method|happens/i);
  });
  it("accepts ask_invitee as location_type once a concrete option is offered", () => {
    const r = publishReadiness({ type: "personal", availability_json: win, date_overrides: [], location_options: phone, location_type: "ask_invitee", hostCount: 1 });
    expect(r.ready).toBe(true);
  });
  it("refuses a malformed weekly window ('9:00', not HH:MM) — matches the server's shape check", () => {
    const bad = [{ day: 1, start: "9:00", end: "17:00" }];
    const r = publishReadiness({ type: "personal", availability_json: bad, date_overrides: [], location_options: phone, hostCount: 1 });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/window/i);
  });
});

/* ------------------------------------------------------------ preset templates */

describe("PRESET_CATALOG + draftForTemplate — recognizable models, editable defaults, §2/§63 clean", () => {
  it("offers the six owner-named categories, custom last", () => {
    expect(PRESET_CATALOG.map((c) => c.id)).toEqual([
      "one_on_one", "round_robin", "collective", "group_class", "webinar", "custom",
    ]);
    expect(PRESET_CATALOG.at(-1)?.custom).toBe(true);
  });
  it("carries the honest host floor the server enforces (2 for team models)", () => {
    const byId = Object.fromEntries(PRESET_CATALOG.map((c) => [c.id, c.minHosts]));
    expect(byId.round_robin).toBe(2);
    expect(byId.collective).toBe(2);
    expect(byId.one_on_one).toBe(1);
  });
  it("webinar is honestly the event model (no separate streaming substrate)", () => {
    const webinar = PRESET_CATALOG.find((c) => c.id === "webinar")!;
    expect(webinar.model).toBe("event");
    expect(webinar.detail).toMatch(/no separate streaming|same registration engine|registration engine as a group/i);
  });
  it("a standard template builds a Draft-shaped CalendarDraft with the model + duration", () => {
    const cat = PRESET_CATALOG.find((c) => c.id === "one_on_one")!;
    const tmpl = cat.templates.find((t) => t.id === "consult45")!;
    const d = draftForTemplate(cat, tmpl, "");
    expect(d.type).toBe("personal");
    expect(d.duration_min).toBe(45);
    expect(d.title.length).toBeGreaterThan(0); // falls back to the template title
  });
  it("an event template carries a real capacity (not the 1:1 default)", () => {
    const cat = PRESET_CATALOG.find((c) => c.id === "group_class")!;
    const d = draftForTemplate(cat, cat.templates[0], "");
    expect(d.type).toBe("event");
    expect(d.capacity).toBeGreaterThan(1);
  });
  it("custom takes the owner's name and chosen model, carries no baked identity", () => {
    const custom = PRESET_CATALOG.find((c) => c.custom)!;
    const d = draftForTemplate({ ...custom, model: "collective" }, null, "Strategy session");
    expect(d.title).toBe("Strategy session");
    expect(d.type).toBe("collective");
    // No hardcoded tenant/brand/service/provider identity leaked into the draft (§2/§63).
    expect(d.location_options).toEqual([{ type: "phone", value: null }]);
    expect(d.appointment_types).toEqual([]);
  });
});
