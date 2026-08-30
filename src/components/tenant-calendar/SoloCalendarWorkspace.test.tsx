import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoloBooking, SoloCalendarMeta } from "./useSoloCalendar";
import { findConflicts } from "./useSoloCalendar";

const setStatus = vi.fn(async () => ({ ok: true }) as { ok: boolean; message?: string });
const createBooking = vi.fn(async () => ({ ok: true }) as { ok: boolean; message?: string });
const refresh = vi.fn();
const retry = vi.fn(async () => {});

const state: {
  bookings: SoloBooking[];
  calendars: SoloCalendarMeta[];
  phase: "loading" | "ready" | "error";
  error: string | null;
  stale: boolean;
  lastSyncedAt: Date | null;
} = { bookings: [], calendars: [], phase: "ready", error: null, stale: false, lastSyncedAt: null };

// Only the DATA BOUNDARY is faked. The component's rendering, drawer, keyboard
// handling and focus restoration are the real shipped code; the hook's own
// range/label/conflict logic is tested against the real implementation next door.
vi.mock("./useSoloCalendar", async () => {
  const actual = await vi.importActual<typeof import("./useSoloCalendar")>("./useSoloCalendar");
  return {
    ...actual,
    useSoloCalendar: () => {
      // Mirrors the real hook exactly: the class fold runs BEFORE the grid and
      // the conflict detector see anything, so these tests exercise the shipped
      // folding logic rather than a convenient stand-in for it.
      const folded = actual.foldClassSeats(state.bookings);
      return {
      bookings: folded.visible,
      calendars: state.calendars,
      seatsBySession: folded.seatsBySession,
      conflicts: actual.findConflicts(folded.visible),
      phase: state.phase,
      error: state.error,
      calendarsError: null,
      stale: state.stale,
      lastSyncedAt: state.lastSyncedAt,
      retry,
      refresh,
      setStatus,
      createBooking,
      colorForBooking: (b: SoloBooking) => {
        const c = state.calendars.find((x) => x.id === b.calendar_id);
        return c?.color || c?.accent || actual.DEFAULT_CALENDAR_COLOR;
      },
      };
    },
  };
});

const { SoloCalendarWorkspace } = await import("./SoloCalendarWorkspace");

/** A calendar row with every stored column at its honest "not recorded" value, so a
 *  test states ONLY the columns it is about. */
function calendarMeta(over: Partial<SoloCalendarMeta> & { id: string; title: string }): SoloCalendarMeta {
  return {
    color: null, accent: null, type: null,
    slug: null, enabled: null, duration_min: null, buffer_before_min: null,
    buffer_after_min: null, min_notice_min: null, booking_horizon_days: null,
    capacity: null, timezone: null, location_type: null, location_value: null,
    notify_config: null, availability_json: null, date_overrides: null, intake_questions: null,
    ...over,
  };
}

function booking(over: Partial<SoloBooking> & { id: string; start_at: string; end_at: string }): SoloBooking {
  return {
    title: "Discovery call", status: "scheduled", source: "manual",
    guest_name: null, guest_email: null, guest_phone: null, calendar_id: null,
    location_type: null, location_value: null, notes: null,
    booking_kind: "appointment", capacity: null, class_session_id: null,
    intake_answers: null, appointment_type: null,
    host_user_id: "host-a", host_full_name: null, timezone: null,
    ...over,
  };
}

/** "Today at hh:mm" as an ISO string, so the rendered week always contains it. */
function todayAt(hour: number, minutes = 0) {
  const d = new Date();
  d.setHours(hour, minutes, 0, 0);
  return d.toISOString();
}

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <SoloCalendarWorkspace activeTenantId="tenant-1" connectionsHref="/solo/1/integrations" />,
    );
  });
}

const text = () => container.textContent ?? "";
const dialog = () => document.querySelector('[role="dialog"]');
const chip = (title: RegExp) =>
  [...container.querySelectorAll<HTMLButtonElement>("button.sc-ev")]
    .find((b) => title.test(b.getAttribute("title") ?? "")) ?? null;
const buttonByText = (re: RegExp, scope: ParentNode = container) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => re.test(b.textContent ?? "")) ?? null;

