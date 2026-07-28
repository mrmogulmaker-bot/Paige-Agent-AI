import { PageShell } from "./PageShell";
import { StatRow, StatTile } from "./StatTile";
import { DataTableShell } from "./DataTableShell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shared page-shaped loading state (§11/§18 — one home, not a fork per site).
 *
 * A full-screen bare-text "Loading…" (or an animated brand splash) on a working
 * admin surface is the amateur tell the Cowork #113 report flagged — it reads as
 * broken and eats the viewport. This paints the app's actual chrome immediately —
 * a header, a KPI row, and a table — all as skeletons, so first paint already
 * "looks like the app" and the eye reads structure, not a stall.
 *
 * Composed entirely from existing primitives: StatTile's built-in `loading` renders
 * a value Skeleton, DataTableShell's `loading` paints skeleton rows. No new skeleton
 * markup. Reserved brand motion (PaigeScene / Studio build cutscene) stays where it
 * earns its pixels (§22) — it is NOT a default page-transition loader.
 */
export function PageSkeleton({
  tiles = 4,
  columns = 5,
}: {
  tiles?: 2 | 3 | 4;
  columns?: number;
}) {
  return (
    <PageShell>
      {/* Header stand-in — a lean title/description block, no hero (§11 banner rule). */}
      <div className="border-b border-border/60 pb-5" aria-hidden>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>

      <StatRow cols={tiles}>
        {Array.from({ length: tiles }).map((_, i) => (
          <StatTile key={i} loading label="" value="" />
        ))}
      </StatRow>

      <DataTableShell
        loading
        columns={Array.from({ length: columns }).map((_, i) => ({ key: `sk-${i}`, header: "" }))}
      />
    </PageShell>
  );
}
