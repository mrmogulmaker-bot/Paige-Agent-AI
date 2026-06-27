import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Snapshot = {
  id: string;
  bureau: string;
  score: number;
  pulled_at: string;
  factors: any;
  alerts_triggered: any;
};

const BUREAU_LABEL: Record<string, string> = {
  transunion: "TransUnion",
  equifax: "Equifax",
  experian: "Experian",
};

export function OwnerCreditTab({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paige_owner_credit_snapshots")
        .select("*")
        .eq("contact_id", contactId)
        .order("pulled_at", { ascending: false })
        .limit(30);
      setRows((data ?? []) as Snapshot[]);
      setLoading(false);
    })();
  }, [contactId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  // Latest per bureau
  const latestByBureau = new Map<string, Snapshot>();
  for (const r of rows) if (!latestByBureau.has(r.bureau)) latestByBureau.set(r.bureau, r);

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 flex items-start gap-2">
        <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>Read-only view. Dispute workflows live in the member dashboard per Doctrine §84.</span>
      </div>

      {latestByBureau.size === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No owner credit snapshots yet. Connect SmartCredit from{" "}
          <a href="/admin/integrations/smartcredit" className="text-primary hover:underline">Integrations → SmartCredit</a>.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from(latestByBureau.values()).map((s) => (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    {BUREAU_LABEL[s.bureau] ?? s.bureau}
                    <Badge variant="outline" className="text-[10px]">
                      {formatDistanceToNow(new Date(s.pulled_at), { addSuffix: true })}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{s.score}</div>
                  {Array.isArray(s.alerts_triggered) && s.alerts_triggered.length > 0 && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {s.alerts_triggered.length} alert{s.alerts_triggered.length === 1 ? "" : "s"}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Score history</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1.5 text-sm">
                {rows.slice(0, 12).map((r) => (
                  <div key={r.id} className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-0">
                    <span>{BUREAU_LABEL[r.bureau] ?? r.bureau}</span>
                    <span className="font-mono">{r.score}</span>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.pulled_at), { addSuffix: true })}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
