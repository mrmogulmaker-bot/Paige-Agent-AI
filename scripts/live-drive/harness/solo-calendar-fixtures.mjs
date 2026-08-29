/**
 * Deterministic fixtures for the Solo Calendar review render.
 *
 * FROZEN WEEK. The clock is pinned to Wed 26 Aug 2026 15:00 local, so the week under review is
 * always Sun 23 Aug – Sat 29 Aug 2026. Nothing here drifts with the day the harness is run,
 * which is what makes two captures comparable.
 *
 * These rows are SYNTHETIC (§63): no real account, contact, or tenant appears. They are shaped
 * to exercise the states the reviewer must actually see rather than a tidy happy path:
 *   - two calendars with DIFFERENT stored colours, plus one booking on no calendar at all
 *   - a genuine overlap on ONE host (a real conflict)
 *   - a same-time pair on DIFFERENT hosts (must NOT be flagged)
 *   - a back-to-back pair (must NOT be flagged)
 *   - a cancelled booking that overlaps a live one (must NOT be flagged — it released its slot)
 */
export const FIXED_NOW = new Date("2026-08-26T15:00:00").getTime();

const HOST_A = "11111111-1111-4111-8111-111111111111";
const HOST_B = "22222222-2222-4222-8222-222222222222";
const CAL_COACHING = "cal-coaching-0001";
const CAL_INTRO = "cal-intro-0002";

export const CALENDARS = [
  { id: CAL_COACHING, title: "Coaching sessions", color: "#7A67E8", accent: null, type: "internal" },
  { id: CAL_INTRO, title: "Intro calls", color: "#1FA98A", accent: null, type: "internal" },
  { id: "cal-review-0003", title: "Reviews", color: null, accent: "#D98A2B", type: "internal" },
];

/** `d` is the day of Aug 2026; times are local, matching what the grid lays out. */
function at(d, h, m = 0) {
  return new Date(2026, 7, d, h, m, 0).toISOString();
}
function booking(o) {
  return {
    guest_email: null, guest_phone: null, location_type: null, location_value: null,
    notes: null, booking_kind: "appointment", capacity: null, timezone: "America/New_York",
    source: "manual", ...o,
  };
}

export const BOOKINGS = [
  booking({ id: "bk-01", title: "Strategy session", start_at: at(24, 9), end_at: at(24, 10),
    status: "scheduled", guest_name: "Dana Whitfield", calendar_id: CAL_COACHING,
    host_user_id: HOST_A, host_full_name: "Alex Rivera",
    notes: "Second of four. Wants the pricing page reviewed before we meet." }),

  // Back-to-back with bk-01 — shares an edge, must NOT read as a conflict.
  booking({ id: "bk-02", title: "Intro call", start_at: at(24, 10), end_at: at(24, 10, 30),
    status: "scheduled", guest_name: "Marcus Lyle", calendar_id: CAL_INTRO,
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),

  // A REAL overlap on the same host — this is the one the conflict count must find.
  booking({ id: "bk-03", title: "Quarterly review", start_at: at(25, 13), end_at: at(25, 14, 30),
    status: "scheduled", guest_name: "Priya Raman", calendar_id: "cal-review-0003",
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),
  booking({ id: "bk-04", title: "Onboarding walkthrough", start_at: at(25, 14), end_at: at(25, 15),
    status: "scheduled", guest_name: "Tomas Beck", calendar_id: CAL_COACHING,
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),

  // Same wall-clock as bk-03 but a DIFFERENT host — must NOT be flagged.
  booking({ id: "bk-05", title: "Discovery call", start_at: at(25, 13, 30), end_at: at(25, 14, 30),
    status: "scheduled", guest_name: "Ines Fournier", calendar_id: CAL_INTRO,
    host_user_id: HOST_B, host_full_name: "Sam Okonkwo" }),

  // Cancelled, and it overlaps bk-07. It released the slot, so it must NOT be flagged —
  // but it must still be VISIBLE, struck through, rather than deleted from the day.
  booking({ id: "bk-06", title: "Follow-up", start_at: at(27, 11), end_at: at(27, 12),
    status: "cancelled", guest_name: "Ruth Alvarez", calendar_id: CAL_COACHING,
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),
  booking({ id: "bk-07", title: "Package renewal", start_at: at(27, 11, 30), end_at: at(27, 12, 30),
    status: "scheduled", guest_name: "Ruth Alvarez", calendar_id: CAL_COACHING,
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),

  // No calendar at all — proves the unassigned fallback tint is reached.
  booking({ id: "bk-08", title: "Blocked — deep work", start_at: at(28, 8), end_at: at(28, 11),
    status: "blocked", guest_name: null, calendar_id: null,
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),

  booking({ id: "bk-09", title: "Intro call", start_at: at(28, 15), end_at: at(28, 15, 30),
    status: "scheduled", guest_name: "Wes Nakamura", calendar_id: CAL_INTRO,
    host_user_id: HOST_B, host_full_name: "Sam Okonkwo" }),

  booking({ id: "bk-10", title: "Strategy session", start_at: at(23, 16), end_at: at(23, 17),
    status: "no_show", guest_name: "Camille Ortiz", calendar_id: CAL_COACHING,
    host_user_id: HOST_A, host_full_name: "Alex Rivera" }),
];

export const USER = {
  id: HOST_A, aud: "authenticated", role: "authenticated",
  email: "harness@example.invalid", app_metadata: {}, user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
