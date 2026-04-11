import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

const PRODUCT_TYPES = [
  "Personal Credit Line",
  "Business Credit Line",
  "SBA 7(a)",
  "SBA 504",
  "CDFI",
  "Commercial Real Estate",
  "Equipment Financing",
  "Revenue-Based Financing",
  "Term Loan",
  "Other",
];

interface FundingEvent {
  id: string;
  date_secured: string;
  lender_name: string;
  product_type: string;
  amount: number;
  interest_rate: number | null;
  factor_rate: number | null;
  term_length_months: number | null;
  notes: string | null;
  created_at: string;
}

interface FundingSecuredTrackerProps {
  clientUserId?: string;
}

export function FundingSecuredTracker({ clientUserId }: FundingSecuredTrackerProps) {
  const [events, setEvents] = useState<FundingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date_secured: new Date().toISOString().split("T")[0],
    lender_name: "",
    product_type: "",
    amount: "",
    interest_rate: "",
    factor_rate: "",
    term_length_months: "",
    notes: "",
  });

  useEffect(() => {
    fetchEvents();

    const channel = supabase
      .channel("funding-secured-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "funding_secured" }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientUserId]);

  const fetchEvents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const targetUserId = clientUserId || user.id;
      const { data, error } = await supabase
        .from("funding_secured")
        .select("*")
        .eq("client_user_id", targetUserId)
        .order("date_secured", { ascending: true });

      if (error) throw error;
      setEvents((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching funding events:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.lender_name || !form.product_type || !form.amount) {
      toast.error("Please fill in lender name, product type, and amount.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const targetUserId = clientUserId || user.id;

      const { error } = await supabase.from("funding_secured").insert({
        user_id: user.id,
        client_user_id: targetUserId,
        date_secured: form.date_secured,
        lender_name: form.lender_name,
        product_type: form.product_type,
        amount: parseFloat(form.amount),
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        factor_rate: form.factor_rate ? parseFloat(form.factor_rate) : null,
        term_length_months: form.term_length_months ? parseInt(form.term_length_months) : null,
        notes: form.notes || null,
      } as any);

      if (error) throw error;
      toast.success("Funding event logged!");
      setDialogOpen(false);
      setForm({ date_secured: new Date().toISOString().split("T")[0], lender_name: "", product_type: "", amount: "", interest_rate: "", factor_rate: "", term_length_months: "", notes: "" });
      fetchEvents();
    } catch (err: any) {
      toast.error(err.message || "Failed to log funding event");
    } finally {
      setSubmitting(false);
    }
  };

  const totalFunding = events.reduce((sum, e) => sum + Number(e.amount), 0);

  // Build cumulative timeline data
  const timelineData = events.map((e, i) => ({
    date: format(new Date(e.date_secured), "MMM yyyy"),
    cumulative: events.slice(0, i + 1).reduce((s, ev) => s + Number(ev.amount), 0),
    amount: Number(e.amount),
    lender: e.lender_name,
  }));

  const chartConfig = {
    cumulative: { label: "Cumulative Funding", color: "hsl(var(--primary))" },
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
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Funding Secured</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              ${totalFunding.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Funding Events</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{events.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Latest Secured</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {events.length > 0
                ? format(new Date(events[events.length - 1].date_secured), "MMM d, yyyy")
                : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cumulative Timeline Chart */}
      {timelineData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Funding Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <AreaChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Events Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Funding Events</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Log Funding</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Log Funding Secured</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date Secured</Label>
                    <Input type="date" value={form.date_secured} onChange={(e) => setForm({ ...form, date_secured: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lender Name *</Label>
                    <Input value={form.lender_name} onChange={(e) => setForm({ ...form, lender_name: e.target.value })} placeholder="e.g. Chase Bank" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Product Type *</Label>
                    <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {PRODUCT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="50000" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Interest Rate %</Label>
                    <Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} placeholder="7.5" />
                  </div>
                  <div className="space-y-2">
                    <Label>Factor Rate</Label>
                    <Input type="number" step="0.0001" value={form.factor_rate} onChange={(e) => setForm({ ...form, factor_rate: e.target.value })} placeholder="1.25" />
                  </div>
                  <div className="space-y-2">
                    <Label>Term (months)</Label>
                    <Input type="number" value={form.term_length_months} onChange={(e) => setForm({ ...form, term_length_months: e.target.value })} placeholder="60" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional details..." />
                </div>
                <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                  {submitting ? "Saving..." : "Log Funding Event"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No funding events logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Term</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...events].reverse().map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{format(new Date(e.date_secured), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-medium">{e.lender_name}</TableCell>
                      <TableCell><Badge variant="secondary">{e.product_type}</Badge></TableCell>
                      <TableCell className="text-right font-mono">${Number(e.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        {e.interest_rate ? `${e.interest_rate}%` : e.factor_rate ? `${e.factor_rate}x` : "—"}
                      </TableCell>
                      <TableCell>{e.term_length_months ? `${e.term_length_months}mo` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
