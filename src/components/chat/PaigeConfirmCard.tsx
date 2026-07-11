import { Button } from "@/components/ui/button";
import { Check, X, ShieldQuestion } from "lucide-react";

/**
 * The approve/deny bubble Paige shows before she commits a change (#120). Her
 * autonomy gate returns a confirm_summary server-side; the chat surfaces it here
 * so the operator clicks Approve (gold — the act moment, §11) or Not now instead
 * of typing "yes". Approve/Deny send a short confirmation back to Paige, who then
 * runs (or drops) the action.
 */
export function PaigeConfirmCard({
  summary,
  onApprove,
  onDeny,
  disabled,
}: {
  summary: string;
  onApprove: () => void;
  onDeny: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 rounded-lg border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-3">
      <div className="flex items-start gap-2">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--gold-dark))]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--gold-dark))]">
            Approve this?
          </p>
          <p className="mt-0.5 text-sm text-foreground">{summary}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="gold" onClick={onApprove} disabled={disabled}>
              <Check className="mr-1 h-4 w-4" /> Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={onDeny} disabled={disabled} className="text-muted-foreground">
              <X className="mr-1 h-4 w-4" /> Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
