import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, DollarSign, Users, TrendingUp, Link as LinkIcon, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AffiliateStats {
  totalReferrals: number;
  activeReferrals: number;
  totalEarnings: number;
  pendingEarnings: number;
  conversionRate: number;
}

interface Referral {
  id: string;
  referred_email: string;
  status: string;
  commission_amount: number;
  created_at: string;
  converted_at: string | null;
}

export function AffiliateTracking() {
  const [stats, setStats] = useState<AffiliateStats>({
    totalReferrals: 0,
    activeReferrals: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
    conversionRate: 0,
  });
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [affiliateCode, setAffiliateCode] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAffiliateData();
  }, []);

  const fetchAffiliateData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Generate or fetch affiliate code
      const code = `PAIGE-${user.id.slice(0, 8).toUpperCase()}`;
      setAffiliateCode(code);

      // Fetch referrals (mock data for now - replace with actual table)
      const mockReferrals: Referral[] = [
        {
          id: "1",
          referred_email: "john@example.com",
          status: "converted",
          commission_amount: 25,
          created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          converted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: "2",
          referred_email: "sarah@example.com",
          status: "pending",
          commission_amount: 0,
          created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          converted_at: null,
        },
      ];

      setReferrals(mockReferrals);

      // Calculate stats
      const converted = mockReferrals.filter((r) => r.status === "converted");
      setStats({
        totalReferrals: mockReferrals.length,
        activeReferrals: converted.length,
        totalEarnings: converted.reduce((sum, r) => sum + r.commission_amount, 0),
        pendingEarnings: mockReferrals
          .filter((r) => r.status === "pending")
          .reduce((sum, r) => sum + 25, 0), // Assume $25 per conversion
        conversionRate:
          mockReferrals.length > 0
            ? (converted.length / mockReferrals.length) * 100
            : 0,
      });
    } catch (error) {
      console.error("Error fetching affiliate data:", error);
      toast({
        title: "Error",
        description: "Failed to load affiliate data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyAffiliateLink = () => {
    const link = `${window.location.origin}?ref=${affiliateCode}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Copied!",
      description: "Affiliate link copied to clipboard",
    });
  };

  const copyAffiliateCode = () => {
    navigator.clipboard.writeText(affiliateCode);
    toast({
      title: "Copied!",
      description: "Affiliate code copied to clipboard",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Affiliate Program
        </h1>
        <p className="text-muted-foreground mt-2">
          Earn 20% commission on every referral that converts
        </p>
      </div>

      {/* Affiliate Code Card */}
      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <CardTitle>Your Affiliate Link</CardTitle>
          <CardDescription>
            Share this link to earn commissions on referrals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="affiliate-link">Affiliate Link</Label>
            <div className="flex gap-2">
              <Input
                id="affiliate-link"
                value={`${window.location.origin}?ref=${affiliateCode}`}
                readOnly
                className="font-mono text-sm"
              />
              <Button onClick={copyAffiliateLink} variant="outline">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="affiliate-code">Affiliate Code</Label>
            <div className="flex gap-2">
              <Input
                id="affiliate-code"
                value={affiliateCode}
                readOnly
                className="font-mono text-sm"
              />
              <Button onClick={copyAffiliateCode} variant="outline">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.totalReferrals}</span>
              <Users className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-success">
                {stats.activeReferrals}
              </span>
              <CheckCircle2 className="w-8 h-8 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">
                ${stats.totalEarnings.toFixed(2)}
              </span>
              <DollarSign className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">
                {stats.conversionRate.toFixed(1)}%
              </span>
              <TrendingUp className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referrals Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Referral History</CardTitle>
          <CardDescription>Track your referrals and earnings</CardDescription>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <div className="text-center py-12">
              <LinkIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No referrals yet</h3>
              <p className="text-muted-foreground">
                Start sharing your affiliate link to earn commissions
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Referred Date</TableHead>
                  <TableHead>Converted Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell className="font-medium">
                      {referral.referred_email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          referral.status === "converted" ? "default" : "secondary"
                        }
                      >
                        {referral.status.charAt(0).toUpperCase() +
                          referral.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {referral.status === "converted"
                        ? `$${referral.commission_amount.toFixed(2)}`
                        : "Pending"}
                    </TableCell>
                    <TableCell>
                      {new Date(referral.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {referral.converted_at
                        ? new Date(referral.converted_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Commission Info */}
      <Card className="shadow-card border-primary/20">
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-primary font-bold">1</span>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Share Your Link</h4>
              <p className="text-sm text-muted-foreground">
                Share your unique affiliate link with friends, clients, or your audience
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-primary font-bold">2</span>
            </div>
            <div>
              <h4 className="font-semibold mb-1">They Sign Up</h4>
              <p className="text-sm text-muted-foreground">
                When someone signs up using your link, they become your referral
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-primary font-bold">3</span>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Earn Commission</h4>
              <p className="text-sm text-muted-foreground">
                Earn 20% commission when they upgrade to a paid plan
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
