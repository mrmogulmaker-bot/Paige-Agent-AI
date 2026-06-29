import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Gauge, CreditCard, Activity, Landmark, TrendingUp, FileSignature,
} from "lucide-react";
import type { LensRollup } from "./FundingReadinessLens";

function money(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function avgBusinessScore(scores: Record<string, number> | null) {
  if (!scores) return null;
  const vals = Object.values(scores).filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function scoreColor(s: number | null) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-600";
  if (s >= 60) return "text-amber-600";
  return "text-red-600";
}

type Tile = {
  icon: any; label: string; value: string; sub?: string; tone?: string;
};

function Tile({ icon: Icon, label, value, sub, tone }: Tile) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`mt-1 text-xl font-semibold ${tone || ""}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function ReadinessSnapshotStrip({
  rollup, loading,
}: { rollup: LensRollup | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[78px] rounded-md" />
        ))}
      </div>
    );
  }

  const composite = rollup?.readiness_score ?? null;
  const biz = avgBusinessScore(rollup?.business_scores || null);
  const sigPct = rollup && rollup.envelopes_total > 0
    ? Math.round((rollup.envelopes_completed / rollup.envelopes_total) * 100)
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
      <Tile
        icon={Gauge}
        label="Readiness"
        value={composite == null ? "—" : `${composite}/100`}
        sub={rollup?.stored_overall_score != null ? "stored" : composite != null ? "computed" : "no data"}
        tone={scoreColor(composite)}
      />
      <Tile
        icon={CreditCard}
        label="Owner FICO"
        value={rollup?.owner_fico ? String(rollup.owner_fico) : "—"}
        sub={rollup?.owner_bureau ? rollup.owner_bureau : "no bureau pull"}
      />
      <Tile
        icon={Activity}
        label="Business Credit"
        value={biz == null ? "—" : String(biz)}
        sub={rollup?.business_pulled_at ? "avg across bureaus" : "not pulled"}
      />
      <Tile
        icon={Landmark}
        label="Banks Connected"
        value={`${rollup?.bank_connections_active ?? 0}`}
        sub={rollup?.bank_connections ? `${rollup.bank_connections} total` : "none yet"}
      />
      <Tile
        icon={TrendingUp}
        label="Runway"
        value={rollup?.runway_days ? `${rollup.runway_days}d` : "—"}
        sub={rollup?.avg_daily_balance_cents != null
          ? `avg bal ${money(rollup.avg_daily_balance_cents)}`
          : "no snapshot"}
      />
      <Tile
        icon={FileSignature}
        label="Signatures"
        value={sigPct == null ? "—" : `${sigPct}%`}
        sub={rollup
          ? `${rollup.envelopes_completed}/${rollup.envelopes_total} signed`
          : ""}
      />
    </div>
  );
}
