// src/components/legal/ContextualConsentDialog.tsx
// Reusable modal that previews a legal document and records acceptance before
// allowing the gated action to proceed.

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { useContextualConsent } from "@/lib/legal/useContextualConsent";

export type ContextualConsentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | undefined;
  slug: string;
  actionLabel?: string;
  /** Extra metadata stored on the acceptance row for audit (e.g., contact_id). */
  context?: Record<string, unknown>;
  onAccepted: () => void;
};

export function ContextualConsentDialog({
  open,
  onOpenChange,
  userId,
  slug,
  actionLabel = "I agree and continue",
  context,
  onAccepted,
}: ContextualConsentDialogProps) {
  const { doc, loading, accept } = useContextualConsent(userId, slug);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAccept() {
    setSubmitting(true);
    const { error } = await accept(context ?? {});
    setSubmitting(false);
    if (!error) {
      setChecked(false);
      onOpenChange(false);
      onAccepted();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{doc?.title ?? "Required disclosure"}</DialogTitle>
          {doc?.summary && <DialogDescription>{doc.summary}</DialogDescription>}
        </DialogHeader>
        <ScrollArea className="h-[55vh] rounded border p-4 bg-muted/30">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : doc ? (
            <article className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{doc.body_md}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">Document unavailable.</p>
          )}
        </ScrollArea>
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-0.5" />
          <span>
            I have read and agree to the {doc?.title ?? "document"}{" "}
            {doc?.version ? <span className="text-muted-foreground">(v{doc.version})</span> : null}.
          </span>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={!checked || submitting || !doc}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
