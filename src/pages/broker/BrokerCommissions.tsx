// Broker Workspace → Commissions tab.
// Shows broker→broker referral earnings: who they referred, monthly take,
// how many months remaining, and a lifetime total.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBrokerContext } from "@/hooks/useBrokerContext";
import { Copy, DollarSign, Users2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Row {
  id: string;
  monthly_amount: number;
  commission_rate: number;
  duration_months: number;
  started_at: string;
  expires_at: string | null;
  status: string;
  referred_broker: { business_name: string } | null;
}

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const monthsRemaining = (expires: string | null) => {
  if (!expires) return null;
  const diff = new Date(expires).getTime() - Date.now();
  const months = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24 * 30)));
  return months;
};

const BrokerCommissions = () => {
  const { activeBrokerId, parentBrokerProfile } = useBrokerContext();
  const profile = parentBrokerProfile;
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBrokerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("broker_referral_commissions")
        .select(
          "id, monthly_amount, commission_rate, duration_months, started_at, expires_at, status, referred_broker:broker_profiles!broker_referral_commissions_referred_broker_id_fkey(business_name)",
        )
        .eq("referring_broker_id", activeBrokerId)
        .order("started_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast({ title: "Failed to load commissions", description: error.message, variant: "destructive" });
      } else {
        setRows((data as any) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBrokerId, toast]);

  const activeRows = rows.filter((r) => r.status === "active");
  const monthlyTotal = activeRows.reduce((s, r) => s + Number(r.monthly_amount || 0), 0);
  const lifetimeTotal = rows.reduce((s, r) => {
    const months =
      r.status === "active"
        ? Math.min(r.duration_months, Math.max(1, Math.ceil((Date.now() - new Date(r.started_at).getTime()) / (1000 * 60 * 60 * 24 * 30))))
        : r.duration_months;
    return s + Number(r.monthly_amount || 0) * months;
  }, 0);

  const referralLink = profile?.referral_code
    ? `https://paigeagent.ai/broker?ref=${profile.referral_code}`
    : "";

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast({ title: "Copied", description: "Broker referral link copied." });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commissions</h1>
        <p className="text-sm text-muted-foreground">
          Earn 20% recurring for 12 months on every broker who joins through your link.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users2} label="Active referred brokers" value={String(activeRows.length)} />
        <StatCard icon={DollarSign} label="Recurring per month" value={fmtMoney(monthlyTotal)} />
        <StatCard icon={Clock} label="Lifetime earnings" value={fmtMoney(lifetimeTotal)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your broker referral link</CardTitle>
          <CardDescription>
            Share this link with other coaches, mortgage brokers, or financial advisors. When they
            sign up for the Broker Workspace through it, you earn 20% of their $197/mo for the first
            year.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-md bg-muted text-sm font-mono truncate">
              {referralLink || "Pending broker setup"}
            </code>
            <Button size="sm" variant="outline" onClick={copyLink} disabled={!referralLink}>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral ledger</CardTitle>
          <CardDescription>Every broker you've referred and the commission you earn from them.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No referred brokers yet. Share your link above to start earning.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referred broker</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Months left</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const left = monthsRemaining(r.expires_at);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.referred_broker?.business_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.started_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtMoney(Number(r.monthly_amount || 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {left === null ? "—" : `${left}/${r.duration_months}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : "secondary"} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

export default BrokerCommissions;
