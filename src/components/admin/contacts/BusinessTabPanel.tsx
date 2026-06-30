import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Building2, SlidersHorizontal } from "lucide-react";
import { BusinessVerificationCard } from "./BusinessVerificationCard";

interface BizRow {
  id: string;
  legal_name: string | null;
  dba: string | null;
  entity_type: string | null;
}

interface RunRow {
  business_id: string;
  status: string;
  created_at: string;
}

type FilterKey = "all" | "fresh" | "stale" | "never" | "failed";

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "fresh", label: "Verified (Fresh)" },
  { value: "stale", label: "Stale (>30d)" },
  { value: "never", label: "Never Verified" },
  { value: "failed", label: "Failed" },
];

export function BusinessTabPanel({
  linkedUserId,
  businesses,
}: {
  linkedUserId: string;
  businesses: BizRow[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const bizIds = useMemo(() => businesses.map((b) => b.id), [businesses]);

  const { data: runs = [] } = useQuery({
    queryKey: ["business-verification-runs", linkedUserId, bizIds.join(",")],
    enabled: bizIds.length > 0,
    queryFn: async (): Promise<RunRow[]> => {
      const { data, error } = await supabase
        .from("business_verification_runs")
        .select("business_id, status, created_at")
        .in("business_id", bizIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const latestRunByBiz = useMemo(() => {
    const map: Record<string, RunRow> = {};
    for (const r of runs) {
      if (!map[r.business_id]) map[r.business_id] = r;
    }
    return map;
  }, [runs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businesses.filter((b) => {
      const nameMatch =
        !q ||
        (b.legal_name || "").toLowerCase().includes(q) ||
        (b.dba || "").toLowerCase().includes(q);
      if (!nameMatch) return false;

      if (filter === "all") return true;

      const run = latestRunByBiz[b.id];
      if (!run) return filter === "never";

      const ageDays = Math.floor(
        (Date.now() - new Date(run.created_at).getTime()) / 86400000
      );
      const isStale = ageDays > 30;

      switch (filter) {
        case "fresh":
          return (run.status === "succeeded" || run.status === "partial") && !isStale;
        case "stale":
          return isStale;
        case "failed":
          return run.status === "failed";
        default:
          return true;
      }
    });
  }, [businesses, search, filter, latestRunByBiz]);

  const resultCount = filtered.length;
  const totalCount = businesses.length;

  return (
    <div className="space-y-3">
      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search business name or DBA…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary" className="text-[10px]">
          {resultCount} of {totalCount}
        </Badge>
        {resultCount < totalCount && (
          <span>Showing filtered results</span>
        )}
      </div>

      {/* Business cards */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {businesses.length === 0
              ? "No businesses on file for this contact yet."
              : "No businesses match your search or filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((b) => (
            <div key={b.id} className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {b.legal_name || b.dba || "Unnamed business"}
                </span>
                {b.entity_type && (
                  <Badge variant="outline" className="text-[10px]">
                    {b.entity_type}
                  </Badge>
                )}
              </div>
              <BusinessVerificationCard businessId={b.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
