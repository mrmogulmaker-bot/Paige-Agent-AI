/**
 * `settings · Capabilities` — the clamp arithmetic and the governed-but-invisible gap.
 *
 * This surface is WIRED, so most of what matters is behaviour rather than authored strings: what
 * the Trust Compass does to a mode, what the schema forbids, and whether a failed read is honest.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { clampMode } from "@/operator/data/useToolAutonomy";

describe("the ceiling clamps a mode; it never rewrites one", () => {
  /** `capOf` — `capsVals` L9954, verbatim in arithmetic. */
  it("holds everything off at a ceiling of nothing", () => {
    for (const m of ["auto", "confirm", "off"] as const) {
      expect(clampMode(m, 0)).toBe("off");
    }
  });

  it("holds autopilot down to ask-first one rung up, and leaves the rest alone", () => {
    expect(clampMode("auto", 1)).toBe("confirm");
    expect(clampMode("confirm", 1)).toBe("confirm");
    expect(clampMode("off", 1)).toBe("off");
  });

  it("stops clamping once the ceiling is above ask-first", () => {
    for (const c of [2, 3, 4]) {
      expect(clampMode("auto", c)).toBe("auto");
      expect(clampMode("confirm", c)).toBe("confirm");
    }
  });

  /**
   * A NULL ceiling means the platform holds no rung. Clamping against one would report a gate
   * that is not set (§13) — the same reason `usePlatformTrust` renders no meter rather than a
   * default rung.
   */
  it("clamps nothing when the platform holds no rung", () => {
    expect(clampMode("auto", null)).toBe("auto");
    expect(clampMode("off", null)).toBe("off");
  });

  /**
   * The clamp is a RENDER, never a write. Stated as a property: clamping is idempotent on the
   * stored mode, so a ceiling that goes down and back up restores what the tool was set to. If a
   * later edit ever wrote the clamped value back, this is the test that would still pass while
   * the product silently lost every autopilot setting — so it is paired with the assertion that
   * the surface's own write path is `setMode`, not the clamp.
   */
  it("leaves the stored mode recoverable when the ceiling moves down and back", () => {
    const stored = "auto" as const;
    expect(clampMode(stored, 1)).toBe("confirm");
    expect(clampMode(stored, 4)).toBe("auto");
  });
});

/**
 * The governed-but-invisible gap. The real number is measured by `lint:tool-catalogue`, which
 * fails when it grows; these read the SHIPPED component and the two files the number comes from,
 * so the foot cannot drift back to CD's "four" or the ledger's "five" without a test saying so.
 *
 * The first version of this block asserted a string constant it had declared itself two lines
 * earlier — which proves the test file can hold a string, and nothing about what ships. Recorded
 * because that is the exact shape of a test that passes forever while the product is wrong.
 */
describe("what the surface says about the gap is the measured number", () => {
  /**
   * COMMENTS ARE STRIPPED FIRST, and this is the second time that has been the bug. The port
   * DOCUMENTS what it refused to carry — it quotes CD's "Four automation tools…" in the comment
   * that explains why the count was corrected — so a guard reading the raw file fires on the very
   * note proving the figure was fixed. `consoleTypography.test.ts` learned this on its own first
   * run. Read the code, never the prose about the code.
   */
  const surface = readFileSync(
    resolve(process.cwd(), "src/operator/surfaces/settings/CapabilitiesSurface.tsx"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");

  it("states twenty-three in the shipped foot, and not CD's four", () => {
    expect(surface).toContain("Twenty-three tools are gated at runtime but missing");
    expect(surface).not.toContain("Four automation tools");
  });

  it("still carries the two schema rules CD wrote, which are not figures but law", () => {
    expect(surface).toContain("anything sent through approval must carry approval");
    expect(surface).toContain("Auto-send cannot be expressed");
  });

  /**
   * And the number itself, derived the way the guard derives it: every tool in the runtime gate
   * that has no row in the catalogue. If a migration adds them, this drops and the guard's own
   * baseline check fails first — which is the ordering that makes the fix visible rather than
   * silent.
   */
  it("matches the live diff of the runtime gate against the catalogue", () => {
    const chat = readFileSync(
      resolve(process.cwd(), "supabase/functions/paige-ai-chat/index.ts"),
      "utf8",
    );
    const at = chat.indexOf("const MUTATING_TOOLS = new Set<string>([");
    const gate = new Set(
      [...chat.slice(chat.indexOf("[", at), chat.indexOf("]);", at)).matchAll(/"([a-z0-9_]+)"/g)].map(
        (m) => m[1],
      ),
    );

    const dir = resolve(process.cwd(), "supabase/migrations");
    let catalogue = new Set<string>();
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      const sql = readFileSync(resolve(dir, f), "utf8");
      if (!sql.includes("FUNCTION public.list_tool_autonomy")) continue;
      const from = sql.indexOf("WITH catalog(tool_key");
      catalogue = new Set(
        [...sql.slice(from, sql.indexOf("SELECT", from)).matchAll(/\('([a-z0-9_]+)',/g)].map(
          (m) => m[1],
        ),
      );
    }

    const invisible = [...gate].filter((k) => !catalogue.has(k));
    expect(gate.size).toBe(47);
    expect(catalogue.size).toBe(24);
    expect(invisible).toHaveLength(23);
    // The one that makes it more than bookkeeping: a permanent delete the operator cannot disable.
    expect(invisible).toContain("n8n_delete_workflow");
  });
});
