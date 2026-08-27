import { renderToStaticMarkup } from "react-dom/server";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, useLocation } from "react-router-dom";
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
  return { default: class MockCalendar extends ReactModule.Component<{ soloSettings?: boolean }> { mountId = ++ownerHarness.calendars; render() { return ReactModule.createElement("div", { "data-mocked-calendar": this.mountId, "data-solo-settings": String(Boolean(this.props.soloSettings)) }, ReactModule.createElement("h1", null, "Calendar")); } } };
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
  people: [{
    id: "p-1",
    name: "Supplied Person",
    recordType: "person",
    company: "Supplied Co",
    email: "person@example.test",
    phone: "+1 202 555 0142",
    title: "Founder",
    website: "https://example.test",
    location: "Atlanta, GA",
    source: "Referral",
    status: "active",
    tags: ["Priority"],
    doNotContact: false,
    sharedContextConsent: false,
    linkedUserId: null,
    relationship: "client active",
    owner: "Assigned owner",
    lastTouch: null,
    createdAt: "2026-01-10T12:00:00Z",
    updatedAt: "2026-08-24T12:00:00Z",
  }],
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

function LocationProbe() {
  const location = useLocation();
  return <output data-location>{location.pathname}{location.search}</output>;
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
    expect(html).toContain("People · LIVE");
    expect(html).toContain("Assigned owner");
    expect(html).not.toMatch(/Alex Rivera|Morgan Shaw|Taylor Chen|Sarah&#x27;s Coaching Practice/);
  });

  it("replaces the shallow Solo inspector with the approved client-record workspace and honest truth states", () => {
    const html = render("/solo/42/clients/people?person=p-1");
    expect(html).toContain("Client record");
    expect(html).toContain("Person profile");
    expect(html).toContain("Relationship overview");
    expect(html).toContain("Contact details");
    expect(html).toContain("Relationship intelligence");
    expect(html).toContain("Campaigns owns pipeline");
    expect(html).toContain("Portal access");
    expect(html).toContain("Client files");
    expect(html).toContain("PAIGE enrichment");
    expect(html).toContain("Search and selection · LIVE");
    expect(html).toContain("Governed details · UNAVAILABLE");
    expect(html).toContain("Birthday reminders");
    expect(html).toContain("Tenant custom fields");
    expect(html).toContain("Unified activity · UNAVAILABLE");
    expect(html).toContain("Back to People");
    expect(html).not.toMatch(/religion|password|credential|race|ethnicity|political affiliation|sexual orientation|biometric/i);
  });

  it("presents business records without forcing person-only fields", () => {
    useTenantRelationshipsData.mockReturnValue({
      ...baseData,
      people: [{
        ...baseData.people[0],
        id: "business-1",
        name: "Supplied Company",
        recordType: "business",
        company: "Supplied Company",
        title: null,
      }],
    });
    const html = render("/solo/42/clients/people?person=business-1");
    expect(html).toContain("Business profile");
    expect(html).toContain("Organization details");
    expect(html).toContain("Related people · PARTIAL");
    expect(html).not.toContain("Birthday reminders");
    expect(html).not.toContain("Family context");
  });

  it("keeps the approved redesign Solo-only and preserves the legacy sub-account People owner", () => {
    const html = render("/agency/1/sub/2/clients/people", "sub_account");
    expect(html).not.toContain("data-solo-client-record");
    expect(html).toContain("trc-table-card");
    expect(html).toContain("Ask PAIGE about this view");
    expect(useTenantRelationshipsData).toHaveBeenLastCalledWith(expect.objectContaining({ soloPeople: false }));
  });

  it("recovers honestly from a missing or unauthorized client deep link", () => {
    const html = render("/solo/42/clients/people?person=not-authorized");
    expect(html).toContain("Client record unavailable");
    expect(html).toContain("missing, unavailable to this account, or could not be resolved");
    expect(html).not.toContain("Person profile");
  });

  it("does not expose unproven record mutations as operational controls", () => {
    const html = render("/solo/42/clients/people?person=p-1");
    const labels = Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll("button"), (button) => button.textContent ?? "").join("|");
    expect(labels).not.toMatch(/Add person|Edit client|Invite client|Upload file|Assign pipeline/i);
    expect(html).toContain("Open PAIGE workspace");
    expect(html).toContain("No automatic write occurs");
  });

  it("keeps the selected identity visible when search excludes its list row", async () => {
    useSubtabRoute.mockImplementation((_tier: string, _branch: string, initial: string) => React.useState(initial));
    const openPaige = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/solo/42/clients/people"]}><TenantRelationshipsClientsWorkspace routeTier="solo" openPaige={openPaige} /></MemoryRouter>));
    await act(async () => host.querySelector<HTMLButtonElement>(".trc-person-select")?.click());
    const input = host.querySelector<HTMLInputElement>("input[placeholder^='Search']");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "no-match");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.textContent).toContain("No matching people");
    expect(host.querySelector("#trc-record-title")?.textContent).toBe("Supplied Person");
    const paige = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Open PAIGE workspace"));
    await act(async () => paige?.click());
    expect(openPaige).toHaveBeenCalledTimes(1);
    const back = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Back to People"));
    await act(async () => back?.click());
    await vi.waitFor(() => expect(document.activeElement).toBe(input));
    act(() => root.unmount());
    host.remove();
  });

  it("keeps the Solo record selection keyboard-operable, restorable, and URL-addressable", async () => {
    useSubtabRoute.mockImplementation((_tier: string, _branch: string, initial: string) => React.useState(initial));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter initialEntries={["/solo/42/clients/people"]}><TenantRelationshipsClientsWorkspace routeTier="solo" openPaige={vi.fn()} /><LocationProbe /></MemoryRouter>));
    const personButton = host.querySelector<HTMLButtonElement>(".trc-person-select");
    personButton?.focus();
    await act(async () => personButton?.click());
    expect(host.querySelector("[data-solo-client-record]")?.getAttribute("data-record-selected")).toBe("true");
    expect(host.querySelector("[data-location]")?.textContent).toContain("person=p-1");
    const back = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Back to People"));
    expect(back?.getAttribute("aria-label")).toBe("Back to People list");
    await act(async () => back?.click());
    await vi.waitFor(() => expect(document.activeElement).toBe(host.querySelector<HTMLButtonElement>(".trc-person-select")));
    expect(host.querySelector("[data-solo-client-record]")?.getAttribute("data-record-selected")).toBe("false");
    expect(host.querySelector("[data-location]")?.textContent).not.toContain("person=");
    act(() => root.unmount());
    host.remove();
  });

  it("clears search, selection, URL, and focus state when the authenticated Solo account changes", async () => {
    let tenantId = "tenant-a";
    useTenantContext.mockImplementation(() => ({
      activeTenantId: tenantId,
      activeTenant: { id: tenantId, name: tenantId === "tenant-a" ? "Account A" : "Account B", account_type: "standalone", parent_tenant_id: null },
      accountContextLoading: false,
      isPlatformOwner: false,
      refresh: vi.fn(),
    }));
    useTenantRelationshipsData.mockImplementation(({ activeTenantId }: { activeTenantId: string }) => activeTenantId === "tenant-a"
      ? baseData
      : { ...baseData, people: [{ ...baseData.people[0], id: "p-b", name: "Second Account Client", email: "second@example.test" }] });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const tree = () => <MemoryRouter initialEntries={["/solo/42/clients/people"]}><TenantRelationshipsClientsWorkspace routeTier="solo" openPaige={vi.fn()} /><LocationProbe /></MemoryRouter>;
    await act(async () => root.render(tree()));
    const search = host.querySelector<HTMLInputElement>("input[placeholder^='Search']");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(search, "Supplied");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
      host.querySelector<HTMLButtonElement>(".trc-person-select")?.click();
    });
    expect(host.querySelector("[data-location]")?.textContent).toContain("person=p-1");
    tenantId = "tenant-b";
    await act(async () => root.render(tree()));
    expect(host.querySelector<HTMLInputElement>("input[placeholder^='Search']")?.value).toBe("");
    expect(host.textContent).toContain("Second Account Client");
    expect(host.textContent).not.toContain("Supplied Person");
    expect(host.querySelector("[data-location]")?.textContent).not.toContain("person=");
    expect(useTenantRelationshipsData).toHaveBeenLastCalledWith(expect.objectContaining({ activeTenantId: "tenant-b", deepLinkedContactId: null }));
    act(() => root.unmount());
    host.remove();
  });

  it("keeps native button semantics and does not steal focus on same-record refresh", async () => {
    useSubtabRoute.mockImplementation((_tier: string, _branch: string, initial: string) => React.useState(initial));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const tree = () => <MemoryRouter initialEntries={["/solo/42/clients/people"]}><TenantRelationshipsClientsWorkspace routeTier="solo" openPaige={vi.fn()} /></MemoryRouter>;
    await act(async () => root.render(tree()));
    const row = host.querySelector<HTMLButtonElement>(".trc-client-rows .trc-person-select");
    expect(row?.getAttribute("role")).toBeNull();
    expect(row?.parentElement?.getAttribute("role")).toBe("listitem");
    await act(async () => row?.click());
    const paige = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("Open PAIGE workspace"));
    paige?.focus();
    useTenantRelationshipsData.mockReturnValue({ ...baseData, people: [{ ...baseData.people[0] }] });
    await act(async () => root.render(tree()));
    expect(document.activeElement).toBe(paige);
    act(() => root.unmount());
    host.remove();
  });

  it("encodes narrow record-first containment, visible focus, and reduced-motion behavior without changing Calendar geometry", () => {
    const html = render("/solo/42/clients/people?person=p-1");
    const css = readFileSync(resolve("src/components/tenant-relationships/tenant-relationships-clients-workspace.css"), "utf8");
    expect(html).toContain("trc-workspace--people");
    expect(html).toContain("trc-panel--people");
    useSubtabRoute.mockReturnValue(["conversations", vi.fn()]);
    expect(render("/solo/42/clients/conversations")).not.toMatch(/trc-(workspace|panel)--people/);
    useSubtabRoute.mockReturnValue(["people", vi.fn()]);
    expect(render("/agency/1/sub/2/clients/people", "agency")).not.toMatch(/trc-(workspace|panel)--people/);
    expect(css).toMatch(/\.trc-workspace--people\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(css).toMatch(/\.trc-panel--people\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/);
    expect(css).toContain("container-name: solo-people-workspace");
    expect(css).toMatch(/@container solo-people-workspace \(max-width: 800px\)/);
    expect(css).toMatch(/trc-client-workspace[^{]*\{[^}]*grid-row:\s*3/);
    expect(css).toMatch(/data-record-selected="true"[\s\S]*trc-client-list[\s\S]*display:\s*none/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("container-name: solo-calendar-mount");
    expect(css).toContain("minmax(360px, .9fr)");
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
    expect(host.querySelector(".trc-heading")).toBeNull();
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("h1")?.textContent).toBe("Calendar");
    expect(Array.from(host.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual(["People", "Conversations", "Calendar", "Portal"]);
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
