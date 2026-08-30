import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./SystemsCheckTile.tsx", import.meta.url)),
  "utf8",
);

describe("SystemsCheckTile source-integrity boundary", () => {
  it("routes finding approval through the governed server mutation seam", () => {
    expect(source).toContain('rpc("approve_systems_check_finding"');
    expect(source).toContain("p_account_number:");
    expect(source).toContain("p_scope: scope");
    expect(source).toContain("p_finding_id: f.id");
  });

  it("never mutates Systems Check source tables from the browser", () => {
    expect(source).not.toMatch(/\.from\(["']paige_systems_check_(?:finding|run)["']\)\s*\.(?:insert|update|upsert|delete)/s);
    expect(source).not.toContain('rpc("advance_action"');
  });
});
