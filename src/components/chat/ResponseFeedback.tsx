import { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const REASON_OPTIONS = [
  { value: "factually_incorrect", label: "Factually Incorrect" },
  { value: "missing_important_context", label: "Missing Important Context" },
  { value: "recommended_wrong_strategy", label: "Recommended Wrong Strategy" },
  { value: "outdated_information", label: "Outdated Information" },
  { value: "other", label: "Other" },
];

interface ResponseFeedbackProps {
  messageContent: string;
  messageIndex: number;
  sessionId: string;
}

export function ResponseFeedback({ messageContent, messageIndex, sessionId }: ResponseFeedbackProps) {
  const [rated, setRated] = useState<"positive" | "negative" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  const handlePositive = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("response_quality_feedback" as any).insert({
        session_id: sessionId,
        message_id: `msg-${messageIndex}`,
        message_content: messageContent.substring(0, 2000),
        rating: "positive",
        rated_by: user.id,
      });
      setRated("positive");
    } catch {
      // Silent fail for positive feedback
    }
  };

  const handleNegative = () => {
    setDialogOpen(true);
  };

  const submitNegative = async () => {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("response_quality_feedback" as any).insert({
        session_id: sessionId,
        message_id: `msg-${messageIndex}`,
        message_content: messageContent.substring(0, 2000),
        rating: "negative",
        reason_category: reason,
        reason_other: reason === "other" ? reasonOther : null,
        correction_note: correction || null,
        rated_by: user.id,
      });
      if (error) throw error;
      setRated("negative");
      setDialogOpen(false);
      toast.success("Feedback submitted — thank you for improving Paige");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback");
    } finally {
      setSaving(false);
    }
  };

  if (rated) {
    return (
      <span className="text-xs text-muted-foreground ml-2">
        {rated === "positive" ? "✓ Helpful" : "✓ Flagged"}
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 ml-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePositive} title="Accurate & helpful">
          <ThumbsUp className="w-3 h-3 text-muted-foreground hover:text-green-500" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNegative} title="Inaccurate or incomplete">
          <ThumbsDown className="w-3 h-3 text-muted-foreground hover:text-red-500" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>What was wrong with this response?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reason === "other" && (
              <div className="space-y-2">
                <Label>Please specify</Label>
                <Textarea value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} rows={2} />
              </div>
            )}
            <div className="space-y-2">
              <Label>What should the correct answer be? (optional)</Label>
              <Textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="Describe the correct information..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitNegative} disabled={saving || !reason}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Submit Feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
