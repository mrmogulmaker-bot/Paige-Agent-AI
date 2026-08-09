// Render-smoke + token-discipline for the Wave 4a.4 interactive-analytics primitives
// (Sparkline · DrillContainer · MetricEntityCard · ExploreChart · TrendLineCard area variant).
//
// Goal (§32): prove these RENDER — not just compile — across the four data shapes the
// downstream 5 surfaces will actually feed them: representative, EMPTY, SINGLE-point, and a
// LARGE series. A headless render that does not throw is the cheapest catch for "compiles but
// crashes." Rendering uses react-dom/server (folder convention — no RTL dep, §14) rather than a
// full jsdom mount; the static markup is enough to assert no-throw + the load-bearing token
// discipline (§11: no gold on chart chrome; §22: tabular-nums on figures; §13: honest empties).
//
// HONEST CAVEAT (§13/§25/§32.c): renderToStaticMarkup exercises the render path once, without
// layout, interaction, or the reduced-motion effect resolving — it CANNOT see FLIP motion, the
// Explore reveal, hover-lift, or AA contrast in a real browser. The live taste-drive across the
// 5-surface composition + FLIP + both themes is OWED to a browser-capable session (§32.c).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TableRow, TableCell } from "@/components/ui/table";
import { Sparkline } from "./Sparkline";
import { DrillContainer } from "./DrillContainer";
import { MetricEntityCard } from "./MetricEntityCard";
import { ExploreChart } from "./ExploreChart";
import { TrendLineCard } from "./ChartCards";
import { EmptyState } from "./EmptyState";

const REPRESENTATIVE = [4, 6, 5, 9, 7, 11, 10];
const SINGLE = [7];
const EMPTY: number[] = [];
const LARGE = Array.from({ length: 400 }, (_, i) => Math.round(50 + 30 * Math.sin(i / 9)));

const trendRows = REPRESENTATIVE.map((v, i) => ({ day: `D${i}`, active: v, atRisk: Math.max(0, v - 3) }));

describe("Sparkline — renders across every data shape (§32)", () => {
  it.each([
    ["representative", REPRESENTATIVE],
    ["single-point", SINGLE],
    ["empty", EMPTY],
    ["large", LARGE],
  ])("does not throw with %s data (line + area)", (_label, data) => {
    expect(() => renderToStaticMarkup(<Sparkline data={data} />)).not.toThrow();
    expect(() => renderToStaticMarkup(<Sparkline data={data} variant="area" tone="positive" />)).not.toThrow();
  });

  it("renders an HONEST flat baseline (not a fabricated line) for <2 points (§13)", () => {
    const html = renderToStaticMarkup(<Sparkline data={SINGLE} />);
    expect(html).toContain('aria-label="No trend yet"'); // default aria when there is no trend
    expect(html).toContain("bg-border"); // a hairline baseline, not a chart line/path
    expect(html).not.toContain("recharts"); // no fabricated recharts line for a single point
  });
});

describe("DrillContainer — summary/detail swap (§6.9 FLIP)", () => {
  it("renders the summary when closed and the detail when open, no throw", () => {
    const closed = renderToStaticMarkup(
      <DrillContainer open={false} summary={<span>SUMMARY</span>} detail={<span>DETAIL</span>} />,
    );
    const open = renderToStaticMarkup(
      <DrillContainer open layoutId="e1" summary={<span>SUMMARY</span>} detail={<span>DETAIL</span>} />,
    );
    expect(closed).toContain("SUMMARY");
    expect(open).toContain("DETAIL");
  });
});

describe("MetricEntityCard — the roll-up entity card (§5)", () => {
  it("renders interactive + static, at-risk + healthy, loading, across data shapes — no throw", () => {
    for (const data of [REPRESENTATIVE, SINGLE, EMPTY, LARGE]) {
      expect(() =>
        renderToStaticMarkup(
          <MetricEntityCard
            name="Acme Coaching"
            subtitle="Solo · 12 clients"
            spark={data}
            metric={42}
            metricLabel="clients"
            delta={{ value: "8%", direction: "up" }}
            atRisk
            onClick={() => {}}
            selected
            expanded
          />,
        ),
      ).not.toThrow();
    }
    expect(() => renderToStaticMarkup(<MetricEntityCard name="X" loading />)).not.toThrow();
    expect(() => renderToStaticMarkup(<MetricEntityCard name="X" spark={REPRESENTATIVE} />)).not.toThrow();
  });

  it("selection emphasis is INDIGO (ring-ring), never gold (§11)", () => {
    const html = renderToStaticMarkup(
      <MetricEntityCard name="X" onClick={() => {}} selected spark={REPRESENTATIVE} />,
    );
    expect(html).toContain("ring-ring");
    expect(html).not.toMatch(/\bbg-\[hsl\(var\(--gold\)\)\]/);
    expect(html).not.toContain("variant-gold");
  });
});

describe("ExploreChart — chart + Explore drill table (§6.3)", () => {
  const columns = [
    { key: "when", header: "When" },
    { key: "amt", header: "Amount", numeric: true },
  ];
  it("renders with rows and with an empty table, no throw", () => {
    expect(() =>
      renderToStaticMarkup(
        <ExploreChart
          title="Revenue"
          chart={<Sparkline data={REPRESENTATIVE} variant="area" />}
          columns={columns}
          defaultOpen
          rows={
            <TableRow>
              <TableCell>Today</TableCell>
              <TableCell className="text-right tabular-nums">$100</TableCell>
            </TableRow>
          }
        />,
      ),
    ).not.toThrow();
    expect(() =>
      renderToStaticMarkup(
        <ExploreChart
          title="Revenue"
          chart={<Sparkline data={EMPTY} />}
          columns={columns}
          defaultOpen
          isEmpty
          tableEmpty={<EmptyState title="No events yet" />}
        />,
      ),
    ).not.toThrow();
  });
});

describe("TrendLineCard — new area variant (§ chart list)", () => {
  it("renders line and area with representative + insufficient (<2) data, no throw", () => {
    expect(() =>
      renderToStaticMarkup(
        <TrendLineCard title="t" data={trendRows} series={[{ key: "active", label: "Active" }]} xKey="day" />,
      ),
    ).not.toThrow();
    expect(() =>
      renderToStaticMarkup(
        <TrendLineCard
          title="t"
          variant="area"
          data={trendRows}
          series={[
            { key: "active", label: "Active" },
            { key: "atRisk", label: "At risk" },
          ]}
          xKey="day"
        />,
      ),
    ).not.toThrow();
    // <2 points → crafted EmptyState, never a fabricated area (§13)
    const html = renderToStaticMarkup(
      <TrendLineCard title="t" variant="area" data={[{ day: "D0", active: 1 }]} series={[{ key: "active", label: "A" }]} xKey="day" />,
    );
    expect(html).toMatch(/No trend to show yet|fills in once/);
  });
});
