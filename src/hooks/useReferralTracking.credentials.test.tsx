import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";

/**
 * THE SECOND CAPTURE PATH, proven against its ACTUAL emitted body.
 *
 * `usePageView` is not the only sink that reads the URL. `useReferralTracking` reads
 * `window.location.href` independently and posts `landing_path` to `track-referral-click`, which
 * lands in `referral_clicks` — whose RLS (`clicks_self`) lets the OWNING AFFILIATE select the row.
 * That is an ordinary tenant-tier user, so this sink has WORSE reachability than `analytics_events`,
 * which only a platform operator can read.
 *
 * It is also the sink a pathname-only redactor misses entirely: it built `landing_path` as
 * `redactSecretPath(url.pathname) + url.search`, appending the query string RAW after redacting the
 * path. `/unsubscribe?token=` and `?ct=` carry their credential in exactly that half.
 *
 * The wiring test that covered this asserted against SOURCE TEXT and stayed green while the
 * credential shipped, so this drives the real hook and reads what is actually posted.
 */

const invokeCalls: Array<{ fn: string; body: Record<string, unknown> }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // `useReferralTracking` imports the redactors from `useAnalytics`, which subscribes to auth at
    // module load — the mock has to carry it or the import throws before the hook ever runs.
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(),
    },
    functions: {
      invoke: vi.fn(async (fn: string, opts?: { body?: Record<string, unknown> }) => {
        invokeCalls.push({ fn, body: opts?.body ?? {} });
        return { data: null, error: null };
      }),
    },
  },
}));

// Real mint shapes, not invented fixtures.
const SIGNING_TOKEN = "3f".repeat(32);                  // 64 hex
const UNSUB_TOKEN = "a9".repeat(32);                    // 64 hex
const INVITE_TOKEN = "kJ8vQ2mZ+xR7bN4wT1yH/cL6pA3dS9e="; // 32 chars, standard base64

function atLocation(href: string) {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
  // The hook rewrites the URL after reading it; give it a real history to call.
  window.history.replaceState({}, "", "/");
}

async function driveHook(): Promise<string> {
  const { useReferralTracking } = await import("./useReferralTracking");
  const Probe: React.FC = () => {
    useReferralTracking();
    return null;
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(React.createElement(Probe));
  });
  // Let the fire-and-forget async IIFE settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return JSON.stringify(invokeCalls);
}

beforeEach(() => {
  invokeCalls.length = 0;
  try { window.localStorage.clear(); } catch { /* jsdom without storage */ }
  vi.resetModules();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("track-referral-click never carries a credential — all four token-bearing routes", () => {
  const cases: Array<{ name: string; href: string; token: string }> = [
    {
      name: "/sign/:token — the signing bearer",
      href: `https://app.example.com/sign/${SIGNING_TOKEN}?ref=PARTNER1`,
      token: SIGNING_TOKEN,
    },
    {
      name: "/join/:token — standing workspace membership, stored UNHASHED",
      href: `https://app.example.com/join/${INVITE_TOKEN}?ref=PARTNER1`,
      token: INVITE_TOKEN,
    },
    {
      name: "/u/:token — unsubscribe in the path",
      href: `https://app.example.com/u/${UNSUB_TOKEN}?ref=PARTNER1`,
      token: UNSUB_TOKEN,
    },
    {
      name: "/unsubscribe?token= — the QUERY-STRING surface a pathname-only redactor misses",
      href: `https://app.example.com/unsubscribe?token=${UNSUB_TOKEN}&ref=PARTNER1`,
      token: UNSUB_TOKEN,
    },
    {
      name: "/unsubscribe?ct= — the tenant-comms variant",
      href: `https://app.example.com/unsubscribe?ct=${UNSUB_TOKEN}&ref=PARTNER1`,
      token: UNSUB_TOKEN,
    },
  ];

  for (const c of cases) {
    it(`redacts ${c.name}`, async () => {
      atLocation(c.href);
      const posted = await driveHook();
      // The sink must actually have fired — a test that proves nothing posted proves nothing.
      expect(invokeCalls.length).toBeGreaterThan(0);
      expect(invokeCalls[0].fn).toBe("track-referral-click");
      expect(posted).not.toContain(c.token);
    });
  }

  it("still records the attribution it exists to record", async () => {
    atLocation("https://app.example.com/pricing?ref=PARTNER1&utm_campaign=black_friday_2026_launch");
    const posted = await driveHook();
    expect(invokeCalls.length).toBeGreaterThan(0);
    const body = invokeCalls[0].body as Record<string, unknown>;
    expect(body.referral_code).toBe("PARTNER1");
    expect(body.landing_path).toBe("/pricing?ref=PARTNER1&utm_campaign=black_friday_2026_launch");
    expect(posted).toContain("black_friday_2026_launch");
  });
});
