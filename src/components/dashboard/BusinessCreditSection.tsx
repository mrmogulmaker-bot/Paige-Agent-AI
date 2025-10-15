import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, BarChart3, Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AccountsOverview } from "./AccountsOverview";

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

const BankAccountsTab = () => (
  <div className="space-y-6">
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Business Bank Accounts</CardTitle>
        <CardDescription>Monitor your business banking relationships</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-start justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">Chase Business Checking</h4>
                <p className="text-sm text-muted-foreground">Account ending in 4567</p>
              </div>
            </div>
            <Badge variant="outline">Active</Badge>
          </div>

          <div className="flex items-start justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-semibold">Bank of America Business Savings</h4>
                <p className="text-sm text-muted-foreground">Account ending in 8901</p>
              </div>
            </div>
            <Badge variant="outline">Active</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

export function BusinessCreditSection() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Business Credit
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitor and manage your business credit profile
        </p>
      </div>

      <Tabs defaultValue="accounts" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
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
