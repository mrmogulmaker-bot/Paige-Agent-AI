// src/components/affiliates/AffiliateLeaderboard.tsx
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, Search } from "lucide-react";
import type {
  AffiliateStatRow,
  LeaderboardSortKey,
  SortDir,
} from "@/lib/affiliates/types";
import { formatCents, formatNumber } from "@/lib/affiliates/format";

interface Props {
  rows: AffiliateStatRow[];
  onSelectAffiliate?: (row: AffiliateStatRow) => void;
}

const COLUMNS: { key: LeaderboardSortKey; label: string; align?: "right" }[] = [
  { key: "full_name", label: "Affiliate" },
  { key: "tier_name", label: "Tier" },
  { key: "clicks", label: "Clicks", align: "right" },
  { key: "signups", label: "Signups", align: "right" },
  { key: "paid_conversions", label: "Paid", align: "right" },
  { key: "commission_owed_cents", label: "Owed", align: "right" },
  { key: "commission_paid_ytd_cents", label: "Paid YTD", align: "right" },
];

export default function AffiliateLeaderboard({
  rows,
  onSelectAffiliate,
}: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] =
    useState<LeaderboardSortKey>("commission_owed_cents");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter(
        (r) =>
          (r.full_name ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          r.referral_code.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
    });
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(key: LeaderboardSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "full_name" || key === "tier_name" ? "asc" : "desc");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a2840]/40" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or code"
            className="pl-8"
          />
        </div>
        <p className="text-sm text-[#1a2840]/60">
          {filtered.length} affiliate{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-[#1a2840]/10">
        <Table>
          <TableHeader className="bg-[#1a2840]/5">
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead
                  key={c.key}
                  className={c.align === "right" ? "text-right" : ""}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort(c.key)}
                    className="-ml-2 h-7 text-xs font-semibold uppercase tracking-wider text-[#1a2840]/70"
                  >
                    {c.label}
                    <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="py-10 text-center text-sm text-[#1a2840]/60"
                >
                  No affiliates match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r.affiliate_id}
                  className="cursor-pointer hover:bg-[#d4a574]/5"
                  onClick={() => onSelectAffiliate?.(r)}
                >
                  <TableCell>
                    <div className="font-medium text-[#1a2840]">
                      {r.full_name ?? "Unnamed"}
                    </div>
                    <div className="text-xs text-[#1a2840]/60">{r.email}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#d4a574]">
                      {r.referral_code}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="bg-[#1a2840]/5 text-[#1a2840]"
                    >
                      {r.tier_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.clicks)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.signups)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.paid_conversions)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-[#1a2840]">
                    {formatCents(r.commission_owed_cents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-[#1a2840]/70">
                    {formatCents(r.commission_paid_ytd_cents)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
