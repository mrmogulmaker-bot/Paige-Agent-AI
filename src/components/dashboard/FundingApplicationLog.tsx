import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Loader2, ClipboardList } from "lucide-react";
import { format } from "date-fns";

// LAYER 2 — Platform Intelligence Engine:
// When this query reaches 100+ records, build an aggregation service
// comparing predicted_match_score against actual approval outcomes by product category.

const PRODUCT_TYPES = [
  "Secured Credit Card", "Unsecured Credit Card", "Credit Builder Loan",
  "Personal Line of Credit", "Business Line of Credit", "SBA 7(a)", "SBA 504",
  "CDFI Microloan", "Equipment Financing", "Revenue-Based Financing",
  "Merchant Cash Advance", "Commercial Real Estate", "Term Loan", "Other",
];

const OUTCOME_OPTIONS = [
  { value: "approved", label: "Approved" },
  { value: "approved_lower_amount", label: "Approved at Lower Amount" },
  { value: "declined", label: "Declined" },
  { value: "counter_offered", label: "Counter-Offered" },
  { value: "withdrawn", label: "Withdrawn by Client" },
  { value: "pending", label: "Pending" },
];

const DECLINE_REASONS = [
  { value: "credit_score_too_low", label: "Credit Score Too Low" },
  { value: "too_many_derogatory_items", label: "Too Many Derogatory Items" },
  { value: "insufficient_time_in_business", label: "Insufficient Time in Business" },
  { value: "insufficient_revenue", label: "Insufficient Revenue" },
  { value: "no_business_credit_history", label: "No Business Credit History" },
  { value: "fraud_alert_on_file", label: "Fraud Alert on File" },
  { value: "security_freeze", label: "Security Freeze" },
  { value: "application_incomplete", label: "Application Incomplete" },
  { value: "other", label: "Other" },
];

interface FundingApplicationLogProps {
  clientId: string;
}

export function FundingApplicationLog({ clientId }: FundingApplicationLogProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    lender_name: "",
    product_type: "",
    application_date: new Date().toISOString().split("T")[0],
    amount_requested: "",
    outcome: "",
    approved_amount: "",
    interest_rate: "",
    factor_rate: "",
    decline_reason: "",
    decline_reason_other: "",
    follow_up_date: "",
    predicted_match_score: "",
    admin_notes: "",
  });

  useEffect(() => { fetchEntries(); }, [clientId]);

  const fetchEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("funding_application_outcomes" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("application_date", { ascending: false });
      if (error) throw error;
      setEntries((data as any[]) || []);
    } catch (err) {
      console.error("Error fetching funding applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.lender_name || !form.product_type || !form.amount_requested || !form.outcome) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("funding_application_outcomes" as any).insert({
        client_id: clientId,
        user_id: user.id,
        lender_name: form.lender_name,
        product_type: form.product_type,
        application_date: form.application_date,
        amount_requested: parseFloat(form.amount_requested),
        outcome: form.outcome,
        approved_amount: form.approved_amount ? parseFloat(form.approved_amount) : null,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        factor_rate: form.factor_rate ? parseFloat(form.factor_rate) : null,
        decline_reason: form.outcome === "declined" ? (form.decline_reason || null) : null,
        decline_reason_other: form.decline_reason === "other" ? form.decline_reason_other : null,
        follow_up_date: form.outcome === "pending" && form.follow_up_date ? form.follow_up_date : null,
        predicted_match_score: form.predicted_match_score ? parseInt(form.predicted_match_score) : null,
        admin_notes: form.admin_notes || null,
        recorded_by: user.id,
      });
      if (error) throw error;

      toast.success("Funding application logged");
      setDialogOpen(false);
      setForm({
        lender_name: "", product_type: "", application_date: new Date().toISOString().split("T")[0],
        amount_requested: "", outcome: "", approved_amount: "", interest_rate: "", factor_rate: "",
        decline_reason: "", decline_reason_other: "", follow_up_date: "", predicted_match_score: "",
        admin_notes: "",
      });
      fetchEntries();
    } catch (err: any) {
      toast.error(err.message || "Failed to log application");
    } finally {
      setSubmitting(false);
    }
  };

  const outcomeColor = (outcome: string) => {
    if (outcome === "approved" || outcome === "approved_lower_amount") return "default";
    if (outcome === "declined") return "destructive";
    if (outcome === "pending") return "secondary";
    return "outline";
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Funding Application Log</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Log Application</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Log Funding Application</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Lender Name *</Label>
                    <Input value={form.lender_name} onChange={(e) => setForm({ ...form, lender_name: e.target.value })} placeholder="e.g. Chase Bank" />
                  </div>
                  <div className="space-y-2">
                    <Label>Application Date</Label>
                    <Input type="date" value={form.application_date} onChange={(e) => setForm({ ...form, application_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Product Type *</Label>
                    <Select value={form.product_type} onValueChange={(v) => setForm({ ...form, product_type: v })}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>{PRODUCT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Requested *</Label>
                    <Input type="number" value={form.amount_requested} onChange={(e) => setForm({ ...form, amount_requested: e.target.value })} placeholder="50000" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Outcome *</Label>
                  <Select value={form.outcome} onValueChange={(v) => setForm({ ...form, outcome: v })}>
                    <SelectTrigger><SelectValue placeholder="Select outcome" /></SelectTrigger>
                    <SelectContent>{OUTCOME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                {(form.outcome === "approved" || form.outcome === "approved_lower_amount") && (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Approved Amount</Label>
                      <Input type="number" value={form.approved_amount} onChange={(e) => setForm({ ...form, approved_amount: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Interest Rate %</Label>
                      <Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Factor Rate</Label>
                      <Input type="number" step="0.001" value={form.factor_rate} onChange={(e) => setForm({ ...form, factor_rate: e.target.value })} />
                    </div>
                  </div>
                )}

                {form.outcome === "declined" && (
                  <div className="space-y-2">
                    <Label>Decline Reason</Label>
                    <Select value={form.decline_reason} onValueChange={(v) => setForm({ ...form, decline_reason: v })}>
                      <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                      <SelectContent>{DECLINE_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {form.decline_reason === "other" && (
                      <Input value={form.decline_reason_other} onChange={(e) => setForm({ ...form, decline_reason_other: e.target.value })} placeholder="Specify decline reason..." className="mt-2" />
                    )}
                  </div>
                )}

                {form.outcome === "pending" && (
                  <div className="space-y-2">
                    <Label>Follow-Up Date</Label>
                    <Input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Platform Match Score (optional)</Label>
                  <Input type="number" value={form.predicted_match_score} onChange={(e) => setForm({ ...form, predicted_match_score: e.target.value })} placeholder="e.g. 72" />
                  <p className="text-xs text-muted-foreground">Copy the match score from the Funding Intelligence panel at time of application</p>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={form.admin_notes} onChange={(e) => setForm({ ...form, admin_notes: e.target.value })} placeholder="Additional details..." rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Log Application
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="py-8 text-center">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">No funding applications logged yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Match Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{format(new Date(e.application_date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-medium text-sm">{e.lender_name}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{e.product_type}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-sm">${Number(e.amount_requested).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={outcomeColor(e.outcome) as any} className="text-xs">
                          {OUTCOME_OPTIONS.find(o => o.value === e.outcome)?.label || e.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {e.approved_amount ? `$${Number(e.approved_amount).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">{e.predicted_match_score || "—"}</TableCell>
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
