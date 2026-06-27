import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

type Event = {
  id: string;
  event_type: string;
  stripe_customer_id: string | null;
  contact_id: string | null;
  tier_before: string | null;
  tier_after: string | null;
  mrr_delta_cents: number | null;
  created_at: string;
};

function dollars(cents: number | null | undefined) {
  if (!cents) return "$0";
  const v = cents / 100;
  return v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`;
}

export default function SubscriptionsRevenue() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("paige_subscription_events")
        .select("id, event_type, stripe_customer_id, contact_id, tier_before, tier_after, mrr_delta_cents, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setEvents((data ?? []) as Event[]);
      setLoading(false);
    })();
  }, []);

  const summary = useMemo(() => {
    const thirty = Date.now() - 30 * 86_400_000;
    const recent = events.filter((e) => new Date(e.created_at).getTime() >= thirty);
    const mrrNet = recent.reduce((acc, e) => acc + (e.mrr_delta_cents ?? 0), 0);
    const churn = recent.filter((e) => e.event_type === "customer.subscription.deleted").length;
    const newSubs = recent.filter((e) => e.event_type === "customer.subscription.created").length;
    const failed = recent.filter((e) => e.event_type === "invoice.payment_failed").length;
    return { mrrNet, churn, newSubs, failed };
  }, [events]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Stripe Revenue</h1>
        <p className="text-sm text-muted-foreground">Last 100 subscription / invoice events.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Net MRR (30d)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{dollars(summary.mrrNet)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">New subs (30d)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{summary.newSubs}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Churned (30d)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{summary.churn}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-xs text-muted-foreground">Failed payments (30d)</CardTitle></CardHeader><CardContent><div className="text-2xl font-semibold">{summary.failed}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent events</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Stripe events yet. Configure the webhook to send to <code>handle-stripe-webhook</code>.</p>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>Event</TableHead><TableHead>Customer</TableHead>
                <TableHead>Tier</TableHead><TableHead className="text-right">MRR Δ</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell><Badge variant="outline">{e.event_type}</Badge></TableCell>
                    <TableCell className="text-xs"><code>{e.stripe_customer_id ?? "—"}</code></TableCell>
                    <TableCell className="text-xs">{e.tier_before ?? "—"} → {e.tier_after ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{dollars(e.mrr_delta_cents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
