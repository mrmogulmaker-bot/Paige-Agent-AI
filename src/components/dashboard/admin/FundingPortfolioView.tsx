import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, CalendarDays } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface FundingRecord {
  date_secured: string;
  product_type: string;
  amount: number;
  lender_name: string;
}

export function FundingPortfolioView() {
  const [records, setRecords] = useState<FundingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const { data, error } = await supabase
        .from("funding_secured")
        .select("date_secured, product_type, amount, lender_name")
        .order("date_secured", { ascending: false });

      if (error) throw error;
      setRecords((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching portfolio funding:", err);
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const monthRecords = records.filter((r) => {
    const d = new Date(r.date_secured);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const ytdRecords = records.filter((r) => {
    return new Date(r.date_secured).getFullYear() === thisYear;
  });

  const totalMonth = monthRecords.reduce((s, r) => s + Number(r.amount), 0);
  const totalYTD = ytdRecords.reduce((s, r) => s + Number(r.amount), 0);
  const totalAll = records.reduce((s, r) => s + Number(r.amount), 0);

  // Breakdown by product type (YTD)
  const byType: Record<string, number> = {};
  ytdRecords.forEach((r) => {
    byType[r.product_type] = (byType[r.product_type] || 0) + Number(r.amount);
  });

  const typeData = Object.entries(byType)
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount);

  const chartConfig = {
    amount: { label: "Amount", color: "hsl(var(--primary))" },
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${totalMonth.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">{monthRecords.length} events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Year to Date</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${totalYTD.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">{ytdRecords.length} events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">All Time</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalAll.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">{records.length} events</p>
          </CardContent>
        </Card>
      </div>

      {/* By Type Chart */}
      {typeData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>YTD Funding by Product Type</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart data={typeData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="type" width={160} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>YTD Breakdown by Type</CardTitle>
        </CardHeader>
        <CardContent>
          {typeData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No funding data for this year.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeData.map((t) => (
                  <TableRow key={t.type}>
                    <TableCell className="font-medium">{t.type}</TableCell>
                    <TableCell className="text-right font-mono">${t.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{totalYTD > 0 ? ((t.amount / totalYTD) * 100).toFixed(1) : 0}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
