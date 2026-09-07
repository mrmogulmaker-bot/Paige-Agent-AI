import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformUpdateBannerView } from "./PlatformUpdateBanner";
import type { CustomerUpdateManifest } from "@/hooks/usePlatformUpdate";

const release: CustomerUpdateManifest = {
  schemaVersion: 1,
  releaseName: "Paige Solo Preview",
  version: "0.8",
  date: "2026-09-06",
  customerOutcome: "Owners can review a clearer client workflow.",
  whatChanged: "The client view now explains next steps.",
  whoCanUseIt: "Solo owners.",
  ownerAction: "Open Clients and review the updated view.",
  status: ["LIVE", "PROOF OWED"],
  knownLimitations: "Mobile proof remains owed.",
  safeNextStep: "Use the current desktop path.",
};

describe("PlatformUpdateBannerView", () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  const render = (props: Partial<React.ComponentProps<typeof PlatformUpdateBannerView>> = {}) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<PlatformUpdateBannerView
      updateAvailable
      customerUpdate={null}
      recentRelease={null}
      reload={() => true}
      dismiss={() => undefined}
      {...props}
    />));
    return host;
  };

  afterEach(() => {
    if (root) act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("keeps routine deployments generic and removes the unproven session claim", () => {
    const view = render();
    expect(view.textContent).toContain("An update is ready");
    expect(view.textContent).not.toContain("new version of Paige");
    expect(view.textContent).not.toContain("stay signed in");
    expect(view.querySelector("button")?.textContent).toContain("Reload");
  });

  it("shows approved release identity and expands canonical notes", () => {
    const view = render({ customerUpdate: release });
    expect(view.textContent).toContain("Paige Solo Preview 0.8 is ready");
    const whatsNew = [...view.querySelectorAll("button")].find((button) => button.textContent?.includes("What's new"));
    act(() => whatsNew?.click());
    expect(view.textContent).toContain(release.whatChanged);
    expect(view.textContent).toContain("PROOF OWED");
  });

  it("keeps release notes available after reload without another reload action", () => {
    const view = render({ updateAvailable: false, recentRelease: release });
    expect(view.textContent).toContain("Paige Solo Preview 0.8 is ready");
    expect([...view.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Reload")).toBe(false);
  });

  it("explains when registered work blocks reload", () => {
    const reload = vi.fn(() => false);
    const view = render({ reload });
    const reloadButton = [...view.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Reload");
    act(() => reloadButton?.click());
    expect(reload).toHaveBeenCalledOnce();
    expect(view.textContent).toContain("Finish or save your current work before reloading.");
  });
});
