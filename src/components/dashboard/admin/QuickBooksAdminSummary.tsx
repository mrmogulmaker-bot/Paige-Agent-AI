import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  clientUserId: string;
}

export function QuickBooksAdminSummary({ clientUserId }: Props) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<any>(null);
  const [financials, setFinancials] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: conn } = await supabase
        .from("quickbooks_connections")
        .select("id, qb_company_name, last_synced_at, is_active, token_expires_at")
        .eq("user_id", clientUserId)
        .maybeSingle();
      setConnection(conn);
      if (conn) {
        const { data: fin } = await supabase
          .from("quickbooks_financials")
          .select("total_revenue, gross_margin_percent, net_margin_percent, cash_and_bank_balance, monthly_burn_rate, cash_runway_months, synced_at")
          .eq("qb_connection_id", conn.id)
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setFinancials(fin);
      }
      setLoading(false);
    })();
  }, [clientUserId]);

  if (loading) return null;
  if (!connection) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" /> QuickBooks</CardTitle>
        </CardHeader>
        <CardContent className="py-3 text-xs text-muted-foreground">
          Client has not connected QuickBooks.
        </CardContent>
      </Card>
    );
  }

  const expired = connection.token_expires_at && new Date(connection.token_expires_at).getTime() < Date.now();
  const fmt = (n: any) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 justify-between">
          <span className="flex items-center gap-2"><Database className="w-4 h-4" /> QuickBooks Financial Summary</span>
          {expired ? (
            <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" /> Expired</Badge>
          ) : connection.is_active ? (
            <Badge className="text-[10px] bg-emerald-500/20 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Active</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">Inactive</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="text-xs text-muted-foreground">
          {connection.qb_company_name} · Synced {connection.last_synced_at ? formatDistanceToNow(new Date(connection.last_synced_at), { addSuffix: true }) : "never"}
        </div>
        {financials && (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <SummaryStat label="Revenue (30d)" value={fmt(financials.total_revenue)} />
            <SummaryStat label="Gross Margin" value={`${Number(financials.gross_margin_percent || 0).toFixed(1)}%`} />
            <SummaryStat label="Net Margin" value={`${Number(financials.net_margin_percent || 0).toFixed(1)}%`} />
            <SummaryStat label="Cash" value={fmt(financials.cash_and_bank_balance)} />
            <SummaryStat label="Burn Rate" value={fmt(financials.monthly_burn_rate)} />
            <SummaryStat label="Runway" value={financials.cash_runway_months !== null ? `${Number(financials.cash_runway_months).toFixed(1)} mo` : "—"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-md p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
