import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Marketplace scroll ownership", () => {
  it("gives Marketplace the same full-height route contract as other inner-scroll workspaces", () => {
    const app = readFileSync(resolve(process.cwd(), "src/solo/SoloApp.tsx"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/solo/marketplace.css"), "utf8");
    expect(app).toMatch(/const full=[^;]*route==='market'/);
    expect(css).toMatch(/\.mk-body\{[^}]*overflow-y:auto[^}]*overflow-x:hidden/s);
    expect(css).not.toMatch(/\.mk-workspace\{[^}]*overflow:auto/s);
  });
});
