import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Settings } from "lucide-react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TenantCommandCenterShell, TenantPaigeCommandField } from "./TenantCommandCenterShell";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/admin/AdminBridgeBell", () => ({ AdminBridgeBell: () => null }));
vi.mock("@/components/admin/voice/DialPadTrigger", () => ({ DialPadTrigger: () => null }));
vi.mock("@/components/ui/paige", () => ({
  AgentPresenceProvider: ({ children }: { children: React.ReactNode }) => children,
  useAgentPresence: () => {
    const [railExpanded, setRailExpanded] = useState(false);
    return {
      railExpanded,
      expandRail: () => setRailExpanded(true),
      collapseRail: () => setRailExpanded(false),
    };
  },
}));
vi.mock("@/hooks/usePendingApprovals", () => ({ usePendingApprovals: () => ({ items: [] }) }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({
    activeTenant: { account_number: "42", name: "Supplied Solo account", account_type: "standalone", parent_tenant_id: null },
  }),
}));
vi.mock("@/lib/voice/VoiceDeviceProvider", () => ({ VoiceDeviceProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/admin/voice/DialPadSurface", () => ({ DialPadSurface: () => null }));
vi.mock("@/components/admin/voice/IncomingCallOverlay", () => ({ IncomingCallOverlay: () => null }));
vi.mock("@/components/admin/voice/LiveTranscriptPanel", () => ({ LiveTranscriptPanel: () => null }));
vi.mock("@/solo/CommandCenter", () => ({ CommandHub: () => null }));
vi.mock("@/solo/paigehub", () => ({ PaigeHub: () => null }));
vi.mock("@/solo/SoloPaigeWorkspace", () => ({ SoloPaigeWorkspace: () => <div data-solo-paige-test-workspace /> }));
vi.mock("@/solo/compass", () => ({ TrustCompass: () => null }));
vi.mock("@/solo/automations-build", () => ({ AutomationsHub: () => null }));
vi.mock("@/components/tenant-relationships/TenantRelationshipsClientsWorkspace", () => ({ TenantRelationshipsClientsWorkspace: () => null }));
vi.mock("@/solo/conversations", () => ({ ClientsHub: () => null }));
vi.mock("@/components/tenant-calendar/TenantCanonicalCalendarWorkspace", () => ({ TenantCanonicalCalendarWorkspace: () => null }));
vi.mock("@/solo/analytics2", () => ({ Analytics2: () => null }));
vi.mock("@/solo/marketplace", () => ({ Marketplace: () => null }));
vi.mock("@/solo/settings", () => ({ SoloSettings: () => null }));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RouteProbe = () => {
  const location = useLocation();
  return <output data-route-probe>{location.pathname}</output>;
};

const settlePaigeFocus = async () => {
  await new Promise<void>((resolveFrame) => window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => resolveFrame());
  }));
};

