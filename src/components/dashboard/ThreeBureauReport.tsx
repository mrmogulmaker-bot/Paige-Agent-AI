import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, AlertCircle } from "lucide-react";

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

      {/* Account Summary */}
      <Card className="p-6 bg-card border-border shadow-card">
        <h2 className="text-2xl font-semibold mb-6">Account Summary</h2>
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
        </div>
      </Card>

      {/* Negative Items */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <AlertCircle className="w-5 h-5 text-warning" />
          <h2 className="text-2xl font-semibold">Negative Items</h2>
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
        </div>
      </Card>

      {/* Financial Summary */}
      <Card className="p-6 bg-card border-border shadow-card">
        <h2 className="text-2xl font-semibold mb-6">Financial Summary</h2>
        <div className="space-y-0">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b-2 border-border font-bold">
            <div></div>
            {bureauData.map((bureau) => (
              <div key={bureau.name} className="text-center">{bureau.name}</div>
            ))}
          </div>

          <CategoryRow 
            label="Total Balances" 
            values={bureauData.map(b => formatCurrency(b.balances))} 
          />
          <CategoryRow 
            label="Monthly Payments" 
            values={bureauData.map(b => formatCurrency(b.payments))} 
          />
        </div>
      </Card>

      {/* Inquiries & Public Records */}
      <Card className="p-6 bg-card border-border shadow-card">
        <h2 className="text-2xl font-semibold mb-6">Inquiries & Public Records</h2>
        <div className="space-y-0">
          <div className="grid grid-cols-4 gap-4 pb-3 border-b-2 border-border font-bold">
            <div></div>
            {bureauData.map((bureau) => (
              <div key={bureau.name} className="text-center">{bureau.name}</div>
            ))}
          </div>

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

      {/* Dispute Summary */}
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
