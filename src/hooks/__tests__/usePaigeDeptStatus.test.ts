import { describe, it, expect } from "vitest";
import { buildDeptStatus, type DeptRow, type OpenActionRow } from "@/hooks/usePaigeDeptStatus";

const DEPTS: DeptRow[] = [
  { slug: "marketing", name: "Marketing", display_order: 4 },
  { slug: "sales", name: "Sales", display_order: 5 },
  { slug: "finance", name: "Finance", display_order: 8 },
];

describe("buildDeptStatus — pure grouping is null-safe and correct (§32)", () => {
  it("returns [] for empty/garbage input without throwing", () => {
    expect(buildDeptStatus(null, null)).toEqual([]);
    expect(buildDeptStatus(undefined, undefined)).toEqual([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentionally malformed input
    expect(buildDeptStatus("nope" as any, 42 as any)).toEqual([]);
  });

  it("seeds an idle row per enabled department even with zero actions", () => {
    const rows = buildDeptStatus(DEPTS, []);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.openCount === 0 && r.workingCount === 0 && r.awaitingCount === 0)).toBe(true);
    expect(rows.every((r) => r.lastActivityAt === null)).toBe(true);
  });

  it("counts open / working / awaiting per to_department and tracks last activity", () => {
    const actions: OpenActionRow[] = [
      { to_department: "marketing", status: "drafting", filed_at: "2026-08-01T10:00:00Z" },
      { to_department: "marketing", status: "executing", filed_at: "2026-08-01T12:00:00Z" },
      { to_department: "marketing", status: "filed", filed_at: "2026-08-01T09:00:00Z" },
      { to_department: "sales", status: "pending_approval", filed_at: "2026-08-02T08:00:00Z" },
    ];
    const rows = buildDeptStatus(DEPTS, actions);
    const mkt = rows.find((r) => r.slug === "marketing")!;
    const sales = rows.find((r) => r.slug === "sales")!;
    const finance = rows.find((r) => r.slug === "finance")!;

    expect(mkt.openCount).toBe(3);
    expect(mkt.workingCount).toBe(2); // drafting + executing
    expect(mkt.awaitingCount).toBe(0);
    expect(mkt.lastActivityAt).toBe("2026-08-01T12:00:00Z"); // max filed_at

    expect(sales.openCount).toBe(1);
    expect(sales.workingCount).toBe(0);
    expect(sales.awaitingCount).toBe(1);

    expect(finance.openCount).toBe(0); // idle desk still present
  });

  it("ignores actions routed to a disabled/unknown desk (not in the seed)", () => {
    const actions: OpenActionRow[] = [
      { to_department: "operations_pmo", status: "drafting", filed_at: "2026-08-01T10:00:00Z" },
      { to_department: null, status: "filed", filed_at: "2026-08-01T10:00:00Z" },
    ];
    const rows = buildDeptStatus(DEPTS, actions);
    expect(rows.reduce((s, r) => s + r.openCount, 0)).toBe(0);
  });

  it("sorts by display order then name", () => {
    const rows = buildDeptStatus(DEPTS, []);
    expect(rows.map((r) => r.slug)).toEqual(["marketing", "sales", "finance"]);
  });
});
