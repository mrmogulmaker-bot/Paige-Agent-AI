/**
 * Data-boundary stub for the Solo Calendar harness mount.
 *
 * MOCKS THE PROVIDER, NEVER THE CONTRACT (harness README). The component, the
 * `useSoloCalendar` hook, its conflict maths and the real CSS are all the shipped
 * ones — only the Supabase transport is replaced, and it answers with the exact
 * shapes the real seams return (`calendars` rows; `list_team_bookings` rows).
 * A harness handed pre-computed conflicts could only assert the conflicts it was
 * given; these come out of the real `findConflicts` over synthetic times.
 *
 * THE ROWS ARE VISIBLY SYNTHETIC ON PURPOSE. Titles read "Harness slot N" and
 * guests "Harness guest N" so a frame can never be mistaken for a tenant's real
 * book, and so no invented person ever appears in an artifact (§13/§63). This is
 * GEOMETRY evidence only: it proves the grid, the scroll owner and the drawers at
 * density. It proves NOTHING about production data, and must never be reported as
 * having done so.
 *
 * `?data=` selects the state under measurement:
 *   dense (default) · empty · error · calendars-error
 */

const DAY = 86400000;

export type StubState = "dense" | "empty" | "error" | "calendars-error";

function state(): StubState {
  const v = new URLSearchParams(window.location.search).get("data");
  return (v as StubState) || "dense";
}

/** Monday of the current week, so every frame is deterministic regardless of run day. */
function weekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** notify_config mirrors the real `calendars` column shape. cal-1 carries an SMS
 *  reminder so the config drawer's conditional Connections remediation is on screen
 *  in a frame; cal-2 is email-only (it must NOT show one); cal-3 stores nothing at
 *  all so the honest "no notification settings" state is measured too. */
const CALENDARS = [
  {
    id: "cal-1", title: "Consultations", color: "#7A67E8", accent: null, type: "consult",
    notify_config: {
      confirm_guest: true, confirm_host: true,
      reminders: [
        { channel: "email", offset_min: 1440, to: "guest" },
        { channel: "sms", offset_min: 120, to: "guest" },
      ],
    },
  },
  {
    id: "cal-2", title: "Onboarding", color: "#2FA37C", accent: null, type: "onboarding",
    notify_config: {
      confirm_guest: true, confirm_host: false,
      reminders: [{ channel: "email", offset_min: 60, to: "both" }],
    },
  },
  { id: "cal-3", title: "Reviews", color: "#C9922F", accent: null, type: "review", notify_config: null },
];

/** Deliberately includes: two overlapping slots on ONE host (a real conflict the
 *  shipped findConflicts must detect), a cancelled slot, an unassigned-calendar
 *  slot, a long title for min-width:0 pressure, and a day stacked past the
 *  month-cell cap so "+N more" is exercised. */
function bookings() {
  const w = weekStart();
  const at = (day: number, hour: number, min = 0) =>
    new Date(w.getTime() + day * DAY + hour * 3600000 + min * 60000).toISOString();
  const row = (o: Record<string, unknown>) => ({
    status: "scheduled", source: "manual", guest_email: null, guest_phone: null,
    location_type: "video", location_value: null, notes: null, booking_kind: "appointment",
    capacity: null, class_session_id: null, host_user_id: "host-a", host_full_name: "Harness host A",
    timezone: "UTC", calendar_id: "cal-1", guest_name: null, ...o,
  });

  return [
    row({ id: "b1", title: "Harness slot 1", start_at: at(1, 9), end_at: at(1, 10), guest_name: "Harness guest 1" }),
    // b2 overlaps b3 on host-a — the ONLY conflict in this set, and it is real overlap.
    row({ id: "b2", title: "Harness slot 2", start_at: at(2, 14), end_at: at(2, 15), calendar_id: "cal-2" }),
    row({ id: "b3", title: "Harness slot 3", start_at: at(2, 14, 30), end_at: at(2, 15, 30), calendar_id: "cal-2" }),
    // Different host at the same time — must NOT be flagged.
    row({ id: "b4", title: "Harness slot 4", start_at: at(2, 14, 15), end_at: at(2, 15), host_user_id: "host-b", host_full_name: "Harness host B", calendar_id: "cal-3" }),
    row({ id: "b5", title: "Harness slot 5 with a deliberately long title to pressure min-width and force ellipsis", start_at: at(3, 11), end_at: at(3, 12), calendar_id: "cal-3" }),
    row({ id: "b6", title: "Harness slot 6", start_at: at(3, 16), end_at: at(3, 17), status: "cancelled" }),
    row({ id: "b7", title: "Harness slot 7", start_at: at(4, 8), end_at: at(4, 9), calendar_id: null }),
    // A class plus its attendee seats — three rows that must render as ONE chip
    // and produce ZERO conflicts, which is what the fold is for. Rendering them
    // unfolded is the shipped defect this fixture now catches in geometry.
    row({ id: "c1", title: "Harness group session", booking_kind: "class_session", capacity: 6, start_at: at(1, 13), end_at: at(1, 14), calendar_id: "cal-2" }),
    ...["s1", "s2", "s3"].map((id, i) =>
      row({
        id, title: "Harness group session", booking_kind: "class_seat", class_session_id: "c1",
        guest_name: `Harness attendee ${i + 1}`, start_at: at(1, 13), end_at: at(1, 14), calendar_id: "cal-2",
      }),
    ),
    // Day 5 stacked five deep so the month cell overflows its 3-chip cap.
    ...[8, 9, 10, 11, 12].map((h, i) =>
      row({ id: `b8${i}`, title: `Harness slot 8.${i + 1}`, start_at: at(5, h), end_at: at(5, h + 1) }),
    ),
  ];
}

