import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertCircle } from "lucide-react";

type Snap = {
  id: string;
  contact_id: string;
  bureau: string;
  score: number | null;
  pulled_at: string;
  alerts_triggered: unknown[] | null;
};

export default function OwnerCreditAdmin() {
  const [rows, setRows] = useState<Snap[]>([]);
  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from("paige_owner_credit_snapshots")
        .select("id, contact_id, bureau, score, pulled_at, alerts_triggered")
        .order("pulled_at", { ascending: false })
        .limit(100);
      setRows((data ?? []) as Snap[]);
    })();
  }, []);

  const eligibility = (s: number | null) =>
    s == null ? "unknown" : s >= 700 ? "strong" : s >= 640 ? "moderate" : "limited";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Funding Eligibility Lens</h1>
      </div>
      <Card className="border-amber-300 bg-amber-50/40">
        <CardContent className="flex gap-3 pt-6">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Scope guard</div>
            <p className="text-muted-foreground">
              SmartCredit data is used <strong>only</strong> to assess business funding eligibility.
              No dispute workflows, no FCRA enforcement, no consumer credit repair surfaces.
              That work lives on a separate product.
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent owner snapshots</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No snapshots yet.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div>
                    <div className="font-mono text-xs">{r.contact_id}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.pulled_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="capitalize">{r.bureau}</Badge>
                    <span className="font-semibold">{r.score ?? "—"}</span>
                    <Badge>{eligibility(r.score)}</Badge>
                    {Array.isArray(r.alerts_triggered) && r.alerts_triggered.length > 0 && (
                      <Badge variant="destructive">{r.alerts_triggered.length} alerts</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