function click(el: Element | null) {
  expect(el, "expected the element under test to exist").toBeTruthy();
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

beforeEach(() => {
  state.bookings = [];
  state.calendars = [];
  state.phase = "ready";
  state.error = null;
  state.stale = false;
  state.lastSyncedAt = null;
  retry.mockClear();
  setStatus.mockClear();
  setStatus.mockResolvedValue({ ok: true });
  createBooking.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Solo Calendar — a truthful surface", () => {
  it("renders no duplicate heading: the Clients tab strip already names this view", () => {
    mount();
    // The retired presentation drew an <h1>Calendar</h1> plus an eyebrow and a
    // description INSIDE the Clients panel, directly under the Clients heading.
    expect(container.querySelector("h1")).toBeNull();
  });

  it("states plainly that nothing overlaps when the book is empty", () => {
    mount();
    expect(text()).toMatch(/No overlapping appointments in this range/i);
  });

  it("invents no counts for an empty book", () => {
    mount();
    // The retired sheet reserved a hard 560px for four tiles reading 0 / 0 / 0 / 0.
    expect(text()).not.toMatch(/still to come/i);
    expect(text()).not.toMatch(/Cancelled \/ no-show/i);
  });

  it("reports a load failure instead of drawing an empty week as success", () => {
    state.phase = "error";
    state.error = "permission denied for function list_team_bookings";
    mount();
    expect(text()).toMatch(/couldn’t load this range/i);
    expect(text()).toMatch(/permission denied/i);
  });

  it("labels the range without the Intl field-name fallback the old header emitted", () => {
    mount();
    expect(text()).not.toMatch(/\(day:/);
  });
});

describe("Solo Calendar — colour coding from real calendar rows", () => {
  it("paints an event with its own calendar's stored colour", () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" })];
    state.bookings = [booking({ id: "b1", calendar_id: "cal-1", start_at: todayAt(10), end_at: todayAt(11) })];
    mount();
    expect(chip(/Discovery call/)?.getAttribute("style")).toContain("#2E7D8F");
  });

  it("falls back to the accent when a calendar stores no colour", () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: null, accent: "#8A5A9E", type: "meeting" })];
    state.bookings = [booking({ id: "b1", calendar_id: "cal-1", start_at: todayAt(10), end_at: todayAt(11) })];
    mount();
    expect(chip(/Discovery call/)?.getAttribute("style")).toContain("#8A5A9E");
  });

  it("lists the account's real calendars as toggles and hides their events when switched off", () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" })];
    state.bookings = [booking({ id: "b1", calendar_id: "cal-1", start_at: todayAt(10), end_at: todayAt(11) })];
    mount();
    expect(chip(/Discovery call/)).toBeTruthy();
    click(buttonByText(/Consults/));
    expect(chip(/Discovery call/)).toBeNull();
  });
});

describe("Solo Calendar — conflicts are measured, never asserted", () => {
  it("counts a real overlap in the notice", () => {
    state.bookings = [
      booking({ id: "b1", start_at: todayAt(10), end_at: todayAt(11) }),
      booking({ id: "b2", title: "Review", start_at: todayAt(10, 30), end_at: todayAt(11, 30) }),
    ];
    expect(findConflicts(state.bookings).size).toBe(2);
    mount();
    expect(text()).toMatch(/2 appointments overlap another on the same host/i);
  });

  it("marks only the overlapping chips", () => {
    state.bookings = [
      booking({ id: "b1", start_at: todayAt(10), end_at: todayAt(11) }),
      booking({ id: "b2", title: "Review", start_at: todayAt(10, 30), end_at: todayAt(11, 30) }),
      booking({ id: "b3", title: "Clear one", start_at: todayAt(15), end_at: todayAt(16) }),
    ];
    mount();
    expect(chip(/Discovery call/)?.className).toContain("sc-ev--conflict");
    expect(chip(/Clear one/)?.className).not.toContain("sc-ev--conflict");
  });
});

