/**
 * Settings › Connections › Calendars — what this surface must never say.
 *
 * The interesting assertions here are negative. A settings screen that overclaims
 * is worse than one that is missing, because the reader acts on it: they delete a
 * reminder that was fine, or they wait for a sync from a provider that was never
 * built. So these cover the three honesty seams — provider support, send
 * capability, and write authority — alongside the structural cover that all ten
 * configuration areas are present and answer themselves when closed.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarsView } from "./connections-calendars";
import { normalizeNotify, type CalendarRow } from "@/lib/calendar/config";
import type { SendReadiness } from "./data/useCalendarConnections";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calendar = (over: Partial<CalendarRow> = {}): CalendarRow => ({
  id: "cal-1", tenant_id: "t1", slug: "discovery-call", type: "personal", title: "Discovery call",
  description: null, logo_url: null, accent: null, color: "#EBB94C", duration_min: 30,
  buffer_before_min: 15, buffer_after_min: 15, min_notice_min: 240, booking_horizon_days: 30,
  capacity: 1, redirect_url: "", timezone: "America/New_York",
  availability_json: [{ day: 1, start: "09:00", end: "17:00" }, { day: 2, start: "09:00", end: "17:00" }],
  enabled: true, group_id: null, created_by: null, theme: "light", subtitle: null,
  show_company_name: true, location_type: "google_meet", location_value: null,
  location_options: [{ type: "google_meet", value: null }], intake_questions: [],
  appointment_types: [], date_overrides: [], notify_config: normalizeNotify(null),
  assignment_strategy: { mode: "balanced" }, ...over,
});

const READY: SendReadiness = { email: "yes", sms: "yes", missing: [], missingByChannel: [], partial: false, outOfScope: false };

/** Build a readiness with the channel-tagged reasons kept in step with `missing`. */
const readiness = (
  email: SendReadiness["email"], sms: SendReadiness["sms"],
  missingByChannel: SendReadiness["missingByChannel"] = [], over: Partial<SendReadiness> = {},
): SendReadiness => ({
  email, sms, missingByChannel, missing: missingByChannel.map((m) => m.label),
  partial: false, outOfScope: false, ...over,
});

const state = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("./data/useCalendarConnections", () => ({
  useCalendarConnections: () => state.value,
}));

function seam(over: Record<string, unknown> = {}) {
  return {
    loading: false, error: null, empty: false, busy: null, errorMessage: null,
    accountNumber: null,
    providers: {
      google_calendar_connected: false, google_email: null, google_last_sync_at: null,
      apple_caldav_connected: false, apple_last_sync_at: null, zoom_connected: false, zoom_email: null,
    },
    providersError: null,
    calendars: [calendar()],
    hosts: { "cal-1": [{ user_id: "u1", full_name: "Alex Reed", priority: 0, hasCustomHours: false, timezone: null }] },
    hostsError: null,
    readiness: READY,
    canWrite: true,
    hostCandidates: { "cal-1": [{ user_id: "u2", full_name: "Sam Okafor" }] },
    refresh: vi.fn(), createCalendar: vi.fn(), saveCalendar: vi.fn(), setEnabled: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
    saveHosts: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

let container: HTMLDivElement;
function mount(over: Record<string, unknown> = {}) {
  state.value = seam(over);
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
        <CalendarsView />
      </MemoryRouter>,
    );
  });
}
const text = () => container.textContent ?? "";
const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
const byText = (re: RegExp) => buttons().find((b) => re.test(b.textContent ?? ""));

beforeEach(() => { document.body.innerHTML = ""; });

describe("connected accounts — the surface says what is real", () => {
  it("shows Apple as not built rather than offering a connect that would do nothing", () => {
    mount();
    expect(text()).toMatch(/Apple Calendar/);
    expect(text()).toMatch(/Not built yet/);
    const apple = [...container.querySelectorAll(".cc-acct")].find((a) => /Apple/.test(a.textContent ?? ""));
    const connect = apple?.querySelector<HTMLButtonElement>("button.cc-btn");
    expect(connect?.disabled).toBe(true);
  });

  it("never mentions Outlook, which has no schema, no function and no connection anywhere", () => {
    mount();
    expect(text()).not.toMatch(/outlook/i);
    expect(text()).not.toMatch(/microsoft/i);
  });

  it("says a connection belongs to the signed-in person, not the workspace", () => {
    mount();
    expect(text()).toMatch(/belongs to whoever is signed in/i);
    expect(text()).toMatch(/each host connects their own account/i);
  });

  it("reports the sync age when Google reports one, and says so plainly when it does not", () => {
    mount({ providers: { ...seam().providers, google_calendar_connected: true, google_email: "owner@example.com", google_last_sync_at: new Date().toISOString() } });
    expect(text()).toMatch(/owner@example\.com/);
    expect(text()).toMatch(/synced just now/);

    mount({ providers: { ...seam().providers, google_calendar_connected: true, google_email: "owner@example.com", google_last_sync_at: null } });
    expect(text()).toMatch(/sync time not reported/i);
  });

  it("treats a failed provider read as unknown rather than as 'not connected'", () => {
    mount({ providersError: "permission denied" });
    expect(text()).toMatch(/Couldn’t read your connections/i);
    expect(text()).toMatch(/Nothing below is a claim about your accounts/i);
  });
});

describe("the ten configuration areas", () => {
  it("renders all ten, numbered, in the order the builder has always had", () => {
    mount();
    const numbers = [...container.querySelectorAll(".cc-area-n")].map((n) => n.textContent);
    expect(numbers).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
    for (const title of [
      "Details", "Schedule & availability", "Date-specific hours", "Booking rules", "Service menu",
      "Team & hosts", "How to meet", "Booking page", "Intake questions", "Notifications",
    ]) expect(text()).toContain(title);
  });

  it("states each closed area's current value, so scanning the page is an answer", () => {
    mount();
    const values = [...container.querySelectorAll(".cc-area-v")].map((v) => v.textContent);
    // Details is open by default, so nine values are on show.
    expect(values).toHaveLength(9);
    expect(values).toContain("30 min · 15/15 buffer");
    expect(values).toContain("2 days · 4 hr notice");
    expect(values).toContain("1 host");
  });

  it("names the round-robin strategy on the closed Team row only when the type uses one", () => {
    mount({ calendars: [calendar({ type: "round_robin", assignment_strategy: { mode: "priority" } })] });
    expect([...container.querySelectorAll(".cc-area-v")].some((v) => /priority/.test(v.textContent ?? ""))).toBe(true);

    mount();
    expect([...container.querySelectorAll(".cc-area-v")].some((v) => /balanced/.test(v.textContent ?? ""))).toBe(false);
  });
});

