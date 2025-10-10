import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, AlertCircle, User, Home, CreditCard } from "lucide-react";

interface BureauData {
  name: string;
  score: number;
  totalAccounts: number;
  openAccounts: number;
  closedAccounts: number;
  derogatoryItems: number;
  delinquentItems: number;
  balances: number;
  payments: number;
  publicRecords: number;
  inquiries: number;
}

const bureauData: BureauData[] = [
  {
    name: "Equifax®",
    score: 812,
    totalAccounts: 17,
    openAccounts: 11,
    closedAccounts: 6,
    derogatoryItems: 1,
    delinquentItems: 0,
    balances: 51230,
    payments: 1114,
    publicRecords: 0,
    inquiries: 0,
  },
  {
    name: "Experian®",
    score: 812,
    totalAccounts: 18,
    openAccounts: 11,
    closedAccounts: 7,
    derogatoryItems: 0,
    delinquentItems: 0,
    balances: 51478,
    payments: 1114,
    publicRecords: 0,
    inquiries: 0,
  },
  {
    name: "TransUnion®",
    score: 813,
    totalAccounts: 18,
    openAccounts: 12,
    closedAccounts: 6,
    derogatoryItems: 0,
    delinquentItems: 0,
    balances: 51105,
    payments: 0,
    publicRecords: 0,
    inquiries: 1,
  },
];

interface CategoryRowProps {
  label: string;
  values: (string | number)[];
  variant?: "default" | "warning" | "success";
}

