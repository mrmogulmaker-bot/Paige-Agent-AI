import type { ReactNode } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column {
  key: string;
  header: ReactNode;
  /** right-align + tabular-nums for numeric columns */
  numeric?: boolean;
  className?: string;
}

/**
 * Premium table framing — wraps shadcn Table (keeps sort/semantics) and supplies
 * the chrome every hand-rolled <table>/bordered-div list lacks: elevated card
 * shell, muted header, hover/zebra rows, tabular numerics, skeleton loading, and
 * a crafted EmptyState. Replaces "border rounded-md p-3" debug lists and raw
 * <pre> dumps.
 *
 * Pass rows as children (<TableRow> elements) so callers keep full cell control;
 * `columns` drives the header + skeleton/empty colspan.
 */
export function DataTableShell({
  columns,
  children,
  loading,
  empty,
  zebra = false,
  dense = false,
  isEmpty = false,
  className,
}: {
  columns: Column[];
  children?: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  zebra?: boolean;
  dense?: boolean;
  isEmpty?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-card",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border-strong hover:bg-transparent">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    c.numeric && "text-right",
                    c.className,
                  )}
                >
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody
            className={cn(
              zebra && "[&_tr:nth-child(even)]:bg-muted/20",
              dense ? "[&_td]:py-2" : "",
              "[&_tr]:border-b [&_tr]:border-border/60 [&_tr:hover]:bg-muted/40 [&_tr]:transition-colors",
            )}
          >
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(c.numeric && "text-right")}>
                      <Skeleton className="h-4 w-full max-w-[8rem]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isEmpty ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              children
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
