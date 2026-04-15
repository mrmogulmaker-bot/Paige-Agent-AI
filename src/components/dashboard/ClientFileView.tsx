import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, DollarSign, FileText, Mail, StickyNote, Upload, AlertTriangle, Brain, TrendingUp, Database, User, Phone, AtSign, MapPin, Calendar, Shield, MessageSquare, Trash2, Edit3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportUploadTab } from "./ReportUploadTab";
import { OutreachCenter } from "./OutreachCenter";
import { PMEFundingReadiness } from "./PMEFundingReadiness";
import { ClientMemoryTab } from "./ClientMemoryTab";
import { ClientOutcomesTab } from "./ClientOutcomesTab";
import { AdminAccountManagement } from "./AdminAccountManagement";
import { DisputesManager } from "./DisputesManager";
import { AdminFactoryResetDialog, AdminChatHistory, AdminFundingOverride } from "./admin/AdminClientTools";

interface ClientFileViewProps {
  clientUserId: string;
  onBack: () => void;
  userRole?: "admin" | "coach";
}

interface ClientProfile {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  street_address: string | null;
  zip_code: string | null;
  date_of_birth: string | null;
  ssn_last_4: string | null;
  estimated_fico_eq: number | null;
  estimated_fico_ex: number | null;
  estimated_fico_tu: number | null;
  onboarding_completed: boolean | null;
  has_discrepancies: boolean | null;
  cross_bureau_discrepancies: any[] | null;
  last_report_analyzed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function ClientFileView({ clientUserId, onBack, userRole = "coach" }: ClientFileViewProps) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [subscription, setSubscription] = useState<{ plan_slug: string; status: string } | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [negativeCount, setNegativeCount] = useState(0);
  const [disputeCount, setDisputeCount] = useState(0);
  const [showFactoryReset, setShowFactoryReset] = useState(false);


  useEffect(() => {
    fetchProfile();
    fetchClientData();
  }, [clientUserId]);

  const fetchProfile = async () => {
    const [profileRes, subRes, rolesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, phone, city, state, street_address, zip_code, date_of_birth, ssn_last_4, estimated_fico_eq, estimated_fico_ex, estimated_fico_tu, onboarding_completed, has_discrepancies, cross_bureau_discrepancies, last_report_analyzed_at, created_at, updated_at")
        .eq("user_id", clientUserId)
        .maybeSingle(),
      supabase
        .from("user_subscriptions")
        .select("plan_slug, status")
        .eq("user_id", clientUserId)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", clientUserId),
    ]);

    if (profileRes.data) setProfile(profileRes.data as unknown as ClientProfile);
    if (subRes.data) setSubscription(subRes.data as any);
    if (rolesRes.data) setRoles((rolesRes.data as any[]).map(r => r.role));

    // Try to get email from auth admin (edge case: we can only get our own email client-side)
    // Instead check if there's a coach_clients record or use profiles
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id === clientUserId) {
      setEmail(user.email || null);
    }
  };

  const fetchClientData = async () => {
    const [negRes, dispRes] = await Promise.all([
      supabase
        .from("credit_negative_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", clientUserId),
      supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", clientUserId),
    ]);
    setNegativeCount(negRes.count || 0);
    setDisputeCount(dispRes.count || 0);
  };

  const bestFICO = Math.max(
    profile?.estimated_fico_eq || 0,
    profile?.estimated_fico_ex || 0,
    profile?.estimated_fico_tu || 0
  );

  const ProfileField = ({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: any }) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <p className="text-sm font-medium text-foreground">{value || "—"}</p>
      </div>
    </div>
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
          <TabsTrigger value="profile" className="text-xs">
            <User className="w-3 h-3 mr-1" /> Profile
          </TabsTrigger>
          <TabsTrigger value="credit-reports" className="text-xs">
            <Upload className="w-3 h-3 mr-1" /> Credit Reports
          </TabsTrigger>
          <TabsTrigger value="account-mgmt" className="text-xs">
            <Database className="w-3 h-3 mr-1" /> Account Mgmt
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
          <TabsTrigger value="outcomes" className="text-xs">
            <TrendingUp className="w-3 h-3 mr-1" /> Outcomes
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">
            <StickyNote className="w-3 h-3 mr-1" /> Notes
          </TabsTrigger>
        </TabsList>

        {/* Profile Overview Tab */}
        <TabsContent value="profile" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Personal Information */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5" /> Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <ProfileField label="Full Name" value={profile?.full_name} icon={User} />
                  <ProfileField label="Email" value={email} icon={AtSign} />
                  <ProfileField label="Phone" value={profile?.phone} icon={Phone} />
                  <ProfileField label="Date of Birth" value={profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString() : null} icon={Calendar} />
                  <ProfileField label="SSN (Last 4)" value={profile?.ssn_last_4 ? `••••${profile.ssn_last_4}` : null} icon={Shield} />
                </div>

                {/* Address */}
                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Address
                  </h4>
                  <div className="grid grid-cols-2 gap-6">
                    <ProfileField label="Street Address" value={profile?.street_address} />
                    <ProfileField label="City" value={profile?.city} />
                    <ProfileField label="State" value={profile?.state} />
                    <ProfileField label="Zip Code" value={profile?.zip_code} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats Sidebar */}
            <div className="space-y-4">
              {/* Credit Scores */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Credit Scores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Equifax</span>
                    <span className="font-semibold">{profile?.estimated_fico_eq || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Experian</span>
                    <span className="font-semibold">{profile?.estimated_fico_ex || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">TransUnion</span>
                    <span className="font-semibold">{profile?.estimated_fico_tu || "—"}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Account Stats */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Account Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Negative Items</span>
                    <Badge variant={negativeCount > 0 ? "destructive" : "default"}>{negativeCount}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Active Disputes</span>
                    <Badge variant="secondary">{disputeCount}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Subscription</span>
                    <Badge variant="outline">{subscription?.plan_slug || "None"}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Roles</span>
                    <div className="flex gap-1">
                      {roles.length > 0 ? roles.map(r => (
                        <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                      )) : <span className="text-sm">—</span>}
                    </div>
                  </div>
                  {profile?.last_report_analyzed_at && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Last Report</span>
                      <span className="text-xs">{new Date(profile.last_report_analyzed_at).toLocaleDateString()}</span>
                    </div>
                  )}
                  {profile?.created_at && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Joined</span>
                      <span className="text-xs">{new Date(profile.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="credit-reports" className="mt-4">
          <ReportUploadTab clientUserId={clientUserId} />
        </TabsContent>

        <TabsContent value="account-mgmt" className="mt-4">
          <AdminAccountManagement clientUserId={clientUserId} userRole={userRole} />
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

        <TabsContent value="outcomes" className="mt-4">
          <ClientOutcomesTab clientId={clientUserId} clientName={profile?.full_name || "Client"} />
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
