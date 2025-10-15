import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AffiliateSignup } from "./AffiliateSignup";
import { AffiliateApplications } from "./AffiliateApplications";
import { ReferralCodeManager } from "./ReferralCodeManager";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Users } from "lucide-react";

interface AffiliateStats {
  totalEarnings: number;
  pendingCommissions: number;
  totalConversions: number;
  totalClicks: number;
}

interface Conversion {
  id: string;
  order_amount: number;
  commission_amount: number;
  status: string;
  converted_at: string;
  referral_codes: {
    code: string;
  };
}

interface AffiliateProfile {
  status: string;
  id: string;
}

interface UserRole {
  role: string;
}

export function AffiliateTracking() {
  const [affiliateProfile, setAffiliateProfile] = useState<AffiliateProfile | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [stats, setStats] = useState<AffiliateStats>({
    totalEarnings: 0,
    pendingCommissions: 0,
    totalConversions: 0,
    totalClicks: 0,
  });
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAffiliateData();
  }, []);

  const fetchAffiliateData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isAdmin = roles?.some((r) => r.role === "admin");
      if (isAdmin) {
        setUserRole({ role: "admin" });
      }

      // Get affiliate profile
      const { data: profile } = await supabase
        .from("affiliate_profiles")
        .select("id, status")
        .eq("user_id", user.id)
        .maybeSingle();

      setAffiliateProfile(profile);

      if (!profile || profile.status !== "approved") {
        setIsLoading(false);
        return;
      }

      // Get conversions
      const { data: conversionsData } = await supabase
        .from("referral_conversions")
        .select(`
          *,
          referral_codes (code)
        `)
        .eq("affiliate_id", profile.id)
        .order("converted_at", { ascending: false });

      setConversions(conversionsData || []);

      // Calculate stats
      const totalEarnings = conversionsData
        ?.filter((c) => c.status === "paid")
        .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      const pendingCommissions = conversionsData
        ?.filter((c) => c.status === "pending" || c.status === "approved")
        .reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;

      const totalConversions = conversionsData?.length || 0;

      // Get total clicks from referral codes
      const { data: codes } = await supabase
        .from("referral_codes")
        .select("clicks")
        .eq("affiliate_id", profile.id);

      const totalClicks = codes?.reduce((sum, code) => sum + code.clicks, 0) || 0;

      setStats({
        totalEarnings,
        pendingCommissions,
        totalConversions,
        totalClicks,
      });
    } catch (error) {
      console.error("Error fetching affiliate data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  // Show admin view
  if (userRole?.role === "admin") {
    return (
      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">Applications</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
        </TabsList>
        <TabsContent value="applications" className="mt-6">
          <AffiliateApplications />
        </TabsContent>
        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Affiliate Program Overview</CardTitle>
              <CardDescription>Manage your affiliate program</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Admin overview coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    );
  }

  // Show application form if no profile
  if (!affiliateProfile) {
    return <AffiliateSignup />;
  }

  // Show pending/rejected status
  if (affiliateProfile.status === "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application Pending</CardTitle>
          <CardDescription>Your affiliate application is under review</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            We'll notify you once your application has been reviewed. This typically takes 1-2 business days.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (affiliateProfile.status === "rejected") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Application Not Approved</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Unfortunately, your affiliate application was not approved at this time. Please contact support for more information.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show affiliate dashboard for approved affiliates
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.totalEarnings.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.pendingCommissions.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalConversions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Clicks</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalClicks}</div>
          </CardContent>
        </Card>
      </div>

      <ReferralCodeManager />

      <Card>
        <CardHeader>
          <CardTitle>Recent Conversions</CardTitle>
          <CardDescription>Your latest referral conversions</CardDescription>
        </CardHeader>
        <CardContent>
          {conversions.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No conversions yet</p>
          ) : (
            <div className="space-y-4">
              {conversions.map((conversion) => (
                <div key={conversion.id} className="flex items-center justify-between border-b pb-4">
                  <div>
                    <p className="font-medium">Code: {conversion.referral_codes.code}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(conversion.converted_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${Number(conversion.commission_amount).toFixed(2)}</p>
                    <p className="text-sm text-muted-foreground capitalize">{conversion.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