const ok = (data: unknown) => Promise.resolve({ data, error: null });
const fail = (message: string) => Promise.resolve({ data: null, error: { message } });

/** Mirrors only the surface `useSoloCalendar` actually touches. */
/** Flipped by the drive to exercise a failed live refresh; "ok" by default so
 *  every existing frame measures exactly what it measured before. */
/** "empty" lets a drive prove what happens when a booking DISAPPEARS between
 *  reads — the case that closes an open drawer out from under the reader. It is
 *  not expressible with ok/fail alone, so the focus behaviour on that path could
 *  not be driven in a browser without it. */
let bookingReadMode: "ok" | "fail" | "empty" = "ok";
const listeners = new Set<() => void>();

export const supabase = {
  from(table: string) {
    const result =
      table === "calendars"
        ? state() === "calendars-error"
          ? fail("Harness: calendars read refused")
          : ok(state() === "empty" ? [] : CALENDARS)
        : ok([]);
    const chain = {
      select: () => chain,
      eq: () => result,
      then: (r: (v: unknown) => unknown) => result.then(r),
    };
    return chain;
  },
  rpc(name: string) {
    if (name === "list_team_bookings") {
      if (state() === "error") return fail("Harness: booking range read refused");
      // Driveable refresh failure: the drive flips this AFTER the first read has
      // landed, so the surface has real rows on screen when the refresh fails —
      // which is the only state the freshness warning is about.
      if (bookingReadMode === "fail") return fail("Harness: refresh refused");
      if (bookingReadMode === "empty") return { data: [], error: null };
      return ok(state() === "empty" ? [] : bookings());
    }
    // Writes are not exercised by a geometry render; they resolve without effect.
    return Promise.resolve({ data: null, error: null });
  },
  auth: {
    getUser: () => Promise.resolve({ data: { user: { id: "harness-user" } }, error: null }),
  },
  /** Realtime needs a live socket a geometry harness does not have. This channel
   *  is quiet by default — no events, no refetch — so the measured layout is the
   *  one a real page shows between changes. It exists because `useRealtimeTable`
   *  would otherwise throw on `.channel`, and a thrown hook renders nothing at all
   *  to measure. It also KEEPS the handler, so a drive can fire a change the way
   *  Postgres would and exercise the live-refresh path for real. */
  channel: () => {
    const own = new Set<() => void>();
    const ch = {
      on: (_event: string, _filter: unknown, cb: () => void) => { own.add(cb); listeners.add(cb); return ch; },
      subscribe: () => ch,
      unsubscribe: () => { own.forEach((c) => listeners.delete(c)); return ch; },
      __own: own,
    };
    return ch;
  },
  removeChannel: (ch: { __own?: Set<() => void> }) => {
    ch?.__own?.forEach((c) => listeners.delete(c));
  },
};

/** Drive hooks. Harness-only: this module is aliased in ONLY by the harness Vite
 *  config and is never part of the app build. */
(globalThis as unknown as Record<string, unknown>).__calHarness = {
  /** Deliver a booking change the way a Postgres event would. */
  fireBookingChange: () => { listeners.forEach((cb) => cb()); },
  /** Make the next booking reads succeed or fail. */
  setBookingReads: (mode: "ok" | "fail" | "empty") => { bookingReadMode = mode; },
};

export default { supabase };
