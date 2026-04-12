import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Globe, BarChart3, FileText, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BuildProgramSection } from "./BuildProgramSection";

interface Props {
  clientId?: string; // For internal client mode
}

export function BusinessInfrastructureAssessment({ clientId }: Props) {
  const [businesses, setBusinesses] = useState<{ id: string; legal_name: string }[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("build");

  // Completion percentages
  const [foundationPct, setFoundationPct] = useState(0);
  const [presencePct, setPresencePct] = useState(0);
  const [bureauPct, setBureauPct] = useState(0);
  const [docsPct, setDocsPct] = useState(0);
  const [buildPct, setBuildPct] = useState(0);

  const overallScore = Math.round(
    (foundationPct * 0.25 + presencePct * 0.15 + bureauPct * 0.25 + docsPct * 0.15 + buildPct * 0.20)
  );

  useEffect(() => { fetchBusinesses(); }, [clientId]);

  const fetchBusinesses = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data } = await supabase
      .from("businesses")
      .select("id, legal_name")
      .eq("owner_user_id", user.id)
      .order("legal_name");

    if (data && data.length > 0) {
      setBusinesses(data);
      setSelectedBusinessId(data[0].id);
    }
  };

  const tabs = [
    { value: "foundation", label: "Foundation", icon: Building2, pct: foundationPct },
    { value: "presence", label: "Public Presence", icon: Globe, pct: presencePct },
    { value: "credit", label: "Business Credit", icon: BarChart3, pct: bureauPct },
    { value: "docs", label: "Financial Docs", icon: FileText, pct: docsPct },
    { value: "build", label: "BUILD Program", icon: Award, pct: buildPct },
  ];

  const PlaceholderTab = ({ label }: { label: string }) => (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm text-muted-foreground">This section is coming in the next step.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-xl md:text-2xl font-bold text-foreground">Business Infrastructure Assessment</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete each section to maximize your funding readiness.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {businesses.length > 1 && (
            <Select value={selectedBusinessId} onValueChange={setSelectedBusinessId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {businesses.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {businesses.length === 1 && (
            <Badge variant="outline" className="text-sm py-1 px-3">
              <Building2 className="w-3 h-3 mr-1" />
              {businesses[0].legal_name}
            </Badge>
          )}
        </div>
      </div>

      {/* Overall Readiness Score */}
      <Card className="border-primary/20 bg-gradient-to-r from-card to-primary/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Business Readiness Score</span>
            <span className="text-2xl font-bold text-primary">{overallScore}%</span>
          </div>
          <Progress value={overallScore} className="h-2.5" />
          <div className="flex justify-between mt-2">
            {tabs.map(t => (
              <div key={t.value} className="text-center">
                <div className="text-[10px] text-muted-foreground">{t.label}</div>
                <div className={`text-xs font-semibold ${t.pct >= 80 ? "text-emerald-500" : t.pct >= 40 ? "text-amber-500" : "text-muted-foreground"}`}>{t.pct}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabbed Sections */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1.5">
              <t.icon className="w-3 h-3" />
              {t.label}
              <Badge variant="outline" className={`text-[10px] px-1 py-0 ml-1 ${t.pct >= 80 ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" : t.pct >= 40 ? "bg-amber-500/20 text-amber-600 border-amber-500/30" : ""}`}>
                {t.pct}%
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="foundation" className="mt-4">
          <PlaceholderTab label="Foundation" />
        </TabsContent>

        <TabsContent value="presence" className="mt-4">
          <PlaceholderTab label="Public Presence" />
        </TabsContent>

        <TabsContent value="credit" className="mt-4">
          <PlaceholderTab label="Business Credit" />
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <PlaceholderTab label="Financial Docs" />
        </TabsContent>

        <TabsContent value="build" className="mt-4">
          {businesses.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Business Entity Found</h3>
                <p className="text-sm text-muted-foreground">
                  Add a business entity from the Business Organization section to begin your infrastructure assessment.
                </p>
              </CardContent>
            </Card>
          ) : (
            <BuildProgramSection foundationPct={foundationPct} bureauPct={bureauPct} onCompletionChange={setBuildPct} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
