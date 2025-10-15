import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle, AlertTriangle, Download, GitCompare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  source: "plaid" | "statement";
  matched?: boolean;
}

interface DiffFlag {
  type: "missing_days" | "duplicates" | "large_variances";
  count: number;
  severity: "error" | "warning" | "info";
}

export function ReconciliationTab() {
  const [selectedPeriod, setSelectedPeriod] = useState("june-2025");

  // Mock data
  const plaidTransactions: Transaction[] = [
    {
      id: "p1",
      date: new Date(2025, 5, 15),
      description: "Client Payment - ABC Corp",
      amount: 15000,
      source: "plaid",
      matched: true,
    },
    {
      id: "p2",
      date: new Date(2025, 5, 14),
      description: "Office Supplies",
      amount: -450,
      source: "plaid",
      matched: true,
    },
    {
      id: "p3",
      date: new Date(2025, 5, 13),
      description: "Payroll Processing",
      amount: -8500,
      source: "plaid",
      matched: false,
    },
  ];

  const statementTransactions: Transaction[] = [
    {
      id: "s1",
      date: new Date(2025, 5, 15),
      description: "DEPOSIT - ABC CORP",
      amount: 15000,
      source: "statement",
      matched: true,
    },
    {
      id: "s2",
      date: new Date(2025, 5, 14),
      description: "OFFICE DEPOT",
      amount: -450,
      source: "statement",
      matched: true,
    },
    {
      id: "s3",
      date: new Date(2025, 5, 12),
      description: "PAYROLL",
      amount: -8750,
      source: "statement",
      matched: false,
    },
  ];

  const diffFlags: DiffFlag[] = [
    { type: "missing_days", count: 2, severity: "warning" },
    { type: "duplicates", count: 0, severity: "info" },
    { type: "large_variances", count: 1, severity: "error" },
  ];

  const handleMarkReconciled = () => {
    toast.success("Period marked as reconciled");
  };

  const handleExportVariance = () => {
    toast.success("Variance report exported");
  };

  const getFlagIcon = (severity: string) => {
    switch (severity) {
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-warning" />;
      default:
        return <CheckCircle2 className="h-5 w-5 text-success" />;
    }
  };

  const getFlagLabel = (type: string) => {
    switch (type) {
      case "missing_days":
        return "Missing Days";
      case "duplicates":
        return "Duplicate Entries";
      case "large_variances":
        return "Large Variances";
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-accent" />
              Reconciliation: June 2025
            </CardTitle>
            <div className="flex gap-2">
              <Button onClick={handleMarkReconciled} className="bg-gradient-gold hover:shadow-glow">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Mark Reconciled
              </Button>
              <Button variant="outline" onClick={handleExportVariance}>
                <Download className="mr-2 h-4 w-4" />
                Export Variance Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Diff Flags */}
          <div className="grid grid-cols-3 gap-4">
            {diffFlags.map((flag, index) => (
              <Alert key={index} className={`border-2 ${flag.severity === 'error' ? 'border-destructive/30' : flag.severity === 'warning' ? 'border-warning/30' : 'border-success/30'}`}>
                <div className="flex items-center gap-3">
                  {getFlagIcon(flag.severity)}
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{getFlagLabel(flag.type)}</p>
                    <AlertDescription>
                      {flag.count === 0 ? "None detected" : `${flag.count} detected`}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Side-by-side Comparison */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Plaid Transactions */}
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Transactions (Plaid)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm mb-4">
                <span className="text-muted-foreground">Total: {plaidTransactions.length}</span>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {plaidTransactions.filter(t => t.matched).length} matched
                </Badge>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {plaidTransactions.map((txn) => (
                  <div
                    key={txn.id}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      txn.matched
                        ? "border-success/30 bg-success/5"
                        : "border-warning/30 bg-warning/5"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{txn.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(txn.date, "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${txn.amount > 0 ? 'text-success' : 'text-destructive'}`}>
                          ${Math.abs(txn.amount).toLocaleString()}
                        </p>
                        {txn.matched ? (
                          <Badge className="mt-1 bg-success/10 text-success text-xs">Matched</Badge>
                        ) : (
                          <Badge className="mt-1 bg-warning/10 text-warning text-xs">Unmatched</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statement Transactions */}
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Transactions (Statement)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm mb-4">
                <span className="text-muted-foreground">Total: {statementTransactions.length}</span>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {statementTransactions.filter(t => t.matched).length} matched
                </Badge>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {statementTransactions.map((txn) => (
                  <div
                    key={txn.id}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      txn.matched
                        ? "border-success/30 bg-success/5"
                        : "border-warning/30 bg-warning/5"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{txn.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(txn.date, "MMM dd, yyyy")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${txn.amount > 0 ? 'text-success' : 'text-destructive'}`}>
                          ${Math.abs(txn.amount).toLocaleString()}
                        </p>
                        {txn.matched ? (
                          <Badge className="mt-1 bg-success/10 text-success text-xs">Matched</Badge>
                        ) : (
                          <Badge className="mt-1 bg-warning/10 text-warning text-xs">Unmatched</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Variance Summary */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Variance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Plaid Amount</TableHead>
                <TableHead className="text-right">Statement Amount</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-border/50">
                <TableCell>{format(new Date(2025, 5, 13), "MMM dd")}</TableCell>
                <TableCell>Payroll Processing</TableCell>
                <TableCell className="text-right">$8,500.00</TableCell>
                <TableCell className="text-right">$8,750.00</TableCell>
                <TableCell className="text-right text-destructive font-semibold">$250.00</TableCell>
                <TableCell>
                  <Badge className="bg-destructive/10 text-destructive">Large Variance</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-accent/5 to-gold/5">
        <CardContent className="pt-6 text-sm">
          <p className="font-medium mb-2">Reconciliation ensures data accuracy by:</p>
          <ul className="space-y-1 text-muted-foreground ml-4">
            <li>• Comparing live Plaid data with uploaded bank statements</li>
            <li>• Identifying missing transactions, duplicates, and discrepancies</li>
            <li>• Validating completeness of transaction history</li>
            <li>• Providing audit trail for compliance and reporting</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
