import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { TenantCommandCenterCore } from "./TenantCommandCenterCore";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("tenant Command Center core workspace", () => {
  it("renders only connected values or explicit unavailability and preserves the account tree", () => {
    const openPaige = vi.fn();
    const host = document.createElement("div");
    const root = createRoot(host);

    act(() => root.render(
      <MemoryRouter initialEntries={["/solo/1971670/command-center"]}>
        <TenantCommandCenterCore
          openPaige={openPaige}
          data={{
            greeting: { name: "Antonio", dateLabel: "Tuesday, August 25", summary: "You're all caught up." },
            metrics: [
              { label: "Active clients", value: "1", state: "LIVE" },
              { label: "Net revenue retention", state: "UNAVAILABLE", note: "No connected read yet" },
            ],
            approvals: [],
            attention: { at_risk_clients: 1, tasks_due: 2 },
            attentionState: "LIVE",
            departments: [{ slug: "ops", name: "Operations", displayOrder: 1, openCount: 3, workingCount: 1, awaitingCount: 1, lastActivityAt: null }],
            departmentState: "LIVE",
            loading: false,
            approve: vi.fn(),
            decline: vi.fn(),
            refresh: vi.fn(),
          }}
        />
      </MemoryRouter>,
    ));

    expect(host.textContent).toContain("Active clients");
    expect(host.textContent).toContain("Connected read");
    expect(host.textContent).toContain("Net revenue retention");
    expect(host.textContent).toContain("No connected read yet");
    expect(host.textContent).toContain("Trust Compass authority history");
    expect(host.textContent).toContain("UNAVAILABLE");
    expect(host.textContent).toContain("Attention · LIVE");
    expect(host.textContent).not.toMatch(/Bellweather|Ridgeline|Hartwell|Ledgerly/);
    expect(Array.from(host.querySelectorAll("a")).map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/solo/1971670/clients", "/solo/1971670/calendar", "/solo/1971670/setup"]),
    );

    const command = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Put PAIGE to work"),
    );
    act(() => command?.click());
    expect(openPaige).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("keeps secondary ownership out of Command Center and reuses the live Systems Check", () => {
    const agency = source("src/agency/CommandCenter.tsx");
    const solo = source("src/solo/CommandCenter.tsx");

    expect(agency).toContain("<AgencyCommandCenterCore");
    expect(solo).toContain("<SoloCommandCenterCore");
    expect(agency).not.toContain('["team", "Team Pulse"');
    expect(agency).not.toContain('["pipe", "Prospect Pipeline"');
    expect(agency).toMatch(/<SystemsCheckTile scope="tenant"\s*\/>/);
    expect(solo).toMatch(/<SystemsCheckTile scope="tenant"\s*\/>/);
  });

  it("uses independent workspace scroll regions without document-level sizing", () => {
    const css = source("src/components/tenant-shell/tenant-command-center-core.css");
    expect(css).toContain(".tcc-queue-scroll");
    expect(css).toMatch(/\.tcc-queue-scroll[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.tcc-signal[^}]*overflow-y:\s*auto/s);
    expect(css).not.toContain("100vh");
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
