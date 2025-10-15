import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface ReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warning";
  currentValue?: string;
  targetValue?: string;
}

export function CreditHealthTab() {
  // Mock data - replace with real data from hooks
  const checks: ReadinessCheck[] = [
    {
      id: "overdrafts",
      label: "No overdrafts (90d)",
      status: "pass",
      currentValue: "0 NSF events",
      targetValue: "0 required"
    },
    {
      id: "avg_balance",
      label: "Avg Balance ≥ $1,500",
      status: "pass",
      currentValue: "$2,450",
      targetValue: "$1,500"
    },
    {
      id: "utilization",
      label: "Utilization ≤ 30%",
      status: "warning",
      currentValue: "35%",
      targetValue: "≤ 30%"
    },
    {
      id: "savings",
      label: "Monthly Savings ≥ $500",
      status: "fail",
      currentValue: "$320",
      targetValue: "$500"
    }
  ];

  const getStatusIcon = (status: "pass" | "fail" | "warning") => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-6 w-6 text-green-600" />;
      case "fail":
        return <XCircle className="h-6 w-6 text-red-600" />;
      case "warning":
        return <AlertCircle className="h-6 w-6 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: "pass" | "fail" | "warning") => {
    const variants: Record<string, "default" | "destructive" | "secondary"> = {
      pass: "default",
      fail: "destructive",
      warning: "secondary"
    };
    
    return (
      <Badge variant={variants[status]}>
        {status === "pass" ? "✓ Pass" : status === "fail" ? "✗ Fail" : "⚠ Review"}
      </Badge>
    );
  };

  const passedCount = checks.filter(c => c.status === "pass").length;
  const totalCount = checks.length;
  const readinessPercent = Math.round((passedCount / totalCount) * 100);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Readiness Score</CardTitle>
          <CardDescription>
            You've met {passedCount} of {totalCount} readiness criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="text-4xl font-bold text-primary">
              {readinessPercent}%
            </div>
            <Button onClick={() => alert("Opening credit readiness plan...")}>
              Open Credit Readiness Plan
            </Button>
          </div>
          <div className="w-full bg-muted rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-primary to-primary/80 h-3 rounded-full transition-all"
              style={{ width: `${readinessPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Readiness Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Readiness Checks</CardTitle>
          <CardDescription>
            Meet these criteria to improve your credit application success rate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {checks.map((check) => (
              <div
                key={check.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1">
                  {getStatusIcon(check.status)}
                  <div className="flex-1">
                    <div className="font-medium mb-1">{check.label}</div>
                    <div className="text-sm text-muted-foreground">
                      Current: <span className="font-medium">{check.currentValue}</span>
                      {" • "}
                      Target: <span className="font-medium">{check.targetValue}</span>
                    </div>
                  </div>
                </div>
                <div>
                  {getStatusBadge(check.status)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Improvement Suggestions */}
      <Card>
        <CardHeader>
          <CardTitle>Improvement Plan</CardTitle>
          <CardDescription>
            Action steps to meet failing criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checks
              .filter(c => c.status !== "pass")
              .map((check) => (
                <div
                  key={check.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="text-sm">
                    <div className="font-medium mb-1">{check.label}</div>
                    <div className="text-muted-foreground">
                      {check.id === "utilization" && "Pay down $500 on revolving balances before next statement"}
                      {check.id === "savings" && "Increase monthly savings by $180 to meet target"}
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Create Task
                  </Button>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