describe("Solo Calendar — the detail drawer", () => {
  function openDetail(over: Partial<SoloBooking> = {}) {
    state.bookings = [booking({
      id: "b1", start_at: todayAt(10), end_at: todayAt(11),
      guest_name: "A. Guest", host_full_name: "Owner", ...over,
    })];
    mount();
    const target = chip(/Discovery call/)!;
    target.focus();
    click(target);
    return target;
  }

  it("opens as an in-page dialog, not a detached browser window", () => {
    openDetail();
    const d = dialog();
    expect(d).toBeTruthy();
    expect(d?.getAttribute("aria-modal")).toBe("true");
    expect(d?.textContent).toContain("A. Guest");
    // A true pop-out would need a proven cross-window sync pattern; there is none.
    expect(d?.classList.contains("sc-drawer")).toBe(true);
  });

  it("closes on Escape and restores focus to the event that opened it", () => {
    const target = openDetail();
    expect(dialog()).toBeTruthy();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(target);
  });

  it("routes a status change through the tenant-gated seam", () => {
    openDetail();
    click(buttonByText(/Cancel appointment/i, document.body));
    expect(setStatus).toHaveBeenCalledWith("b1", "cancelled");
  });

  it("surfaces a refusal rather than reporting a change that did not happen", async () => {
    setStatus.mockResolvedValueOnce({ ok: false, message: "You can't change that booking." });
    openDetail();
    click(buttonByText(/No-show/i, document.body));
    await act(async () => { await Promise.resolve(); });
    expect(dialog()?.textContent).toContain("You can't change that booking.");
  });

  it("says 'Not recorded' rather than inventing a placeholder for absent detail", () => {
    openDetail({ guest_name: null, guest_email: null, host_full_name: null });
    expect(dialog()?.textContent).toContain("Not recorded");
  });

  it("names the overlap inside the drawer when this appointment is one", () => {
    state.bookings = [
      booking({ id: "b1", start_at: todayAt(10), end_at: todayAt(11) }),
      booking({ id: "b2", title: "Review", start_at: todayAt(10, 30), end_at: todayAt(11, 30) }),
    ];
    mount();
    click(chip(/Discovery call/));
    expect(dialog()?.textContent).toMatch(/overlaps another appointment on the same host/i);
  });
});

