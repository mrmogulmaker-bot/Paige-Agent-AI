// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A green typecheck is not a working render (§32), and this surface is the one where that gap
 * matters most: every string it shows is a statement about what Paige is allowed to do unattended.
 * So these drive the REAL components through the states the read can actually be in — loading, a
 * failed read, a department with nothing routed to it, and a real posture — and assert what the
 * owner is told in each.
 *
 * The seam is mocked at `useSoloTrust`, not at the network: the hook itself is unit-tested
 * separately against the measured prod distribution, and mocking it here keeps these tests about
 * what the SURFACE says rather than about Supabase.
 */
const harness = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("./data/useSoloTrust", () => ({ useSoloTrust: () => harness.value }));
vi.mock("@/hooks/usePaigeDeptStatus", () => ({
  usePaigeDeptStatus: () => ({ loading: false, configured: true, departments: [] }),
}));

import { MiniCompass } from "./compass";

let host: HTMLDivElement;
let root: Root;

/** Renders the real component and hands back its DOM. No library, matching the sibling tests. */
function draw(node: React.ReactElement): HTMLDivElement {
  act(() => { root.render(node); });
  return host;
}
const byRole = (h: HTMLElement, role: string) => h.querySelector(`[role="${role}"]`);

const dept = (over: Record<string, unknown> = {}) => ({
  slug: "legal_compliance", name: "Legal & Compliance", displayOrder: 9,
  lanes: { auto: 0, confirm: 0, off: 1 }, kinds: 1,
  acts: [{ label: "Flag for review", lane: "off" as const }],
  defaultLevel: 0, openCount: 0, workingCount: 0, awaitingCount: 0, ...over,
});

const ok = (d = dept()) => ({
  loading: false, configured: true, departments: [d],
  bySlug: { [d.slug as string]: d }, error: null,
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  harness.value = null;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("MiniCompass — what the owner is told, in each state the read can be in", () => {
  it("while loading, says it is reading — it does not show a level", () => {
    harness.value = ({ loading: true, configured: false, departments: [], bySlug: {}, error: null });
    const h = draw(<MiniCompass dept="legal_compliance" />);
    expect(byRole(h, "status")?.textContent).toMatch(/Reading the platform default/i);
  });

  it("on a FAILED read, reports it as unavailable — never as a posture", () => {
    // The failure this exists to prevent: an unreadable policy rendering as "always your call",
    // which is a governance claim rather than an absence.
    harness.value = ({ loading: false, configured: false, departments: [], bySlug: {}, error: "boom" });
    const h = draw(<MiniCompass dept="legal_compliance" />);
    const t = byRole(h, "status")?.textContent ?? "";
    expect(t).toMatch(/unavailable/i);
    expect(t).not.toMatch(/your call|automatically|drafts for you/i);
  });

  it("a department with NOTHING routed to it says so, rather than showing a level", () => {
    harness.value = (ok(dept({ lanes: { auto: 0, confirm: 0, off: 0 }, kinds: 0, acts: [], defaultLevel: null })));
    const container = draw(<MiniCompass dept="legal_compliance" />);
    expect(container.textContent).toMatch(/No action types are routed/i);
    expect(container.textContent).not.toMatch(/Always your call/i);
  });

  it("with a real posture, names it as the PLATFORM's default and not the workspace's choice", () => {
    harness.value = (ok());
    const container = draw(<MiniCompass dept="legal_compliance" />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Always your call/);
    expect(text).toMatch(/not a setting this workspace chose/i);
    // The claim that must never appear: that this workspace authorised anything.
    expect(text).not.toMatch(/you (approved|authoris|authoriz|set)/i);
    expect(text).not.toMatch(/Slide to change/i);
  });

  it("renders NO writable control — the dial is read-only", () => {
    harness.value = (ok());
    const container = draw(<MiniCompass dept="legal_compliance" />);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("carries the real counts in its accessible name, so the bar is not the only carrier", () => {
    harness.value = (ok(dept({ lanes: { auto: 8, confirm: 3, off: 0 }, kinds: 11, defaultLevel: 9.5 / 11 })));
    const h = draw(<MiniCompass dept="legal_compliance" />);
    expect(byRole(h, "img")?.getAttribute("aria-label"))
      .toMatch(/8 run automatically, 3 drafted for you, 0 always your call/);
  });

  it("resolves a department by NAME as well as slug — the pending-action seam passes a name", () => {
    harness.value = (ok());
    const container = draw(<MiniCompass dept="Legal & Compliance" />);
    expect(container.textContent).toMatch(/Always your call/);
  });

  it("an UNKNOWN department is reported as unavailable, not silently blank", () => {
    harness.value = (ok());
    const h = draw(<MiniCompass dept="not_a_department" />);
    expect(byRole(h, "status")?.textContent).toMatch(/unavailable/i);
  });
});
