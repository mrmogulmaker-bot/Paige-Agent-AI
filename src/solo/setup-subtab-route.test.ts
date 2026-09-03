import { describe, expect, it } from "vitest";
import { SOLO_SETUP_TABS } from "./settings-business-context-contract";
import { resolveSetupSubtabRoute, setupSubtabPath } from "./setup-subtab-route";

describe("Solo Setup child addresses", () => {
  it.each(SOLO_SETUP_TABS)(
    "resolves %s identically for every Solo account",
    (tab) => {
      for (const account of ["100", "9082725", "3212141"])
        expect(
          resolveSetupSubtabRoute(setupSubtabPath(account, tab), account),
        ).toEqual({ kind: "tab", tab });
    },
  );
  it.each([
    "/solo/100/settings",
    "/solo/100/settings/",
    "/solo/100/settings/setup",
    "/solo/100/settings/setup/",
  ])("preserves index entry %s", (path) => {
    expect(resolveSetupSubtabRoute(path, "100")).toEqual({ kind: "index" });
  });
  it.each(["unknown", "business-profile/extra", "../team", "Business-profile"])(
    "refuses invalid leaf %s",
    (leaf) => {
      expect(
        resolveSetupSubtabRoute(`/solo/100/settings/setup/${leaf}`, "100"),
      ).toEqual({ kind: "invalid" });
    },
  );
  it.each([
    "/solo/200/settings/setup/direction",
    "/solo/100/settings/team",
    "/agency/100/settings/setup/direction",
    "/business/100/settings/setup/direction",
    "/admin/setup",
    "/solo/100/settings/setup-other",
  ])("does not treat %s as a same-workspace sibling", (path) => {
    expect(resolveSetupSubtabRoute(path, "100")).toEqual({ kind: "outside" });
  });
});
