import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = process.env.PAIGE_SOURCE_ROOT || process.cwd();
const source = (file: string) => {
  const absolute = resolve(sourceRoot, file);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
};

describe("tenant canonical Calendar source contract", () => {
  const calendar = source("src/pages/admin/CalendarAdmin.tsx");
  const solo = source("src/solo/SoloApp.tsx");
  const agency = source("src/agency/AgencyApp.tsx");
  const adapter = source("src/components/tenant-calendar/TenantCanonicalCalendarWorkspace.tsx");
  const manager = source("src/components/admin/calendar/CalendarsPanel.tsx");
  const css = source("src/components/tenant-calendar/tenant-canonical-calendar.css");

  it("retires both fixture Calendar owners in favor of one canonical adapter", () => {
    expect(solo).not.toContain('from "./calendar-book"');
    expect(agency).not.toContain('from "./calendar"');
    expect(solo).toContain('<TenantCanonicalCalendarWorkspace tier="solo" openPaige={openPaige}/>');
    expect(agency).toContain('<TenantCanonicalCalendarWorkspace tier="agency" openPaige={openAsk} />');
    expect(adapter).toContain('from "@/pages/admin/CalendarAdmin"');
    expect(adapter).not.toContain("PaigeWorkspace");
  });

  it("keeps the canonical six views and gates the approved seventh Settings view to Solo Clients", () => {
    expect([...calendar.matchAll(/<TabsTrigger\s+value="([a-z-]+)"/g)].map((match) => match[1])).toEqual([
      "calendar", "agenda", "tasks", "booking", "availability", "connections", "settings",
    ]);
    expect(calendar).toContain('{soloSettings && <TabsTrigger value="settings"');
    expect(adapter).toContain('soloSettings={soloClientsOwner}');
  });

  it("keeps bookings, dated plan items, and configuration on their canonical seams", () => {
    expect(calendar).toContain('supabase.rpc("list_team_bookings"');
    expect(calendar).toContain('supabase.rpc("create_internal_booking"');
    expect(calendar).toContain('supabase.rpc("admin_set_booking_status"');
    expect(calendar).toContain("usePlanList({");
    expect(calendar).toContain("<CalendarsPanel activeTenantId={activeTenantId} />");
    expect(calendar).not.toContain("illustrative");
  });

  it("pins the scheduling manager to the accepted account and reports failed reads distinctly", () => {
    expect(manager).toContain('calendarsQuery.eq("tenant_id", activeTenantId)');
    expect(manager).toContain('groupsQuery.eq("tenant_id", activeTenantId)');
    expect(manager).toContain('query.eq("tenant_id", activeTenantId)');
    expect(manager).toContain("loadSeq.current");
    expect(manager).toContain("Scheduling calendars couldn't load");
    expect(manager).toContain("No empty state or calendar count is inferred");
    expect(manager).toContain('truth: "PARTIAL"');
  });

  it("pins calendar metadata and mutations to the server-resolved active tenant", () => {
    expect(calendar).toContain('.eq("tenant_id", activeTenantId)');
    expect(calendar).toContain("_tenant_id: activeTenantId");
    expect(calendar).not.toContain("_tenant_id: cal?.tenant_id ?? activeTenantId");
    expect(adapter).toContain("key={activeTenantId}");
  });

  it("preserves bounded scrolling, responsive reflow, keyboard controls, and reduced motion", () => {
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("@media (max-width: 1279px)");
    expect(css).toContain("@media (max-width: 1023px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source("src/components/admin/calendar/CalendarGrid.tsx")).toContain('event.key === "Enter" || event.key === " "');
  });

  it("gives the tenant Calendar a compact, viewport-owned working hierarchy without hiding information", () => {
    expect(calendar).toContain('className={tenantMode ? "tcal-shell !space-y-0" : undefined}');
    expect(calendar).toContain('className={tenantMode ? "tcal-header" : undefined}');
    expect(calendar).toContain('className={tenantMode ? "tcal-summary" : undefined}');
    expect(calendar).toContain('className={tenantMode ? "tcal-tabs-root" : "space-y-4"}');
    expect(calendar).toContain('className={tenantMode ? "tcal-calendar-panel" : "space-y-4"}');
    expect(calendar).toContain('className={tenantMode ? "tcal-toolbar" : "flex flex-wrap items-center justify-between gap-3"}');
    expect(calendar).toContain('className={tenantMode ? "tcal-read-state" : undefined}');

    expect(css).toContain('grid-template-areas: "header summary" "tabs tabs"');
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("@container (max-width: 900px)");
    expect(css).toContain(".tcal-read-state");
    expect(css).toContain("grid-area: board");
    expect(css).toContain("min-height: 0");
    expect(css).toContain("overflow-y: auto");
    expect(css).not.toMatch(/\.tcal-(?:header|summary|truth|toolbar|board)[^{]*\{[^}]*display:\s*none/s);

    for (const copy of [
      "Today", "This week", "Upcoming", "Cancelled / no-show",
      "LIVE", "PARTIAL", "UNAVAILABLE", "New appointment", "Add task",
    ]) {
      expect(calendar).toContain(copy);
    }
  });
});
