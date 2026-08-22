import { describe, expect, it } from "vitest";
import { shouldRenderFloatingChatbot } from "./floatingChatVisibility";

describe("shouldRenderFloatingChatbot", () => {
  it.each([
    "/tenant-redesign",
    "/tenant-redesign/",
    "/admin",
    "/admin/clients-hub/pipeline",
    "/agency",
    "/agency/portfolio",
    "/business",
    "/business/clients",
    "/solo",
    "/solo/work",
    "/operator",
    "/operator/fleet",
    "/app",
    "/app/settings",
  ])("suppresses the redundant widget on PAIGE-owned shell %s", (pathname) => {
    expect(shouldRenderFloatingChatbot(pathname)).toBe(false);
  });

  it.each(["/about", "/pricing", "/portal/example", "/book/example", "/administrator-help"])(
    "keeps technically separate public/customer property %s eligible",
    (pathname) => expect(shouldRenderFloatingChatbot(pathname)).toBe(true),
  );

  it("does not use unsafe partial-prefix matching", () => {
    expect(shouldRenderFloatingChatbot("/administer")).toBe(true);
    expect(shouldRenderFloatingChatbot("/business-card-guide")).toBe(true);
  });
});
