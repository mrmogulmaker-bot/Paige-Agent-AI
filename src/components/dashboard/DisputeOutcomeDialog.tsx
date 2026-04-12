import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const OUTCOME_OPTIONS = [
  { value: "deleted", label: "Deleted — Item completely removed" },
  { value: "updated_to_paid", label: "Updated to Paid — Status changed to paid" },
  { value: "updated_to_settled", label: "Updated to Settled — Status changed to settled" },
  { value: "verified_no_change", label: "Verified — No Change (bureau confirmed)" },
  { value: "no_response_35_days", label: "No Response Within 35 Days (FCRA violation)" },
  { value: "withdrawn", label: "Withdrawn — Client chose not to pursue" },
];

interface DisputeOutcomeDialogProps {
  dispute: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function DisputeOutcomeDialog({ dispute, open, onOpenChange, onSaved }: DisputeOutcomeDialogProps) {
  const [outcomeType, setOutcomeType] = useState("");
  const [responseDate, setResponseDate] = useState(new Date().toISOString().split("T")[0]);
  const [scoreImpact, setScoreImpact] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!dispute) return null;

  const submissionDate = dispute.round_submitted_at
    ? new Date(dispute.round_submitted_at).toISOString().split("T")[0]
    : dispute.created_at
    ? new Date(dispute.created_at).toISOString().split("T")[0]
    : null;

  const handleSave = async () => {
    if (!outcomeType) {
      toast.error("Please select an outcome before saving");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let responseTimeDays: number | null = null;
      if (submissionDate && responseDate) {
        const diff = new Date(responseDate).getTime() - new Date(submissionDate).getTime();
        responseTimeDays = Math.round(diff / (1000 * 60 * 60 * 24));
      }

      const { error } = await supabase.from("dispute_outcomes" as any).insert({
        dispute_id: dispute.id,
        client_id: dispute.client_id || null,
        user_id: dispute.user_id,
        bureau: dispute.bureau,
        creditor_name: dispute.creditor_name,
        outcome_type: outcomeType,
        submission_date: submissionDate,
        response_date: responseDate,
        response_time_days: responseTimeDays,
        dispute_round: dispute.dispute_round || null,
        score_impact: scoreImpact ? parseInt(scoreImpact) : null,
        admin_notes: notes || null,
        recorded_by: user.id,
      });

      if (error) throw error;

      // Update the dispute status to resolved
      await supabase.from("disputes").update({
        status: "resolved",
        resolution_note: `${OUTCOME_OPTIONS.find(o => o.value === outcomeType)?.label || outcomeType}`,
        updated_at: new Date().toISOString(),
      } as any).eq("id", dispute.id);

      toast.success("Dispute outcome recorded");
      onSaved();
      onOpenChange(false);
      setOutcomeType("");
      setScoreImpact("");
      setNotes("");
    } catch (err: any) {
      toast.error(err.message || "Failed to save outcome");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Dispute Outcome</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="p-3 bg-muted rounded-lg text-sm">
            <p><strong>{dispute.creditor_name}</strong> — {dispute.bureau}</p>
            {dispute.dispute_round && <p className="text-muted-foreground text-xs mt-1">Round {dispute.dispute_round}</p>}
          </div>

          <div className="space-y-2">
            <Label>Outcome *</Label>
            <Select value={outcomeType} onValueChange={setOutcomeType}>
              <SelectTrigger><SelectValue placeholder="Select outcome..." /></SelectTrigger>
              <SelectContent>
                {OUTCOME_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Response Date</Label>
              <Input type="date" value={responseDate} onChange={(e) => setResponseDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Score Impact (optional)</Label>
              <Input
                type="number"
                value={scoreImpact}
                onChange={(e) => setScoreImpact(e.target.value)}
                placeholder="+15 or -5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What the bureau said, how this was handled..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !outcomeType}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
