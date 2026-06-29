import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, CreditCard, Landmark, TrendingUp, FileSignature, Shield,
} from "lucide-react";
import { BusinessCreditTab } from "@/components/admin/contacts/BusinessCreditTab";
import { OwnerCreditTab } from "@/components/admin/contacts/OwnerCreditTab";
import { BankingTab } from "@/components/admin/contacts/BankingTab";
import { CashFlowTab } from "@/components/admin/contacts/CashFlowTab";
import { SignaturesSubTab } from "./SignaturesSubTab";
import { ReadinessSnapshotStrip } from "./ReadinessSnapshotStrip";

export type LensRollup = {
  contact_id: string;
  readiness_score: number | null;
  stored_overall_score: number | null;
  owner_fico: number | null;
  owner_bureau: string | null;
  owner_pulled_at: string | null;
  business_scores: Record<string, number> | null;
  business_pulled_at: string | null;
  avg_daily_balance_cents: number | null;
  runway_days: number | null;
  cash_flow_readiness: number | null;
  cash_flow_period_end: string | null;
  bank_connections: number;
  bank_connections_active: number;
  last_bank_sync_at: string | null;
  envelopes_total: number;
  envelopes_completed: number;
  envelopes_pending: number;
  last_signed_at: string | null;
};

type Props = {
  contactId: string;
  mode?: "admin" | "client";
};

export function FundingReadinessLens({ contactId, mode = "admin" }: Props) {
  const [rollup, setRollup] = useState<LensRollup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("contact_readiness_rollup")
        .select("*")
        .eq("contact_id", contactId)
        .maybeSingle();
      if (!cancel) {
        setRollup((data as LensRollup) || null);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [contactId]);

  return (
    <div className="space-y-4">
      <ReadinessSnapshotStrip rollup={rollup} loading={loading} />

      {mode === "client" && (
        <Card>
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <Shield className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Your Funding Readiness</div>
              <div className="text-muted-foreground">
                This snapshot pulls from the credit, banking and signature data your team has connected on your behalf.
                Information is encrypted in transit and at rest, and never shared with third parties without your explicit consent.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="owner" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="owner" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Owner Credit
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Business Credit
          </TabsTrigger>
          <TabsTrigger value="banking" className="gap-1.5">
            <Landmark className="h-3.5 w-3.5" /> Banking
          </TabsTrigger>
          <TabsTrigger value="cash" className="gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Cash Flow
          </TabsTrigger>
          <TabsTrigger value="signatures" className="gap-1.5">
            <FileSignature className="h-3.5 w-3.5" /> Signatures
            {rollup && rollup.envelopes_pending > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {rollup.envelopes_pending} pending
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="owner" className="mt-4"><OwnerCreditTab contactId={contactId} /></TabsContent>
        <TabsContent value="business" className="mt-4"><BusinessCreditTab contactId={contactId} /></TabsContent>
        <TabsContent value="banking" className="mt-4"><BankingTab contactId={contactId} /></TabsContent>
        <TabsContent value="cash" className="mt-4"><CashFlowTab contactId={contactId} /></TabsContent>
        <TabsContent value="signatures" className="mt-4">
          <SignaturesSubTab contactId={contactId} mode={mode} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
