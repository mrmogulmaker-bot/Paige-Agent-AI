import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreditCard, TrendingUp, TrendingDown, DollarSign, Building2, User } from "lucide-react";

const personalAccounts = [
  {
    id: "1",
    creditor: "Chase Freedom",
    type: "revolving",
    balance: 1200,
    limit: 5000,
    utilization: 24,
    status: "open",
    openedOn: "2020-03-15",
    accountType: "personal",
  },
  {
    id: "2",
    creditor: "Discover It",
    type: "revolving",
    balance: 800,
    limit: 3000,
    utilization: 27,
    status: "open",
    openedOn: "2019-07-22",
    accountType: "personal",
  },
  {
    id: "3",
    creditor: "Auto Loan - Honda",
    type: "installment",
    balance: 12000,
    limit: 25000,
    utilization: 48,
    status: "open",
    openedOn: "2021-01-10",
    accountType: "personal",
  },
];

const businessAccounts = [
  {
    id: "4",
    creditor: "Chase Business Ink",
    type: "revolving",
    balance: 3500,
    limit: 10000,
    utilization: 35,
    status: "open",
    openedOn: "2022-05-10",
    accountType: "business",
  },
  {
    id: "5",
    creditor: "American Express Business",
    type: "revolving",
    balance: 0,
    limit: 15000,
    utilization: 0,
    status: "open",
    openedOn: "2023-01-15",
    accountType: "business",
  },
  {
    id: "6",
    creditor: "Business Equipment Loan",
    type: "installment",
    balance: 18000,
    limit: 30000,
    utilization: 60,
    status: "open",
    openedOn: "2022-08-20",
    accountType: "business",
  },
];

const AccountStats = ({ accounts }: { accounts: typeof personalAccounts }) => {
  const totalCredit = accounts.reduce((sum, acc) => sum + acc.limit, 0);
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const avgUtilization = totalCredit > 0 ? Math.round((totalBalance / totalCredit) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardDescription>Total Credit Limit</CardDescription>
          <CardTitle className="text-3xl">${totalCredit.toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-success">
            <TrendingUp className="w-4 h-4" />
            <span>Healthy limit</span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardDescription>Total Balance</CardDescription>
          <CardTitle className="text-3xl">${totalBalance.toLocaleString()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="w-4 h-4" />
            <span>Across {accounts.length} accounts</span>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardDescription>Avg Utilization</CardDescription>
          <CardTitle className="text-3xl">{avgUtilization}%</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-warning">
            <TrendingDown className="w-4 h-4" />
            <span>Keep under 30%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const AccountsList = ({ accounts }: { accounts: typeof personalAccounts }) => (
  <div className="grid gap-4">
    {accounts.length === 0 ? (
      <Card className="shadow-card">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No accounts found</p>
        </CardContent>
      </Card>
    ) : (
      accounts.map((account) => (
        <Card key={account.id} className="shadow-card hover:shadow-glow transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">{account.creditor}</CardTitle>
                  <CardDescription className="capitalize">{account.type} Account</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="capitalize">{account.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Balance</p>
                <p className="font-semibold text-lg">${account.balance.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Credit Limit</p>
                <p className="font-semibold text-lg">${account.limit.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Utilization</p>
                <p className="font-semibold text-lg">{account.utilization}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Opened</p>
                <p className="font-semibold text-lg">{new Date(account.openedOn).getFullYear()}</p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Utilization Rate</span>
                <span className={account.utilization > 30 ? "text-warning" : "text-success"}>
                  {account.utilization}%
                </span>
              </div>
              <Progress value={account.utilization} className="h-2" />
            </div>
          </CardContent>
        </Card>
      ))
    )}
  </div>
);

interface AccountsOverviewProps {
  personalOnly?: boolean;
  businessOnly?: boolean;
}

export function AccountsOverview({ personalOnly, businessOnly }: AccountsOverviewProps) {
  // If personalOnly or businessOnly, show single view without tabs
  if (personalOnly) {
    return (
      <div className="space-y-6">
        <AccountStats accounts={personalAccounts} />
        <AccountsList accounts={personalAccounts} />
      </div>
    );
  }

  if (businessOnly) {
    return (
      <div className="space-y-6">
        <AccountStats accounts={businessAccounts} />
        <AccountsList accounts={businessAccounts} />
      </div>
    );
  }

  // Default: show both with tabs
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Credit Accounts</h2>
        <p className="text-muted-foreground">Monitor your personal and business credit accounts</p>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="personal" className="gap-2">
            <User className="w-4 h-4" />
            Personal Accounts
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="w-4 h-4" />
            Business Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-6 mt-6">
          <AccountStats accounts={personalAccounts} />
          <AccountsList accounts={personalAccounts} />
        </TabsContent>

        <TabsContent value="business" className="space-y-6 mt-6">
          <AccountStats accounts={businessAccounts} />
          <AccountsList accounts={businessAccounts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
