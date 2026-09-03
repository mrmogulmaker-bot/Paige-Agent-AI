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

import { MiniCompass, TrustCompass } from "./compass";

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

/**
 * THE CANVAS ACTUALLY RUNS.
 *
 * Everything above renders `MiniCompass`, which has no canvas — so none of it executes the compass
 * draw path, and a `ReferenceError` in there passes `tsc` (the file is `@ts-nocheck`) and passes
 * every test. That is not hypothetical: removing the drag write left
 * `window.addEventListener('mouseup', up)` behind after `up` was deleted, and nothing caught it
 * because jsdom's `getContext` returns null and the effect bails out one line earlier.
 *
 * So these stub a 2d context, which makes the effect run to completion — registering listeners,
 * measuring labels, and drawing every department band for real.
 */
describe("TrustCompass canvas — it runs, not merely compiles", () => {
  /** Every colour the draw path puts into a gradient, so a band can be inspected, not just survived. */
  let painted: string[] = [];
  const ctx2d = () => new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      if (k === "canvas") return { width: 800, height: 600 };
      if (k === "measureText") return () => ({ width: 40 });
      if (k === "createRadialGradient" || k === "createLinearGradient") {
        return () => ({ addColorStop: (_o: number, c: string) => { painted.push(String(c)); } });
      }
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set: () => true,
  });
  // The tier fallbacks in the draw path, which jsdom's empty getComputedStyle makes it use.
  const TIER_RGB = [/27,\s*122,\s*82/, /180,\s*112,\s*10/, /185,\s*62,\s*55/];

  beforeEach(() => {
    painted = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLCanvasElement.prototype as any).getContext = () => ctx2d();
    // jsdom has no ResizeObserver; the canvas effect observes its wrapper.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver ??= class { observe() {} disconnect() {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    // The draw loop is rAF-driven and re-schedules itself, so jsdom's async rAF means the effect
    // runs but NOTHING IS EVER DRAWN. Without this, every assertion about what was painted is
    // vacuous — which is exactly how the first version of these tests passed with the guard
    // removed. Run a bounded number of frames synchronously so the real draw path executes.
    let frames = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      if (frames++ < 3) cb(performance.now());
      return frames;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).cancelAnimationFrame = () => {};
  });

  it("mounts and draws every real department without throwing", () => {
    const many = ["owner_ops", "client_experience", "legal_compliance"].map((slug, i) =>
      dept({ slug, name: slug, displayOrder: i, lanes: { auto: i, confirm: 1, off: 0 }, kinds: i + 1, defaultLevel: (i + 1) / 4 }));
    harness.value = { loading: false, configured: true, departments: many, bySlug: Object.fromEntries(many.map((d) => [d.slug, d])), error: null };
    expect(() => draw(<TrustCompass />)).not.toThrow();
  });

  it("paints NO tier colour for a department with no posture", () => {
    // `g === null` reaching the band geometry computes `Math.min(null + .24, .97)` and paints a
    // full red ring — telling the owner a desk nothing is routed to is "always your call".
    // Asserting only "does not throw" was VACUOUS here: drawing the wrong band throws nothing, and
    // removing the guard left this test passing. So it inspects what was actually painted.
    const none = dept({ lanes: { auto: 0, confirm: 0, off: 0 }, kinds: 0, acts: [], defaultLevel: null });
    harness.value = { loading: false, configured: true, departments: [none], bySlug: { [none.slug]: none }, error: null };
    expect(() => draw(<TrustCompass />)).not.toThrow();
    expect(painted.length, "the draw path never ran, so this asserts nothing").toBeGreaterThan(0);
    for (const c of painted) {
      for (const tier of TIER_RGB) {
        expect(c, `a no-posture department was painted a tier colour: ${c}`).not.toMatch(tier);
      }
    }
  });

  it("DOES paint tier colours for a department that has a posture", () => {
    // The control that makes the assertion above mean something: if no tier colour is ever painted
    // for any input, the check would pass for the wrong reason.
    const real = dept({ lanes: { auto: 3, confirm: 1, off: 0 }, kinds: 4, defaultLevel: 0.875 });
    harness.value = { loading: false, configured: true, departments: [real], bySlug: { [real.slug]: real }, error: null };
    draw(<TrustCompass />);
    expect(painted.some((c) => TIER_RGB.some((t) => t.test(c))), "no tier colour was painted at all").toBe(true);
  });

  it("survives an empty and an unavailable read", () => {
    harness.value = { loading: false, configured: false, departments: [], bySlug: {}, error: "boom" };
    expect(() => draw(<TrustCompass />)).not.toThrow();
    harness.value = { loading: true, configured: false, departments: [], bySlug: {}, error: null };
    expect(() => draw(<TrustCompass />)).not.toThrow();
  });
});
