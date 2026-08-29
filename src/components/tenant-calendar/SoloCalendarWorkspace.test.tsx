import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoloBooking, SoloCalendarMeta } from "./useSoloCalendar";
import { findConflicts } from "./useSoloCalendar";

const setStatus = vi.fn(async () => ({ ok: true }) as { ok: boolean; message?: string });
const createBooking = vi.fn(async () => ({ ok: true }) as { ok: boolean; message?: string });
const refresh = vi.fn();

const state: {
  bookings: SoloBooking[];
  calendars: SoloCalendarMeta[];
  phase: "loading" | "ready" | "error";
  error: string | null;
} = { bookings: [], calendars: [], phase: "ready", error: null };

// Only the DATA BOUNDARY is faked. The component's rendering, drawer, keyboard
// handling and focus restoration are the real shipped code; the hook's own
// range/label/conflict logic is tested against the real implementation next door.
vi.mock("./useSoloCalendar", async () => {
  const actual = await vi.importActual<typeof import("./useSoloCalendar")>("./useSoloCalendar");
  return {
    ...actual,
    useSoloCalendar: () => ({
      bookings: state.bookings,
      calendars: state.calendars,
      conflicts: actual.findConflicts(state.bookings),
      phase: state.phase,
      error: state.error,
      calendarsError: null,
      refresh,
      setStatus,
      createBooking,
      colorForBooking: (b: SoloBooking) => {
        const c = state.calendars.find((x) => x.id === b.calendar_id);
        return c?.color || c?.accent || actual.DEFAULT_CALENDAR_COLOR;
      },
    }),
  };
});

const { SoloCalendarWorkspace } = await import("./SoloCalendarWorkspace");

function booking(over: Partial<SoloBooking> & { id: string; start_at: string; end_at: string }): SoloBooking {
  return {
    title: "Discovery call", status: "scheduled", source: "manual",
    guest_name: null, guest_email: null, guest_phone: null, calendar_id: null,
    location_type: null, location_value: null, notes: null,
    booking_kind: "appointment", capacity: null,
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
    state.calendars = [{ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" }];
    state.bookings = [booking({ id: "b1", calendar_id: "cal-1", start_at: todayAt(10), end_at: todayAt(11) })];
    mount();
    expect(chip(/Discovery call/)?.getAttribute("style")).toContain("#2E7D8F");
  });

  it("falls back to the accent when a calendar stores no colour", () => {
    state.calendars = [{ id: "cal-1", title: "Consults", color: null, accent: "#8A5A9E", type: "meeting" }];
    state.bookings = [booking({ id: "b1", calendar_id: "cal-1", start_at: todayAt(10), end_at: todayAt(11) })];
    mount();
    expect(chip(/Discovery call/)?.getAttribute("style")).toContain("#8A5A9E");
  });

  it("lists the account's real calendars as toggles and hides their events when switched off", () => {
    state.calendars = [{ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" }];
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
    state.calendars = [{ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" }];
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
    state.calendars = [{ id: "cal-1", title: "Consults", color: "#2E7D8F", accent: null, type: "meeting" }];
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

describe("Solo Calendar — settings group", () => {
  it("defers connection state to Settings rather than inferring it", () => {
    mount();
    click(buttonByText(/^Settings$/));
    expect(text()).toMatch(/Provider status is not inferred here/i);
    expect(text()).toContain("UNAVAILABLE");
  });

  it("points the connections link at the one integrations home", () => {
    mount();
    click(buttonByText(/^Settings$/));
    const link = container.querySelector<HTMLAnchorElement>('a[href="/solo/1/integrations"]');
    expect(link?.textContent).toMatch(/Connections in Settings/i);
  });
});
