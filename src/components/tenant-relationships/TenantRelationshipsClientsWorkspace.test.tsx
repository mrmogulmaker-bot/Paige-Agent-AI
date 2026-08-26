import { renderToStaticMarkup } from "react-dom/server";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TenantRelationshipsClientsWorkspace,
} from "./TenantRelationshipsClientsWorkspace";
import {
  isLegacyRelationshipOwner,
  relationshipWorkspaceVariant,
  workspaceTabs,
} from "./workspaceModel";

const useTenantContext = vi.fn();
const useSubtabRoute = vi.fn();
const useTenantRelationshipsData = vi.fn();
const ownerHarness = vi.hoisted(() => ({ conversations: 0, calendars: 0, portals: 0 }));

vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => useTenantContext() }));
vi.mock("@/components/auth/RoleGate", () => ({ RoleGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/pages/admin/ClientsConversations", async () => {
  const ReactModule = await import("react");
  return {
    default: class MockConversations extends ReactModule.Component {
      mountId = ++ownerHarness.conversations;
      render() { return ReactModule.createElement("div", { "data-conversation-mount": this.mountId }); }
    },
  };
});
vi.mock("@/pages/admin/CalendarAdmin", async () => {
  const ReactModule = await import("react");
  return { default: class MockCalendar extends ReactModule.Component<{ soloSettings?: boolean }> { mountId = ++ownerHarness.calendars; render() { return ReactModule.createElement("div", { "data-mocked-calendar": this.mountId, "data-solo-settings": String(Boolean(this.props.soloSettings)) }); } } };
});
vi.mock("@/pages/admin/PortalStudio", async () => {
  const ReactModule = await import("react");
  return { default: class MockPortal extends ReactModule.Component { mountId = ++ownerHarness.portals; render() { return ReactModule.createElement("div", { "data-mocked-portal-studio": this.mountId }); } } };
});
vi.mock("@/components/admin/contacts/ContactPortalPanel", () => ({ ContactPortalPanel: ({ contactId }: { contactId: string }) => <div data-mocked-contact-access={contactId} /> }));
vi.mock("@/lib/routing/useSubtabRoute", () => ({ useSubtabRoute: (...args: unknown[]) => useSubtabRoute(...args) }));
vi.mock("./useTenantRelationshipsData", () => ({
  useTenantRelationshipsData: (...args: unknown[]) => useTenantRelationshipsData(...args),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseData = {
  people: [{ id: "p-1", name: "Supplied Person", company: "Supplied Co", email: "person@example.test", linkedUserId: null, relationship: "client active", owner: "Assigned owner", lastTouch: null }],
  peopleLoading: false,
  peopleError: false,
  retryPeople: vi.fn(),
  peopleAvailable: true,
  portalConfig: { welcome: { headline: "Welcome" } },
  portalLoading: false,
  portalError: false,
  retryPortal: vi.fn(),
};

function render(path = "/solo/42/clients/people", routeTier: "solo" | "agency" | "enterprise" | "sub_account" = "solo") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <TenantRelationshipsClientsWorkspace routeTier={routeTier} openPaige={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("tenant Relationships / Clients workspace", () => {
  beforeEach(() => {
    useTenantContext.mockReset();
    useSubtabRoute.mockReset();
    useTenantRelationshipsData.mockReset();
    useTenantContext.mockReturnValue({
      activeTenantId: "tenant-solo",
      activeTenant: { id: "tenant-solo", name: "Supplied Workspace", account_type: "standalone", parent_tenant_id: null },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    });
    useSubtabRoute.mockReturnValue(["people", vi.fn()]);
    useTenantRelationshipsData.mockReturnValue(baseData);
  });

  it.each([
    ["agency", null, "relationships"],
    ["enterprise", null, "relationships"],
    ["standalone", null, "clients"],
    ["sub_account", "parent", "clients"],
    ["standalone", "parent", "clients"],
  ])("maps server-resolved %s context to %s", (accountType, parent, expected) => {
    expect(relationshipWorkspaceVariant(accountType, parent)).toBe(expected);
  });

  it("exposes the exact approved tab matrices without Pipeline or Delivery", () => {
    expect(workspaceTabs("relationships").map(({ label }) => label)).toEqual(["People", "Conversations", "Calendar", "Segments"]);
    expect(workspaceTabs("clients").map(({ label }) => label)).toEqual(["People", "Conversations", "Calendar", "Portal"]);
    expect(JSON.stringify([...workspaceTabs("relationships"), ...workspaceTabs("clients")])).not.toMatch(/Pipeline|Delivery/);
  });

  it("preserves hidden legacy capability owners without putting them in the visible matrix", () => {
    expect(isLegacyRelationshipOwner("solo", "pipe")).toBe(true);
    expect(isLegacyRelationshipOwner("solo", "deliv")).toBe(true);
    expect(isLegacyRelationshipOwner("agency", "directory")).toBe(true);
    expect(isLegacyRelationshipOwner("sub_account", "pipes")).toBe(true);
    expect(isLegacyRelationshipOwner("solo", "people")).toBe(false);
  });

  it("renders real supplied People data with accessible routed tabs and no fixture claims", () => {
    const html = render();
    expect(html).toContain("Your client book");
    expect(html).toContain("Supplied Person");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html.match(/aria-controls="trc-panel"/g)).toHaveLength(4);
    expect(html.match(/id="trc-panel"/g)).toHaveLength(1);
    expect(html).toContain("People · PARTIAL");
    expect(html).toContain("Assigned owner");
    expect(html).not.toMatch(/Alex Rivera|Morgan Shaw|Taylor Chen|Sarah&#x27;s Coaching Practice/);
  });

  it("keeps parent Conversations and Segments honest without exposing Portal", () => {
    useTenantContext.mockReturnValue({
      activeTenantId: "tenant-agency",
      activeTenant: { id: "tenant-agency", name: "Supplied Parent", account_type: "agency", parent_tenant_id: null },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    });
    useSubtabRoute.mockReturnValue(["conversations", vi.fn()]);
    const html = render("/agency/1/clients/conversations", "agency");
    expect(html).toContain("Relationships");
    expect(html).toContain("Book-wide threads are not connected");
    expect(html).toContain("Segments");
    expect(html).not.toContain('>Portal<');
  });

  it("does not relabel a parent Sub-account roster as People", () => {
    useTenantContext.mockReturnValue({
      activeTenantId: "tenant-agency",
      activeTenant: { id: "tenant-agency", name: "Supplied Parent", account_type: "agency", parent_tenant_id: null },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    });
    useTenantRelationshipsData.mockReturnValue({ ...baseData, peopleAvailable: false, people: [] });
    const html = render("/agency/1/clients/people", "agency");
    expect(html).toContain("Book-wide People are not connected");
    expect(html).not.toContain("Supplied Person");
  });

  it("mounts the canonical Solo Calendar directly with the approved Settings view and no intermediary", async () => {
    useSubtabRoute.mockReturnValue(["calendar", vi.fn()]);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/solo/42/clients/calendar"]}><TenantRelationshipsClientsWorkspace routeTier="solo" openPaige={vi.fn()} /></MemoryRouter>));
    await vi.waitFor(() => expect(host.querySelector("[data-mocked-calendar]")).not.toBeNull());
    expect(host.textContent).not.toContain("Open full Calendar");
    expect(host.textContent).not.toContain("Relationship association is not yet provable");
    expect(host.textContent).not.toContain("Your client book");
    expect(host.querySelector(".trc-workspace--calendar")).not.toBeNull();
    expect(host.querySelector("[data-mocked-calendar]")?.getAttribute("data-solo-settings")).toBe("true");
    act(() => root.unmount());
  });

  it("preserves the existing partial Calendar lens outside the Solo slice", () => {
    useSubtabRoute.mockReturnValue(["calendar", vi.fn()]);
    const html = render("/agency/1/sub/2/clients/calendar", "agency");
    expect(html).toContain("Open full Calendar");
    expect(html).toContain("Relationship association is not yet provable");
    expect(readFileSync(resolve("src/pages/admin/CalendarAdmin.tsx"), "utf8")).not.toMatch(/from ["'][^"']*fixtures/);
    const source = readFileSync(resolve("src/components/tenant-relationships/TenantRelationshipsClientsWorkspace.tsx"), "utf8");
    expect(source).toContain('lazy(() => import("@/pages/admin/CalendarAdmin"))');
    expect(source).toContain("<CanonicalCalendar key={activeTenantId} />");
    expect(source).not.toContain('to={`/admin/clients-hub/delivery');
  });

  it("opens the canonical Calendar in-place without leaving the active account tree", async () => {
    useSubtabRoute.mockReturnValue(["calendar", vi.fn()]);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/agency/1/sub/2/clients/calendar"]}><TenantRelationshipsClientsWorkspace routeTier="agency" openPaige={vi.fn()} /></MemoryRouter>));
    const open = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Open full Calendar"));
    await act(async () => open?.click());
    await vi.waitFor(() => expect(host.querySelector("[data-mocked-calendar]")).not.toBeNull());
    expect(host.querySelector("[data-canonical-calendar]")?.getAttribute("data-return-address")).toBe("/agency/1/sub/2/clients/calendar");
    const firstMount = Number(host.querySelector("[data-mocked-calendar]")?.getAttribute("data-mocked-calendar"));
    useTenantContext.mockReturnValue({
      activeTenantId: "tenant-calendar-next",
      activeTenant: { id: "tenant-calendar-next", name: "Next Calendar", account_type: "sub_account", parent_tenant_id: "parent" },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    });
    await act(async () => root.render(<MemoryRouter initialEntries={["/agency/1/sub/2/clients/calendar"]}><TenantRelationshipsClientsWorkspace routeTier="agency" openPaige={vi.fn()} /></MemoryRouter>));
    expect(host.querySelector("[data-mocked-calendar]")).toBeNull();
    const reopen = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Open full Calendar"));
    await act(async () => reopen?.click());
    await vi.waitFor(() => expect(Number(host.querySelector("[data-mocked-calendar]")?.getAttribute("data-mocked-calendar"))).toBeGreaterThan(firstMount));
    act(() => root.unmount());
  });

  it("mounts the existing canonical Conversations owner instead of a parallel inbox", () => {
    const source = readFileSync(resolve("src/components/tenant-relationships/TenantRelationshipsClientsWorkspace.tsx"), "utf8");
    expect(source).toContain('lazy(() => import("@/pages/admin/ClientsConversations"))');
    expect(source).toContain("<CanonicalConversations key={activeTenantId} />");
  });

  it("remounts canonical Conversations when authenticated active-tenant context changes", async () => {
    useSubtabRoute.mockReturnValue(["conversations", vi.fn()]);
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/business/2/clients/conversations"]}><TenantRelationshipsClientsWorkspace routeTier="sub_account" openPaige={vi.fn()} /></MemoryRouter>));
    await vi.waitFor(() => expect(host.querySelector("[data-conversation-mount]")).not.toBeNull());
    const firstMount = Number(host.querySelector("[data-conversation-mount]")?.getAttribute("data-conversation-mount"));

    useTenantContext.mockReturnValue({
      activeTenantId: "tenant-next",
      activeTenant: { id: "tenant-next", name: "Next Workspace", account_type: "sub_account", parent_tenant_id: "parent" },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    });
    await act(async () => root.render(<MemoryRouter initialEntries={["/business/2/clients/conversations"]}><TenantRelationshipsClientsWorkspace routeTier="sub_account" openPaige={vi.fn()} /></MemoryRouter>));
    await vi.waitFor(() => expect(Number(host.querySelector("[data-conversation-mount]")?.getAttribute("data-conversation-mount"))).toBeGreaterThan(firstMount));
    act(() => root.unmount());
  });

  it("renders the approved Portal audience boundaries only for client contexts", () => {
    useSubtabRoute.mockReturnValue(["portal", vi.fn()]);
    const html = render("/business/2/clients/portal", "sub_account");
    expect(html).toContain("One relationship. Two authorized views.");
    expect(html).toContain("Shared with client");
    expect(html).toContain("Internal team");
    expect(html).toContain("Restricted system evidence");
    expect(html).toContain("Client-visible home");
    expect(html).toContain("Portal conversation");
    expect(html).toContain("Requests and action items");
    expect(html).toContain("Engagement progress");
    expect(html).toContain("Files and agreements");
    expect(html).toContain("Configuration remains owner/admin gated");
    expect(html).toContain("Choose a client to manage access");
    const adminRoutes = readFileSync(resolve("src/pages/Admin.tsx"), "utf8");
    expect(adminRoutes).toMatch(/path="portal"[\s\S]*?<AdminOnly>/);
    const source = readFileSync(resolve("src/components/tenant-relationships/TenantRelationshipsClientsWorkspace.tsx"), "utf8");
    expect(source).toContain("<RoleGate allow={[\"admin\"]}");
    expect(source).toContain("<PortalStudio key={activeTenantId} />");
    expect(source).toContain("<ContactPortalAccess");
    expect(html).toContain("UNAVAILABLE");
  });

  it("requires explicit keyboard-operable People selection before mounting client access", async () => {
    useSubtabRoute.mockImplementation((_tier: string, _branch: string, initial: string) => React.useState(initial));
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/business/2/clients/people"]}><TenantRelationshipsClientsWorkspace routeTier="sub_account" openPaige={vi.fn()} /></MemoryRouter>));
    const personButton = host.querySelector<HTMLButtonElement>(".trc-person-select");
    expect(personButton?.textContent).toContain("Supplied Person");
    await act(async () => personButton?.click());
    const portalTab = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent === "Portal");
    await act(async () => portalTab?.click());
    const configurationButton = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Open gated Portal configuration");
    await act(async () => configurationButton?.click());
    await vi.waitFor(() => expect(host.querySelector("[data-mocked-portal-studio]")).not.toBeNull());
    const accessButton = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Open selected client access");
    expect(accessButton?.disabled).toBe(false);
    await act(async () => accessButton?.click());
    await vi.waitFor(() => expect(host.querySelector("[data-mocked-contact-access='p-1']")).not.toBeNull());
    const firstPortalMount = Number(host.querySelector("[data-mocked-portal-studio]")?.getAttribute("data-mocked-portal-studio"));
    useTenantContext.mockReturnValue({
      activeTenantId: "tenant-portal-next",
      activeTenant: { id: "tenant-portal-next", name: "Next Portal", account_type: "sub_account", parent_tenant_id: "parent" },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    });
    await act(async () => root.render(<MemoryRouter initialEntries={["/business/2/clients/portal"]}><TenantRelationshipsClientsWorkspace routeTier="sub_account" openPaige={vi.fn()} /></MemoryRouter>));
    expect(host.querySelector("[data-mocked-portal-studio]")).toBeNull();
    expect(host.querySelector("[data-mocked-contact-access]")).toBeNull();
    expect(host.textContent).toContain("Choose a client to manage access");
    const reopenConfiguration = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Open gated Portal configuration");
    await act(async () => reopenConfiguration?.click());
    await vi.waitFor(() => expect(Number(host.querySelector("[data-mocked-portal-studio]")?.getAttribute("data-mocked-portal-studio"))).toBeGreaterThan(firstPortalMount));
    act(() => root.unmount());
  });

  it("blocks all relationship content while authenticated context is unresolved or absent", () => {
    useTenantContext.mockReturnValue({ activeTenantId: null, activeTenant: null, accountContextLoading: true, refresh: vi.fn() });
    expect(render()).toContain("No relationship data appears until the authenticated account is accepted.");
    useTenantContext.mockReturnValue({ activeTenantId: null, activeTenant: null, accountContextLoading: false, refresh: vi.fn() });
    const failed = render();
    expect(failed).toContain("We couldn&#x27;t resolve this workspace");
    expect(failed).not.toContain("Your client book");
  });

  it("does not mount another PAIGE provider or workspace", () => {
    const html = render();
    expect(html).not.toMatch(/tenant-paige-workspace|PAIGE command workspace|AgentPresenceProvider/);
  });
});
