import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATOR_SLOTS } from "@/operator/ia/operatorIA";
import { branchBySlug, subtabPath } from "@/lib/routing/tierBranches";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { TenantSystemsCheckSecondaryView } from "./TenantSystemsCheckSecondaryView";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const useSystemsCheck = vi.fn();

vi.mock("@/hooks/useSystemsCheck", () => ({
  useSystemsCheck: (...args: unknown[]) => useSystemsCheck(...args),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function RouteHarness({ tier }: { tier: "agency" | "sub_account" }) {
  const [tab, setTab] = useSubtabRoute(tier, "command-center", "main");
  const location = useLocation();
  return (
    <div>
      <output data-tab>{tab}</output>
      <output data-path>{location.pathname}</output>
      <button type="button" onClick={() => setTab("history")}>History</button>
    </div>
  );
}

function ActAsSubtabHarness() {
  const [tab, setTab] = useSubtabRoute("agency", "command-center", "main");
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  return (
    <div>
      <output data-tab>{tab}</output>
      <output data-path>{location.pathname}</output>
      <button type="button" onClick={() => setTab("history")}>History</button>
      <button type="button" onClick={() => navigate(`/agency/${params.account}/sub/9001002/command-center`)}>
        Command Center root
      </button>
    </div>
  );
}

const latestRun = {
  id: "run-latest",
  started_at: "2026-08-25T12:00:00.000Z",
  completed_at: "2026-08-25T12:01:00.000Z",
  check_count: 1,
  pass_count: 1,
  fail_count: 0,
};

const latestFinding = {
  id: "finding-latest",
  run_id: "run-latest",
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
};

describe("tenant Command Center secondary tabs", () => {
  beforeEach(() => {
    useSystemsCheck.mockReset();
    useSystemsCheck.mockReturnValue({
      run: latestRun,
      findings: [
        { ...latestFinding, id: "stale", run_id: "run-older", check_name: "Stale prior-run check" },
        latestFinding,
      ],
      loading: false,
      isError: false,
      scanPending: false,
      refresh: vi.fn(),
    });
  });

  it("keeps Fleet operator-only while every tenant registry exposes the ruled three-tab strip", () => {
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
      expect(command?.subtabs?.[0]).toMatchObject({ label: "Command Center", hidden: true });
    }
  });

  it.each([
    ["src/solo/CommandCenter.tsx", ["Systems Check", "Directory", "History"]],
    ["src/agency/CommandCenter.tsx", ["Systems Check", "Directory", "History"]],
  ])("renders only the three ruled secondary labels in %s", (path, labels) => {
    const screen = source(path);
    for (const label of labels) expect(screen).toContain(`"${label}"`);
    expect(screen).not.toMatch(/\["(?:home|main)",\s*"Command Center"/);
    expect(screen).not.toContain("Team Pulse");
    expect(screen).not.toContain("Prospect Pipeline");
  });

  it("renders only the latest tenant snapshot in Directory and never mixes earlier findings", () => {
    const html = renderToStaticMarkup(<TenantSystemsCheckSecondaryView view="directory" />);
    expect(html).toContain("Directory");
    expect(html).toContain("Systems Check · PARTIAL");
    expect(html).toContain("Domain and SSL health");
    expect(html).toContain("Passing");
    expect(html).not.toContain("Stale prior-run check");
    expect(html).not.toContain("Fleet");
    expect(useSystemsCheck).toHaveBeenCalledTimes(1);
    expect(useSystemsCheck).toHaveBeenCalledWith("tenant");
  });

  it("renders only the latest persisted run and labels earlier history unavailable", () => {
    const html = renderToStaticMarkup(<TenantSystemsCheckSecondaryView view="history" />);
    expect(html).toContain("History");
    expect(html).toContain("Latest persisted run · PARTIAL");
    expect(html).toContain("Full run history is not connected here yet.");
    expect(html).toContain("Earlier runs remain unavailable here.");
    expect(html).not.toContain("Fleet");
  });

  it.each([
    [{ run: null, findings: [], loading: true, isError: false, scanPending: false }, "Loading the tenant-scoped snapshot", "LOADING"],
    [{ run: null, findings: [], loading: false, isError: true, scanPending: false }, "No account status is being inferred", "UNAVAILABLE"],
    [{ run: null, findings: [], loading: false, isError: false, scanPending: true }, "No persisted snapshot is available yet", "UNAVAILABLE"],
    [{ run: null, findings: [], loading: false, isError: false, scanPending: false }, "No check directory is available yet", "UNAVAILABLE"],
  ])("keeps Directory honest for unresolved and unavailable states", (state, message, proof) => {
    useSystemsCheck.mockReturnValue({ ...state, refresh: vi.fn() });
    const html = renderToStaticMarkup(<TenantSystemsCheckSecondaryView view="directory" />);
    expect(html).toContain(message);
    expect(html).toContain(`Systems Check · ${proof}`);
    expect(html).not.toContain("Passing");
  });

  it("keeps the Core Workspace at the branch root and the live Systems Check tenant-scoped", () => {
    const solo = source("src/solo/CommandCenter.tsx");
    const agency = source("src/agency/CommandCenter.tsx");
    expect(solo).toContain('useSubtabRoute("solo", "command-center", "home")');
    expect(solo).toContain('tab === "home"');
    expect(solo).toContain('<SystemsCheckTile scope="tenant"');
    expect(agency).toContain('isAgency ? "agency" : "sub_account"');
    expect(agency).toContain('currentTab === "main"');
    expect(agency).toContain('<SystemsCheckTile scope="tenant"');
    expect(source("src/components/tenant-shell/TenantSystemsCheckSecondaryView.tsx")).not.toMatch(/PaigePanel|PaigeWorkspace/);
  });

  it.each([
    ["agency", "/agency/8001001/command-center/directory", "/agency/8001001/command-center/history"],
    ["sub_account", "/business/9001002/command-center/directory", "/business/9001002/command-center/history"],
  ] as const)("keeps the %s account tree across secondary routes", (tier, entry, expected) => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={tier === "agency" ? "/agency/:account/*" : "/business/:account/*"} element={<RouteHarness tier={tier} />} />
        </Routes>
      </MemoryRouter>,
    ));

    expect(host.querySelector("[data-tab]")?.textContent).toBe("directory");
    act(() => host.querySelector("button")?.click());
    expect(host.querySelector("[data-tab]")?.textContent).toBe("history");
    expect(host.querySelector("[data-path]")?.textContent).toBe(expected);
    act(() => root.unmount());
  });

  it("preserves the authenticated Agency Parent acting-as prefix and restores Core at the root", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(
      <MemoryRouter initialEntries={["/agency/8001001/sub/9001002/command-center/directory"]}>
        <Routes>
          <Route path="/agency/:account/*" element={<ActAsSubtabHarness />} />
        </Routes>
      </MemoryRouter>,
    ));

    expect(host.querySelector("[data-tab]")?.textContent).toBe("directory");
    act(() => host.querySelectorAll("button")[0]?.click());
    expect(host.querySelector("[data-tab]")?.textContent).toBe("history");
    expect(host.querySelector("[data-path]")?.textContent).toBe(
      "/agency/8001001/sub/9001002/command-center/history",
    );
    act(() => host.querySelectorAll("button")[1]?.click());
    expect(host.querySelector("[data-tab]")?.textContent).toBe("main");
    act(() => root.unmount());
  });

  it("keeps Solo and Enterprise route construction in their existing account trees", () => {
    expect(subtabPath("solo", "7001001", "command-center", "directory")).toBe(
      "/solo/7001001/command-center/directory",
    );
    expect(subtabPath("enterprise", "6001001", "command-center", "history")).toBe(
      "/enterprise/6001001/command-center/history",
    );
  });
});
