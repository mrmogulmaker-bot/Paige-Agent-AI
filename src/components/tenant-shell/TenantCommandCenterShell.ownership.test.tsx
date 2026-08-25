import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TenantPaigeCommandField } from "./TenantCommandCenterShell";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("tenant shell owns one PAIGE surface", () => {
  it.each([
    ["agency", "src/agency/AgencyApp.tsx"],
    ["solo", "src/solo/SoloApp.tsx"],
  ])("keeps the %s v3 owner on TenantCommandCenterShell without the legacy panel", (_tier, path) => {
    const owner = source(path);
    expect(owner.match(/<TenantCommandCenterShell/g)).toHaveLength(1);
    expect(owner).not.toContain("<PaigePanel");
    expect(owner).not.toMatch(/import\s+\{\s*PaigePanel\s*\}/);
    expect(owner).toContain("expandRail");
  });

  it("keeps business on the corrected shared agency shell", () => {
    const business = source("src/business/BusinessEntry.tsx");
    const sharedOwner = source("src/agency/AgencyApp.tsx");
    expect(business).toContain('import AgencyApp from "@/agency/AgencyApp"');
    expect(business).toContain('<AgencyApp mode="subaccount" />');
    expect(sharedOwner.match(/<TenantCommandCenterShell/g)).toHaveLength(1);
    expect(sharedOwner).not.toContain("<PaigePanel");
  });

  it("keeps the legacy panel available only for non-v3 hosts", () => {
    expect(source("src/solo/agent.tsx")).toContain("export const PaigePanel=");
  });

  it("preserves operator ownership and Studio's immersive bypass", () => {
    const admin = source("src/components/admin/AdminLayout.tsx");
    expect(admin).toContain("if (!godMode)");
    expect(admin).toContain('isStudio ? (');
    expect(admin).toContain('<div className="h-dvh min-h-0 overflow-hidden bg-background">{children}</div>');
    expect(admin.indexOf('isStudio ? (')).toBeLessThan(admin.indexOf('<TenantCommandCenterShell'));
  });
});

describe("tenant PAIGE command field", () => {
  it("opens the surviving workspace through one restrained command control", () => {
    const onOpen = vi.fn();
    const host = document.createElement("div");
    const root = createRoot(host);

    act(() => root.render(<TenantPaigeCommandField expanded={false} onOpen={onOpen} />));
    const command = host.querySelector<HTMLButtonElement>("[data-tenant-paige-command]");

    expect(command).not.toBeNull();
    expect(command?.textContent).toContain("Direct PAIGE, or press ⌘K");
    expect(command?.querySelector("kbd")?.textContent).toBe("⌘K");
    expect(command?.getAttribute("aria-controls")).toBe("tenant-paige-workspace");
    expect(host.querySelectorAll("[data-tenant-paige-command]")).toHaveLength(1);

    act(() => command?.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("routes the command field into expandRail instead of another chat instance", () => {
    const shell = source("src/components/tenant-shell/TenantCommandCenterShell.tsx");
    expect(shell).toMatch(/const openPaige = useCallback\(\(\) => \{\s*expandRail\(\)/);
    expect(shell).toContain("<TenantPaigeCommandField expanded={railExpanded} onOpen={openPaige} />");
    expect(shell.match(/function PaigeWorkspace\(/g)).toHaveLength(1);
  });
});

describe("PAIGE message presentation", () => {
  it("renders no illustrated PAIGE avatar and leaves no avatar gutter", () => {
    const chat = source("src/components/dashboard/PaigeAIChat.tsx");
    expect(chat).not.toContain("paige-ai-avatar.png");
    expect(chat).not.toContain("paigeAvatar");
    expect(chat).not.toContain("pl-[35px]");
    expect(chat).not.toContain("pl-[52px]");
  });
});
