import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Snapshot = {
  id: string;
  period_start: string;
  period_end: string;
  total_deposits_cents: number;
  total_withdrawals_cents: number;
  avg_daily_balance_cents: number;
  runway_days: number | null;
  funding_readiness_score: number | null;
  generated_at: string;
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function readinessColor(score: number | null) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

export function CashFlowTab({ contactId }: { contactId: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paige_cash_flow_snapshots")
        .select("*")
        .eq("contact_id", contactId)
        .order("generated_at", { ascending: false })
        .limit(1);
      setSnap((data?.[0] as Snapshot) ?? null);
      setLoading(false);
    })();
  }, [contactId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (!snap) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No cash flow snapshots yet. Cash flow is computed after bank transactions sync.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Runway</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{snap.runway_days ?? "—"}<span className="text-sm font-normal text-muted-foreground ml-1">days</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Funding Readiness</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${readinessColor(snap.funding_readiness_score)}`}>{snap.funding_readiness_score ?? "—"}<span className="text-sm font-normal text-muted-foreground ml-1">/ 100</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Avg daily balance</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(snap.avg_daily_balance_cents)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-normal">Net flow</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{money(snap.total_deposits_cents - snap.total_withdrawals_cents)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Period {snap.period_start} → {snap.period_end}</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Deposits</span><span className="font-mono text-emerald-600">{money(snap.total_deposits_cents)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Withdrawals</span><span className="font-mono">{money(snap.total_withdrawals_cents)}</span></div>
          <div className="text-xs text-muted-foreground pt-2">Generated {formatDistanceToNow(new Date(snap.generated_at), { addSuffix: true })}</div>
        </CardContent>
      </Card>
    </div>
  );
}
