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
  const css = source("src/components/tenant-calendar/tenant-canonical-calendar.css");

  it("retires both fixture Calendar owners in favor of one canonical adapter", () => {
    expect(solo).not.toContain('from "./calendar-book"');
    expect(agency).not.toContain('from "./calendar"');
    expect(solo).toContain('<TenantCanonicalCalendarWorkspace tier="solo" openPaige={openPaige}/>');
    expect(agency).toContain('<TenantCanonicalCalendarWorkspace tier="agency" openPaige={openAsk} />');
    expect(adapter).toContain('from "@/pages/admin/CalendarAdmin"');
    expect(adapter).not.toContain("PaigeWorkspace");
  });

  it("renders exactly the approved six Calendar destinations", () => {
    expect([...calendar.matchAll(/<TabsTrigger\s+value="([a-z-]+)"/g)].map((match) => match[1])).toEqual([
      "calendar", "agenda", "tasks", "booking", "availability", "connections",
    ]);
  });

  it("keeps bookings, dated plan items, and configuration on their canonical seams", () => {
    expect(calendar).toContain('supabase.rpc("list_team_bookings"');
    expect(calendar).toContain('supabase.rpc("create_internal_booking"');
    expect(calendar).toContain('supabase.rpc("admin_set_booking_status"');
    expect(calendar).toContain("usePlanList({");
    expect(calendar).toContain("<CalendarsPanel />");
    expect(calendar).not.toContain("illustrative");
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
    expect(css).toContain("@media (max-width: 899px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source("src/components/admin/calendar/CalendarGrid.tsx")).toContain('event.key === "Enter" || event.key === " "');
  });
});
