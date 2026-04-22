import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  getAccountAgeImpact,
  type AccountAgeBand,
} from "@/lib/fundabilityScores";
import { NegativeAccountTimeline, type NegativeAccountTimelineItem } from "./NegativeAccountTimeline";

interface NegativeAccountsAgePanelProps {
  totalWeightedNegativeScore?: number;
}

interface NegativeRow {
  id: string;
  creditor_name: string | null;
  item_type: string | null;
  bureau: string | null;
  amount: number | null;
  date_of_occurrence: string | null;
  date_reported: string | null;
  status: string | null;
}

const BAND_PILL_CLASS: Record<AccountAgeBand, string> = {
  critical: "bg-red-100 text-red-800 hover:bg-red-100",
  severe: "bg-orange-100 text-orange-800 hover:bg-orange-100",
  moderate: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  mild: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
  aging: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  historical: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  approaching_removal: "bg-green-100 text-green-800 hover:bg-green-100",
};

const URGENCY_LABEL: Record<"high" | "medium" | "low" | "monitor", string> = {
  high: "High Impact",
  medium: "Moderate Impact",
  low: "Low Impact",
  monitor: "Monitor Only",
};

export function NegativeAccountsAgePanel({ totalWeightedNegativeScore }: NegativeAccountsAgePanelProps) {
  const { data: negatives, isLoading } = useQuery({
    queryKey: ["negative-items-age-panel"],
    queryFn: async (): Promise<NegativeRow[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return [];
      const { data } = await supabase
        .from("credit_negative_items")
        .select("id, creditor_name, item_type, bureau, amount, date_of_occurrence, date_reported, status")
        .eq("user_id", session.user.id)
        .neq("status", "removed");
      return (data ?? []) as NegativeRow[];
    },
  });

  if (isLoading) {
    return (
      <Card className="p-5 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (!negatives || negatives.length === 0) return null;

  const items: NegativeAccountTimelineItem[] = negatives.map((n) => ({
    id: n.id,
    label: n.creditor_name || "Unknown creditor",
    accountType: n.item_type,
    date: n.date_of_occurrence ?? n.date_reported ?? null,
  }));

  return (
    <div className="space-y-4">
      <NegativeAccountTimeline
        accounts={items}
        totalWeightedNegativeScore={totalWeightedNegativeScore}
      />

      <Card className="p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Negative Accounts by Recency</h3>
          <p className="text-xs text-muted-foreground">
            Banks weight negative accounts by how recent they are. Newer = higher impact.
          </p>
        </div>

        <ul className="divide-y divide-border">
          {negatives.map((n) => {
            const date = n.date_of_occurrence ?? n.date_reported ?? null;
            const impact = getAccountAgeImpact(n, date);
            return (
              <li key={n.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">
                      {n.creditor_name || "Unknown creditor"}
                    </p>
                    {n.item_type && (
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {n.item_type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{impact.lenderImpact}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                    <span>{impact.monthsOnReport} months on report</span>
                    <span
                      className={
                        impact.monthsUntilRemoval > 0 && impact.monthsUntilRemoval <= 12
                          ? "text-green-700 font-medium"
                          : ""
                      }
                    >
                      {impact.monthsUntilRemoval > 0
                        ? impact.monthsUntilRemoval <= 12
                          ? `Removes in ${impact.monthsUntilRemoval} months`
                          : `${impact.monthsUntilRemoval} months until removal`
                        : "Past FCRA removal window"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge
                    variant="secondary"
                    className={`text-[11px] font-semibold ${BAND_PILL_CLASS[impact.band]}`}
                  >
                    {impact.bandLabel}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {URGENCY_LABEL[impact.urgency]}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
