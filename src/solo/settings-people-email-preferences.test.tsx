// Render tests for the People & Email preferences section (#1090) — the landed
// destination of the retired notifications page. House idiom (PipelineDelete
// precedent): createRoot + act + direct DOM queries, no testing-library.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PeopleEmailPreferences } from "./settings-people-email-preferences";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type PrefRow = Record<string, boolean | string | null>;

function makeClient(opts: { row?: PrefRow | null; upsertError?: { message: string } } = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_t, k) {
      if (typeof k !== "string" || k === "then") return undefined;
      if (k === "select" || k === "eq") return () => chain;
      if (k === "maybeSingle") return async () => ({ data: opts.row ?? null, error: null });
      if (k === "upsert") {
        return async (row: Record<string, unknown>) => {
          calls.push(row);
          return { error: opts.upsertError ?? null };
        };
      }
      return () => chain;
    },
  });
  return {
    calls,
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "owner@example.com" } } }) },
      from: () => chain,
    },
  };
}

const current: { client?: ReturnType<typeof makeClient> } = {};
vi.mock("@/integrations/supabase/client", () => ({
  get supabase() { return current.client!.supabase; },
}));

const LOADED_ROW: PrefRow = { email_enabled: true, email_weekly_summary: true, email_coaching_reminders: true, email_onboarding: true, unsubscribed_all: false };

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  current.client = makeClient();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render_() {
  act(() => root.render(<PeopleEmailPreferences />));
}
/** Radix Switch renders a button[role=switch]; the Label pairs by id. */
function toggle(id: string): HTMLElement | null {
  return host.querySelector(`button[role="switch"]#${id}`);
}
async function settle() {
  await act(async () => {});
  await act(async () => {});
}

it("renders the coaching-generic rows with paired labels — and ZERO finance rows (§2)", async () => {
  current.client = makeClient({ row: LOADED_ROW });
  render_();
  await settle();
  for (const id of ["pref-email-enabled", "pref-email_weekly_summary", "pref-email_coaching_reminders", "pref-email_onboarding"]) {
    expect(toggle(id), id).toBeTruthy();
    expect(host.querySelector(`label[for="${id}"]`), `label for ${id}`).toBeTruthy();
  }
  expect(host.textContent ?? "").not.toMatch(/credit|funding|score|dispute|lender/i);
});

it("a toggle UPSERTS the row — the legacy update-only no-op on first use is the bug this fixes", async () => {
  current.client = makeClient({ row: null }); // first use: no row exists yet
  render_();
  await settle();
  await act(async () => { toggle("pref-email_weekly_summary")!.click(); });
  await settle();
  expect(current.client!.calls.length).toBe(1);
  expect(current.client!.calls[0]).toMatchObject({ user_id: "u-1", email_weekly_summary: false });
});

it("a failed save shows the honest outcome and reverts to the persisted truth — never a false toggle", async () => {
  current.client = makeClient({ row: LOADED_ROW, upsertError: { message: "row-level security violation" } });
  render_();
  await settle();
  await act(async () => { toggle("pref-email_weekly_summary")!.click(); });
  await settle();
  expect(host.textContent ?? "").toMatch(/Could not save/i);
  expect(toggle("pref-email_weekly_summary")!.getAttribute("aria-checked")).toBe("true");
});

it("unsubscribed-all locks the rows with an honest note; the master switch offers resubscribe", async () => {
  current.client = makeClient({ row: { ...LOADED_ROW, unsubscribed_all: true } });
  render_();
  await settle();
  expect(host.textContent ?? "").toMatch(/All email is currently off/i);
  expect(toggle("pref-email_weekly_summary")!.getAttribute("disabled")).not.toBeNull();
  expect(toggle("pref-email-enabled")!.getAttribute("aria-checked")).toBe("false");
});

it("a load error shows the honest retry state — never fabricated defaults", async () => {
  const broken = makeClient();
  const badChain: Record<string, unknown> = new Proxy({}, {
    get(_t, k) {
      if (k === "maybeSingle") return async () => ({ data: null, error: { message: "conn refused" } });
      if (typeof k !== "string" || k === "then") return undefined;
      return () => badChain;
    },
  });
  broken.supabase.from = () => badChain as never;
  current.client = broken;
  render_();
  await settle();
  // The primitive's honest error copy + retry — and crucially NO toggles rendered
  // from defaults (an error is never "your settings are the defaults").
  expect(host.textContent ?? "").toMatch(/Could not load your email preferences/i);
  expect([...host.querySelectorAll("button")].some((b) => b.textContent === "Retry")).toBe(true);
  expect(toggle("pref-email_weekly_summary")).toBeFalsy();
});