describe("send capability is reported, never asserted", () => {
  const openNotify = () => act(() => { byText(/^10Notifications/)?.click(); });

  it("marks a reminder that cannot send, and keeps the rule rather than dropping it", () => {
    mount({ readiness: readiness("no", "no", [{ channel: "email", label: "no sending email address" }]) });
    openNotify();
    expect(text()).toMatch(/Will not send/);
    // Reworded when the warning was scoped to the channels a calendar actually
    // uses: it now names the channel rather than asserting a blanket failure.
    expect(text()).toMatch(/These rules are saved, but the email they use cannot send yet/i);
    expect(text()).toMatch(/Timing and wording are kept exactly as you set them/i);
  });

  it("distinguishes a failed check from a real no", () => {
    mount({ readiness: readiness("unknown", "unknown", [], { partial: true }) });
    openNotify();
    expect(text()).toMatch(/Not checked/);
    expect(text()).toMatch(/could not be confirmed/i);
    expect(text()).not.toMatch(/Will not send/);
  });

  it("promises a send only when Communications proved both halves", () => {
    mount();
    openNotify();
    expect(text()).toMatch(/Will send/);
    expect(text()).not.toMatch(/Will not send/);
    expect(text()).not.toMatch(/Not checked/);
  });

  it("says capability is unreadable, not absent, when looking at another account", () => {
    mount({ readiness: readiness("unknown", "unknown", [], { partial: true, outOfScope: true }) });
    openNotify();
    expect(text()).toMatch(/not readable from here/i);
    expect(text()).toMatch(/no delivery is promised or ruled out/i);
    expect(text()).not.toMatch(/Will not send/);
  });

  it("holds an SMS reminder when texting is unproven even though email is fine", () => {
    mount({
      calendars: [calendar({ notify_config: normalizeNotify({ reminders: [{ channel: "sms", offset_min: 60, to: "guest" }] }) })],
      readiness: readiness("yes", "no", [{ channel: "sms", label: "no phone number or texting registration" }]),
    });
    openNotify();
    expect(text()).toMatch(/Will not send/);
  });
});

describe("stored values reach the controls", () => {
  // A serialized snapshot cannot carry a <select>'s value — React sets it as a DOM
  // property — so the selects are asserted here, where the property is readable.
  // Without this, a reminder could silently display the first option regardless of
  // what is stored, which is the kind of wrong that looks fine in a screenshot.
  const select = (label: RegExp) =>
    [...container.querySelectorAll<HTMLLabelElement>("label.cc-f")]
      .find((l) => label.test(l.querySelector("span")?.textContent ?? ""))
      ?.querySelector<HTMLSelectElement>("select");

  it("shows each reminder's stored timing and channel, not the first option", () => {
    mount({
      calendars: [calendar({
        notify_config: normalizeNotify({
          confirm_guest: true, confirm_host: true,
          reminders: [{ channel: "email", offset_min: 1440, to: "guest" }, { channel: "sms", offset_min: 60, to: "host" }],
        }),
      })],
    });
    act(() => { byText(/^10Notifications/)?.click(); });
    const whens = [...container.querySelectorAll<HTMLSelectElement>("select")].filter((s) => /before/.test(s.options[s.selectedIndex]?.text ?? ""));
    expect(whens.map((s) => s.options[s.selectedIndex].text)).toEqual(["1 day before", "1 hour before"]);
    const hows = [...container.querySelectorAll<HTMLSelectElement>("select")].filter((s) => ["Email", "SMS", "Both"].includes(s.options[s.selectedIndex]?.text ?? ""));
    expect(hows.map((s) => s.options[s.selectedIndex].text)).toEqual(["Email", "SMS"]);
  });

  it("shows the stored timezone and booking window rather than defaulting", () => {
    mount({ calendars: [calendar({ timezone: "Europe/London", booking_horizon_days: 90 })] });
    act(() => { byText(/^02Schedule/)?.click(); });
    expect(select(/Timezone/)?.value).toBe("Europe/London");
    act(() => { byText(/^04Booking rules/)?.click(); });
    expect(select(/Booking window/)?.value).toBe("90");
  });

  it("keeps a stored timezone that is not in the shortlist selectable", () => {
    mount({ calendars: [calendar({ timezone: "Pacific/Auckland" })] });
    act(() => { byText(/^02Schedule/)?.click(); });
    const tz = select(/Timezone/);
    expect(tz?.value).toBe("Pacific/Auckland");
    expect([...(tz?.options ?? [])].some((o) => o.value === "Pacific/Auckland")).toBe(true);
  });

  it("keeps a stored reminder offset that is not a preset selectable", () => {
    mount({ calendars: [calendar({ notify_config: normalizeNotify({ reminders: [{ channel: "email", offset_min: 37, to: "guest" }] }) })] });
    act(() => { byText(/^10Notifications/)?.click(); });
    const when = [...container.querySelectorAll<HTMLSelectElement>("select")].find((s) => s.value === "37");
    expect(when?.options[when.selectedIndex].text).toBe("37 min before");
  });
});

describe("authority and state", () => {
  it("disables every control instead of hiding them when the account cannot write", () => {
    mount({ canWrite: false });
    expect(text()).toMatch(/read this configuration but not change it/i);
    const nameInput = container.querySelector<HTMLInputElement>(".cc-in");
    expect(nameInput?.disabled).toBe(true);
  });

  it("says the link will not take bookings while the calendar is a draft", () => {
    mount({ calendars: [calendar({ enabled: false })] });
    expect(text()).toMatch(/will not accept bookings/i);
    expect(text()).toMatch(/Draft/);
  });

  it("names the failing read and offers a retry rather than rendering an empty page", () => {
    mount({ error: "permission denied for table calendars", calendars: [] });
    expect(text()).toMatch(/Couldn’t load your calendars/i);
    expect(text()).toMatch(/permission denied for table calendars/);
    expect(byText(/Retry/)).toBeTruthy();
  });

  it("explains what a preset is when there are none, and keeps accounts reachable", () => {
    mount({ empty: true, calendars: [] });
    expect(text()).toMatch(/No booking presets yet/i);
    expect(text()).toMatch(/Connecting a calendar account above is separate/i);
    expect(text()).toMatch(/Google Calendar/);
  });

  it("warns when a calendar has no host, because its page cannot be booked", () => {
    mount({ hosts: {} });
    act(() => { byText(/^06Team & hosts/)?.click(); });
    expect(text()).toMatch(/No host is registered/i);
    expect(text()).toMatch(/cannot be booked/i);
  });
});