describe("Solo Calendar — no control is hidden at narrow widths", () => {
  // Found by the four-viewport capture: below the rail breakpoint the rail is
  // display:none, which made the calendar toggles, colour coding and settings
  // UNREACHABLE at 1024x768 and 900x1000. A responsive layout may move a control;
  // it may not delete it.
  it("offers a View options entry point that carries the rail's controls", () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" })];
    mount();
    const opener = buttonByText(/View options/i);
    expect(opener).toBeTruthy();
    expect(opener?.className).toContain("sc-options-btn");
    click(opener);
    const d = dialog();
    expect(d).toBeTruthy();
    // The SAME controls, not a reduced copy.
    expect(d?.textContent).toContain("Calendars");
    expect(d?.textContent).toContain("Consults");
    expect(d?.textContent).toContain("Colour by");
    expect(d?.textContent).toContain("Settings");
  });

  it("keeps the calendar toggle functional from inside that drawer", () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" })];
    state.bookings = [booking({ id: "b1", calendar_id: "cal-1", start_at: todayAt(10), end_at: todayAt(11) })];
    mount();
    click(buttonByText(/View options/i));
    click(buttonByText(/Consults/, document.body));
    expect(chip(/Discovery call/)).toBeNull();
  });

  it("restores focus to the View options button on Escape", () => {
    mount();
    const opener = buttonByText(/View options/i)!;
    opener.focus();
    click(opener);
    expect(dialog()).toBeTruthy();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

// Calendar settings — availability, booking rules, event types, colours, reminders —
// are Calendar-owned and live on the calendar itself. Connections owns whether an
// SMS-capable channel is connected and permitted. The two interweave at exactly one
// point: a Calendar-configured SMS reminder needs a channel Calendar does not own.
// These tests pin that seam in BOTH directions, because the failure mode is a
// standing link that quietly implies Connections owns scheduling.
// The compact state is driven by a container query, which jsdom does not evaluate — so
// these tests pin the two things that must be TRUE IN THE MARKUP for that query to be
// able to do its job, and the rendered-browser drive proves the swap itself at every
// required frame. Splitting it this way keeps each layer honest about what it can see.
describe("Solo Calendar — the chip survives a narrow column", () => {
  const withOne = () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: "#2E7D8F", type: "meeting" })];
    state.bookings = [booking({
      id: "b1", title: "Quarterly planning session with the onboarding team",
      start_at: todayAt(9), end_at: todayAt(10), calendar_id: "cal-1",
    })];
  };
  const weekChip = () => container.querySelector<HTMLButtonElement>("button.sc-ev--grid.sc-ev--compactable");

  it("names the chip explicitly, so the accessible name cannot shrink with the column", () => {
    withOne();
    mount();
    const chip = weekChip()!;
    // The visible text is width-dependent; the NAME is not. It must carry the title
    // and the time whether or not the title is the thing on screen.
    expect(chip.getAttribute("aria-label")).toMatch(/Quarterly planning session with the onboarding team/);
    expect(chip.getAttribute("aria-label")).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });

  it("carries a compact stand-in for the title in the week grid", () => {
    withOne();
    mount();
    const chip = weekChip()!;
    const compact = chip.querySelector(".sc-ev-compact");
    expect(compact, "the week chip needs something to swap in when the column starves").toBeTruthy();
    // It states the start time in the short form — "9a", "10a", "2:30p" — derived from
    // the same real start_at, never a placeholder. Measured reason for the short form:
    // "10:00 AM" overflowed the chip at the 520px mount, by 16.9px once a conflict flag
    // shared the row. ":00" is dropped on the hour; the minute is kept when it matters.
    expect(compact!.textContent).toMatch(/^\d{1,2}(:\d{2})?[ap]?$/i);
    // The full, unabbreviated time stays on the accessible name.
    expect(chip.getAttribute("aria-label")).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    // and it is hidden from assistive tech, because the aria-label already says it.
    expect(compact!.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks week and month chips as grid chips, and leaves the agenda alone", () => {
    withOne();
    mount();
    expect(weekChip(), "week chip should be a grid chip").toBeTruthy();

    click(buttonByText(/^Month$/));
    const monthChip = container.querySelector("button.sc-ev--grid");
    expect(monthChip, "month chip should be a grid chip").toBeTruthy();
    // The month chip already renders a time, so it needs no second stand-in.
    expect(monthChip!.classList.contains("sc-ev--compactable")).toBe(false);
    expect(monthChip!.querySelector(".sc-ev-time")).toBeTruthy();

    click(buttonByText(/^Agenda$/));
    // Agenda rows are 492px wide even at the tightest measured frame; compacting them
    // would remove readable text for no reason.
    expect(container.querySelector("button.sc-ev.sc-ev--grid")).toBeNull();
    expect(container.querySelector("button.sc-ev")).toBeTruthy();
  });

  it("keeps the conflict flag and the cancelled state independent of the swap", () => {
    state.calendars = [calendarMeta({ id: "cal-1", title: "Consults", color: "#2E7D8F", type: "meeting" })];
    state.bookings = [
      booking({ id: "x1", title: "One", start_at: todayAt(14), end_at: todayAt(15), calendar_id: "cal-1" }),
      booking({ id: "x2", title: "Two", start_at: todayAt(14, 30), end_at: todayAt(15, 30), calendar_id: "cal-1" }),
      booking({ id: "x3", title: "Gone", start_at: todayAt(11), end_at: todayAt(12), status: "cancelled", calendar_id: "cal-1" }),
    ];
    mount();
    // Both halves of a real overlap stay flagged, and the flag is not part of the
    // text that the compact treatment replaces.
    expect(container.querySelectorAll("button.sc-ev--conflict .sc-ev-flag").length).toBe(2);
    const off = container.querySelector("button.sc-ev--off");
    expect(off, "a cancelled booking keeps its own state class").toBeTruthy();
    expect(off!.getAttribute("aria-label")).toMatch(/cancelled/i);
  });
});

