import { Button } from "@/components/ui/button";
import { Check, X, ShieldQuestion, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The approve/deny card Paige shows before she commits a change (#120).
 *
 * WHAT CHANGED, AND WHY IT IS A STRUCTURAL FIX RATHER THAN A RESTYLE
 * ------------------------------------------------------------------
 * The previous version took `fingerprints?: string[]` — optional — and said so in its own comment:
 * "Optional so a caller that has not adopted the binding still renders; that caller's approvals
 * simply will not open the gate." That is a fully live-looking Approve button that CANNOT execute,
 * and it is exactly what the Solo shell shipped: the owner pressed Approve, the rail ticked, and
 * the chat gate — which only ever honours an echoed fingerprint — was still waiting. Measured on
 * production: 21 of 36 proposals in 30 days were never acted on.
 *
 * So the binding is no longer optional-and-hoped-for. Each action carries its OWN fingerprint, and
 * an action with none cannot render an approve affordance at all — it renders the honest refusal
 * (`cannotApproveHere`) that names where the decision can actually be made. A dead Approve button
 * is now unrepresentable rather than merely discouraged (§13/§70).
 *
 * THE INDEX BUG THIS ALSO CLOSES. The old caller built two parallel arrays and filtered one of
 * them — `items.map(c => c.summary)` beside `fingerprints.map(c => c.fingerprint).filter(Boolean)`.
 * Any action missing a fingerprint shifted every later summary onto the wrong fingerprint, so an
 * approval could be spent on a neighbouring call. Pairing summary and fingerprint in ONE object
 * makes that misalignment impossible to express.
 *
 * Gold discipline (§11): container, icon and headings are neutral; gold is spent only on the
 * Approve act. Focus rings are indigo. One elevation declaration — a hairline border on a tinted
 * surface, never a border under a shadow.
 *
 * Owner-surface only: the client portal never renders operator-approval framing (§6/§9).
 */

export type ConfirmActionState = "pending" | "working" | "done" | "failed";

export type ConfirmAction = {
  /** The server-authored sentence describing the exact call. Never model prose re-rendered. */
  summary: string;
  /**
   * The fingerprint of the EXACT stored call this summary describes. Approve echoes it back in the
   * request body — a place the model cannot write to — and the server runs the call it stored under
   * that fingerprint. An action with no fingerprint is NOT approvable on this surface, and the card
   * refuses rather than offering a control that would do nothing.
   */
  fingerprint?: string;
  state?: ConfirmActionState;
  /** Why it failed, or what it produced. Shown verbatim; the server owns this sentence. */
  note?: string;
};

/**
 * Settled rows earn an icon because the icon carries the outcome. A PENDING row does not: repeating
 * the header's shield on every line is noise, and in a mixed batch it actively misleads — an
 * approvable row and an unapprovable one rendered identically while behaving differently. Pending
 * rows use a typographic marker instead, and the two kinds differ at a glance: a filled dot for one
 * this card can act on, a dash for one it cannot.
 */
const ROW_ICON: Partial<Record<ConfirmActionState, typeof Check>> = {
  working: Loader2,
  done: Check,
  failed: AlertTriangle,
};

/** Tone per state. `pending` stays neutral — a decision is not a status. */
const ROW_TONE: Record<ConfirmActionState, string> = {
  pending: "text-muted-foreground",
  working: "text-muted-foreground",
  done: "text-[hsl(var(--success))]",
  failed: "text-destructive",
};

const HEADINGS: Record<ConfirmActionState, (n: number) => string> = {
  pending: (n) => (n > 1 ? `Needs your OK · ${n} actions` : "Needs your OK"),
  working: () => "Running…",
  done: (n) => (n > 1 ? `${n} done` : "Done"),
  failed: () => "Didn't run",
};

export function PaigeConfirmCard({
  actions,
  onApprove,
  onDeny,
  disabled,
  cannotApproveHere,
}: {
  actions: ConfirmAction[];
  onApprove: (fingerprints: string[]) => void;
  onDeny: (fingerprints: string[]) => void;
  disabled?: boolean;
  /**
   * Shown INSTEAD of the approve controls when this surface holds no binding for any action —
   * name where the decision can be completed. Omit it and the card still refuses; it simply says
   * less. Never render an approve control in this state.
   */
  cannotApproveHere?: string;
}) {
  if (!actions.length) return null;

  const approvable = actions.filter((a) => typeof a.fingerprint === "string" && a.fingerprint !== "");
  const fingerprints = approvable.map((a) => a.fingerprint as string);
  const canApprove = fingerprints.length > 0;

  const anyWorking = actions.some((a) => a.state === "working");
  const allSettled = actions.every((a) => a.state === "done" || a.state === "failed");
  const anyFailed = actions.some((a) => a.state === "failed");

  // The card's own state is the strongest signal among its rows: a failure outranks completion,
  // and work in progress outranks both, because that is the one a person is waiting on.
  const cardState: ConfirmActionState = anyWorking
    ? "working"
    : allSettled
      ? (anyFailed ? "failed" : "done")
      : "pending";

  const multi = actions.length > 1;
  const decided = cardState === "done" || cardState === "failed";
  const controlsDisabled = disabled || anyWorking;

  return (
    <div
      role="group"
      aria-label={HEADINGS[cardState](actions.length)}
      className={cn(
        "mt-2 rounded-xl border p-3.5 transition-colors duration-300 motion-reduce:transition-none",
        cardState === "failed"
          ? "border-destructive/30 bg-destructive/[0.04]"
          : cardState === "done"
            ? "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.04)]"
            : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-px grid h-6 w-6 shrink-0 place-items-center rounded-md border border-border/70 bg-background/70",
            ROW_TONE[cardState],
          )}
        >
          {cardState === "working" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : cardState === "done" ? (
            <Check className="h-3.5 w-3.5" />
          ) : cardState === "failed" ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <ShieldQuestion className="h-3.5 w-3.5" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          {/* A real heading, not an uppercase eyebrow. It states the decision, and it changes
              with the outcome so the card reports what happened instead of silently vanishing. */}
          <p
            className="text-[13px] font-semibold leading-[18px] tracking-[-0.012em] text-foreground"
            aria-live="polite"
          >
            {HEADINGS[cardState](actions.length)}
          </p>

          <ul className={cn("mt-1.5 space-y-1.5", !multi && "space-y-0")}>
            {actions.map((action, i) => {
              const state = action.state ?? "pending";
              const RowIcon = ROW_ICON[state];
              const settled = state === "done" || state === "failed";
              const bound = typeof action.fingerprint === "string" && action.fingerprint !== "";
              return (
                <li
                  key={action.fingerprint ?? `${i}-${action.summary.slice(0, 24)}`}
                  className="flex items-start gap-2 text-sm leading-5 text-foreground"
                >
                  {multi &&
                    (RowIcon ? (
                      <RowIcon
                        aria-hidden
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                          ROW_TONE[state],
                          state === "working" && "animate-spin motion-reduce:animate-none",
                        )}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="mt-[7px] h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      >
                        {bound ? (
                          <span className="block h-1 w-1 rounded-full bg-current" />
                        ) : (
                          <span className="block h-px w-2.5 bg-current opacity-60" />
                        )}
                      </span>
                    ))}
                  <span className="min-w-0">
                    <span className={cn((settled || (!bound && multi)) && "text-muted-foreground")}>
                      {action.summary}
                    </span>
                    {action.note && (
                      <span
                        className={cn(
                          "mt-0.5 block text-xs leading-4",
                          state === "failed" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {action.note}
                      </span>
                    )}
                    {/* Only worth saying per ROW when the card can still act on something else.
                        When nothing is approvable the card-level line below says it once, and
                        saying it twice reads as a system repeating itself. */}
                    {!bound && !settled && canApprove && (
                      <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                        Can&rsquo;t be approved from this chat.
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* THE REFUSAL. No binding means no approve control — not a disabled one, not a
              hopeful one. The person is told where the decision can actually be made. */}
          {!canApprove && !decided ? (
            <p className="mt-2.5 text-xs leading-4 text-muted-foreground">
              {cannotApproveHere ??
                "This conversation can’t complete approvals, so nothing has changed. Ask for it again where Paige can show you an approval control."}
            </p>
          ) : null}

          {canApprove && !decided && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="gold"
                onClick={() => onApprove(fingerprints)}
                disabled={controlsDisabled}
              >
                {anyWorking ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                {anyWorking ? "Running…" : multi ? `Approve ${fingerprints.length}` : "Approve"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDeny(fingerprints)}
                disabled={controlsDisabled}
                className="text-muted-foreground"
              >
                <X className="mr-1.5 h-4 w-4" /> Not now
              </Button>
              {approvable.length < actions.length && (
                <span className="text-xs leading-4 text-muted-foreground">
                  {actions.length - approvable.length} of {actions.length} can&rsquo;t be approved here.
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
