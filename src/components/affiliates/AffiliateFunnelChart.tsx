// src/components/affiliates/AffiliateFunnelChart.tsx
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FunnelDay } from "@/lib/affiliates/types";
import { formatNumber } from "@/lib/affiliates/format";

interface Props {
  data: FunnelDay[];
}

export default function AffiliateFunnelChart({ data }: Props) {
  const totals = useMemo(() => {
    const acc = { clicks: 0, signups: 0, paid: 0 };
    data.forEach((d) => {
      acc.clicks += d.clicks;
      acc.signups += d.signups;
      acc.paid += d.paid;
    });
    return acc;
  }, [data]);

  const conversionToSignup =
    totals.clicks > 0 ? (totals.signups / totals.clicks) * 100 : 0;
  const conversionToPaid =
    totals.signups > 0 ? (totals.paid / totals.signups) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-center">
        <FunnelStep
          label="Clicks"
          value={totals.clicks}
          rightLabel={`${conversionToSignup.toFixed(1)}% \u2192 signup`}
        />
        <FunnelStep label="Signups" value={totals.signups} />
        <FunnelStep
          label="Paid"
          value={totals.paid}
          rightLabel={`${conversionToPaid.toFixed(1)}% \u2190 signup`}
        />
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2840" strokeOpacity={0.08} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "#1a2840" }}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#1a2840" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 6,
                borderColor: "#1a2840",
                fontSize: 12,
              }}
              labelFormatter={(d: string) =>
                new Date(d).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              }
              formatter={(v: number) => formatNumber(v)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="clicks" name="Clicks" fill="#1a2840" opacity={0.35} />
            <Bar dataKey="signups" name="Signups" fill="#1a2840" />
            <Bar dataKey="paid" name="Paid" fill="#d4a574" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  rightLabel,
}: {
  label: string;
  value: number;
  rightLabel?: string;
}) {
  return (
    <div className="rounded-md border border-[#1a2840]/10 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wider text-[#1a2840]/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[#1a2840] tabular-nums">
        {formatNumber(value)}
      </p>
      {rightLabel && (
        <p className="mt-1 text-[11px] text-[#d4a574]">{rightLabel}</p>
      )}
    </div>
  );
}