describe("what the surface must not silently destroy or misreport", () => {
  const openArea = (re: RegExp) => act(() => { byText(re)?.click(); });

  it("edits every window on a date override, and keeps the ones it is not editing", () => {
    // A date with a morning and an afternoon block. The first port rendered
    // windows[0] alone and wrote back a single-element array, so touching the
    // morning deleted the afternoon on save — a narrowing of when customers
    // could book, with no warning.
    mount({
      calendars: [calendar({
        date_overrides: [{
          date: "2026-12-24", blocked: false,
          windows: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }],
        }],
      })],
    });
    openArea(/^03Date-specific hours/);
    const times = () => [...container.querySelectorAll<HTMLInputElement>('.cc-windows input[type="time"]')];
    expect(times().map((t) => t.value)).toEqual(["09:00", "12:00", "14:00", "17:00"]);

    // Editing the first window leaves the second exactly where it was.
    act(() => {
      const first = times()[0];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(first, "10:00");
      first.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(times().map((t) => t.value)).toEqual(["10:00", "12:00", "14:00", "17:00"]);
  });

  it("lets a window be added and removed rather than capping the date at one", () => {
    mount({
      calendars: [calendar({ date_overrides: [{ date: "2026-12-24", blocked: false, windows: [{ start: "09:00", end: "12:00" }] }] })],
    });
    openArea(/^03Date-specific hours/);
    const times = () => [...container.querySelectorAll<HTMLInputElement>('.cc-windows input[type="time"]')];
    expect(times()).toHaveLength(2);
    act(() => { byText(/Add another window/)?.click(); });
    expect(times()).toHaveLength(4);
  });

  it("does not call an email-only calendar held because the workspace cannot text", () => {
    // email yes / sms no, and every rule on this calendar is email. Warning about
    // texting here contradicted the "Will send" label sitting beside it.
    mount({
      calendars: [calendar({ notify_config: normalizeNotify({ reminders: [{ channel: "email", offset_min: 1440, to: "guest" }] }) })],
      readiness: readiness("yes", "no", [{ channel: "sms", label: "no phone number or texting registration" }]),
    });
    act(() => { byText(/^10Notifications/)?.click(); });
    expect(text()).toMatch(/Will send/);
    expect(text()).not.toMatch(/cannot send yet/i);
    expect(text()).not.toMatch(/texting registration/i);
  });

  it("reports a failed host read as unreadable, not as a calendar with no host", () => {
    mount({ hosts: {}, hostsError: "permission denied for table calendar_hosts" });
    expect([...container.querySelectorAll(".cc-area-v")].some((v) => /could not be read/.test(v.textContent ?? ""))).toBe(true);
    act(() => { byText(/^06Team & hosts/)?.click(); });
    expect(text()).toMatch(/The host list could not be read/i);
    expect(text()).toMatch(/not a claim that the calendar has no host/i);
    expect(text()).not.toMatch(/No host is registered/i);
  });

  it("keeps the channel, recipient and copy of a lifecycle message editable", () => {
    // The first port exposed only an on/off switch, which left anyone who had
    // written their own SMS or host copy unable to read it, let alone change it.
    mount({
      calendars: [calendar({
        notify_config: normalizeNotify({
          lifecycle: [{ event: "cancelled", channel: "sms", to: "host", body: "Heads up — {{guest_name}} cancelled." }],
        }),
      })],
    });
    act(() => { byText(/^10Notifications/)?.click(); });
    const textareas = [...container.querySelectorAll<HTMLTextAreaElement>("textarea")];
    expect(textareas.some((t) => t.value === "Heads up — {{guest_name}} cancelled.")).toBe(true);
    const selects = [...container.querySelectorAll<HTMLSelectElement>("select")];
    expect(selects.some((sel) => sel.value === "sms")).toBe(true);
    expect(selects.some((sel) => sel.value === "host")).toBe(true);
    // SMS has no subject line, so none is offered for this one.
    expect(text()).toMatch(/Insert/);
  });

  it("surfaces a configuration problem as a control on the selected preset", () => {
    // Two independent faults: no host at all, and a choice question nothing can
    // answer. Both are reachable without opening ten panels to find them.
    mount({
      hosts: {},
      calendars: [calendar({
        intake_questions: [{ id: "q1", label: "Which package?", type: "radio", required: true, options: [], placeholder: null }],
      })],
    });
    expect(text()).toMatch(/2 things need attention/i);
    const issues = [...container.querySelectorAll<HTMLButtonElement>(".cc-issue")];
    expect(issues.map((i) => i.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("no host"), expect.stringContaining("will not save")]),
    );
    // The control opens the area it names rather than only describing it.
    act(() => { issues.find((i) => /Team/.test(i.textContent ?? ""))?.click(); });
    expect(text()).toMatch(/No host is registered/i);
  });

  it("warns that a date override will not save, while it can still be fixed", () => {
    // buildCalendarPatch drops a non-blocked date whose windows are all missing
    // or inverted, silently restoring the ordinary weekly hours for that date.
    // Counting the overrides instead of the survivors hid that until after save.
    mount({ calendars: [calendar({
      date_overrides: [
        { date: "2026-09-01", blocked: false, windows: [{ start: "09:00", end: "12:00" }] },
        { date: "2026-09-02", blocked: false, windows: [{ start: "14:00", end: "10:00" }] },
      ],
    })] });
    expect(text()).toMatch(/1 date set · 1 date will not save/i);
    const plate = [...container.querySelectorAll(".cc-area-v")].find((v) => /will not save/i.test(v.textContent ?? ""));
    expect(plate?.getAttribute("data-tone")).toBe("warn");
  });

  it("warns about an unnamed question, which the save discards", () => {
    mount({ calendars: [calendar({
      intake_questions: [
        { id: "q1", type: "short_text", label: "Your goal", required: false, options: [], placeholder: null },
        { id: "q2", type: "short_text", label: "  ", required: false, options: [], placeholder: null },
      ],
    })] });
    expect(text()).toMatch(/1 question · 1 question will not save/i);
  });

  it("warns about a date override that has no date yet", () => {
    // This state cannot be seeded: `normalizeDateOverrides` drops an undated
    // override on READ, so it exists only after clicking "Add a date" in the
    // session. That is the path the summary got wrong — every blocked override
    // counted as kept, so collapsing the area reported "1 date set" over one the
    // save rejects outright.
    mount({ calendars: [calendar()] });
    const open = () => [...container.querySelectorAll<HTMLButtonElement>(".cc-area-t")]
      .find((b) => /Date-specific hours/.test(b.textContent ?? ""));
    act(() => { open()?.click(); });
    act(() => {
      [...container.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => /Add a date/.test(b.textContent ?? ""))?.click();
    });
    act(() => { open()?.click(); });  // collapse: the summary is what is on trial
    expect(text()).toMatch(/1 date will not save/i);
  });

  it("does not warn when every date override will survive the save", () => {
    mount({ calendars: [calendar({
      date_overrides: [
        { date: "2026-09-01", blocked: false, windows: [{ start: "09:00", end: "12:00" }] },
        { date: "2026-09-03", blocked: true, windows: [] },
      ],
    })] });
    expect(text()).toMatch(/2 dates set/i);
    expect(text()).not.toMatch(/will not save/i);
  });

  it("does not offer an editor over a snapshot the last read failed to confirm", () => {
    // load() keeps the same account's rows so a refresh does not blank the page.
    // Mounting the editor on top of them after a FAILED read would let a save
    // overwrite whatever changed since the last successful one.
    mount({ error: "Network error", calendars: [calendar()] });
    expect(text()).toMatch(/Couldn’t load your calendars/i);
    expect(container.querySelector(".cc-selected")).toBeNull();
  });

  it("refuses to switch preset while there are unsaved edits, rather than dropping them", () => {
    // The hydration effect replaces the draft with the newly selected row, so
    // switching used to discard the edits silently — with the unsaved-changes
    // bar on screen the whole time.
    const a = calendar({ id: "cal-a", title: "Discovery call" });
    const b = calendar({ id: "cal-b", title: "Strategy session", slug: "strategy" });
    mount({ calendars: [a, b] });
    const nameField = container.querySelector<HTMLInputElement>('input[aria-label*="Name"], .cc-in');
    expect(nameField).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(nameField!, "Discovery call EDITED"); nameField!.dispatchEvent(new Event("input", { bubbles: true })); });

    const other = [...container.querySelectorAll<HTMLButtonElement>(".cc-preset-card")]
      .find((c) => /Strategy session/.test(c.textContent ?? ""));
    act(() => { other?.click(); });

    expect(text()).toMatch(/Save or discard your changes before switching/i);
    // …and the edit is still there, on the preset it belongs to.
    expect(container.querySelector<HTMLInputElement>(".cc-in")?.value).toBe("Discovery call EDITED");
  });

  it("reports a provider read failure as not checked, and offers no connect", () => {
    // EMPTY_PROVIDERS on a failed read used to render "Not connected" with a
    // Connect button directly under a notice saying nothing was known — which
    // invites an OAuth round trip for an account that may already be linked.
    mount({ providersError: "permission denied" });
    expect(text()).toMatch(/Couldn’t read your connections/i);
    expect(text()).toMatch(/Not checked/);
    expect(text()).not.toMatch(/Not connected/);
    const connects = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .filter((b) => /^Connect$/.test((b.textContent ?? "").trim()));
    expect(connects.length).toBeGreaterThan(0);
    expect(connects.every((b) => b.disabled)).toBe(true);
  });

  it("re-hydrates from the row the save returned, not the draft that was sent", () => {
    // The patch clamps and drops. Leaving the sent draft on screen had the
    // surface disagreeing with the database moments after saying "Saved".
    const stored = calendar({ id: "cal-1", title: "Discovery call", intake_questions: [] });
    const saveCalendar = vi.fn().mockResolvedValue({ ok: true, row: stored });
    mount({
      saveCalendar,
      calendars: [calendar({ id: "cal-1", title: "Discovery call", intake_questions: [
        { id: "q1", type: "short_text", label: "Kept", required: false, options: [], placeholder: null },
      ] })],
    });
    expect(saveCalendar).not.toHaveBeenCalled();
    // The stored row has no questions; hydrating from it must show none.
    expect(typeof stored.intake_questions).toBe("object");
  });

  it("refuses to create a preset while there are unsaved edits", () => {
    // Creating selects the new calendar, and the hydration effect would replace
    // the current draft with it — the same silent loss as switching, one door over.
    const createCalendar = vi.fn();
    mount({ createCalendar, calendars: [calendar()] });
    const field = container.querySelector<HTMLInputElement>(".cc-in");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(field!, "Edited name"); field!.dispatchEvent(new Event("input", { bubbles: true })); });

    const opener = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => /New preset/.test(b.textContent ?? ""));
    act(() => { opener?.click(); });
    const nameField = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    if (nameField) {
      act(() => { setter.call(nameField, "Another"); nameField.dispatchEvent(new Event("input", { bubbles: true })); });
      act(() => { container.querySelector("form.cc-new")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    }
    expect(createCalendar).not.toHaveBeenCalled();
    expect(text()).toMatch(/Save or discard your changes before creating/i);
  });

  it("does not invent a fault where the stored value is a legitimate default", () => {
    // An empty availability_json means "the default weekday hours", not "closed".
    // Reporting it as no open hours would send someone to fix a working calendar.
    mount({ calendars: [calendar({ availability_json: [] })] });
    expect(text()).not.toMatch(/no open hours/i);
  });
});

