// §58 / §37 regression guard — canonical agency act-as landing.
// Every producer must call the server-authorized transition, remember the chosen
// child, and navigate to the full canonical path derived from the server roster.
// This structural guard inventories all three producers; authenticated runtime
// proof remains separate.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PRODUCERS = [
  { file: "src/components/admin/AccountSwitcher.tsx", arg: "child.id", navigates: true },
  { file: "src/pages/admin/AgencyBoard.tsx", arg: "childId", navigates: true },
  { file: "src/agency/AgencyApp.tsx", arg: "childId", navigates: false },
] as const;

describe("agency act-as canonical landing", () => {
  it.each(PRODUCERS)("$file records the chosen context before canonical navigation", ({ file, arg, navigates }) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("agency_enter_subaccount");

    const remembers = src.indexOf(`rememberWorkspaceEntered(${arg})`);
    expect(remembers).toBeGreaterThan(-1);

    if (navigates) {
      expect(src).toContain('authorizedRootForTier("sub_account",');
      expect(src).toContain("window.location.assign(root)");
      expect(src).not.toMatch(/`\$\{root\}\/command-center`/);
      expect(remembers).toBeLessThan(src.indexOf("window.location.assign(root)"));
    }
  });
});