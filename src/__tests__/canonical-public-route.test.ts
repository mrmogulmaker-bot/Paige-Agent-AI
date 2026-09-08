import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("canonical public homepage routes", () => {
  it("redirects superseded public design paths to the one canonical homepage", () => {
    expect(app).toContain('<Route path="/premium" element={<Navigate to="/" replace />} />');
    expect(app).toContain('<Route path="/legacy" element={<Navigate to="/" replace />} />');
  });

  it("does not compile or mount the superseded homepage components", () => {
    expect(app).not.toContain("./pages/PremiumHero");
    expect(app).not.toContain("./pages/Index");
    expect(app).not.toContain("<PremiumHero");
    expect(app).not.toContain("<Index");
  });
});
