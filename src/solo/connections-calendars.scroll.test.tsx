/**
 * Settings › Connections › Calendars — the surface stays REACHABLE.
 *
 * The owner reported a P1 on First Sterling: the deployed Calendar page could
 * not be scrolled down to its content. Measured in the shell harness, this
 * surface renders 5,100–6,200px below the fold, so everything past the first
 * screen depends entirely on the scroll owner working. Two separate mechanisms
 * had to be wrong at once for it to fail, and each is locked here:
 *
 *   1. `SoloSettings` puts `tcs-main--settings-scrollbar-hidden` on the shell
 *      scroll owner for every Settings destination. That sets
 *      `scrollbar-width: none` AND collapses `::-webkit-scrollbar`, so on a
 *      genuinely long page a human sees no bar, gets no signal the page
 *      continues, and has nothing to drag. Owner policy (2026-08-31) makes
 *      Settings the authorized vertical-scroll class — its scrollbar stays.
 *   2. `.tcs-main` carries no `tabindex`, so it is not focusable. Keyboard
 *      scroll keys then go to <body>, which cannot scroll because
 *      `[data-tenant-shell]` is `overflow: hidden`. Space, PageDown and End did
 *      nothing at all from the arrival state.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. jsdom has no layout engine and no
 * scrollbars, so it cannot prove a human can scroll. It proves the two
 * MECHANISMS are present and correct. The rendered geometry — real content
 * height, real scroll travel, wheel, trackpad, keyboard and Tab travel at four
 * viewports in both themes — is proven separately by
 * `scripts/live-drive/calendar-settings-usable-drive.mjs` against the real
 * `SoloSettings` mounted in the real shell chain. Neither substitutes for the
 * other, and neither is authenticated production proof.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarsView } from "./connections-calendars";
import { SETTINGS_SCROLLBAR_SHOWN } from "./settings-scroll-owner";
import { normalizeNotify, type CalendarRow } from "@/lib/calendar/config";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calendar = (): CalendarRow => ({
  id: "cal-1", tenant_id: "t1", slug: "discovery-call", type: "personal", title: "Discovery call",
  description: null, logo_url: null, accent: null, color: "#EBB94C", duration_min: 30,
  buffer_before_min: 15, buffer_after_min: 15, min_notice_min: 240, booking_horizon_days: 30,
  capacity: 1, redirect_url: "", timezone: "America/New_York",
  availability_json: [{ day: 1, start: "09:00", end: "17:00" }],
  enabled: true, group_id: null, created_by: null, theme: "light", subtitle: null,
  show_company_name: true, location_type: "google_meet", location_value: null,
  location_options: [{ type: "google_meet", value: null }], intake_questions: [],
  appointment_types: [], date_overrides: [], notify_config: normalizeNotify(null),
  assignment_strategy: { mode: "balanced" },
});

const state = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./data/useCalendarConnections", () => ({ useCalendarConnections: () => state.value }));

const seam = (over: Record<string, unknown> = {}) => ({
  loading: false, error: null, empty: false, busy: null, errorMessage: null, accountNumber: null,
  providers: {
    google_calendar_connected: false, google_email: null, google_last_sync_at: null,
    apple_caldav_connected: false, apple_last_sync_at: null, zoom_connected: false, zoom_email: null,
  },
  providersError: null, calendars: [calendar()], hosts: {}, hostsError: null,
  readiness: { email: "yes", sms: "yes", missing: [], missingByChannel: [], partial: false, outOfScope: false },
  canWrite: true, hostCandidates: {},
  refresh: vi.fn(), createCalendar: vi.fn(), saveCalendar: vi.fn(), setEnabled: vi.fn(),
  connect: vi.fn(), disconnect: vi.fn(), saveHosts: vi.fn(async () => ({ ok: true as const })),
  ...over,
});

/**
 * The shell containment chain the surface actually renders inside, reduced to
 * the two elements that matter: the fixed-height, overflow-hidden shell, and
 * the one element that scrolls. This mirrors `tenant-command-center-shell.css`.
 */
