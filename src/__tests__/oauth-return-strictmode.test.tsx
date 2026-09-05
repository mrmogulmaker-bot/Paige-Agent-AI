import { describe, it, expect, beforeEach } from "vitest";
import React, { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { armOAuthReturn, takeOAuthReturn } from "@/solo/data/oauthReturn";

// Reproduce EXACTLY the pattern I shipped: a read-and-clear performed during render,
// memoised on a ref. Codex says StrictMode's replay loses it. Measure, don't argue.
// BROKEN: read-and-clear during render. StrictMode replays the render with fresh hook
// state, the first pass consumes the entry, and the committed pass sees nothing.
function Probe({ seen }: { seen: (v: string | null) => void }) {
  const back = useRef<string | null>(null);
  if (back.current === null) back.current = takeOAuthReturn();
  seen(back.current);
  return null;
}

// CANDIDATE: consume in an effect, guarded by a ref. Effects run only after a commit, so
// the ref is on a committed instance and survives StrictMode's cleanup-and-rerun.
function Fixed({ seen }: { seen: (v: string | null) => void }) {
  const [back, setBack] = useState<string | null>(null);
  const took = useRef(false);
  useEffect(() => { if (took.current) return; took.current = true; setBack(takeOAuthReturn()); }, []);
  seen(back);
  return null;
}

describe("read-and-clear during render, under StrictMode", () => {
  beforeEach(() => { try { window.sessionStorage.clear(); } catch { /* ignore */ } });

  it("reports what the COMMITTED render actually saw", async () => {
    armOAuthReturn("/solo/9082725/settings/integrations");
    const values: (string | null)[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(<StrictMode><Probe seen={(v) => values.push(v)} /></StrictMode>);
    });
    expect(values.length).toBeGreaterThan(0);
    expect(values.at(-1)).toBeNull(); // the defect, measured
  });

  it("the effect-guarded pattern survives the replay", async () => {
    armOAuthReturn("/solo/9082725/settings/integrations");
    const values: (string | null)[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    await act(async () => {
      createRoot(host).render(<StrictMode><Fixed seen={(v) => values.push(v)} /></StrictMode>);
    });
    expect(values.at(-1)).toBe("/solo/9082725/settings/integrations");
  });
});

describe("the shipped callbacks use the pattern that survives", () => {
  it("neither consumes the return path during render", () => {
    for (const f of ["src/pages/McpOAuthCallback.tsx", "src/pages/ZapierOAuthCallback.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      // The consumption happens inside an effect, guarded so StrictMode's cleanup-and-rerun
      // cannot consume it twice and land the committed render on nothing.
      expect(src).toMatch(/took\.current\s*=\s*true;\s*setBack\(takeOAuthReturn\(\)\)/);
      // ...and never in the render body, which is what shipped and was measured broken.
      expect(src).not.toMatch(/back\.current\s*===\s*null\)\s*back\.current\s*=\s*takeOAuthReturn/);
    }
  });
});