const CategoryRow = ({ label, values, variant = "default" }: CategoryRowProps) => {
  const getTextColor = () => {
    switch (variant) {
      case "warning":
        return "text-warning";
      case "success":
        return "text-success";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="grid grid-cols-4 gap-4 py-3 border-b border-border last:border-b-0">
      <div className="font-medium text-muted-foreground">{label}</div>
      {values.map((value, idx) => (
        <div key={idx} className={`text-center font-semibold ${getTextColor()}`}>
          {typeof value === 'number' && label.includes('$') 
            ? `$${value.toLocaleString()}` 
            : value}
        </div>
      ))}
    </div>
  );
};

export function ThreeBureauReport() {
  const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            3-Bureau Credit Report
          </h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive view across Equifax, Experian, and TransUnion
          </p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" />
          Download Report
        </Button>
      </div>

      {/* Credit Scores Header */}
      <Card className="p-6 bg-gradient-subtle border-border shadow-card">
        <div className="grid grid-cols-4 gap-4">
          <div className="font-semibold text-lg text-muted-foreground">
            VantageScore® 3.0
          </div>
          {bureauData.map((bureau) => (
            <div key={bureau.name} className="text-center">
              <div className="text-sm text-muted-foreground mb-2">{bureau.name}</div>
              <div className="text-5xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                {bureau.score}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Personal Information */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <User className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Personal Information</h2>
        </div>
        <div className="space-y-0">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b-2 border-border font-bold">
            <div></div>
            {bureauData.map((bureau) => (
              <div key={bureau.name} className="text-center">{bureau.name}</div>
            ))}
          </div>

          <CategoryRow 
            label="Name" 
            values={["ANTONIO DANIEL", "ANTONIO DANIEL", "ANTONIO DANIEL"]} 
          />
          <CategoryRow 
            label="Also Known As" 
            values={["ANTONIO M DANIEL", "ANTONIO DANIEL", "ANTONIO DANIEL"]} 
          />
          <CategoryRow 
            label="Date of Birth" 
            values={["1986", "1986", "1986"]} 
          />
          <CategoryRow 
            label="Current Address" 
            values={["13606 SANTA ROSA DR", "13606 SANTA ROSA DR", "13606 SANTA ROSA"]} 
          />
          <CategoryRow 
            label="Credit Report Date" 
            values={["10/3/2025", "10/3/2025", "10/3/2025"]} 
          />
        </div>
      </Card>

      {/* Summary - All Categories */}
      <Card className="p-6 bg-card border-border shadow-card">
        <h2 className="text-2xl font-semibold mb-6">Summary</h2>
        <div className="space-y-0">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b-2 border-border font-bold">
            <div></div>
            {bureauData.map((bureau) => (
              <div key={bureau.name} className="text-center">{bureau.name}</div>
            ))}
          </div>

          <CategoryRow 
            label="Total Accounts" 
            values={bureauData.map(b => b.totalAccounts)} 
          />
          <CategoryRow 
            label="Open Accounts" 
            values={bureauData.map(b => b.openAccounts)} 
            variant="success"
          />
          <CategoryRow 
            label="Closed Accounts" 
            values={bureauData.map(b => b.closedAccounts)} 
          />
          <CategoryRow 
            label="Delinquent" 
            values={bureauData.map(b => b.delinquentItems)}
            variant="warning"
          />
          <CategoryRow 
            label="Derogatory" 
            values={bureauData.map(b => b.derogatoryItems)}
            variant="warning"
          />
          <CategoryRow 
            label="Balances" 
            values={bureauData.map(b => formatCurrency(b.balances))} 
          />
          <CategoryRow 
            label="Payments" 
            values={bureauData.map(b => formatCurrency(b.payments))} 
          />
          <CategoryRow 
            label="Public Records" 
            values={bureauData.map(b => b.publicRecords)} 
          />
          <CategoryRow 
            label="Inquiries (2 years)" 
            values={bureauData.map(b => b.inquiries)} 
          />
        </div>
      </Card>

      {/* Consumer Statement */}
      <Card className="p-6 bg-card border-border shadow-card">
        <h2 className="text-2xl font-semibold mb-6">Consumer Statement</h2>
        <div className="space-y-0">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b-2 border-border font-bold">
            <div></div>
            {bureauData.map((bureau) => (
              <div key={bureau.name} className="text-center">{bureau.name}</div>
            ))}
          </div>

          <CategoryRow 
            label="Statement" 
            values={["NONE REPORTED", "NONE REPORTED", "NONE REPORTED"]} 
          />
        </div>
      </Card>

      {/* Negative Items Details */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <AlertCircle className="w-5 h-5 text-warning" />
          <h2 className="text-2xl font-semibold">Negative Items Details</h2>
        </div>
        <div className="space-y-0">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b-2 border-border font-bold">
            <div></div>
            {bureauData.map((bureau) => (
              <div key={bureau.name} className="text-center">{bureau.name}</div>
            ))}
          </div>

          <CategoryRow 
            label="Derogatory Items" 
            values={bureauData.map(b => b.derogatoryItems)}
            variant="warning"
          />
          <CategoryRow 
            label="Delinquent Items" 
            values={bureauData.map(b => b.delinquentItems)}
            variant="warning"
          />
          <CategoryRow 
            label="Collections" 
            values={[0, 0, 0]}
            variant="warning"
          />
          <CategoryRow 
            label="Charge-offs" 
            values={[0, 0, 0]}
            variant="warning"
          />
        </div>
      </Card>

      {/* Revolving Accounts */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Revolving Accounts</h2>
          <Badge variant="outline" className="ml-2">Accounts with an open-end term</Badge>
        </div>

        {/* Account 1: NAVY FEDERAL CREDIT UNION */}
        <div className="mb-8 pb-8 border-b border-border">
          <h3 className="text-xl font-semibold mb-4">NAVY FEDERAL CREDIT UNION - Credit Card</h3>
          
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-4 gap-4 bg-muted p-4 font-bold border-b border-border">
              <div></div>
              <div className="text-center">Equifax®</div>
              <div className="text-center">Experian®</div>
              <div className="text-center">TransUnion®</div>
            </div>

            <div className="divide-y divide-border">
              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account #</div>
                <div className="text-sm text-center">110001**********</div>
                <div className="text-sm text-center">110001******</div>
                <div className="text-sm text-center">****</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">High Balance</div>
                <div className="text-sm text-center font-semibold">$7,407</div>
                <div className="text-sm text-center font-semibold">$0</div>
                <div className="text-sm text-center font-semibold">$7,407</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Balance Owed</div>
                <div className="text-sm text-center font-semibold text-primary">$185</div>
                <div className="text-sm text-center font-semibold text-primary">$185</div>
                <div className="text-sm text-center font-semibold text-primary">$185</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Credit Limit</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date Opened</div>
                <div className="text-sm text-center">9/1/2021</div>
                <div className="text-sm text-center">8/1/2025</div>
                <div className="text-sm text-center">8/31/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date Reported</div>
                <div className="text-sm text-center">9/1/2021</div>
                <div className="text-sm text-center">8/1/2025</div>
                <div className="text-sm text-center">8/31/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Last Verified</div>
                <div className="text-sm text-center">8/1/2025</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date of Last Activity</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Type</div>
                <div className="text-sm text-center">Bank Credit Cards</div>
                <div className="text-sm text-center">Bank Credit Cards</div>
                <div className="text-sm text-center">Bank Credit Cards</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Status</div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Status</div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Rating</div>
                <div className="text-sm text-center">Paid</div>
                <div className="text-sm text-center">Open</div>
                <div className="text-sm text-center">Open</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Description</div>
                <div className="text-sm text-center">Individual</div>
                <div className="text-sm text-center">Individual</div>
                <div className="text-sm text-center">Individual</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Creditor Type</div>
                <div className="text-sm text-center">All Banks</div>
                <div className="text-sm text-center">All Banks</div>
                <div className="text-sm text-center">All Banks</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Dispute Status</div>
                <div className="text-sm text-center">Account not disputed</div>
                <div className="text-sm text-center">Account not disputed</div>
                <div className="text-sm text-center">Account not disputed</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Creditor Remarks</div>
                <div className="text-sm text-center">Credit card</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Closed Date</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Two-Year Payment History</h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="p-2 text-left font-semibold">Bureau</th>
                      {['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', "'24", 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', "'25", 'Feb', 'Mar', 'Apr'].map((month, idx) => (
                        <th key={idx} className="p-2 text-center">{month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">Equifax</td>
                      {Array(24).fill('OK').map((_, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">Experian</td>
                      {Array(24).fill('OK').map((_, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">TransUnion</td>
                      {Array(24).fill('OK').map((_, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Days Late - 7 Year History</h4>
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Equifax®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Experian®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">TransUnion®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Account 2: Additional Credit Card Account */}
        <div className="mb-8 pb-8 border-b border-border">
          <h3 className="text-xl font-semibold mb-4">Credit Card Account - $9,500 Limit</h3>
          
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-4 gap-4 bg-muted p-4 font-bold border-b border-border">
              <div></div>
              <div className="text-center">Equifax®</div>
              <div className="text-center">Experian®</div>
              <div className="text-center">TransUnion®</div>
            </div>

            <div className="divide-y divide-border">
              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account #</div>
                <div className="text-sm text-center">-3499**********</div>
                <div className="text-sm text-center">349993******</div>
                <div className="text-sm text-center">349993**********</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">High Balance</div>
                <div className="text-sm text-center font-semibold">$242</div>
                <div className="text-sm text-center font-semibold">$242</div>
                <div className="text-sm text-center font-semibold">$0</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Balance Owed</div>
                <div className="text-sm text-center font-semibold text-primary">—</div>
                <div className="text-sm text-center font-semibold text-primary">—</div>
                <div className="text-sm text-center font-semibold text-primary">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Credit Limit</div>
                <div className="text-sm text-center font-semibold">$9,500</div>
                <div className="text-sm text-center font-semibold">$9,500</div>
                <div className="text-sm text-center font-semibold">$9,500</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Amount</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$0</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Last Payment</div>
                <div className="text-sm text-center">8/1/2025</div>
                <div className="text-sm text-center">7/29/2025</div>
                <div className="text-sm text-center">7/29/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date of Last Activity</div>
                <div className="text-sm text-center">9/1/2025</div>
                <div className="text-sm text-center">9/2/2025</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Last Verified</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Type</div>
                <div className="text-sm text-center">Credit Card</div>
                <div className="text-sm text-center">Credit Card</div>
                <div className="text-sm text-center">Credit Card</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Status</div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Status</div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Past Due Amount</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$0</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Term Length</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Frequency</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Two-Year Payment History</h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="p-2 text-left font-semibold">Bureau</th>
                      {['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', "'24", 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', "'25", 'Feb', 'Mar', 'Apr'].map((month, idx) => (
                        <th key={idx} className="p-2 text-center">{month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">Equifax</td>
                      {Array(24).fill('OK').map((_, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">Experian</td>
                      {Array(24).fill('OK').map((_, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">TransUnion</td>
                      {Array(24).fill('OK').map((_, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Days Late - 7 Year History</h4>
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Equifax®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Experian®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">TransUnion®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      {/* Real Estate Accounts */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <Home className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Real Estate Accounts</h2>
          <Badge variant="outline" className="ml-2">Primary and secondary mortgages on your home</Badge>
        </div>
        
        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-4">MICH SGCU - Home Equity Account</h3>
          
          {/* Account Details Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-4 gap-4 bg-muted p-4 font-bold border-b border-border">
              <div></div>
              <div className="text-center">Equifax®</div>
              <div className="text-center">Experian®</div>
              <div className="text-center">TransUnion®</div>
            </div>

            {/* Account Details Rows */}
            <div className="divide-y divide-border">
              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account #</div>
                <div className="text-sm text-center">806878******</div>
                <div className="text-sm text-center">806878**</div>
                <div className="text-sm text-center">806878******</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">High Balance</div>
                <div className="text-sm text-center font-semibold">$77,000</div>
                <div className="text-sm text-center font-semibold">$77,938</div>
                <div className="text-sm text-center font-semibold">$76,945</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Balance Owed</div>
                <div className="text-sm text-center font-semibold text-primary">$76,944</div>
                <div className="text-sm text-center font-semibold text-primary">$76,944</div>
                <div className="text-sm text-center font-semibold text-primary">$76,944</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Credit Limit</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$77,000</div>
                <div className="text-sm text-center">$77,000</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Amount</div>
                <div className="text-sm text-center">$539</div>
                <div className="text-sm text-center">$539</div>
                <div className="text-sm text-center">$539</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Last Payment</div>
                <div className="text-sm text-center">10/1/2025</div>
                <div className="text-sm text-center">8/29/2025</div>
                <div className="text-sm text-center">8/29/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date Opened</div>
                <div className="text-sm text-center">10/1/2020</div>
                <div className="text-sm text-center">10/1/2020</div>
                <div className="text-sm text-center">10/27/2020</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date Reported</div>
                <div className="text-sm text-center">10/1/2025</div>
                <div className="text-sm text-center">9/1/2025</div>
                <div className="text-sm text-center">9/1/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Last Verified</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">9/1/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Date of Last Activity</div>
                <div className="text-sm text-center">10/1/2025</div>
                <div className="text-sm text-center">9/1/2025</div>
                <div className="text-sm text-center">9/1/2025</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Type</div>
                <div className="text-sm text-center">Home equity</div>
                <div className="text-sm text-center">Credit line secured</div>
                <div className="text-sm text-center">Home equity</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Status</div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
                <div className="text-sm text-center"><Badge variant="outline" className="bg-success/10">Open</Badge></div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Status</div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
                <div className="text-sm text-center"><Badge className="bg-success">Current</Badge></div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Rating</div>
                <div className="text-sm text-center">Paid</div>
                <div className="text-sm text-center">Open</div>
                <div className="text-sm text-center">Open</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Account Description</div>
                <div className="text-sm text-center">Individual</div>
                <div className="text-sm text-center">Individual</div>
                <div className="text-sm text-center">Individual</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Creditor Type</div>
                <div className="text-sm text-center">Credit Unions</div>
                <div className="text-sm text-center">Credit Unions</div>
                <div className="text-sm text-center">Credit Unions</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Dispute Status</div>
                <div className="text-sm text-center">Account not disputed</div>
                <div className="text-sm text-center">Account not disputed</div>
                <div className="text-sm text-center">Account not disputed</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Creditor Remarks</div>
                <div className="text-sm text-center">Home Equity Line of credit</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Past Due Amount</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$0</div>
                <div className="text-sm text-center">$0</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Term Length</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Payment Frequency</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>

              <div className="grid grid-cols-4 gap-4 p-3 hover:bg-muted/50">
                <div className="text-sm font-medium text-muted-foreground">Closed Date</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
                <div className="text-sm text-center">—</div>
              </div>
            </div>
          </div>

          {/* Two-Year Payment History */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Two-Year Payment History</h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="p-2 text-left font-semibold">Bureau</th>
                      <th className="p-2 text-center">Aug</th>
                      <th className="p-2 text-center">Sep</th>
                      <th className="p-2 text-center">Oct</th>
                      <th className="p-2 text-center">Nov</th>
                      <th className="p-2 text-center">Dec</th>
                      <th className="p-2 text-center">'24</th>
                      <th className="p-2 text-center">Feb</th>
                      <th className="p-2 text-center">Mar</th>
                      <th className="p-2 text-center">Apr</th>
                      <th className="p-2 text-center">May</th>
                      <th className="p-2 text-center">Jun</th>
                      <th className="p-2 text-center">Jul</th>
                      <th className="p-2 text-center">Aug</th>
                      <th className="p-2 text-center">Sep</th>
                      <th className="p-2 text-center">Oct</th>
                      <th className="p-2 text-center">Nov</th>
                      <th className="p-2 text-center">Dec</th>
                      <th className="p-2 text-center">'25</th>
                      <th className="p-2 text-center">Feb</th>
                      <th className="p-2 text-center">Mar</th>
                      <th className="p-2 text-center">Apr</th>
                      <th className="p-2 text-center">May</th>
                      <th className="p-2 text-center">Jun</th>
                      <th className="p-2 text-center">Jul</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">Equifax</td>
                      {Array(24).fill('OK').map((status, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">Experian</td>
                      {Array(24).fill('OK').map((status, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-muted/50">
                      <td className="p-2 font-medium">TransUnion</td>
                      {Array(24).fill('OK').map((status, idx) => (
                        <td key={idx} className="p-2 text-center">
                          <Badge variant="outline" className="bg-success/10 text-xs px-1">OK</Badge>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Days Late - 7 Year History */}
          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Days Late - 7 Year History</h4>
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">TransUnion®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Experian®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm font-semibold mb-2">Equifax®</div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">30 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">60 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">90 days:</span>
                    <span className="font-semibold">0</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </Card>

      {/* Dispute Opportunities */}
      <Card className="p-6 bg-gradient-subtle border-border shadow-card">
        <h2 className="text-2xl font-semibold mb-4">Dispute Opportunities</h2>
        <div className="grid grid-cols-3 gap-6">
          {bureauData.map((bureau) => {
            const totalIssues = bureau.derogatoryItems + bureau.delinquentItems;
            return (
              <div key={bureau.name} className="text-center">
                <div className="text-sm text-muted-foreground mb-2">{bureau.name}</div>
                {totalIssues > 0 ? (
                  <>
                    <Badge variant="destructive" className="text-lg px-4 py-2 mb-3">
                      {totalIssues} Items to Dispute
                    </Badge>
                    <Button className="w-full bg-gradient-gold hover:opacity-90" size="sm">
                      Start Disputes
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-sm px-4 py-2">
                    No Issues Found
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