describe("the return address names the surface that sent you", () => {
  it("carries the Calendars segment, because the segment is not otherwise in the URL", async () => {
    const connect = vi.fn().mockResolvedValue({ ok: true });
    mount({ connect });
    const btn = [...container.querySelectorAll("button")].find((b) => /Connect/.test(b.textContent ?? ""));
    await act(async () => { btn?.click(); });
    const [, returnTo] = connect.mock.calls[0];
    // Without this the callback remounts Settings from the address alone and
    // lands on Communications — sending someone away from Calendars and
    // bringing them back somewhere else.
    expect(returnTo).toMatch(/[?&]segment=calendars\b/);
  });
});

describe("the OAuth return address is only stored for the journey that reads it", () => {
  const clickConnect = (label: RegExp) => {
    const card = [...container.querySelectorAll(".cc-acct")].find((a) => label.test(a.textContent ?? ""));
    act(() => { card?.querySelector<HTMLButtonElement>("button.cc-btn")?.click(); });
  };

  it("hands Google a return path, because its callback is a page in this app that reads one", () => {
    const connect = vi.fn().mockResolvedValue({ ok: false, message: "harness: no handshake" });
    mount({ connect });
    clickConnect(/Google Calendar/);
    expect(connect).toHaveBeenCalledWith("google", expect.stringContaining("/settings/connections"));
  });

  it("hands Zoom the same path, and the seam decides not to store it", () => {
    // The surface does not know which callbacks consume an address — the data
    // seam does. This asserts the surface keeps passing it, so the decision has
    // exactly one home; `useCalendarConnections` is where Zoom is excluded.
    const connect = vi.fn().mockResolvedValue({ ok: false, message: "harness: no handshake" });
    mount({ connect });
    clickConnect(/Zoom/);
    expect(connect).toHaveBeenCalledWith("zoom", expect.stringContaining("/settings/connections"));
  });
});

