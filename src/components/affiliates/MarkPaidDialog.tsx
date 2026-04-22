// src/components/affiliates/MarkPaidDialog.tsx
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCents } from "@/lib/affiliates/format";
import type { AffiliateStatRow } from "@/lib/affiliates/types";
import { Loader2, DollarSign } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  affiliate: AffiliateStatRow;
  onPaid?: () => void;
}

export default function MarkPaidDialog({
  open,
  onOpenChange,
  affiliate,
  onPaid,
}: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const owedCents = affiliate.commission_owed_cents ?? 0;
  const [amount, setAmount] = useState<string>(((owedCents / 100) || 0).toFixed(2));
  const [method, setMethod] = useState<string>("ach");
  const [periodStart, setPeriodStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [periodEnd, setPeriodEnd] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (!cents || cents <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Insert payment record
      const { error: insertErr } = await supabase
        .from("commission_payments")
        .insert({
          affiliate_id: affiliate.affiliate_id,
          amount_cents: cents,
          status: "paid",
          paid_at: new Date().toISOString(),
          period_start: periodStart || null,
          period_end: periodEnd || null,
          notes: notes ? `${method.toUpperCase()} — ${notes}` : method.toUpperCase(),
        });
      if (insertErr) throw insertErr;

      // Sum YTD paid (calendar year) for the email
      const ytdStart = new Date();
      ytdStart.setMonth(0, 1);
      ytdStart.setHours(0, 0, 0, 0);
      const { data: ytdRows } = await supabase
        .from("commission_payments")
        .select("amount_cents")
        .eq("affiliate_id", affiliate.affiliate_id)
        .eq("status", "paid")
        .gte("paid_at", ytdStart.toISOString());
      const ytdCents = (ytdRows ?? []).reduce(
        (s: number, r: any) => s + (r.amount_cents ?? 0),
        0,
      );

      // Send commission-paid email
      if (affiliate.email) {
        const periodLabel =
          periodStart && periodEnd
            ? `${periodStart} → ${periodEnd}`
            : periodStart || periodEnd || "—";
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "affiliate-commission-paid",
            recipientEmail: affiliate.email,
            recipientUserId: affiliate.user_id,
            idempotencyKey: `aff-paid-${affiliate.affiliate_id}-${Date.now()}`,
            templateData: {
              amount: formatCents(cents),
              paymentMethod: method.toUpperCase(),
              periodLabel,
              ytdTotal: formatCents(ytdCents),
            },
          },
        });
      }

      toast({
        title: "Payment recorded",
        description: `${formatCents(cents)} marked as paid.`,
      });
      onPaid?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Could not record payment",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1a2840]">
            <DollarSign className="h-5 w-5 text-[#d4a574]" />
            Record commission payment
          </DialogTitle>
          <DialogDescription>
            Paying <strong>{affiliate.full_name ?? "affiliate"}</strong>. They will
            receive a payment confirmation email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-[#1a2840]/15 bg-[#1a2840]/5 p-3 text-sm">
            <span className="text-[#1a2840]/60">Currently owed: </span>
            <span className="font-semibold text-[#1a2840]">
              {formatCents(owedCents)}
            </span>
          </div>

          <div>
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="method">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ach">ACH / Direct Deposit</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="zelle">Zelle</SelectItem>
                <SelectItem value="wire">Wire Transfer</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="period-start">Period start</Label>
              <Input
                id="period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="period-end">Period end</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reference number, memo, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#d4a574] text-[#1a2840] hover:bg-[#d4a574]/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording…
              </>
            ) : (
              "Mark Paid & Notify"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
