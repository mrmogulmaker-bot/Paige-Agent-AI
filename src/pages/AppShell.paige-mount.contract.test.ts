import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AppShell PAIGE mount contract", () => {
  const source = readFileSync("src/pages/AppShell.tsx", "utf8");

  it("keeps one PaigeChat mount across responsive layout changes", () => {
    expect(source.match(/<PaigeChat\b/g)).toHaveLength(1);
    expect(source).not.toContain("if (isMobile)");
  });
});
