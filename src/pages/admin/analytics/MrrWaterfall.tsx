import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  start: string;
  end: string;
}

interface WaterfallBar {
  label: string;
  value: number;
  positive: boolean;
}

function dollarsFromProps(props: unknown): number {
  if (!props || typeof props !== "object") return 0;
  const p = props as Record<string, unknown>;
  const raw =
    p.amount ?? p.amount_cents ?? p.mrr ?? p.price ?? p.monthly_amount ?? null;
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  // Heuristic: if value > 1000 assume cents, else dollars.
  return n > 1000 ? n / 100 : n;
}

export function MrrWaterfall({ start, end }: Props) {
  const [bars, setBars] = useState<WaterfallBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const startIso = new Date(start).toISOString();
        const endIso = new Date(end + "T23:59:59").toISOString();

        const { data: rows } = await supabase
          .from("analytics_events")
          .select("event_name, properties, created_at")
          .in("event_name", [
            "subscription_started",
            "subscription_upgraded",
            "subscription_cancelled",
          ])
          .gte("created_at", startIso)
          .lte("created_at", endIso)
          .limit(10000);

        let newMrr = 0;
        let expansion = 0;
        let churned = 0;
        for (const r of rows || []) {
          const amount = dollarsFromProps(r.properties);
          if (r.event_name === "subscription_started") newMrr += amount;
          else if (r.event_name === "subscription_upgraded") expansion += amount;
          else if (r.event_name === "subscription_cancelled") churned += amount;
        }

        const net = newMrr + expansion - churned;
        if (cancelled) return;
        setBars([
          { label: "New MRR", value: newMrr, positive: true },
          { label: "Expansion", value: expansion, positive: true },
          { label: "Churned MRR", value: -churned, positive: false },
          { label: "Net New MRR", value: net, positive: net >= 0 },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const totalMagnitude = bars.reduce((s, b) => s + Math.abs(b.value), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>MRR Waterfall</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : totalMagnitude === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
            No subscription events yet for this period. Stripe webhook must fire `subscription_started`,
            `subscription_upgraded`, or `subscription_cancelled` events to populate this chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${Math.round(Number(v))}`}
              />
              <Tooltip formatter={(v: number) => `$${Math.round(Number(v))}`} />
              <Bar dataKey="value">
                {bars.map((b, i) => (
                  <Cell
                    key={i}
                    fill={b.positive ? "hsl(var(--fundability-excellent))" : "hsl(var(--destructive))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
