import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Settings } from "lucide-react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TenantCommandCenterShell, TenantPaigeCommandField } from "./TenantCommandCenterShell";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/admin/AdminBridgeBell", () => ({ AdminBridgeBell: () => null }));
vi.mock("@/components/admin/voice/DialPadTrigger", () => ({ DialPadTrigger: () => null }));
vi.mock("@/components/ui/paige", () => ({
  useAgentPresence: () => ({ railExpanded: false, expandRail: vi.fn(), collapseRail: vi.fn() }),
}));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

  it("reuses the existing immersive Vibe Studio from Campaigns and returns through its owner", () => {
    const solo = source("src/solo/SoloApp.tsx");
    const campaigns = source("src/solo/growth2.tsx");
    const vibe = source("src/solo/vibe.tsx");

    expect(campaigns).toContain("window.dispatchEvent(new CustomEvent('paige-studio'))");
    expect(campaigns).toContain(">Vibe Studio</button>");
    expect(campaigns).toContain('eyebrow="Campaigns"');
    expect(campaigns).not.toContain('eyebrow="Growth & acquisition"');
    expect(solo).toContain("window.addEventListener('paige-studio',h)");
    expect(solo).toContain("<VibeStudio onBack={()=>setStudio(false)}/>");
    expect(solo.match(/<VibeStudio/g)).toHaveLength(1);
    expect(vibe).toContain("Back to Campaigns");
    expect(vibe).not.toContain("Back to Growth");
  });

  it("restores focus to the Solo main-menu owner after Back or Escape closes Settings", () => {
    const shell = source("src/components/tenant-shell/TenantCommandCenterShell.tsx");

    expect(shell).toContain("queueSoloContextualExit");
    expect(shell).toContain("data-tenant-destination={id}");
    expect(shell).toMatch(/focusReturnDestination\.current[\s\S]*?\.focus\(\)/);
  });

  it.each(["back", "escape"])("returns focus to Settings after the %s exit", async (exit) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const shellProps = {
      accountName: "Supplied Solo account",
      accountType: "standalone",
      userRole: "admin" as const,
      onSignOut: vi.fn(),
    };

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/42/settings/connections"]}>
          <Routes>
            <Route
              path="/solo/42/settings/*"
              element={
                <TenantCommandCenterShell
                  {...shellProps}
                  contextualNavigation={{
                    label: "Settings",
                    backHref: "/solo/42/command-center",
                    backLabel: "Back to PAIGE",
                    activeId: "connections",
                    items: [{ id: "connections", label: "Connections", href: "/solo/42/settings/connections", icon: Settings }],
                  }}
                >
                  <p>Settings workspace</p>
                </TenantCommandCenterShell>
              }
            />
            <Route path="/solo/42/command-center" element={<TenantCommandCenterShell {...shellProps}><p>Command Center</p></TenantCommandCenterShell>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    if (exit === "back") {
      await act(async () => host.querySelector<HTMLAnchorElement>(".tcs-context-back")?.click());
    } else {
      await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    }
    await act(async () => new Promise((resolveFrame) => window.requestAnimationFrame(() => resolveFrame(undefined))));

    const settings = host.querySelector<HTMLAnchorElement>('[data-tenant-destination="settings"]');
    expect(settings).not.toBeNull();
    expect(document.activeElement).toBe(settings);
    expect(
      Array.from(host.querySelectorAll<HTMLElement>("[data-tenant-destination]"))
        .map((item) => item.textContent?.trim()),
    ).toEqual(["Command Center", "Clients", "Campaigns", "Marketplace", "Analytics", "Settings"]);

    await act(async () => root.unmount());
    host.remove();
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
