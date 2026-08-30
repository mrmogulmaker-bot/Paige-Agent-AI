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
import { MemoryRouter } from "react-router-dom";
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
    refresh: vi.fn(), saveCalendar: vi.fn(), setEnabled: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
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
      expect.arrayContaining([expect.stringContaining("no host"), expect.stringContaining("unanswerable")]),
    );
    // The control opens the area it names rather than only describing it.
    act(() => { issues.find((i) => /Team/.test(i.textContent ?? ""))?.click(); });
    expect(text()).toMatch(/No host is registered/i);
  });

  it("does not invent a fault where the stored value is a legitimate default", () => {
    // An empty availability_json means "the default weekday hours", not "closed".
    // Reporting it as no open hours would send someone to fix a working calendar.
    mount({ calendars: [calendar({ availability_json: [] })] });
    expect(text()).not.toMatch(/no open hours/i);
  });
});