function mountInShell(withScreenHost = true): { owner: HTMLElement; unmount: () => void } {
  state.value = seam();
  const shell = document.createElement("div");
  shell.setAttribute("data-tenant-shell", "");
  const shellMain = document.createElement("main");
  shellMain.id = "tenant-shell-main";
  shellMain.className = "tcs-main";
  shell.appendChild(shellMain);

  // `SoloApp`'s screen host, which is the element that actually scrolls a
  // document-flow route. Omitting it is what let an earlier harness measure
  // `#tenant-shell-main` -- an element with no scroll extent in the app.
  let owner = shellMain;
  if (withScreenHost) {
    const screenHost = document.createElement("main");
    screenHost.setAttribute("data-solo-screen-host", "");
    shellMain.appendChild(screenHost);
    owner = screenHost;
  }
  // Applied by `SoloSettings` on mount, to whichever element it resolves.
  owner.className = `${owner.className} tcs-main--settings-scrollbar-hidden`.trim();
  const host = document.createElement("div");
  owner.appendChild(host);
  // Attached, not detached: `document.getElementById` and `document.activeElement`
  // both ignore a detached tree, so a harness that forgets this reports "no owner
  // found" and "focus never moved" for a surface that does both correctly.
  document.body.appendChild(shell);

  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/solo/1971670/settings/connections?segment=calendars"]}>
        <CalendarsView />
      </MemoryRouter>,
    );
  });
  return { owner, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("the Calendar surface can be driven from the keyboard", () => {
  it("dresses SoloApp's screen host, not the shell main above it", () => {
    // The regression that made the first version of this repair inert: the
    // surface resolved `#tenant-shell-main` while `SoloSettings` had moved to
    // the screen host, so it restored a scrollbar and focus on an element with
    // no scroll extent while the real owner kept neither.
    const { owner } = mountInShell();
    expect(owner.hasAttribute("data-solo-screen-host")).toBe(true);
    expect(owner.getAttribute("tabindex")).toBe("-1");
    expect(document.getElementById("tenant-shell-main")?.getAttribute("tabindex")).toBe(null);
  });

  it("falls back to the shell main when there is no screen host", () => {
    // Bare mounts -- unit tests, drive harnesses -- supply no screen host.
    const { owner } = mountInShell(false);
    expect(owner.id).toBe("tenant-shell-main");
    expect(owner.getAttribute("tabindex")).toBe("-1");
  });

  it("makes the shell scroll owner focusable on mount", () => {
    const { owner } = mountInShell();
    // -1 and not 0: focusable so scroll keys reach it, without inserting a
    // stop into the Tab order ahead of the surface's own 167 controls.
    expect(owner.getAttribute("tabindex")).toBe("-1");
  });

  it("focuses the scroll owner on arrival, so the first key press scrolls", () => {
    const { owner } = mountInShell();
    expect(document.activeElement).toBe(owner);
  });

  it("leaves the shell exactly as it found it on unmount", () => {
    const { owner, unmount } = mountInShell();
    expect(owner.hasAttribute("tabindex")).toBe(true);
    expect(owner.classList.contains("tcs-main--settings-scrollbar-shown")).toBe(true);
    unmount();
    expect(owner.hasAttribute("tabindex")).toBe(false);
    expect(owner.classList.contains("tcs-main--settings-scrollbar-shown")).toBe(false);
    // Removing `tabindex` does not blur, so an owner still holding focus would
    // keep it on shared chrome after this surface is gone.
    expect(document.activeElement).not.toBe(owner);
  });

  it("does not steal focus from a control the human is already using", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);
    mountInShell();
    expect(document.activeElement).toBe(button);
  });

  it("does not take a Tab stop of its own", () => {
    const { owner } = mountInShell();
    expect(owner.getAttribute("tabindex")).not.toBe("0");
  });
});

describe("the Calendar surface keeps its scrollbar", () => {
  const css = readFileSync(resolve(process.cwd(), "src/solo/connections-calendars.css"), "utf8");
  const settings = readFileSync(resolve(process.cwd(), "src/solo/settings.css"), "utf8");
  const tokens = readFileSync(resolve(process.cwd(), "src/solo/solo-tokens.css"), "utf8");
  /** Rules only -- the comments in these files discuss the very selectors under test. */
  const rules = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");

  it("still faces a Settings shell that suppresses the scrollbar in both lanes", () => {
    // If this stops being true the override is dead code and should be deleted
    // rather than left to rot -- so the test names the dependency.
    expect(rules(settings)).toMatch(/\.tcs-main--settings-scrollbar-hidden\s*\{[^}]*scrollbar-width:\s*none/);
    expect(rules(settings)).toMatch(/\.tcs-main--settings-scrollbar-hidden::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it("adds a second class instead of removing the first", () => {
    // React runs child effects before parent effects, so a `classList.remove`
    // here is undone microseconds later when `SoloSettings` re-adds it.
    expect(rules(css)).not.toMatch(/classList\.remove\(["'`]tcs-main--settings-scrollbar-hidden/);
    expect(SETTINGS_SCROLLBAR_SHOWN).toBe("tcs-main--settings-scrollbar-shown");
  });

  it("outranks the suppression in BOTH lanes by naming both classes", () => {
    // Single-class overrides tie on specificity, and `settings.tsx` imports
    // `connections-calendars` before its own stylesheet -- so `settings.css`
    // loads last and wins on source order. Measured: the owner still reported
    // `scrollbar-width: none`. Naming both classes outranks it outright.
    for (const lane of ["", "::-webkit-scrollbar"]) {
      expect(rules(css), `lane ${lane || "standard"}`).toMatch(
        new RegExp(
          "\\[data-tenant-shell\\]\\s*\\.tcs-main--settings-scrollbar-hidden" +
            "\\.tcs-main--settings-scrollbar-shown" + lane.replace(/[:-]/g, "\\$&") + "\\s*\\{",
        ),
      );
    }
  });

  it("keeps SoloApp's screen host out of the blanket inner-main clip", () => {
    // `.paige-solo main{overflow:hidden!important}` beat SoloApp's inline
    // `overflow:auto` on its own screen host, so a document-flow route had NO
    // scroll owner at all: the host could not scroll and `#tenant-shell-main`
    // never overflowed either. This is the root cause of the reported P1 and it
    // survived the route-set correction that preceded this change.
    expect(rules(tokens)).toMatch(
      /\.paige-solo main:not\(\[data-solo-screen-host\]\)\s*\{[^}]*overflow:\s*hidden\s*!important/,
    );
    expect(rules(tokens)).not.toMatch(/\.paige-solo main\s*\{[^}]*overflow:\s*hidden\s*!important/);
  });

  it("never introduces a scroll region or a viewport-height clip of its own", () => {
    // The page is the one deliberate scroll owner. A nested scroller here parks
    // controls off the edge of an inner box the human cannot see the end of;
    // a viewport-height clip strands everything below it.
    expect(rules(css)).not.toMatch(/^\s*\.cc\s*\{[^}]*overflow-y:\s*(auto|scroll)/ms);
    expect(rules(css)).not.toMatch(/^\s*\.cc\s*\{[^}]*overflow:\s*(auto|scroll|hidden)/ms);
    expect(rules(css)).not.toMatch(/^\s*\.cc\s*\{[^}]*height:\s*100(vh|dvh)/ms);
    expect(rules(css)).not.toMatch(/^\s*\.cc\s*\{[^}]*max-height:/ms);
  });
});
