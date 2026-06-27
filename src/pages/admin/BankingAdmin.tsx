import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark } from "lucide-react";

type Conn = { id: string; contact_id: string; institution_name: string | null; status: string; last_synced_at: string | null };
type Snap = { id: string; contact_id: string; funding_readiness_score: number | null; runway_days: number | null; period_end: string; avg_daily_balance_cents: number };

export default function BankingAdmin() {
  const [activated, setActivated] = useState(false);
  const [conns, setConns] = useState<Conn[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);

  useEffect(() => {
    void (async () => {
      const sb = supabase as any;
      const cfg = await sb.from("paige_config").select("plaid_activated").eq("id", 1).maybeSingle();
      setActivated(!!cfg.data?.plaid_activated);
      const c = await sb.from("paige_bank_connections").select("id, contact_id, institution_name, status, last_synced_at").order("connected_at", { ascending: false });
      setConns((c.data ?? []) as Conn[]);
      const s = await sb.from("paige_cash_flow_snapshots").select("id, contact_id, funding_readiness_score, runway_days, period_end, avg_daily_balance_cents").order("generated_at", { ascending: false }).limit(20);
      setSnaps((s.data ?? []) as Snap[]);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Banking & Cash Flow</h1>
      </div>
      {!activated && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="pt-6 text-sm">
            <div className="font-medium mb-1">Plaid scaffolding — activation pending</div>
            <p className="text-muted-foreground">
              All tables, edge functions, and screens are in place. Connect Plaid credentials and toggle
              <code className="mx-1">plaid_activated</code> in <a href="/admin/integrations/plaid" className="underline">Plaid Integration Config</a> to enable.
            </p>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Bank connections</CardTitle></CardHeader>
        <CardContent>
          {conns.length === 0 ? <div className="text-sm text-muted-foreground">No connections yet.</div> : (
            <div className="space-y-2">
              {conns.map((c) => (
                <div key={c.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div>
                    <div className="font-medium">{c.institution_name ?? "Unknown institution"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.contact_id}</div>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge>{c.status}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {c.last_synced_at ? `synced ${new Date(c.last_synced_at).toLocaleString()}` : "never synced"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recent cash-flow snapshots</CardTitle></CardHeader>
        <CardContent>
          {snaps.length === 0 ? <div className="text-sm text-muted-foreground">No snapshots yet.</div> : (
            <div className="space-y-2">
              {snaps.map((s) => (
                <div key={s.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
                  <div>
                    <div className="font-mono text-xs">{s.contact_id}</div>
                    <div className="text-xs text-muted-foreground">period ends {s.period_end}</div>
                  </div>
                  <div className="flex gap-3 items-center">
                    <Badge variant="secondary">readiness {s.funding_readiness_score ?? "—"}</Badge>
                    <Badge variant="outline">{s.runway_days ?? "—"} day runway</Badge>
                    <span className="text-xs">avg bal ${(s.avg_daily_balance_cents / 100).toFixed(0)}</span>
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
