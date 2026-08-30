// SplineScene — lazy-boundary render test.
//
// WHY THIS EXISTS (2026-08-29): the Spline 3D runtime sits behind `React.lazy`, so `tsc` and
// `vite build` both pass even when the runtime is missing or broken — the failure only appears when
// a viewer opens the surface and the Suspense boundary resolves (§32: a green build is not a working
// render). The sibling `premium-motion.smoke.test.tsx` deliberately does not render, so nothing
// covered the boundary itself. These tests cover the two behaviours that decide whether a viewer
// sees anything: the reduced-motion skip must never boot the runtime, and the lazy specifier must
// actually resolve in the app's own module graph.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reduceMotion = vi.hoisted(() => ({ value: false }));
vi.mock("framer-motion", () => ({ useReducedMotion: () => reduceMotion.value }));

// Count real boots of the 3D runtime. The reduced-motion path must never reach this.
const splineBoots = vi.hoisted(() => ({ count: 0 }));
vi.mock("@splinetool/react-spline", () => ({
  default: ({ scene }: { scene: string }) => {
    splineBoots.count += 1;
    return <div data-testid="spline-mounted" data-scene={scene} />;
  },
}));

import { SplineScene } from "./SplineScene";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  reduceMotion.value = false;
  splineBoots.count = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("SplineScene", () => {
  it("renders the crafted skeleton, not a blank node, before the runtime resolves", () => {
    act(() => {
      root.render(<SplineScene scene="https://example.test/scene.splinecode" />);
    });
    // §11: never a bare "Loading…" and never an empty box while the chunk is in flight.
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(container.textContent).not.toMatch(/loading/i);
  });

  it("boots the 3D runtime once the lazy chunk resolves", async () => {
    await act(async () => {
      root.render(<SplineScene scene="https://example.test/scene.splinecode" />);
    });
    const mounted = container.querySelector("[data-testid='spline-mounted']");
    expect(mounted).not.toBeNull();
    expect(mounted?.getAttribute("data-scene")).toBe("https://example.test/scene.splinecode");
    expect(splineBoots.count).toBe(1);
  });

  it("never boots the runtime under reduced motion — a 3D scene is motion", async () => {
    reduceMotion.value = true;
    await act(async () => {
      root.render(<SplineScene scene="https://example.test/scene.splinecode" />);
    });
    expect(splineBoots.count).toBe(0);
    expect(container.querySelector("[data-testid='spline-mounted']")).toBeNull();
    // It still shows something rather than collapsing to nothing (§32: never silently blank).
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("shows the caller's own fallback under reduced motion when one is given", async () => {
    reduceMotion.value = true;
    await act(async () => {
      root.render(
        <SplineScene scene="https://example.test/scene.splinecode" fallback={<p>Poster</p>} />,
      );
    });
    expect(container.textContent).toContain("Poster");
    expect(splineBoots.count).toBe(0);
  });
});

describe("the Spline lazy specifier", () => {
  // The mock above proves the BOUNDARY works. This proves the REAL specifier still resolves through
  // the app's own resolver — the exact failure the unpublished @splinetool/animation-core caused.
  it("resolves to a React component in the app's module graph", async () => {
    const mod = await vi.importActual<{ default: unknown }>("@splinetool/react-spline");
    const Spline = mod.default;
    const isComponent =
      typeof Spline === "function" || (!!Spline && typeof Spline === "object" && "$$typeof" in Spline);
    expect(isComponent).toBe(true);
  });
});
