import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TOOL_MAP,
  UNMAPPED_CATALOGUE_TOOLS,
  CAPABILITY_DOMAINS,
  toolsForCapability,
  maxModeForRisk,
  clampModeToRisk,
  postureOf,
} from "./capabilityTools";
// The ONE source of truth for action risk. Importing it here (test-only, never in the app bundle)
// is what makes the copied classes in capabilityTools.ts a guarded copy rather than a second source.
import { classifyAction } from "../../../supabase/functions/_shared/action-risk";

// The catalogue `list_tool_autonomy` exposes — DERIVED from the LATEST migration that defines the
// function, not hand-transcribed. A hand copy silently goes stale when a migration adds a governed
// tool, which is the exact "governed invisibly" failure the catalogue's own header warns about; a
// derived list makes that a hard test failure the moment the migration lands.
function catalogueKeysFromMigration(): string[] {
  const dir = path.join(process.cwd(), "supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  // list_tool_autonomy is CREATE OR REPLACE'd across several migrations; the highest-versioned file
  // that defines it holds the live catalogue.
  const defining = files.filter((f) =>
    /CREATE OR REPLACE FUNCTION public\.list_tool_autonomy/.test(fs.readFileSync(path.join(dir, f), "utf8")),
  );
  if (!defining.length) throw new Error("no migration defines list_tool_autonomy");
  const sql = fs.readFileSync(path.join(dir, defining[defining.length - 1]), "utf8");
  // Each catalogue row is `('<tool_key>', '<label>', '<category>'),`. Tool keys are lower_snake with
  // no spaces, so the first single-quoted lower-snake token after an opening paren is the key; labels
  // and categories (which start uppercase or contain spaces) never match this shape.
  const keys = [...sql.matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)].map((m) => m[1]);
  return [...new Set(keys)];
}
const CATALOGUE_KEYS: readonly string[] = catalogueKeysFromMigration();

describe("capabilityTools — no drift from the action-risk policy (§18)", () => {
  it("every mapped tool's copied risk class matches action-risk.ts exactly", () => {
    for (const [tool, { risk }] of Object.entries(TOOL_MAP)) {
      expect({ tool, risk: classifyAction(tool) }).toEqual({ tool, risk });
    }
  });

  it("no mapped tool is unclassified (a knob must front a real, runnable action)", () => {
    for (const tool of Object.keys(TOOL_MAP)) {
      expect(classifyAction(tool)).not.toBe("unclassified");
    }
  });

  it("the deliberately-unmapped catalogue tools are indeed unclassified phantoms", () => {
    for (const tool of UNMAPPED_CATALOGUE_TOOLS) {
      expect(classifyAction(tool)).toBe("unclassified");
    }
  });

  it("covers exactly the catalogue: every catalogue tool is mapped or explicitly excluded", () => {
    const accountedFor = new Set([...Object.keys(TOOL_MAP), ...UNMAPPED_CATALOGUE_TOOLS]);
    const catalogue = new Set(CATALOGUE_KEYS);
    // No catalogue tool is governed invisibly (present in the catalogue, absent from the surface).
    for (const tool of catalogue) expect(accountedFor.has(tool)).toBe(true);
    // No mapped tool is a ghost that the catalogue does not actually expose.
    for (const tool of Object.keys(TOOL_MAP)) expect(catalogue.has(tool)).toBe(true);
    for (const tool of UNMAPPED_CATALOGUE_TOOLS) expect(catalogue.has(tool)).toBe(true);
  });
});

describe("capabilityTools — domains and clamps", () => {
  it("every capability domain has at least one real tool", () => {
    for (const d of CAPABILITY_DOMAINS) expect(toolsForCapability(d.key).length).toBeGreaterThan(0);
  });

  it("every mapped tool belongs to a real domain key", () => {
    const keys = new Set(CAPABILITY_DOMAINS.map((d) => d.key));
    for (const { capability } of Object.values(TOOL_MAP)) expect(keys.has(capability)).toBe(true);
  });

  it("risk ceilings: ordinary→auto, high→confirm, owner_only→off", () => {
    expect(maxModeForRisk("ordinary")).toBe("auto");
    expect(maxModeForRisk("high")).toBe("confirm");
    expect(maxModeForRisk("owner_only")).toBe("off");
  });

  it("clamp never lets a mode exceed its risk ceiling (no false affordance §70.1)", () => {
    expect(clampModeToRisk("auto", "high")).toBe("confirm");
    expect(clampModeToRisk("auto", "owner_only")).toBe("off");
    expect(clampModeToRisk("confirm", "owner_only")).toBe("off");
    expect(clampModeToRisk("auto", "ordinary")).toBe("auto");
    expect(clampModeToRisk("off", "ordinary")).toBe("off");
  });

  it("owner_only always reads as 'Your call' regardless of stored mode", () => {
    expect(postureOf("auto", "owner_only")).toBe("your_call");
    expect(postureOf("off", "owner_only")).toBe("your_call");
    expect(postureOf("auto", "ordinary")).toBe("guardrails");
    expect(postureOf("confirm", "high")).toBe("asks");
    expect(postureOf("off", "ordinary")).toBe("held");
  });
});
