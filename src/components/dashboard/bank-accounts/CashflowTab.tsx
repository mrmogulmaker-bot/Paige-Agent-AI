import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { TrendingUp, Activity, AlertCircle } from "lucide-react";

export function CashflowTab() {
  // Mock data
  const inflowOutflowData = [
    { month: "Jan", inflows: 45000, outflows: 32000 },
    { month: "Feb", inflows: 52000, outflows: 35000 },
    { month: "Mar", inflows: 48000, outflows: 38000 },
    { month: "Apr", inflows: 61000, outflows: 42000 },
    { month: "May", inflows: 55000, outflows: 40000 },
    { month: "Jun", inflows: 67000, outflows: 45000 },
  ];

  const netCashflowData = [
    { month: "Jan", net: 13000 },
    { month: "Feb", net: 17000 },
    { month: "Mar", net: 10000 },
    { month: "Apr", net: 19000 },
    { month: "May", net: 15000 },
    { month: "Jun", net: 22000 },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Balance (90d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">$118,230</p>
            <Badge className="mt-2 bg-success/10 text-success">+8.3%</Badge>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Volatility Index</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">12.4%</p>
            <Badge className="mt-2 bg-gold/10 text-gold">Moderate</Badge>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">12-mo Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-success flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              +24.7%
            </p>
            <Badge className="mt-2 bg-success/10 text-success">Strong Growth</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Inflows vs Outflows Chart */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Inflows vs Outflows</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={inflowOutflowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend />
              <Bar dataKey="inflows" fill="hsl(var(--gold))" radius={[8, 8, 0, 0]} />
              <Bar dataKey="outflows" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Net Cashflow Chart */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Net Cashflow Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={netCashflowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="net"
                stroke="hsl(var(--success))"
                strokeWidth={3}
                dot={{ fill: "hsl(var(--success))", r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-accent/10 to-gold/10">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-accent" />
            Paige Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-accent/20">
            <AlertCircle className="h-5 w-5 text-accent mt-0.5" />
            <p className="text-sm">
              <strong>Add $3k cushion for 30 days</strong> to hit your line of credit target and improve funding readiness.
            </p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-gold/20">
            <TrendingUp className="h-5 w-5 text-gold mt-0.5" />
            <p className="text-sm">
              <strong>Inflows trending +15.2%</strong> month-over-month. Maintain this momentum to strengthen your position.
            </p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-success/20">
            <Activity className="h-5 w-5 text-success mt-0.5" />
            <p className="text-sm">
              <strong>DSCR at 1.48</strong> — well above lender requirements. You're positioned for funding approval.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
