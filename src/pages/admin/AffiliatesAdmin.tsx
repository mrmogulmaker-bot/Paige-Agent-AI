// src/pages/admin/AffiliatesAdmin.tsx
// Route: /admin/affiliates  (gate to admin/owner role in your router)
//
// Visible to: admin and owner roles. Staff users should use
// <MyReferralsPanel /> inside their dashboard instead.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AffiliateStatCards from "@/components/affiliates/AffiliateStatCards";
import AffiliateDateRangePicker from "@/components/affiliates/AffiliateDateRangePicker";
import AffiliateLeaderboard from "@/components/affiliates/AffiliateLeaderboard";
import AffiliateFunnelChart from "@/components/affiliates/AffiliateFunnelChart";
import AffiliateDrawer from "@/components/affiliates/AffiliateDrawer";
import AffiliateApplicationsTab from "@/components/affiliates/AffiliateApplicationsTab";
import CommissionTierEditor from "@/components/affiliates/CommissionTierEditor";
import InviteAffiliateDialog from "@/components/affiliates/InviteAffiliateDialog";
import type {
  AffiliateStatRow,
  CommissionTier,
  DateRange,
  FunnelDay,
} from "@/lib/affiliates/types";
import {
  fetchAffiliateStats,
  fetchCommissionTiers,
  fetchFunnel,
} from "@/lib/affiliates/queries";

function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { from, to };
}

export default function AffiliatesAdmin() {
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [rows, setRows] = useState<AffiliateStatRow[] | null>(null);
  const [funnel, setFunnel] = useState<FunnelDay[] | null>(null);
  const [tiers, setTiers] = useState<CommissionTier[] | null>(null);
  const [selected, setSelected] = useState<AffiliateStatRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [r, f, t] = await Promise.all([
        fetchAffiliateStats(),
        fetchFunnel(range),
        fetchCommissionTiers(),
      ]);
      setRows(r);
      setFunnel(f);
      setTiers(t);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [range]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadingStats = rows === null;

  const activeRows = useMemo(
    () => (rows ?? []).filter((r) => r.active),
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[#1a2840]">Affiliates</h1>
          <p className="text-sm text-[#1a2840]/60">
            Internal referral program — leaderboard, conversions, and commission tiers.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <InviteAffiliateDialog onInvited={loadAll} />
          <AffiliateDateRangePicker value={range} onChange={setRange} />
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <AffiliateStatCards rows={activeRows} loading={loadingStats} />

      <Tabs defaultValue="leaderboard" className="w-full">
        <TabsList className="bg-[#1a2840]/5">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="tiers">Commission tiers</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <Card className="border-[#1a2840]/15">
            <CardHeader>
              <CardTitle className="text-[#1a2840]">
                Affiliate leaderboard
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AffiliateLeaderboard
                rows={rows ?? []}
                onSelectAffiliate={setSelected}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications">
          <AffiliateApplicationsTab />
        </TabsContent>

        <TabsContent value="funnel">
          <Card className="border-[#1a2840]/15">
            <CardHeader>
              <CardTitle className="text-[#1a2840]">Conversion funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <AffiliateFunnelChart data={funnel ?? []} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiers">
          <CommissionTierEditor tiers={tiers} onSaved={loadAll} />
        </TabsContent>
      </Tabs>

      <AffiliateDrawer
        affiliate={selected}
        onClose={() => setSelected(null)}
        onPaid={loadAll}
      />
    </div>
  );
}