describe("Solo Calendar — calendar settings stay Calendar-owned", () => {
  const withNotify = (notify_config: unknown) => {
    state.calendars = [calendarMeta({
      id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting",
      notify_config,
    })];
  };
  const openConfig = () => {
    const cog = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => /How Consults is configured/i.test(b.getAttribute("aria-label") ?? ""));
    click(cog ?? null);
  };

  it("keeps no standing link out of the surface in the settings group", () => {
    mount();
    click(buttonByText(/^Settings$/));
    // A general signpost would read as though calendar configuration lived elsewhere.
    expect(container.querySelector('a[href="/solo/1/integrations"]')).toBeNull();
    expect(text()).toMatch(/Open a calendar's cog above/i);
  });

  it("reads confirmations and reminders off the calendar row", () => {
    withNotify({
      confirm_guest: true,
      confirm_host: false,
      reminders: [{ channel: "email", offset_min: 1440, to: "guest" }],
    });
    mount();
    openConfig();
    expect(text()).toMatch(/Confirmations and reminders/i);
    expect(text()).toMatch(/1 day before/i);
    expect(text()).toMatch(/Email · to the guest/i);
  });

  it("says a calendar stores no notification settings rather than showing the column default", () => {
    withNotify(null);
    mount();
    openConfig();
    expect(text()).toMatch(/stores no notification settings/i);
    expect(text()).toContain("UNAVAILABLE");
  });

  it("offers no Connections path when the stored reminders are email-only", () => {
    withNotify({ confirm_guest: true, confirm_host: true, reminders: [{ channel: "email", offset_min: 60, to: "guest" }] });
    mount();
    openConfig();
    expect(container.querySelector('a[href="/solo/1/integrations"]')).toBeNull();
  });

  it("offers the Connections remediation only when this calendar's own reminders ask for SMS", () => {
    withNotify({ confirm_guest: true, confirm_host: true, reminders: [{ channel: "sms", offset_min: 120, to: "guest" }] });
    mount();
    openConfig();
    const link = container.querySelector<HTMLAnchorElement>('a[href="/solo/1/integrations"]');
    expect(link?.textContent).toMatch(/Settings → Connections/);
    // It is a remediation for a channel, and says so — it never claims to know that
    // SMS is unavailable, because this surface does not read sending capability.
    expect(text()).toMatch(/SMS sending capability is not read here/i);
  });

  it("treats a 'both' reminder as asking for SMS too", () => {
    withNotify({ confirm_guest: true, confirm_host: true, reminders: [{ channel: "both", offset_min: 30, to: "both" }] });
    mount();
    openConfig();
    expect(container.querySelector('a[href="/solo/1/integrations"]')).toBeTruthy();
    expect(text()).toMatch(/Email and SMS · to guest and host/i);
  });
});

describe("Solo Calendar — a class is one appointment, not one per attendee", () => {
  /** The shape `list_team_bookings` really returns for a group booking: the
   *  session marker plus one `class_seat` per attendee, all on the same host at
   *  the same hour. */
  function groupBooking(seats: { id: string; name: string; email?: string; status?: string }[]) {
    return [
      booking({
        id: "class-1", title: "Group coaching", booking_kind: "class_session",
        capacity: 8, start_at: todayAt(10), end_at: todayAt(11),
      }),
      ...seats.map((s) =>
        booking({
          id: s.id, title: "Group coaching", booking_kind: "class_seat",
          class_session_id: "class-1", guest_name: s.name, guest_email: s.email ?? null,
          status: s.status ?? "scheduled", start_at: todayAt(10), end_at: todayAt(11),
        }),
      ),
    ];
  }

  it("draws the class once, however many people are booked into it", () => {
    state.bookings = groupBooking([
      { id: "seat-1", name: "Attendee One" },
      { id: "seat-2", name: "Attendee Two" },
      { id: "seat-3", name: "Attendee Three" },
    ]);
    mount();
    expect(container.querySelectorAll("button.sc-ev")).toHaveLength(1);
  });

  it("does not accuse the host of double-booking themselves with their own class", () => {
    state.bookings = groupBooking([
      { id: "seat-1", name: "Attendee One" },
      { id: "seat-2", name: "Attendee Two" },
    ]);
    mount();
    expect(container.querySelectorAll(".sc-ev--conflict")).toHaveLength(0);
    expect(text()).toMatch(/No overlapping appointments in this range/i);
  });

  it("lists the real attendees in the class detail", () => {
    state.bookings = groupBooking([
      { id: "seat-1", name: "Attendee One", email: "one@example.com" },
      { id: "seat-2", name: "Attendee Two", email: "two@example.com" },
    ]);
    mount();
    click(chip(/Group coaching/));
    const d = dialog();
    expect(d?.textContent).toMatch(/Who is booked/);
    expect(d?.textContent).toMatch(/Attendee One/);
    expect(d?.textContent).toMatch(/one@example\.com/);
    expect(d?.textContent).toMatch(/Attendee Two/);
    expect(d?.textContent).toMatch(/2 of 8 booked/);
  });

  it("keeps a cancelled attendee on the record without counting them as booked", () => {
    state.bookings = groupBooking([
      { id: "seat-1", name: "Attendee One" },
      { id: "seat-2", name: "Attendee Two", status: "cancelled" },
    ]);
    mount();
    click(chip(/Group coaching/));
    expect(dialog()?.textContent).toMatch(/1 of 8 booked/);
    expect(dialog()?.textContent).toMatch(/Attendee Two/);
  });

  it("says a class is empty rather than showing an authoritative-looking count", () => {
    state.bookings = [
      booking({
        id: "class-1", title: "Group coaching", booking_kind: "class_session",
        capacity: 8, start_at: todayAt(10), end_at: todayAt(11),
      }),
    ];
    mount();
    click(chip(/Group coaching/));
    expect(dialog()?.textContent).toMatch(/No attendee is booked into this session yet/i);
  });

  it("still flags a real clash between the class and a separate appointment", () => {
    state.bookings = [
      ...groupBooking([{ id: "seat-1", name: "Attendee One" }]),
      booking({ id: "solo", title: "Discovery call", start_at: todayAt(10, 30), end_at: todayAt(11, 30) }),
    ];
    mount();
    expect(container.querySelectorAll(".sc-ev--conflict")).toHaveLength(2);
  });
});

