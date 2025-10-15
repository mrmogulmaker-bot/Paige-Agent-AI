import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Activity, AlertCircle, RefreshCcw, Download, Plus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
  icon: React.ReactNode;
  subtitle?: string;
}

function KPICard({ title, value, change, trend, icon, subtitle }: KPICardProps) {
  return (
    <Card className="border-border/50 shadow-card hover:shadow-glow transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-3xl font-bold text-primary">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {change && (
            <div className="flex items-center gap-1">
              {trend === "up" ? (
                <TrendingUp className="h-4 w-4 text-success" />
              ) : (
                <TrendingDown className="h-4 w-4 text-destructive" />
              )}
              <span className={`text-sm font-medium ${trend === "up" ? "text-success" : "text-destructive"}`}>
                {change}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface OverviewTabProps {
  onConnectBank: () => void;
  onRefresh: () => void;
  businessMode?: boolean;
}

export function OverviewTab({ onConnectBank, onRefresh, businessMode = false }: OverviewTabProps) {
  // Mock data - replace with real data from hooks
  const cashflowData = [
    { date: "Jan", inflow: 45000, outflow: 32000 },
    { date: "Feb", inflow: 52000, outflow: 35000 },
    { date: "Mar", inflow: 48000, outflow: 38000 },
    { date: "Apr", inflow: 61000, outflow: 42000 },
    { date: "May", inflow: 55000, outflow: 40000 },
    { date: "Jun", inflow: 67000, outflow: 45000 },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Total Balance"
          value="$127,450"
          change="+12.5%"
          trend="up"
          subtitle="Across all accounts"
          icon={<DollarSign className="h-5 w-5 text-primary" />}
        />
        <KPICard
          title="Avg Balance (90d)"
          value="$118,230"
          change="+8.3%"
          trend="up"
          subtitle="Rolling average"
          icon={<Activity className="h-5 w-5 text-primary" />}
        />
        <KPICard
          title={businessMode ? "Monthly Inflows" : "Income (30d)"}
          value="$67,000"
          change="+15.2%"
          trend="up"
          subtitle="Current month"
          icon={<TrendingUp className="h-5 w-5 text-success" />}
        />
        <KPICard
          title={businessMode ? "Monthly Outflows" : "Expenses (30d)"}
          value="$45,000"
          change="-5.1%"
          trend="down"
          subtitle="Current month"
          icon={<TrendingDown className="h-5 w-5 text-accent" />}
        />
        {businessMode ? (
          <KPICard
            title="DSCR"
            value="1.48"
            change="+8.0%"
            trend="up"
            subtitle="Funding ready"
            icon={<Activity className="h-5 w-5 text-primary" />}
          />
        ) : (
          <KPICard
            title="Savings Rate"
            value="33%"
            change="+5.0%"
            trend="up"
            subtitle="Monthly average"
            icon={<Activity className="h-5 w-5 text-primary" />}
          />
        )}
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onConnectBank} className="bg-gradient-gold hover:shadow-glow">
          <Plus className="mr-2 h-4 w-4" />
          Connect Account
        </Button>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Refresh Balances
        </Button>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Cashflow Chart */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">Cashflow Over Time</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="cursor-pointer hover:bg-accent/10">30d</Badge>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent/10">60d</Badge>
              <Badge className="bg-gradient-gold cursor-pointer">90d</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cashflowData}>
              <defs>
                <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--gold))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--gold))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Area
                type="monotone"
                dataKey="inflow"
                stroke="hsl(var(--gold))"
                fill="url(#inflowGradient)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="outflow"
                stroke="hsl(var(--accent))"
                fill="url(#outflowGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bank Hygiene Widget */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-card to-surface">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-accent" />
            Bank Hygiene
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">NSF Count (90d)</p>
              <p className="text-2xl font-bold text-success">0</p>
              <Badge className="bg-success/10 text-success hover:bg-success/20">Excellent</Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Days Since Last Overdraft</p>
              <p className="text-2xl font-bold text-primary">247</p>
              <Badge className="bg-gold/10 text-gold hover:bg-gold/20">Strong</Badge>
            </div>
          </div>
          <div className="mt-4 p-4 rounded-lg bg-accent/5 border border-accent/20">
            <p className="text-sm font-medium text-accent flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Balance is posture. Show lenders your stance.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DSCR Indicator or Savings Health */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {businessMode ? "Debt Service Coverage Ratio (DSCR)" : "Savings & Budget Health"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {businessMode ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-bold text-primary">1.48</p>
                <Badge className="bg-success/10 text-success">Strong</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Lenders typically require DSCR ≥ 1.25. You're positioned well for funding.
              </p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-gold" style={{ width: "74%" }} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-bold text-primary">$22,000</p>
                <Badge className="bg-success/10 text-success">33% saved</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Excellent savings rate. Keep it up to build emergency fund and credit readiness.
              </p>
              <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                <div>• &lt;10%: Build fund</div>
                <div>• 10-20%: Good</div>
                <div>• &gt;20%: Excellent</div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-gold" style={{ width: "33%" }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
