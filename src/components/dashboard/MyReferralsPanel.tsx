// src/components/dashboard/MyReferralsPanel.tsx
// Drop into the staff (admin/coach) dashboard. Shows ONLY the current user's
// affiliate stats. Safe to render even if the user doesn't have an
// affiliate_profile row yet — it renders an empty state instead.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Copy,
  Check,
  MousePointerClick,
  UserPlus,
  CreditCard,
  Coins,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client"; // ADJUST-IF-NEEDED
import {
  fetchMyAffiliateStats,
  fetchMyRecentConversions,
} from "@/lib/affiliates/queries";
import type {
  AffiliateStatRow,
  ConversionRow,
} from "@/lib/affiliates/types";
import {
  formatCents,
  formatDate,
  formatNumber,
  formatPercent,
  referralUrlForCode,
} from "@/lib/affiliates/format";

export default function MyReferralsPanel() {
  const [stats, setStats] = useState<AffiliateStatRow | null>(null);
  const [recent, setRecent] = useState<ConversionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: userRes, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        const userId = userRes.user?.id;
        if (!userId) {
          if (!cancelled) setStats(null);
          return;
        }
        const s = await fetchMyAffiliateStats(userId);
        if (cancelled) return;
        setStats(s);
        if (s) {
          const c = await fetchMyRecentConversions(s.affiliate_id, 10);
          if (!cancelled) setRecent(c);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className="border-[#1a2840]/15">
        <CardHeader>
          <CardTitle className="text-[#1a2840]">My referrals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-4 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">My referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="border-[#1a2840]/15">
        <CardHeader>
          <CardTitle className="text-[#1a2840]">My referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#1a2840]/70">
            You&rsquo;re not enrolled in the referral program yet. An admin can
            enroll you, or your role will auto-enroll you when assigned.
          </p>
        </CardContent>
      </Card>
    );
  }

  const url = referralUrlForCode(stats.referral_code);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <Card className="border-[#1a2840]/15">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-[#1a2840]">My referrals</CardTitle>
          <p className="mt-1 text-xs text-[#1a2840]/60">
            {stats.tier_name} · {formatPercent(stats.commission_rate)} commission
          </p>
        </div>
        <Badge className="bg-[#1a2840] text-white">{stats.referral_code}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 md:flex-row">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button
            onClick={copyLink}
            className="bg-[#d4a574] text-[#1a2840] hover:bg-[#d4a574]/90"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4" /> Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" /> Copy link
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStatCard
            label="Clicks"
            value={formatNumber(stats.clicks)}
            Icon={MousePointerClick}
          />
          <MiniStatCard
            label="Signups"
            value={formatNumber(stats.signups)}
            Icon={UserPlus}
          />
          <MiniStatCard
            label="Paid"
            value={formatNumber(stats.paid_conversions)}
            Icon={CreditCard}
          />
          <MiniStatCard
            label="Owed"
            value={formatCents(stats.commission_owed_cents)}
            Icon={Coins}
            highlight
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-[#1a2840]">
            Recent activity
          </h3>
          {recent.length === 0 ? (
            <p className="rounded-md border border-dashed border-[#1a2840]/20 p-4 text-center text-sm text-[#1a2840]/60">
              No conversions yet. Share your link to get started.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-[#1a2840]/10">
              <Table>
                <TableHeader className="bg-[#1a2840]/5">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Your cut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">
                        {formatDate(c.converted_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            c.status === "attributed"
                              ? "border-green-500 text-green-600"
                              : "border-[#1a2840]/30 text-[#1a2840]/60"
                          }
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCents(c.amount_cents)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-[#d4a574]">
                        {formatCents(c.commission_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStatCard({
  label,
  value,
  Icon,
  highlight,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-md bg-[#d4a574]/10 p-3"
          : "rounded-md border border-[#1a2840]/10 p-3"
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-[#1a2840]/60">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 text-[#1a2840]/40" />
      </div>
      <p
        className={
          highlight
            ? "mt-1 text-xl font-semibold text-[#d4a574] tabular-nums"
            : "mt-1 text-xl font-semibold text-[#1a2840] tabular-nums"
        }
      >
        {value}
      </p>
    </div>
  );
}
