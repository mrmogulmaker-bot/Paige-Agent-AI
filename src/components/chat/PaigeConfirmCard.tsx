import { Button } from "@/components/ui/button";
import { Check, X, ShieldQuestion } from "lucide-react";

/**
 * The approve/deny bubble Paige shows before she commits a change (#120). Her
 * autonomy gate returns a confirm_summary server-side for each pending mutating
 * action; the chat surfaces them here so the operator clicks Approve (gold — the
 * one sanctioned act moment, §11) or "Not now" instead of typing "yes". Approve
 * covers EVERY listed action, so all pending actions are shown — nothing the
 * operator hasn't seen gets run. Owner-surface only: the client portal never
 * renders operator-approval framing (§6/§9).
 *
 * Gold discipline (§11): the container chrome, icon and eyebrow are neutral;
 * gold is spent only on the Approve button.
 */
export function PaigeConfirmCard({
  items,
  onApprove,
  onDeny,
  disabled,
}: {
  items: string[];
  onApprove: () => void;
  onDeny: () => void;
  disabled?: boolean;
}) {
  if (!items.length) return null;
  const multi = items.length > 1;
  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-start gap-2">
        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {multi ? `Needs your OK · ${items.length} actions` : "Needs your OK"}
          </p>
          {multi ? (
            <ul className="mt-1 space-y-1">
              {items.map((summary, i) => (
                <li key={i} className="flex gap-1.5 text-sm text-foreground">
                  <span className="text-muted-foreground">·</span>
                  <span className="min-w-0">{summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 text-sm text-foreground">{items[0]}</p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="gold" onClick={onApprove} disabled={disabled}>
              <Check className="mr-1 h-4 w-4" /> {multi ? "Approve all" : "Approve"}
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
