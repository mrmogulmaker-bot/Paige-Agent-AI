import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, TrendingUp, DollarSign, Activity } from "lucide-react";

interface FundingGate {
  id: string;
  name: string;
  requirement: string;
  current: string;
  status: "pass" | "fail" | "warning";
  impact: "high" | "medium" | "low";
}

export function FundingSignalsTab() {
  const fundingGates: FundingGate[] = [
    {
      id: "dscr",
      name: "Debt Service Coverage Ratio",
      requirement: "≥ 1.25",
      current: "1.48",
      status: "pass",
      impact: "high",
    },
    {
      id: "avg_balance",
      name: "Average Balance (90d)",
      requirement: "≥ $5,000",
      current: "$118,230",
      status: "pass",
      impact: "high",
    },
    {
      id: "nsf",
      name: "NSF Count (90d)",
      requirement: "0",
      current: "0",
      status: "pass",
      impact: "high",
    },
    {
      id: "overdraft",
      name: "Days Since Overdraft",
      requirement: "≥ 180",
      current: "247",
      status: "pass",
      impact: "medium",
    },
    {
      id: "volatility",
      name: "Balance Volatility",
      requirement: "< 20%",
      current: "12.4%",
      status: "pass",
      impact: "medium",
    },
    {
      id: "monthly_inflow",
      name: "Monthly Inflows",
      requirement: "≥ $25,000",
      current: "$67,000",
      status: "pass",
      impact: "high",
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-6 w-6 text-success" />;
      case "fail":
        return <XCircle className="h-6 w-6 text-destructive" />;
      case "warning":
        return <AlertCircle className="h-6 w-6 text-warning" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pass":
        return "bg-success/10 text-success border-success/20";
      case "fail":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "warning":
        return "bg-warning/10 text-warning border-warning/20";
      default:
        return "";
    }
  };

  const passedGates = fundingGates.filter((g) => g.status === "pass").length;
  const totalGates = fundingGates.length;
  const readinessScore = Math.round((passedGates / totalGates) * 100);

  return (
    <div className="space-y-6">
      {/* Readiness Score */}
      <Card className="border-border/50 shadow-glow bg-gradient-to-br from-primary/5 via-accent/5 to-gold/5">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Funding Readiness Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-6xl font-bold text-primary">{readinessScore}%</p>
              <Badge className="bg-success text-success-foreground">
                {passedGates} of {totalGates} gates passed
              </Badge>
            </div>
            <div className="w-32 h-32 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
              <CheckCircle2 className="h-16 w-16 text-primary" />
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-gold transition-all duration-500"
              style={{ width: `${readinessScore}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            You've met all key lender requirements. Ready to pursue funding opportunities.
          </p>
        </CardContent>
      </Card>

      {/* Funding Gates Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {fundingGates.map((gate) => (
          <Card
            key={gate.id}
            className={`border-2 transition-all duration-300 ${getStatusColor(gate.status)} hover:shadow-md`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base font-semibold">{gate.name}</CardTitle>
                  <Badge variant="outline" className="mt-2 capitalize text-xs">
                    {gate.impact} impact
                  </Badge>
                </div>
                {getStatusIcon(gate.status)}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Requirement:</span>
                <span className="font-medium">{gate.requirement}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Your Status:</span>
                <span className="font-bold">{gate.current}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Next Steps */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Next Steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-accent/5 border border-accent/20">
            <TrendingUp className="h-5 w-5 text-accent mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Create Your Funding Plan</p>
              <p className="text-sm text-muted-foreground mt-1">
                You've passed all gates. Build a comprehensive funding strategy to leverage your strong position.
              </p>
            </div>
            <Button className="bg-gradient-gold hover:shadow-glow">
              Start Plan
            </Button>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-gold/5 border border-gold/20">
            <DollarSign className="h-5 w-5 text-gold mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Explore Funding Offers</p>
              <p className="text-sm text-muted-foreground mt-1">
                Browse pre-qualified funding opportunities matched to your profile.
              </p>
            </div>
            <Button variant="outline">
              View Offers
            </Button>
          </div>
          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <Activity className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Monitor Your Progress</p>
              <p className="text-sm text-muted-foreground mt-1">
                Keep track of your financial health and maintain your strong funding readiness.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insight */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-success/5 to-accent/5">
        <CardContent className="pt-6">
          <p className="text-sm font-medium text-accent flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Green lights mean go get funded.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