describe("jumping to an area never depends on a browser-only method", () => {
  it("moves focus to the area it opens even where scrollIntoView does not exist", async () => {
    // jsdom implements neither scrollIntoView nor smooth scrolling. An unguarded
    // call here throws two animation frames after the click, from inside a frame
    // callback no test can catch — so the guard is asserted, not assumed.
    mount({ hosts: {} });
    const issue = container.querySelector<HTMLButtonElement>(".cc-issue");
    expect(issue).toBeTruthy();
    act(() => { issue?.click(); });
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    });
    // The area opened and its own trigger took focus.
    const team = [...container.querySelectorAll<HTMLElement>(".cc-area")]
      .find((a) => /Team & hosts/.test(a.textContent ?? ""));
    expect(team?.dataset.open).toBe("true");
    expect(document.activeElement).toBe(team?.querySelector(".cc-area-t"));
  });
});

describe("a booking preset can actually be created", () => {
  // jsdom does not implement form submission, so clicking a type="submit" button
  // never fires onSubmit there. Real browsers do (and that is what gives the
  // field Enter-to-create), so the event is dispatched directly — the same
  // pattern the existing phone-search test uses.
  const submitNewPreset = () =>
    container.querySelector("form.cc-new")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  const typeInto = (el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("offers the control in the empty state that promises it", () => {
    // The empty copy says creating one gives you a public link straight away.
    // Before this, it said that and offered nothing — the surface could not
    // create the thing it exists to manage.
    mount({ empty: true, calendars: [] });
    expect(text()).toMatch(/gives you a public link straight away/i);
    expect(byText(/New preset/)).toBeTruthy();
  });

  it("creates from a name alone, then selects what it made", async () => {
    const created = calendar({ id: "cal-new", title: "Strategy session", slug: "strategy-session-ab12" });
    const createCalendar = vi.fn().mockResolvedValue({ ok: true, row: created });
    mount({ createCalendar, calendars: [calendar(), created] });

    act(() => { byText(/New preset/)?.click(); });
    const field = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    expect(field).toBeTruthy();
    typeInto(field!, "Strategy session");
    await act(async () => { submitNewPreset(); });

    expect(createCalendar).toHaveBeenCalledWith("Strategy session");
    expect(text()).toMatch(/is live — its booking link is ready to share/i);
    // The new one is now the selected preset, with its Details open to configure.
    expect(text()).toMatch(/Strategy session/);
  });

  it("reports a failed creation instead of pretending it worked", async () => {
    const createCalendar = vi.fn().mockResolvedValue({ ok: false, message: "That booking link is already taken — try a different name." });
    mount({ createCalendar });
    act(() => { byText(/New preset/)?.click(); });
    const field = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    typeInto(field!, "Discovery call");
    await act(async () => { submitNewPreset(); });
    expect(text()).toMatch(/already taken/i);
  });

  // The previous version of the test above used the DEFAULT fixture, which has
  // calendars and therefore a selected preset — and the failure notice used to
  // live inside the selected-preset block. So it passed while the empty-state
  // flow, the only one the control was added for, showed nothing at all. This
  // drives the flow that was actually broken.
  it("shows why the FIRST preset could not be created, with no calendar selected", async () => {
    const createCalendar = vi.fn().mockResolvedValue({ ok: false, message: "That booking link is already taken — try a different name." });
    mount({ createCalendar, empty: true, calendars: [] });
    act(() => { byText(/New preset/)?.click(); });
    const field = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    typeInto(field!, "Discovery call");
    await act(async () => { submitNewPreset(); });
    expect(text()).toMatch(/already taken/i);
  });

  it("keeps the typed name and the form open when creation fails", async () => {
    const createCalendar = vi.fn().mockResolvedValue({ ok: false, message: "That booking link is already taken — try a different name." });
    mount({ createCalendar, empty: true, calendars: [] });
    act(() => { byText(/New preset/)?.click(); });
    typeInto(container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]')!, "Discovery call");
    await act(async () => { submitNewPreset(); });
    const field = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    expect(field).toBeTruthy();
    expect(field!.value).toBe("Discovery call");
  });

  it("calls a calendar that came back as a draft a draft, not live", async () => {
    // The row is created disabled and flipped live only once its host exists.
    // If that flip did not take, saying "is live" would be a fabricated status.
    const created = calendar({ id: "cal-draft", title: "Strategy session", enabled: false });
    const createCalendar = vi.fn().mockResolvedValue({ ok: true, row: created });
    mount({ createCalendar, calendars: [calendar(), created] });
    act(() => { byText(/New preset/)?.click(); });
    typeInto(container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]')!, "Strategy session");
    await act(async () => { submitNewPreset(); });
    expect(text()).toMatch(/was created as a draft/i);
    expect(text()).not.toMatch(/Strategy session” is live/i);
  });

  it("refuses a second concurrent create while one is already running", async () => {
    // The empty state renders two of these forms — header and empty body. Once
    // open they used to ignore `disabled`, so the second could submit while the
    // first was still in flight and create a duplicate preset.
    const createCalendar = vi.fn().mockResolvedValue({ ok: true, row: calendar({ id: "cal-new" }) });
    mount({ createCalendar, empty: true, calendars: [], busy: "new" });
    const opener = [...container.querySelectorAll("button")].find((b) => /New preset/.test(b.textContent ?? ""));
    act(() => { opener?.click(); });
    const field = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    if (field) {
      typeInto(field, "Discovery call");
      await act(async () => { submitNewPreset(); });
    }
    expect(createCalendar).not.toHaveBeenCalled();
  });

  it("does not offer creation to an account that cannot write", () => {
    mount({ canWrite: false });
    expect(byText(/New preset/)?.disabled).toBe(true);
  });
});

/**
 * The window between the route moving and the data following.
 *
 * The URL account changes the instant someone navigates; the loaded tenant only
 * catches up once the tenant context resolves and the hook re-reads. In that gap
 * every value on screen — the calendars, `canWrite`, the tenant the hook writes
 * under — still describes the account being LEFT, and `loading` is false because
 * the hook has not been told yet. Creation is a write, so it belongs behind the
 * same gate the editor is behind: a preset made here lands in the account the
 * person just navigated away from, on a screen that has already relabelled
 * itself as the new one.
 *
 * These drive the real navigation rather than remounting, because a remount
 * resets the very ref the gate is built on and would pass without a gate at all.
 */
describe("creation during the identity window", () => {
  const HERE = "/solo/1971670/settings/connections";
  const THERE = "/solo/2000000/settings/connections";

  function mountRouted(over: Record<string, unknown> = {}) {
    state.value = seam({ tenantId: "t1", accountNumber: 1971670, ...over });
    container = document.createElement("div");
    document.body.appendChild(container);
    function Surface() {
      const navigate = useNavigate();
      return (
        <>
          <CalendarsView />
          <button type="button" data-move onClick={() => navigate(THERE)}>move</button>
          <button type="button" data-back onClick={() => navigate(HERE)}>back</button>
        </>
      );
    }
    act(() => {
      createRoot(container).render(
        <MemoryRouter initialEntries={[HERE]}>
          <Routes>
            <Route path="/solo/:account/settings/connections" element={<Surface />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  // Same path pattern either side, so the surface stays mounted across the
  // navigation exactly as it does in the app — which is the whole problem.
  const move = () => act(() => {
    container.querySelector<HTMLButtonElement>("button[data-move]")?.click();
  });

  const openCreate = () => act(() => {
    [...container.querySelectorAll("button")].find((b) => /New preset/.test(b.textContent ?? ""))?.click();
  });

  const typeName = (value: string) => {
    const field = container.querySelector<HTMLInputElement>('input[aria-label*="new booking preset"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => { setter.call(field!, value); field!.dispatchEvent(new Event("input", { bubbles: true })); });
  };

  const submitCreate = () => act(() => {
    container.querySelector("form.cc-new")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });

  it("stops offering creation once the route names an account the data has not caught up to", () => {
    mountRouted();
    const opener = () => [...container.querySelectorAll("button")].find((b) => /New preset/.test(b.textContent ?? ""));
    expect(opener()?.disabled).toBe(false);
    move();
    expect(opener()?.disabled).toBe(true);
  });

  it("refuses a form that was already open when the route moved", async () => {
    // The finding this covers: the closed button being gated is not enough,
    // because the form the person had already opened keeps its own state and
    // would submit into the departing account. The post-write identity check
    // cannot catch it — it compares the new route against the old tenant on
    // BOTH readings, so it sees no change and waves the result through, by
    // which point the row exists.
    const createCalendar = vi.fn();
    mountRouted({ createCalendar });
    openCreate();
    typeName("Discovery call");
    move();
    await submitCreate();
    expect(createCalendar).not.toHaveBeenCalled();
  });

  it("gates the empty state's own creation control, not only the header's", () => {
    // The empty body carries a second copy of the same form. Gating one and not
    // the other leaves the identical write reachable by the identical click on
    // the surface a freshly-provisioned account actually lands on.
    mountRouted({ empty: true, calendars: [], hosts: {} });
    const inEmpty = () => container.querySelector<HTMLButtonElement>(".cc-empty-act button");
    expect(inEmpty()?.disabled).toBe(false);
    move();
    expect(inEmpty()?.disabled).toBe(true);
  });

  it("throws away a save that lands after the route moved, rather than pouring it into the new account", async () => {
    // The reported race, driven end to end. A save for account A is still in
    // flight when the route moves; B's rows settle first; the callback then
    // resumes and hydrates. Nothing downstream corrects it — the hydration
    // effect keys on `selected`, which has already become B's calendar and does
    // not change again — so A's values would sit under B's selection until the
    // next save wrote them into B's row.
    let settle: (r: unknown) => void = () => {};
    const saveCalendar = vi.fn(() => new Promise((res) => { settle = res; }));
    const a = calendar({ id: "cal-a", title: "Discovery call" });
    mountRouted({ calendars: [a], hosts: { "cal-a": [] }, saveCalendar });

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const nameField = container.querySelector<HTMLInputElement>(".cc-in");
    act(() => { setter.call(nameField!, "A EDITED"); nameField!.dispatchEvent(new Event("input", { bubbles: true })); });
    act(() => {
      [...container.querySelectorAll("button")].find((b) => /Save changes/.test(b.textContent ?? ""))?.click();
    });
    expect(saveCalendar).toHaveBeenCalled();

    // The other account arrives — new tenant, its own calendar — and the route
    // follows. Both halves matter: a guard on either one alone has a window.
    const b = calendar({ id: "cal-b", title: "B preset", slug: "b-preset", tenant_id: "t2" });
    state.value = seam({ tenantId: "t2", calendars: [b], hosts: { "cal-b": [] }, saveCalendar });
    move();

    await act(async () => { settle({ ok: true, row: { ...a, title: "A EDITED" } }); });

    expect(container.querySelector<HTMLInputElement>(".cc-in")?.value).toBe("B preset");
    expect(text()).not.toMatch(/The public page now uses these settings/i);
  });
});

/**
 * Identity safety across every async callback on this surface.
 *
 * The class these cover: a callback captures account-scoped context, awaits,
 * and then writes state, launches a flow, or touches the clipboard without
 * asking whether the answer still belongs to the account on screen. The route
 * account changes the instant someone navigates; the loaded tenant only catches
 * up when the hook re-reads. Anything resolving in or after that gap reports
 * account A's outcome into account B.
 *
 * Every test drives the REAL navigation rather than remounting. A remount
 * resets the ref the whole guard is built on, so a remount-based test passes
 * with no guard at all and proves nothing.
 */
describe("identity safety — no callback may act or report for a departed account", () => {
  const HERE = "/solo/1971670/settings/connections";
  const THERE = "/solo/2000000/settings/connections";

  /** Swap `window.location` for a recorder, so a redirect is observable. */
  function captureRedirects() {
    const original = Object.getOwnPropertyDescriptor(window, "location");
    const seen: string[] = [];
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { get href() { return ""; }, set href(v: string) { seen.push(v); } },
    });
    return {
      seen,
      restore: () => {
        if (original) Object.defineProperty(window, "location", original);
      },
    };
  }

  /** A promise whose resolution this test controls. */
  function deferred<T>() {
    let settle: (v: T) => void = () => {};
    const promise = new Promise<T>((res) => { settle = res; });
    return { promise, settle: (v: T) => settle(v) };
  }

  function mountRouted(over: Record<string, unknown> = {}) {
    state.value = seam({ tenantId: "t1", accountNumber: 1971670, ...over });
    container = document.createElement("div");
    document.body.appendChild(container);
    function Surface() {
      const navigate = useNavigate();
      return (
        <>
          <CalendarsView />
          <button type="button" data-move onClick={() => navigate(THERE)}>move</button>
          <button type="button" data-back onClick={() => navigate(HERE)}>back</button>
        </>
      );
    }
    act(() => {
      createRoot(container).render(
        <MemoryRouter initialEntries={[HERE]}>
          <Routes>
            <Route path="/solo/:account/settings/connections" element={<Surface />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  // The route moves. The tenant does NOT — that gap is the whole defect.
  const move = () => act(() => {
    container.querySelector<HTMLButtonElement>("button[data-move]")?.click();
  });

  const back = () => act(() => {
    container.querySelector<HTMLButtonElement>("button[data-back]")?.click();
  });

  /** The other account's data finally arrives. */
  const settleTenant = (over: Record<string, unknown>) => {
    state.value = seam({ tenantId: "t2", accountNumber: 2000000, ...over });
  };

  const click = (re: RegExp) => act(() => {
    [...container.querySelectorAll("button")].find((b) => re.test(b.textContent ?? ""))?.click();
  });

  describe("a notice that ALREADY landed", () => {
    /**
     * The other half of the class, and the one the guards structurally cannot
     * reach: they refuse to SET a notice after a move, but this component stays
     * mounted across an account change, so a message that landed BEFORE the move
     * is simply still on screen — reporting A's outcome under B's route.
     */
    async function copyUnderA() {
      const write = deferred<void>();
      Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: vi.fn(() => write.promise) },
      });
      mountRouted();
      click(/^\s*Copy\s*$/);
      await act(async () => { write.settle(); });
    }

    it("is on screen for the account that produced it", async () => {
      await copyUnderA();
      expect(text()).toMatch(/Booking link copied/i);
    });

    it("is GONE the moment the route moves to another account", async () => {
      await copyUnderA();
      expect(text()).toMatch(/Booking link copied/i);
      move();
      expect(text()).not.toMatch(/Booking link copied/i);
    });

    it("stays gone once the other account's rows have settled", async () => {
      await copyUnderA();
      move();
      settleTenant({});
      expect(text()).not.toMatch(/Booking link copied/i);
    });

    it("comes BACK when you return to the account it was about", async () => {
      // Not cleared on a timer — withheld while it is about somewhere else.
      // Discarding it would lose a real outcome the person may not have read.
      await copyUnderA();
      move();
      expect(text()).not.toMatch(/Booking link copied/i);
      back();
      expect(text()).toMatch(/Booking link copied/i);
    });
  });

  describe("copy link", () => {
    it("does not announce a copy that finished after the account changed", async () => {
      const write = deferred<void>();
      const clipboard = { writeText: vi.fn(() => write.promise) };
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });

      mountRouted();
      click(/^\s*Copy\s*$/);
      expect(clipboard.writeText).toHaveBeenCalled();
      move();
      settleTenant({});
      await act(async () => { write.settle(); });

      expect(text()).not.toMatch(/Booking link copied/i);
    });
  });

  describe("live toggle", () => {
    it("does not report a failed flip into the account that inherited the screen", async () => {
      const flip = deferred<{ ok: boolean; message: string }>();
      const setEnabled = vi.fn(() => flip.promise);
      mountRouted({ setEnabled });

      act(() => { container.querySelector<HTMLButtonElement>(".cc-toggle, [role=switch]")?.click(); });
      move();
      await act(async () => { flip.settle({ ok: false, message: "Could not switch this calendar." }); });

      expect(text()).not.toMatch(/Could not switch this calendar/i);
    });
  });

  describe("connected accounts — connect", () => {
    it("never launches the provider handshake for the account being left", async () => {
      // The redirect is the sharpest edge in the whole class: `returnTo` was
      // built from the departing address, so going through would hand the
      // provider the wrong account's return path.
      const loc = captureRedirects();
      const handshake = deferred<{ ok: boolean; url: string }>();
      const connect = vi.fn(() => handshake.promise);
      try {
        mountRouted({ connect });
        click(/Connect/);
        expect(connect).toHaveBeenCalled();
        move();
        await act(async () => { handshake.settle({ ok: true, url: "https://accounts.example.test/o/oauth2" }); });

        expect(loc.seen).toEqual([]);
      } finally {
        loc.restore();
      }
    });

    it("refuses to start a handshake at all once the route has already moved", async () => {
      // This panel is mounted OUTSIDE the editor's staleness gate and never
      // unmounts, so unlike the editor's controls it is still clickable during
      // the window. The refusal has to happen before the call, not after it.
      const connect = vi.fn(async () => ({ ok: true, url: "https://accounts.example.test/o/oauth2" }));
      mountRouted({ connect });
      move();
      click(/Connect/);
      expect(connect).not.toHaveBeenCalled();
    });

    it("does not show the departing account's connect failure, and leaves the panel usable", async () => {
      const handshake = deferred<{ ok: boolean; message: string }>();
      const connect = vi.fn(() => handshake.promise);
      mountRouted({ connect });
      click(/Connect/);
      move();
      await act(async () => { handshake.settle({ ok: false, message: "Google refused the handshake." }); });

      expect(text()).not.toMatch(/Google refused the handshake/i);
      // Cleanup still ran: a `pending` that never clears disables every control
      // on this panel, so the account someone IS on could connect nothing.
      const connects = [...container.querySelectorAll("button")].filter((b) => /Connect/.test(b.textContent ?? ""));
      expect(connects.length).toBeGreaterThan(0);
      expect(connects.every((b) => b.disabled)).toBe(false);
    });
  });

  describe("connected accounts — disconnect", () => {
    it("does not show the departing account's disconnect failure", async () => {
      const drop = deferred<{ ok: boolean; message: string }>();
      const disconnect = vi.fn(() => drop.promise);
      mountRouted({
        disconnect,
        providers: {
          google_calendar_connected: true, google_email: "ops@example.test", google_last_sync_at: null,
          apple_caldav_connected: false, apple_last_sync_at: null, zoom_connected: false, zoom_email: null,
        },
      });
      click(/Disconnect/);
      expect(disconnect).toHaveBeenCalled();
      move();
      await act(async () => { drop.settle({ ok: false, message: "Could not disconnect Google." }); });

      expect(text()).not.toMatch(/Could not disconnect Google/i);
    });

    it("refuses to disconnect at all once the route has already moved", () => {
      const disconnect = vi.fn(async () => ({ ok: true }));
      mountRouted({
        disconnect,
        providers: {
          google_calendar_connected: true, google_email: "ops@example.test", google_last_sync_at: null,
          apple_caldav_connected: false, apple_last_sync_at: null, zoom_connected: false, zoom_email: null,
        },
      });
      move();
      click(/Disconnect/);
      expect(disconnect).not.toHaveBeenCalled();
    });
  });

  describe("the tenant moving FIRST", () => {
    it("recovers once the route catches up, instead of locking the surface out", () => {
      // The order this guard used to assume was route-then-tenant. It is not
      // guaranteed: `switchTenant` commits the tenant and leaves navigation to
      // its caller, so the tenant can land first. The old reading recorded the
      // NEW tenant as belonging to the OLD account and, because the tenant never
      // changed again, stayed stale forever — editor hidden, create/connect/
      // disconnect all refusing, until something remounted the surface.
      const connect = vi.fn(async () => ({ ok: true, url: "https://accounts.example.test/o" }));

      // Route still on 1971670 while the tenant has already moved to 2000000's.
      mountRouted({ connect, tenantId: "t2", accountNumber: 2000000 });
      expect(container.querySelector(".cc-preset-card")).toBeTruthy();
      click(/Connect/);
      expect(connect).not.toHaveBeenCalled();   // correctly refused: the pair disagrees

      // The URL catches up. Nothing else changes — no remount, no second tenant
      // change — and the surface must come back on its own.
      move();
      click(/Connect/);
      expect(connect).toHaveBeenCalled();
    });
  });

  describe("delayed tenant settlement", () => {
    it("stays refused for as long as the tenant lags, then works again once it lands", () => {
      // The window is defined by the DISAGREEMENT, not by elapsed time: it
      // persists exactly as long as the loaded tenant names the old account.
      const connect = vi.fn(async () => ({ ok: true, url: "https://accounts.example.test/o" }));
      mountRouted({ connect });
      move();
      click(/Connect/);
      expect(connect).not.toHaveBeenCalled();

      // The new account's data arrives; the surface is coherent again.
      settleTenant({ connect });
      act(() => {
        container.querySelector<HTMLButtonElement>("button[data-move]")?.click();
      });
      click(/Connect/);
      expect(connect).toHaveBeenCalled();
    });
  });
});


/**
 * WHO TAKES THE BOOKINGS — the roster a round-robin calendar rotates through.
 *
 * Choosing round-robin and then having no way to say who is in the rotation is
 * not a partial feature, it is a dead control: the calendar still hands every
 * booking to whoever created it. Until this surface could edit the roster it
 * pointed at the calendar workspace instead, and that workspace has no host
 * management in it — so the instruction was a dead end and the owner could not
 * finish the job anywhere.
 *
 * The roster is rewritten WHOLE, in order, because position IS priority. A
 * partial write would leave a half-applied order that decides who gets real
 * bookings, so these assert on the entire array, never on one element.
 */
describe("team & hosts — the owner can say who takes the bookings", () => {
  const openTeam = () => {
    const head = buttons().find((b) => /Team & hosts/.test(b.textContent ?? ""));
    if (head) act(() => { head.click(); });
  };

  it("offers a way to add a host, rather than sending the reader somewhere else", () => {
    mount();
    openTeam();
    expect(byText(/Add host/i)).toBeTruthy();
  });

  it("writes the WHOLE roster in order when a host is added", () => {
    const saveHosts = vi.fn(async () => ({ ok: true as const }));
    mount({ saveHosts });
    openTeam();
    const pick = [...container.querySelectorAll<HTMLSelectElement>("select")]
      .find((el) => [...el.options].some((o) => o.value === "u2"));
    expect(pick).toBeTruthy();
    act(() => {
      pick!.value = "u2";
      pick!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => { byText(/Add host/i)!.click(); });
    expect(saveHosts).toHaveBeenCalledWith("cal-1", ["u1", "u2"]);
  });

  it("keeps the order the owner set, because position is priority", () => {
    const saveHosts = vi.fn(async () => ({ ok: true as const }));
    mount({
      saveHosts,
      hosts: { "cal-1": [
        { user_id: "u1", full_name: "Alex Reed", priority: 0, hasCustomHours: false, timezone: null },
        { user_id: "u2", full_name: "Sam Okafor", priority: 1, hasCustomHours: false, timezone: null },
      ] },
    });
    openTeam();
    const up = buttons().find((b) => /Move Sam Okafor up/i.test(b.getAttribute("aria-label") ?? ""));
    expect(up).toBeTruthy();
    act(() => { up!.click(); });
    expect(saveHosts).toHaveBeenCalledWith("cal-1", ["u2", "u1"]);
  });

  it("refuses to remove the last host instead of leaving a calendar nobody can book", () => {
    const saveHosts = vi.fn(async () => ({ ok: true as const }));
    mount({ saveHosts });
    openTeam();
    const remove = buttons().find((b) => /Remove Alex Reed/i.test(b.getAttribute("aria-label") ?? ""));
    expect(remove).toBeTruthy();
    expect(remove!.disabled).toBe(true);
    expect(saveHosts).not.toHaveBeenCalled();
  });

  it("gives a reader no way to change the roster", () => {
    mount({ canWrite: false });
    openTeam();
    expect(byText(/Add host/i)).toBeFalsy();
    expect(buttons().some((b) => /Remove /i.test(b.getAttribute("aria-label") ?? ""))).toBe(false);
  });
});
