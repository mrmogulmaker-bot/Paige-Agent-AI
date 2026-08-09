import { useState, type ReactNode } from "react";
import { ChevronDown, TableProperties } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./SectionCard";
import { DataTableShell, type Column } from "./DataTableShell";

/**
 * ExploreChart — "no chart is a dead end" (spec §3.2 / §6.3, the Stripe Explore pattern).
 *
 * Wraps any chart node in a SectionCard whose header carries an "Explore" toggle; opening it
 * reveals the underlying-events DataTableShell beneath the chart (spring height reveal). Every
 * analytics surface pairs its aggregate chart with the rows behind it through this ONE primitive
 * (§18) instead of hand-rolling a chart-plus-table layout per page.
 *
 * DOCTRINE (binding):
 * - §11/§6 GOLD DISCIPLINE: the Explore toggle is a NEUTRAL control (ghost/outline), NOT gold —
 *   exploring data is not the act/approve moment. Gold is reserved for a real act the caller
 *   passes into `actions`.
 * - §22/§11 motion-safe: the reveal is a spring height/opacity expand, cut to instant under
 *   useReducedMotion. §32 VISIBLE: the reveal is perceptible, not sub-perceptual.
 * - §13 HONESTY: the table renders a crafted EmptyState (via DataTableShell) when there are no
 *   rows — never a fabricated line item; `loading` is a skeleton, never a blank.
 * - §11 no amateur tells: the underlying data is a real DataTableShell, never a raw <pre>/JSON dump.
 */
export interface ExploreChartProps {
  title: ReactNode;
  description?: ReactNode;
  /** The chart render (a ChartCards card body, a Sparkline, or any node). */
  chart: ReactNode;
  /** Columns for the underlying-events table. */
  columns: Column[];
  /** <TableRow> children — the events behind the aggregate. */
  rows?: ReactNode;
  isEmpty?: boolean;
  /** Crafted empty node for the table (§13). */
  tableEmpty?: ReactNode;
  loading?: boolean;
  /** Extra header actions (e.g. a range picker, a gold act) rendered LEFT of the Explore toggle. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state (omit for internal state). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  exploreLabel?: string;
  className?: string;
}

export function ExploreChart({
  title,
  description,
  chart,
  columns,
  rows,
  isEmpty = false,
  tableEmpty,
  loading = false,
  actions,
  defaultOpen = false,
  open,
  onOpenChange,
  exploreLabel = "Explore",
  className,
}: ExploreChartProps) {
  const reduce = useReducedMotion();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  function toggle() {
    const next = !isOpen;
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  return (
    <SectionCard
      title={title}
      description={description}
      className={className}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Button
            type="button"
            variant={isOpen ? "secondary" : "outline"}
            size="sm"
            onClick={toggle}
            aria-expanded={isOpen}
            className="gap-1.5"
          >
            <TableProperties className="h-4 w-4" aria-hidden />
            {exploreLabel}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                isOpen && "rotate-180",
              )}
              aria-hidden
            />
          </Button>
        </div>
      }
    >
      {chart}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="explore"
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-4">
              <DataTableShell
                columns={columns}
                loading={loading}
                isEmpty={isEmpty}
                empty={tableEmpty}
              >
                {rows}
              </DataTableShell>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </SectionCard>
  );
}
