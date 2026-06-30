import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, AlertCircle, User, Home, CreditCard, DollarSign, Wallet, AlertTriangle, FileText, Search, Phone, Bot } from "lucide-react";
import { DisputeLetterDialog } from "./DisputeLetterDialog";

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
  const [selectedBureau, setSelectedBureau] = useState<BureauData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;

  const handleGenerateLetter = (bureau: BureauData) => {
    setSelectedBureau(bureau);
    setIsDialogOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
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
              <div className="text-5xl font-bold text-foreground">
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
            values={["SAMPLE CLIENT", "SAMPLE CLIENT", "SAMPLE CLIENT"]} 
          />
          <CategoryRow 
            label="Also Known As" 
            values={["SAMPLE C CLIENT", "SAMPLE CLIENT", "SAMPLE CLIENT"]} 
          />
          <CategoryRow 
            label="Date of Birth" 
            values={["19XX", "19XX", "19XX"]} 
          />
          <CategoryRow 
            label="Current Address" 
            values={["123 SAMPLE ST", "123 SAMPLE ST", "123 SAMPLE"]} 
          />
          <CategoryRow 
            label="Credit Report Date" 
            values={["--/--/----", "--/--/----", "--/--/----"]} 
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

      {/* Real Estate Accounts */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <Home className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Real Estate Accounts</h2>
          <Badge variant="outline" className="ml-2">Primary and secondary mortgages on your home</Badge>
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-semibold mb-4">MICH SGCU - Home Equity Account</h3>
          
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

          <div className="mt-6">
            <h4 className="text-lg font-semibold mb-4">Two-Year Payment History</h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="p-2 text-left font-semibold">Bureau</th>
                      {['Aug', 'Sep', 'Oct', 'Nov', 'Dec', "'24", 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', "'25", 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((month, idx) => (
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

      {/* Installment Accounts */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <DollarSign className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Installment Accounts</h2>
          <Badge variant="outline" className="ml-2">Accounts comprised of fixed terms with regular payments</Badge>
        </div>

        {/* Auto Loans Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-primary/20">
            <CreditCard className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Auto Loans</h3>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            No auto loan accounts found
          </div>
        </div>

        {/* Personal Loans Section */}
        <div>
          <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-primary/20">
            <DollarSign className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Personal Loans</h3>
          </div>
          <div className="text-center py-8 text-muted-foreground">
            No personal loan accounts found
          </div>
        </div>
      </Card>

      {/* Overdraft/Reserve Checking/Line of Credit */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <Wallet className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Overdraft/Reserve Checking/Line of Credit</h2>
        </div>
        
        <div className="text-center py-8 text-muted-foreground">
          No overdraft, reserve checking, or line of credit accounts found
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

      {/* Collections */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <AlertTriangle className="w-5 h-5 text-warning" />
          <h2 className="text-2xl font-semibold">Collections</h2>
        </div>
        
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-4 gap-4 bg-muted p-4 font-bold border-b border-border">
            <div></div>
            <div className="text-center">Equifax®</div>
            <div className="text-center">Experian®</div>
            <div className="text-center">TransUnion®</div>
          </div>
          <div className="p-8 text-center text-muted-foreground">
            No collection accounts found
          </div>
        </div>
      </Card>

      {/* Public Information */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Public Information</h2>
        </div>
        
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-4 gap-4 bg-muted p-4 font-bold border-b border-border">
            <div></div>
            <div className="text-center">Equifax®</div>
            <div className="text-center">Experian®</div>
            <div className="text-center">TransUnion®</div>
          </div>
          <div className="p-8 text-center text-muted-foreground">
            No public records found
          </div>
        </div>
      </Card>

      {/* Inquiries */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <Search className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Inquiries</h2>
          <Badge variant="outline" className="ml-2">Last 2 years</Badge>
        </div>
        
        <div className="space-y-6">
          {/* Equifax Inquiries */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-primary">Equifax®</span>
              <Badge variant="outline">0 inquiries</Badge>
            </h3>
            <div className="border border-border rounded-lg p-4 text-center text-muted-foreground">
              No inquiries found
            </div>
          </div>

          {/* Experian Inquiries */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-primary">Experian®</span>
              <Badge variant="outline">0 inquiries</Badge>
            </h3>
            <div className="border border-border rounded-lg p-4 text-center text-muted-foreground">
              No inquiries found
            </div>
          </div>

          {/* TransUnion Inquiries */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <span className="text-primary">TransUnion®</span>
              <Badge variant="outline">1 inquiry</Badge>
            </h3>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted p-3 font-semibold border-b border-border">
                Recent Inquiry
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Company:</span>
                    <span className="ml-2 font-medium">Sample Credit Company</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="ml-2 font-medium">Within last 2 years</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Creditor Contacts */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <Phone className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-semibold">Creditor Contacts</h2>
        </div>
        
        <div className="space-y-4">
          {/* MICH SGCU Contact */}
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">MICH SGCU</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Address:</p>
                <p className="font-medium">Michigan State Credit Union</p>
                <p className="font-medium">P.O. Box [Address]</p>
                <p className="font-medium">Michigan, MI [ZIP]</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Phone:</p>
                <p className="font-medium">(XXX) XXX-XXXX</p>
                <p className="text-muted-foreground mt-3 mb-1">Account:</p>
                <p className="font-medium">806878******</p>
              </div>
            </div>
          </div>

          {/* NAVY FEDERAL Contact */}
          <div className="border border-border rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">NAVY FEDERAL CREDIT UNION</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Address:</p>
                <p className="font-medium">Navy Federal Credit Union</p>
                <p className="font-medium">P.O. Box [Address]</p>
                <p className="font-medium">Virginia, VA [ZIP]</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Phone:</p>
                <p className="font-medium">(XXX) XXX-XXXX</p>
                <p className="text-muted-foreground mt-3 mb-1">Account:</p>
                <p className="font-medium">110001**********</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Dispute Opportunities */}
      <Card className="p-6 bg-gradient-subtle border-border shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Dispute Opportunities</h2>
          <Badge variant="outline" className="gap-2">
            <Bot className="w-4 h-4" />
            AI-Powered Letter Generation
          </Badge>
        </div>
        <p className="text-muted-foreground mb-6">
          Use our AI assistant to generate professional, FCRA-compliant dispute letters for any inaccuracies found on your credit reports.
        </p>
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
                    <Button 
                      className="w-full bg-gradient-gold hover:opacity-90 gap-2" 
                      size="sm"
                      onClick={() => handleGenerateLetter(bureau)}
                    >
                      <Bot className="w-4 h-4" />
                      Generate Dispute Letter
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <Badge variant="outline" className="text-sm px-4 py-2">
                      No Issues Found
                    </Badge>
                    <Button 
                      className="w-full gap-2" 
                      size="sm"
                      variant="outline"
                      onClick={() => handleGenerateLetter(bureau)}
                    >
                      <Bot className="w-4 h-4" />
                      Create Custom Letter
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {selectedBureau && (
        <DisputeLetterDialog 
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          bureauData={selectedBureau}
        />
      )}
    </div>
  );
}