describe("Solo Calendar — an honest freshness state when a refresh fails", () => {
  /**
   * Console-only was the defect: the rows stayed on screen and nothing told the
   * owner they might no longer be true. Keeping the rows is right; letting them
   * read as current is not.
   */
  const staleRow = () => booking({ id: "b1", start_at: todayAt(10), end_at: todayAt(11) });

  it("says nothing at all while refreshes are succeeding", () => {
    state.bookings = [staleRow()];
    state.lastSyncedAt = new Date();
    mount();
    expect(text()).not.toMatch(/may be out of date/i);
    expect(buttonByText(/^Retry$/)).toBeNull();
  });

  it("says the calendar may be out of date, and keeps the appointments on screen", () => {
    state.bookings = [staleRow()];
    state.stale = true;
    mount();
    expect(text()).toMatch(/Calendar may be out of date/i);
    expect(text()).toMatch(/could not refresh the latest booking changes/i);
    // The rows are still there — the notice replaces nothing.
    expect(chip(/Discovery call/)).toBeTruthy();
  });

  it("announces the state politely rather than trapping or interrupting", () => {
    state.bookings = [staleRow()];
    state.stale = true;
    mount();
    const live = container.querySelector('[role="status"]');
    expect(live, "the freshness state must be announced to assistive tech").toBeTruthy();
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.textContent).toMatch(/Calendar may be out of date/i);
  });

  it("offers a real Retry that drives the real refresh", () => {
    state.bookings = [staleRow()];
    state.stale = true;
    mount();
    const btn = buttonByText(/^Retry$/);
    expect(btn, "a stale calendar must offer a way back").toBeTruthy();
    click(btn);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("names a last-updated time only when a real one exists", () => {
    state.bookings = [staleRow()];
    state.stale = true;
    state.lastSyncedAt = null;
    mount();
    // No successful refresh has ever landed — inventing "just now" would be the lie.
    expect(text()).toMatch(/Calendar may be out of date/i);
    expect(text()).not.toMatch(/Last updated/i);

    act(() => root.unmount());
    container.remove();

    state.lastSyncedAt = new Date();
    mount();
    expect(text()).toMatch(/Last updated/i);
  });

  it("drops the notice once the calendar is fresh again", () => {
    state.bookings = [staleRow()];
    state.stale = true;
    mount();
    expect(text()).toMatch(/Calendar may be out of date/i);

    act(() => root.unmount());
    container.remove();

    state.stale = false;
    state.lastSyncedAt = new Date();
    mount();
    expect(text()).not.toMatch(/may be out of date/i);
    expect(buttonByText(/^Retry$/)).toBeNull();
  });
});
