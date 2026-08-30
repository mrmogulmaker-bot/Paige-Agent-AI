import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const analyticsSource = readFileSync(resolve(process.cwd(), "src/solo/analytics2.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "src/solo/SoloApp.tsx"), "utf8");
const analyticsCss = readFileSync(resolve(process.cwd(), "src/solo/analytics2.css"), "utf8");

describe("Solo Analytics evidence-first contract", () => {
  it("retires fixture metrics, page-local PAIGE, benchmarks, and simulated actions", () => {
    expect(analyticsSource).not.toContain("./analytics-data");
    expect(analyticsSource).not.toContain("AskPop");
    expect(analyticsSource).not.toContain("AN_ANS");
    expect(analyticsSource).not.toContain("setTimeout");
    expect(analyticsSource).not.toContain("Approve fix");
    expect(analyticsSource).not.toContain("You against comparable businesses");
    expect(analyticsSource).not.toContain("Run the dunning sequence");
  });

  it("renders the approved unavailable evidence fields without querying the rail", () => {
    for (const label of [
      "UNAVAILABLE",
      "NOT CONNECTED",
      "Metric identity",
      "Definition",
      "Formula / version",
      "Exact requested range",
      "Source references",
      "Contributing records",
      "Completeness / coverage",
      "Exclusions",
      "Freshness / queried at",
      "Truth state",
    ]) {
      expect(analyticsSource).toContain(label);
    }

    for (const forbiddenRailField of [
      "get_client_rail",
      "paige_client_events",
      "record_rail_event",
      "rail.title",
      "rail.summary",
      "rail.payload",
    ]) {
      expect(analyticsSource).not.toContain(forbiddenRailField);
    }
  });

  it("reuses the resolved tenant context and the one shell-owned PAIGE workspace", () => {
    expect(appSource).toContain("analytics:<Analytics2 accountContext={accountContext} openPaige={openPaige}/>");
    expect(analyticsSource).toContain("accountContext");
    expect(analyticsSource).toContain("openPaige");
    expect(analyticsSource).toContain("Open PAIGE workspace");
    expect(analyticsSource).not.toContain("SoloPaigeWorkspace");
  });

  it("owns its internal scroll, both responsive layouts, focus treatment, and reduced motion", () => {
    expect(analyticsCss).toContain("container:solo-analytics/inline-size");
    expect(analyticsCss).toContain("height:100%;min-height:0;overflow:auto");
    expect(analyticsCss).toContain("@container solo-analytics (max-width:900px)");
    expect(analyticsCss).toContain("@container solo-analytics (max-width:650px)");
    expect(analyticsCss).toContain("@media(prefers-reduced-motion:reduce)");
    expect(analyticsCss).toContain("outline:2px solid var(--ring)");
    expect(analyticsCss).toContain("box-shadow:var(--pg-lift-1)");
    expect(analyticsCss).toContain("box-shadow:var(--pg-e4)");
    expect(analyticsCss).not.toMatch(/--pg-(?:shadow-sm|shadow-lg|bg|card)\b/);
  });
});
