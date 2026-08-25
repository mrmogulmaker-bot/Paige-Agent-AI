import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SLOTS } from "@/operator/ia/operatorIA";
import { branchBySlug } from "@/lib/routing/tierBranches";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { TenantSystemsCheckSecondaryView } from "./TenantSystemsCheckSecondaryView";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const useSystemsCheck = vi.fn();

vi.mock("@/hooks/useSystemsCheck", () => ({
  useSystemsCheck: (...args: unknown[]) => useSystemsCheck(...args),
}));

function ActAsSubtabHarness() {
  const [tab, setTab] = useSubtabRoute("agency", "command-center", "main");
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  return (
    <div>
      <output data-tab>{tab}</output>
      <output data-path>{location.pathname}</output>
      <button type="button" onClick={() => setTab("directory")}>Directory</button>
      <button type="button" onClick={() => setTab("history")}>History</button>
      <button
        type="button"
        onClick={() => navigate(`/agency/${params.account}/sub/9001002/command-center`)}
      >
        Command Center root
      </button>
    </div>
  );
}

describe("tenant Command Center secondary tabs", () => {
  beforeEach(() => {
    useSystemsCheck.mockReturnValue({
      run: {
        id: "run-1",
        started_at: "2026-08-25T12:00:00.000Z",
        completed_at: "2026-08-25T12:01:00.000Z",
        check_count: 1,
        pass_count: 1,
        fail_count: 0,
      },
      findings: [{
        id: "finding-1",
        run_id: "run-1",
        check_id: "domain_ssl",
        status: "pass",
        severity_at_finding: "high",
        evidence: null,
        paige_interpretation: null,
        paige_drafted_fix: null,
        department_id: null,
        resolved_at: null,
        resolution: null,
        resolution_action_id: null,
        created_at: "2026-08-25T12:00:00.000Z",
        check_name: "Domain and SSL health",
        domain: "infrastructure",
        priority: 1,
      }],
      loading: false,
      isError: false,
      scanPending: false,
      refresh: vi.fn(),
    });
  });

  it("keeps Fleet operator-only while tenants keep Command Center and the same three visible secondary labels", () => {
    expect(OPERATOR_SLOTS.find((slot) => slot.id === "fleet")).toMatchObject({
      label: "Fleet",
      views: ["Systems check", "Directory", "History"],
    });

    for (const tier of ["solo", "sub_account", "agency", "enterprise"] as const) {
      const command = branchBySlug(tier, "command-center");
      expect(command?.label).toBe("Command Center");
      expect(command?.subtabs?.filter((tab) => !tab.hidden).map((tab) => tab.label)).toEqual([
        "Systems Check",
        "Directory",
        "History",
      ]);
    }
  });

  it.each([
    ["src/solo/CommandCenter.tsx", ["Systems Check", "Directory", "History"]],
    ["src/agency/CommandCenter.tsx", ["Systems Check", "Directory", "History"]],
  ])("renders only the three ruled secondary labels in %s", (path, labels) => {
    const screen = source(path);
    for (const label of labels) expect(screen).toContain(`"${label}"`);
    expect(screen).not.toMatch(/\["(?:home|main)",\s*"Command Center"/);
  });

  it("renders a live-shaped tenant directory without Fleet language or fixtures", () => {
    const html = renderToStaticMarkup(<TenantSystemsCheckSecondaryView view="directory" />);
    expect(html).toContain("Directory");
    expect(html).toContain("Systems Check · PARTIAL");
    expect(html).toContain("Domain and SSL health");
    expect(html).toContain("Passing");
    expect(html).not.toContain("Fleet");
    expect(useSystemsCheck).toHaveBeenCalledWith("tenant");
  });

  it("renders only the latest persisted tenant run and labels full history as unavailable", () => {
    const html = renderToStaticMarkup(<TenantSystemsCheckSecondaryView view="history" />);
    expect(html).toContain("History");
    expect(html).toContain("Latest persisted run · PARTIAL");
    expect(html).toContain("Full run history is not connected here yet.");
    expect(html).toContain("Earlier runs remain unavailable here.");
    expect(html).not.toContain("Fleet");
  });

  it("renders an honest unavailable state instead of inventing account status", () => {
    useSystemsCheck.mockReturnValue({
      run: null,
      findings: [],
      loading: false,
      isError: true,
      scanPending: false,
      refresh: vi.fn(),
    });
    const html = renderToStaticMarkup(<TenantSystemsCheckSecondaryView view="directory" />);
    expect(html).toContain("Systems Check data is unavailable.");
    expect(html).toContain("No account status is being inferred");
  });

  it("keeps the approved Core Workspace at the branch root and mounts tenant-scoped secondary views", () => {
    const solo = source("src/solo/CommandCenter.tsx");
    const agency = source("src/agency/CommandCenter.tsx");
    expect(solo).toContain('useSubtabRoute("solo", "command-center", "home")');
    expect(solo).toContain('tab === "home"');
    expect(solo).toContain('<SystemsCheckTile scope="tenant"');
    expect(agency).toContain('const rootKey = isAgency ? "main" : "home"');
    expect(agency).toContain('const systemsKey = isAgency ? "systems" : "sys"');
    expect(agency).toContain('const directoryKey = isAgency ? "directory" : "dir"');
    expect(agency).toContain('const historyKey = isAgency ? "history" : "hist"');
    expect(agency).toContain('currentTab === rootKey');
    expect(agency).toContain('<SystemsCheckTile scope="tenant"');
  });

  it("preserves the authenticated agency act-as prefix across secondary routes and restores Core at the root", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(
      <MemoryRouter initialEntries={["/agency/2869296/sub/9001002/command-center/directory"]}>
        <Routes>
          <Route path="/agency/:account/*" element={<ActAsSubtabHarness />} />
        </Routes>
      </MemoryRouter>,
    ));

    expect(host.querySelector("[data-tab]")?.textContent).toBe("directory");
    act(() => host.querySelectorAll("button")[1]?.click());
    expect(host.querySelector("[data-tab]")?.textContent).toBe("history");
    expect(host.querySelector("[data-path]")?.textContent).toBe(
      "/agency/2869296/sub/9001002/command-center/history",
    );

    act(() => host.querySelectorAll("button")[2]?.click());
    expect(host.querySelector("[data-tab]")?.textContent).toBe("main");
    expect(host.querySelector("[data-path]")?.textContent).toBe(
      "/agency/2869296/sub/9001002/command-center",
    );
    act(() => root.unmount());
  });
});
