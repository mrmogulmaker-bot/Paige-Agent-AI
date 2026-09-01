import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("canonical Solo shell contract", () => {
  it("records the current-and-future Solo invariant in the canonical route doctrine", () => {
    const doctrine = source("docs/doctrine/route-and-url-taxonomy.md");
    expect(doctrine).toContain("Every current and future Solo tenant mounts the same canonical shell chain");
    expect(doctrine).toContain("SoloEntry → SoloApp → TenantCommandCenterShell → SoloSettings");
    expect(doctrine).toContain("Tenant context may change data, permissions, entitlements, and proven capability state; it must never fork the Solo shell");
  });

  it("keeps every Solo account address on the one dynamic shell owner", () => {
    const entry = source("src/solo/SoloEntry.tsx");
    const app = source("src/solo/SoloApp.tsx");
    expect(entry).toContain('<Route path=":account/*" element={<SoloApp />} />');
    expect(app.match(/<TenantCommandCenterShell/g)).toHaveLength(1);
    expect(app.match(/<SoloPaigeWorkspace/g)).toHaveLength(1);
    expect(app.match(/data-solo-screen-host/g)).toHaveLength(1);
    expect(app).toContain("resolveTenantAccountContext");
  });

  it("treats the URL account as an address and server-resolved tenant context as authority", () => {
    const entry = source("src/solo/SoloEntry.tsx");
    const app = source("src/solo/SoloApp.tsx");
    expect(entry).toContain("The URL account is an address only");
    expect(entry).toContain("accountContextStatus");
    expect(app).toContain("activeTenant?.account_number");
    expect(app).toContain("String(own) !== String(urlAccount)");
  });

  it("cannot restore a mutable per-tenant selector for the canonical Solo shell", () => {
    const admin = source("src/pages/Admin.tsx");
    const context = source("src/hooks/useTenantContext.tsx");

    expect(admin).toContain("resolveCanonicalSoloAdminOwner");
    expect(admin).toContain("CanonicalSoloAdminHandoff");
    expect(admin).not.toContain("<SoloApp");
    expect(admin).not.toMatch(/soloShellEnabled|solo_shell_enabled/);
    expect(context).not.toMatch(/soloShellEnabled|solo_shell_enabled/);
  });
});
