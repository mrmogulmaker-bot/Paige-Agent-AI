import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Connection = {
  id: string;
  institution_name: string | null;
  status: string | null;
  accounts: any[] | null;
  last_synced_at: string | null;
  connected_at: string;
};

type Txn = {
  id: string;
  date: string;
  amount_cents: number;
  name: string;
  pending: boolean;
};

export function BankingTab({ contactId }: { contactId: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: conns } = await supabase
        .from("paige_bank_connections")
        .select("*")
        .eq("contact_id", contactId)
        .order("connected_at", { ascending: false });
      const list = (conns ?? []) as Connection[];
      setConnections(list);

      if (list.length) {
        const { data: t } = await supabase
          .from("paige_bank_transactions")
          .select("*")
          .in("bank_connection_id", list.map((c) => c.id))
          .order("date", { ascending: false })
          .limit(25);
        setTxns((t ?? []) as Txn[]);
      }
      setLoading(false);
    })();
  }, [contactId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No bank connections. Have the client link a bank from{" "}
          <a href="/admin/integrations/plaid" className="text-primary hover:underline">Integrations → Plaid</a>.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {connections.map((c) => {
          const accountCount = Array.isArray(c.accounts) ? c.accounts.length : 0;
          return (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><Building2 className="w-4 h-4" />{c.institution_name ?? "Bank"}</span>
                  <Badge variant={c.status === "active" ? "default" : "outline"} className="text-[10px]">{c.status ?? "unknown"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>{accountCount} account{accountCount === 1 ? "" : "s"}</div>
                {c.last_synced_at && <div>Synced {formatDistanceToNow(new Date(c.last_synced_at), { addSuffix: true })}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Recent transactions</CardTitle></CardHeader>
        <CardContent>
          {txns.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">No transactions synced yet.</div>
          ) : (
            <div className="divide-y">
              {txns.map((t) => (
                <div key={t.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.date}{t.pending ? " · pending" : ""}</div>
                  </div>
                  <span className={`font-mono shrink-0 ${t.amount_cents < 0 ? "text-emerald-600" : ""}`}>
                    {t.amount_cents < 0 ? "+" : "-"}${Math.abs(t.amount_cents / 100).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
