import { useState } from "react";
import { ThumbsUp, ThumbsDown, Loader2, Check } from "lucide-react";
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
  /** The rated assistant message text (stored as the eval-case output). */
  messageContent: string;
  /** Stable message id — the feedback row key (splice-safe, replaces msg-${index}). */
  messageId: string;
  /** The preceding user turn, stored as the eval-case input (L2 labeled case). Optional. */
  userPrompt?: string;
  sessionId: string;
}

// Thumbs feedback → the L2 eval labeled-case seam. Each row is a self-contained
// eval case: message_content = output, user_prompt = input, rating = label,
// correction_note = expected. tenant_id is set SERVER-SIDE by a trigger (§9 —
// the client never sends it, so it cannot be spoofed); paige-eval's
// feedback_selector reads these rows tenant-scoped. (Trace-join is a fast-follow.)
export function ResponseFeedback({ messageContent, messageId, userPrompt, sessionId }: ResponseFeedbackProps) {
  const [rated, setRated] = useState<"positive" | "negative" | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonOther, setReasonOther] = useState("");
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);

  const baseRow = () => ({
    session_id: sessionId,
    message_id: messageId,
    message_content: messageContent.substring(0, 2000),
    user_prompt: userPrompt?.substring(0, 2000) ?? null,
    agent_id: "paige-ai-chat",
  });

  // response_quality_feedback isn't in the generated Supabase types; insert through a
  // narrow local shape (no `any`) so both tsc and eslint stay clean. tenant_id is set
  // server-side by a trigger, so it is intentionally absent from the row here (§9).
  const insertFeedback = (row: Record<string, unknown>) =>
    (supabase.from as unknown as (t: string) => {
      insert: (r: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
    })("response_quality_feedback").insert(row);

  const handlePositive = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await insertFeedback({
        ...baseRow(),
        rating: "positive",
        rated_by: user.id,
      });
      if (error) throw error;
      setRated("positive");
    } catch (err) {
      // Never silently swallow (§13) — a rating that didn't persist must not read as saved.
      console.error("[ResponseFeedback] positive insert failed:", err);
      toast.error("Couldn't record that — give it another tap in a moment.");
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
      const { error } = await insertFeedback({
        ...baseRow(),
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit feedback");
    } finally {
      setSaving(false);
    }
  };

  if (rated) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        {rated === "positive" ? "Helpful" : "Flagged"}
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePositive} title="Accurate & helpful" aria-label="Mark helpful">
          <ThumbsUp className="h-3 w-3 text-muted-foreground transition-colors hover:text-[hsl(var(--success))]" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNegative} title="Inaccurate or incomplete" aria-label="Flag response">
          <ThumbsDown className="h-3 w-3 text-muted-foreground transition-colors hover:text-destructive" />
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
