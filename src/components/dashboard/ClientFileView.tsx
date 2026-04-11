import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, DollarSign, FileText, Mail, StickyNote, Upload, AlertTriangle, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportUploadTab } from "./ReportUploadTab";
import { OutreachCenter } from "./OutreachCenter";
import { PMEFundingReadiness } from "./PMEFundingReadiness";
import { ClientMemoryTab } from "./ClientMemoryTab";

interface ClientFileViewProps {
  clientUserId: string;
  onBack: () => void;
}

interface ClientProfile {
  full_name: string | null;
  city: string | null;
  state: string | null;
  estimated_fico_eq: number | null;
  estimated_fico_ex: number | null;
  estimated_fico_tu: number | null;
  onboarding_completed: boolean | null;
  has_discrepancies: boolean | null;
  cross_bureau_discrepancies: any[] | null;
  last_report_analyzed_at: string | null;
}

export function ClientFileView({ clientUserId, onBack }: ClientFileViewProps) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [activeTab, setActiveTab] = useState("credit-reports");

  useEffect(() => {
    fetchProfile();
  }, [clientUserId]);

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, city, state, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, onboarding_completed, has_discrepancies, cross_bureau_discrepancies, last_report_analyzed_at")
      .eq("user_id", clientUserId)
      .maybeSingle();
    if (data) setProfile(data as unknown as ClientProfile);
  };

  const bestFICO = Math.max(
    profile?.estimated_fico_eq || 0,
    profile?.estimated_fico_ex || 0,
    profile?.estimated_fico_tu || 0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-foreground">
            {profile?.full_name || "Client File"}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {profile?.city && profile?.state && (
              <span className="text-sm text-muted-foreground">{profile.city}, {profile.state}</span>
            )}
            {bestFICO > 0 && (
              <Badge variant={bestFICO >= 700 ? "default" : bestFICO >= 600 ? "secondary" : "destructive"}>
                FICO: {bestFICO}
              </Badge>
            )}
            <Badge variant={profile?.onboarding_completed ? "default" : "outline"}>
              {profile?.onboarding_completed ? "Active" : "Pending"}
            </Badge>
            {profile?.has_discrepancies && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Cross-Bureau Discrepancies
              </Badge>
            )}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="credit-reports" className="text-xs">
            <Upload className="w-3 h-3 mr-1" /> Credit Reports
          </TabsTrigger>
          <TabsTrigger value="funding" className="text-xs">
            <DollarSign className="w-3 h-3 mr-1" /> Funding Readiness
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">
            <FileText className="w-3 h-3 mr-1" /> Documents
          </TabsTrigger>
          <TabsTrigger value="outreach" className="text-xs">
            <Mail className="w-3 h-3 mr-1" /> Outreach
          </TabsTrigger>
          <TabsTrigger value="memory" className="text-xs">
            <Brain className="w-3 h-3 mr-1" /> Memory
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">
            <StickyNote className="w-3 h-3 mr-1" /> Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credit-reports" className="mt-4">
          <ReportUploadTab clientUserId={clientUserId} />
        </TabsContent>

        <TabsContent value="funding" className="mt-4">
          <PMEFundingReadiness />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Client documents coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outreach" className="mt-4">
          <OutreachCenter clientUserId={clientUserId} />
        </TabsContent>

        <TabsContent value="memory" className="mt-4">
          <ClientMemoryTab clientUserId={clientUserId} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Client notes coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