const PaigeWorkspaceFixture = () => {
  const surfaces = ["Chat", "Knowledge", "Helpers", "Capabilities"];
  const [activeSurface, setActiveSurface] = useState(surfaces[0]);
  const [draft, setDraft] = useState("Draft survives folding");
  return (
    <div>
      <div role="tablist" aria-label="PAIGE workspace views">
        {surfaces.map((surface) => (
          <button
            key={surface}
            type="button"
            role="tab"
            aria-selected={activeSurface === surface}
            onClick={() => setActiveSurface(surface)}
          >
            {surface}
          </button>
        ))}
      </div>
      <p data-paige-active-surface>{activeSurface}</p>
      <input aria-label="Persistent PAIGE draft" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
      <button type="button" onClick={() => setDraft("")}>Clear draft</button>
    </div>
  );
};

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

    expect(campaigns).toContain("detail:{returnFocus:event.currentTarget}");
    expect(campaigns).toContain("data-solo-vibe-studio-launcher");
    expect(campaigns).toContain(">Vibe Studio</button>");
    expect(campaigns).toContain('eyebrow="Campaigns"');
    expect(campaigns).not.toContain('eyebrow="Growth & acquisition"');
    expect(solo).toContain("window.addEventListener('paige-studio',h)");
    expect(solo).toContain("<VibeStudio onBack={closeStudio}/>");
    expect(solo.match(/<VibeStudio/g)).toHaveLength(1);
    expect(vibe).toContain("Back to Campaigns");
    expect(vibe).not.toContain("Back to Growth");
  });

  it.each(["back", "escape"])("restores the real Campaigns Vibe Studio launcher after %s closes the mounted owner", async (exit) => {
    const { default: SoloApp } = await import("@/solo/SoloApp");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/42/growth"]}>
          <Routes>
            <Route path="/solo/:account/*" element={<><SoloApp /><RouteProbe /></>} />
          </Routes>
        </MemoryRouter>,
      );
    });

    const launcher = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.trim() === "Vibe Studio");
    expect(launcher).toBeTruthy();
    launcher?.focus();
    expect(document.activeElement).toBe(launcher);
    await act(async () => launcher?.click());

    const back = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("Back to Campaigns"));
    expect(back).toBeTruthy();
    back?.focus();
    expect(document.activeElement).toBe(back);

    if (exit === "back") {
      await act(async () => back?.click());
    } else {
      await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    }

    expect(host.textContent).not.toContain("Back to Campaigns");
    expect(document.activeElement).toBe(launcher);
    expect(host.querySelector("[data-route-probe]")?.textContent).toBe("/solo/42/growth");

    await act(async () => root.unmount());
    host.remove();
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
  it("lets the native hidden state win over the authored PAIGE layout", () => {
    const css = source("src/components/tenant-shell/tenant-command-center-shell.css");
    expect(css).toMatch(/\.tcs-paige\[hidden\]\s*\{[^}]*display:\s*none;/);
  });

  it("keeps the mounted Chat and management workspace non-present while folded and restores its launcher", async () => {
    const styles = document.createElement("style");
    styles.textContent = source("src/components/tenant-shell/tenant-command-center-shell.css");
    document.head.appendChild(styles);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/42/command-center"]}>
          <TenantCommandCenterShell
            accountName="Solo account"
            accountType="standalone"
            userRole="admin"
            onSignOut={vi.fn()}
            soloPaigeWorkspace={<PaigeWorkspaceFixture />}
          >
            <p>Main CRM remains usable</p>
          </TenantCommandCenterShell>
        </MemoryRouter>,
      );
    });

    const workspace = host.querySelector<HTMLElement>("#tenant-paige-workspace");
    const command = host.querySelector<HTMLButtonElement>("[data-tenant-paige-command]");
    const draft = host.querySelector<HTMLInputElement>('[aria-label="Persistent PAIGE draft"]');
    expect(workspace?.hidden).toBe(true);
    expect(workspace && getComputedStyle(workspace).display).toBe("none");
    expect(command?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => host.querySelector<HTMLButtonElement>("[data-tenant-paige-command]")?.click());
    expect(host.querySelector("#tenant-paige-workspace")).toBe(workspace);
    expect(workspace?.hidden).toBe(false);
    expect(workspace && getComputedStyle(workspace).display).toBe("flex");
    expect(host.querySelector("[data-tenant-paige-command]")?.getAttribute("aria-expanded")).toBe("true");

    for (const [index, activeSurface] of ["Chat", "Knowledge", "Helpers", "Capabilities"].entries()) {
      const surface = Array.from(workspace?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((button) => button.textContent === activeSurface);
      await act(async () => surface?.click());
      surface?.focus();
      expect(document.activeElement).toBe(surface);
      expect(surface?.getAttribute("aria-selected")).toBe("true");
      expect(workspace?.querySelector("[data-paige-active-surface]")?.textContent).toBe(activeSurface);

      await act(async () => {
        if (index % 2 === 0) {
          workspace?.querySelector<HTMLButtonElement>('[aria-label="Fold PAIGE conversation"]')?.click();
        } else {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }
        await settlePaigeFocus();
      });

      expect(host.querySelector("#tenant-paige-workspace")).toBe(workspace);
      expect(workspace?.hidden).toBe(true);
      expect(workspace && getComputedStyle(workspace).display).toBe("none");
      expect(workspace?.contains(document.activeElement)).toBe(false);
      expect(document.activeElement).toBe(host.querySelector("[data-tenant-paige-command]"));
      expect(host.querySelector("[data-tenant-paige-command]")?.getAttribute("aria-expanded")).toBe("false");
      expect(draft?.value).toBe("Draft survives folding");

      await act(async () => host.querySelector<HTMLButtonElement>("[data-tenant-paige-command]")?.click());
      expect(host.querySelector("#tenant-paige-workspace")).toBe(workspace);
      expect(host.querySelector('[aria-label="Persistent PAIGE draft"]')).toBe(draft);
      expect(draft?.value).toBe("Draft survives folding");
      expect(workspace?.querySelector("[data-paige-active-surface]")?.textContent).toBe(activeSurface);
      expect(host.querySelectorAll("#tenant-paige-workspace")).toHaveLength(1);
    }

    await act(async () => root.unmount());
    host.remove();
    styles.remove();
  });

  it("moves the one Solo workspace into a pop-out host instead of loading a second app", () => {
    const shell = source("src/components/tenant-shell/TenantCommandCenterShell.tsx");
    expect(shell).toContain('import { createPortal } from "react-dom"');
    expect(shell).toContain("paigePortalHost");
    expect(shell).toContain("createPortal(");
    expect(shell).toContain("popoutReturnFocusRef");
    expect(shell).toMatch(/if \(soloPaigeWorkspace\)[\s\S]*return;[\s\S]*next\.searchParams\.set\("paigeSurface", "detached"\)/);
    expect(shell).toContain("if (detached && !soloPaigeWorkspace)");
    expect(shell.match(/content=\{soloPaigeWorkspace\}/g)).toHaveLength(1);
  });

  it("keeps the identical mounted Solo workspace interactive after redock and a second pop-out native close", async () => {
    const styles = document.createElement("style");
    styles.textContent = source("src/components/tenant-shell/tenant-command-center-shell.css");
    document.head.appendChild(styles);
    const popupRecords = ["first", "second"].map((name) => {
      const popupDocument = document.implementation.createHTMLDocument(`PAIGE ${name} popup`);
      let beforeUnload: EventListener | null = null;
      const popupRecord = {
        document: popupDocument,
        closed: false,
        focus: vi.fn(),
        addEventListener: vi.fn((type: string, listener: EventListener) => { if (type === "beforeunload") beforeUnload = listener; }),
        close: vi.fn(() => {
          beforeUnload?.(new Event("beforeunload"));
          popupRecord.closed = true;
        }),
        nativeClose: () => {
          beforeUnload?.(new Event("beforeunload"));
          popupRecord.closed = true;
        },
      };
      return popupRecord;
    });
    const open = vi.spyOn(window, "open")
      .mockReturnValueOnce(popupRecords[0] as unknown as Window)
      .mockReturnValueOnce(popupRecords[1] as unknown as Window);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/42/command-center"]}>
          <TenantCommandCenterShell accountName="Solo account" accountType="standalone" userRole="admin" onSignOut={vi.fn()} soloPaigeWorkspace={<PaigeWorkspaceFixture />}>
            <p>Main CRM remains usable</p>
          </TenantCommandCenterShell>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-tenant-paige-command]")?.click();
      await Promise.resolve();
    });
    const workspace = host.querySelector("#tenant-paige-workspace");
    const draft = host.querySelector<HTMLInputElement>('[aria-label="Persistent PAIGE draft"]');
    expect(workspace).not.toBeNull();
    expect((workspace as HTMLElement | null)?.hidden).toBe(false);
    expect(draft?.value).toBe("Draft survives folding");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Open PAIGE in a new window"]')?.click();
      await Promise.resolve();
    });
    expect(host.querySelector("#tenant-paige-workspace")).toBeNull();
    expect(popupRecords[0].document.body.querySelector("#tenant-paige-workspace")).toBe(workspace);
    expect(popupRecords[0].document.body.querySelector('[aria-label="Persistent PAIGE draft"]')).toBe(draft);
    expect(popupRecords[0].document.body.querySelector('[aria-label="Fold PAIGE conversation"]')).toBeNull();
    expect(host.textContent).toContain("Main CRM remains usable");

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-tenant-paige-command]")?.click();
      await Promise.resolve();
    });
    expect(popupRecords[0].focus).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".tcs-paige-backdrop")).toBeNull();
    expect(host.querySelectorAll("#tenant-paige-workspace")).toHaveLength(0);
    expect(popupRecords[0].document.body.querySelectorAll("#tenant-paige-workspace")).toHaveLength(1);

    await act(async () => {
      popupRecords[0].document.body.querySelector<HTMLButtonElement>('[aria-label="Dock PAIGE back into the workspace"]')?.click();
      await Promise.resolve();
    });
    expect(host.querySelector("#tenant-paige-workspace")).toBe(workspace);
    expect(host.querySelector('[aria-label="Persistent PAIGE draft"]')).toBe(draft);
    expect(draft?.value).toBe("Draft survives folding");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Open PAIGE in a new window"]')?.click();
      await Promise.resolve();
    });
    expect(popupRecords[1].document.body.querySelector("#tenant-paige-workspace")).toBe(workspace);

    await act(async () => {
      popupRecords[1].nativeClose();
      expect(host.querySelector("#tenant-paige-workspace")).toBe(workspace);
      await Promise.resolve();
    });

    for (const activeSurface of ["Chat", "Knowledge", "Helpers", "Capabilities"]) {
      const surface = Array.from(workspace?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
        .find((button) => button.textContent === activeSurface);
      await act(async () => surface?.click());
      expect(workspace?.querySelector("[data-paige-active-surface]")?.textContent).toBe(activeSurface);
    }

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(draft, "Recovered draft");
      draft?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(draft?.value).toBe("Recovered draft");

    const clearDraft = Array.from(workspace?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent === "Clear draft");
    await act(async () => clearDraft?.click());
    expect(draft?.value).toBe("");
    expect(host.querySelectorAll("#tenant-paige-workspace")).toHaveLength(1);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Fold PAIGE conversation"]')?.click();
      await settlePaigeFocus();
    });
    expect(host.querySelectorAll("#tenant-paige-workspace")).toHaveLength(1);
    expect((workspace as HTMLElement | null)?.hidden).toBe(true);
    expect(workspace && getComputedStyle(workspace).display).toBe("none");
    expect(document.activeElement).toBe(host.querySelector("[data-tenant-paige-command]"));
    expect(popupRecords[0].closed).toBe(true);
    expect(popupRecords[1].closed).toBe(true);

    await act(async () => root.unmount());
    host.remove();
    styles.remove();
    open.mockRestore();
  });

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
    const solo = source("src/solo/SoloApp.tsx");
    expect(shell).toMatch(/const openPaige = useCallback\(\(\) => \{[\s\S]*child\.focus\(\);[\s\S]*expandRail\(\)/);
    expect(shell).toMatch(/<TenantPaigeCommandField[^>]*expanded=\{railExpanded \|\| paigeFull\}[^>]*onOpen=\{openPaige\}/);
    expect(shell.match(/function PaigeWorkspace\(/g)).toHaveLength(1);
    expect(shell).toContain("soloPaigeWorkspace");
    expect(shell).toContain("paigeFull");
    expect(shell).toContain('!railExpanded || paigeOverlay ? "0px"');
    expect(solo).not.toContain("paige:<PaigeHub/>");
    expect(solo).toContain("<SoloPaigeWorkspace");
    expect(solo.match(/<SoloPaigeWorkspace/g)).toHaveLength(1);
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
