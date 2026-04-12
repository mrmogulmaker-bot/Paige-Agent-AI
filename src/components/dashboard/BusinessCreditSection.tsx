import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, BarChart3, Building2, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AccountsOverview } from "./AccountsOverview";
import { supabase } from "@/integrations/supabase/client";
import { useFinancialKPIs } from "@/hooks/useFinancialKPIs";
import BusinessCreditDashboard from "./BusinessCreditDashboard";

const mockBusinessCreditReport = {
  duns: "12-345-6789",
  paydexScore: 75,
  creditLimit: 50000,
  outstandingBalance: 12000,
  paymentHistory: "Good",
  tradelines: 8,
  inquiries: 2,
};

const BusinessCreditReportTab = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardDescription>PAYDEX Score</CardDescription>
          <CardTitle className="text-3xl">{mockBusinessCreditReport.paydexScore}</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={mockBusinessCreditReport.paydexScore} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {mockBusinessCreditReport.paydexScore >= 80 ? "Excellent" : "Good"}
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardDescription>Total Credit Limit</CardDescription>
          <CardTitle className="text-3xl">
            ${mockBusinessCreditReport.creditLimit.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {mockBusinessCreditReport.tradelines} active tradelines
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardDescription>Outstanding Balance</CardDescription>
          <CardTitle className="text-3xl">
            ${mockBusinessCreditReport.outstandingBalance.toLocaleString()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {Math.round((mockBusinessCreditReport.outstandingBalance / mockBusinessCreditReport.creditLimit) * 100)}% utilization
          </p>
        </CardContent>
      </Card>
    </div>

    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Business Credit Profile</CardTitle>
        <CardDescription>D&B DUNS: {mockBusinessCreditReport.duns}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Payment History</p>
            <p className="font-semibold">{mockBusinessCreditReport.paymentHistory}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Recent Inquiries</p>
            <p className="font-semibold">{mockBusinessCreditReport.inquiries}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

const BankAccountsTab = () => {
  const [connectedAccounts, setConnectedAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: kpis } = useFinancialKPIs();

  const fetchConnectedAccounts = async () => {
    const { data, error } = await supabase
      .from('connected_bank_accounts')
      .select('id, account_id, account_name, account_mask, account_type, account_subtype, institution_id, institution_name, business_id, is_active, last_sync_at, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching accounts:', error);
    } else {
      setConnectedAccounts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchConnectedAccounts();
  }, []);

  return (
    <div className="space-y-6">
      {/* Phase 2 Notice */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-accent mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Open Banking Connection — Phase 2</p>
            <p className="text-sm text-muted-foreground">
              Bank account connection via open banking is planned for Phase 2. Upload bank statements as PDFs in the Financial Docs tab to document your cash flow.
            </p>
            <Badge variant="outline" className="text-xs border-accent/30 text-accent mt-1">Coming Soon</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Business Bank Accounts</CardTitle>
          <CardDescription>
            Connected accounts will appear here once open banking integration is available in Phase 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : connectedAccounts.length > 0 ? (
            <div className="space-y-4">
              {connectedAccounts.map((account) => (
                <div key={account.id} className="flex items-start justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">{account.institution_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {account.account_name} {account.account_mask ? `•••• ${account.account_mask}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {account.account_type} {account.account_subtype ? `• ${account.account_subtype}` : ''}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No bank accounts connected yet</h3>
              <p className="text-muted-foreground mb-2">
                Upload your bank statements as PDFs in the Financial Docs tab to document your cash flow and banking relationships.
              </p>
              <p className="text-xs text-muted-foreground">
                Direct bank account connection via open banking is planned for Phase 2.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export function BusinessCreditSection() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-2">
            <CreditCard className="w-4 h-4" />
            Credit Accounts
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Credit Reports
          </TabsTrigger>
          <TabsTrigger value="bank-accounts" className="gap-2">
            <Building2 className="w-4 h-4" />
            Bank Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <BusinessCreditDashboard />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <AccountsOverview businessOnly={true} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <BusinessCreditReportTab />
        </TabsContent>

        <TabsContent value="bank-accounts" className="mt-6">
          <BankAccountsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
