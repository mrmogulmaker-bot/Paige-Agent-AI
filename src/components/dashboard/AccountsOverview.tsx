import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

const mockAccounts = [
  {
    id: "1",
    creditor: "Chase Freedom",
    type: "revolving",
    balance: 1200,
    limit: 5000,
    utilization: 24,
    status: "open",
    openedOn: "2020-03-15",
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
  },
];

export function AccountsOverview() {
  const totalCredit = mockAccounts.reduce((sum, acc) => sum + acc.limit, 0);
  const totalBalance = mockAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const avgUtilization = Math.round((totalBalance / totalCredit) * 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Credit Accounts
        </h1>
        <p className="text-muted-foreground mt-2">Monitor your credit accounts and utilization</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <span>Across {mockAccounts.length} accounts</span>
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

      <div className="grid gap-4">
        {mockAccounts.map((account) => (
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
        ))}
      </div>
    </div>
  );
}
