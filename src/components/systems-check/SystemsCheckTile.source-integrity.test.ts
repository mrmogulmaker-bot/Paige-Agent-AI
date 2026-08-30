import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/systems-check/SystemsCheckTile.tsx"),
  "utf8",
);

describe("SystemsCheckTile source-integrity boundary", () => {
  it("routes finding approval through the governed server mutation seam", () => {
    const args = source.match(
      /rpc\("approve_systems_check_finding",\s*\{(?<args>[\s\S]*?)\}\s*\)/,
    )?.groups?.args;
    const keys = args?.match(/\bp_[a-z_]+(?=\s*:)/g)?.sort();

    expect(keys).toEqual(["p_account_number", "p_finding_id", "p_scope"]);
    expect(args).toContain("p_scope: scope");
    expect(args).toContain("p_finding_id: f.id");
    expect(args).not.toMatch(/evidence|drafted_fix|action_payload|status|timestamp/i);
  });

  it("never mutates Systems Check source tables from the browser", () => {
    expect(source).not.toMatch(/\.from\(["']paige_systems_check_(?:finding|run)["']\)\s*\.(?:insert|update|upsert|delete)/s);
    expect(source).not.toContain('rpc("advance_action"');
  });
});
