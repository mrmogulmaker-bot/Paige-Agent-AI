// src/components/affiliates/AffiliateStatCards.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MousePointerClick, UserPlus, CreditCard, Coins, BadgeCheck } from "lucide-react";
import type { AffiliateStatRow } from "@/lib/affiliates/types";
import { formatCents, formatNumber } from "@/lib/affiliates/format";

interface Props {
  rows: AffiliateStatRow[] | null;
  loading?: boolean;
}

function sum<T extends keyof AffiliateStatRow>(
  rows: AffiliateStatRow[],
  key: T,
): number {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

export default function AffiliateStatCards({ rows, loading }: Props) {
  const totals = rows ?? [];
  const stats = [
    {
      label: "Clicks",
      value: formatNumber(sum(totals, "clicks")),
      Icon: MousePointerClick,
    },
    {
      label: "Signups",
      value: formatNumber(sum(totals, "signups")),
      Icon: UserPlus,
    },
    {
      label: "Paid conversions",
      value: formatNumber(sum(totals, "paid_conversions")),
      Icon: CreditCard,
    },
    {
      label: "Commissions owed",
      value: formatCents(sum(totals, "commission_owed_cents")),
      Icon: Coins,
    },
    {
      label: "Paid YTD",
      value: formatCents(sum(totals, "commission_paid_ytd_cents")),
      Icon: BadgeCheck,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {stats.map(({ label, value, Icon }) => (
        <Card
          key={label}
          className="border-[#1a2840]/15 bg-white shadow-sm"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[#1a2840]/60">
                  {label}
                </p>
                <div className="mt-2 text-2xl font-semibold text-[#1a2840]">
                  {loading ? <Skeleton className="h-7 w-24" /> : value}
                </div>
              </div>
              <div className="rounded-md bg-[#d4a574]/10 p-2 text-[#d4a574]">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
