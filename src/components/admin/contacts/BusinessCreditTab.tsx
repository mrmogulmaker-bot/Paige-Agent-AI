import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Profile = {
  id: string;
  business_name: string | null;
  ein: string | null;
  scores: Record<string, number> | null;
  trade_lines: any[] | null;
  history: Array<{ pulled_at: string; scores: Record<string, number> }> | null;
  last_pulled_at: string | null;
};

const BUREAU_LABELS: Record<string, string> = {
  paydex: "D&B Paydex",
  intelliscore: "Experian Intelliscore",
  equifax_business: "Equifax Business",
  dnb_rating: "D&B Rating",
};

function ScoreCard({ label, value, prev }: { label: string; value: number; prev?: number }) {
  const trend = prev == null ? "flat" : value > prev ? "up" : value < prev ? "down" : "flat";
  const Icon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const color = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-muted-foreground";
  return (
    <div className="border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        {prev != null && (
          <span className={`text-xs flex items-center gap-0.5 ${color}`}>
            <Icon className="w-3 h-3" />
            {Math.abs(value - prev)}
          </span>
        )}
      </div>
    </div>
  );
}

export function BusinessCreditTab({ contactId }: { contactId: string }) {
  const [data, setData] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase
        .from("paige_business_credit_profiles")
        .select("*")
        .eq("contact_id", contactId)
        .order("last_pulled_at", { ascending: false, nullsFirst: false })
        .limit(1);
      setData((rows?.[0] as Profile) ?? null);
      setLoading(false);
    })();
  }, [contactId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No business credit profile on file. Connect Nav.com from{" "}
          <a href="/admin/integrations/nav" className="text-primary hover:underline">Integrations → Nav</a> to start pulling.
        </CardContent>
      </Card>
    );
  }

  const scores = data.scores ?? {};
  const prev = data.history?.[data.history.length - 2]?.scores ?? {};
  const tradeLineCount = Array.isArray(data.trade_lines) ? data.trade_lines.length : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{data.business_name ?? "Business credit"}</CardTitle>
            {data.ein && <div className="text-xs text-muted-foreground mt-0.5">EIN {data.ein}</div>}
          </div>
          {data.last_pulled_at && (
            <Badge variant="outline" className="text-xs">
              Pulled {formatDistanceToNow(new Date(data.last_pulled_at), { addSuffix: true })}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(scores).map(([key, value]) => (
              <ScoreCard
                key={key}
                label={BUREAU_LABELS[key] ?? key}
                value={Number(value)}
                prev={prev[key] != null ? Number(prev[key]) : undefined}
              />
            ))}
          </div>
          {Object.keys(scores).length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">No bureau scores yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Trade lines</CardTitle></CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {tradeLineCount === 0 ? "No trade lines reported." : `${tradeLineCount} active trade line${tradeLineCount === 1 ? "" : "s"}.`}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
