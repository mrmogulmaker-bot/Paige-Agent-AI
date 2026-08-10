// MessageBubble — the ONE scope-agnostic message bubble for every conversation surface
// (§18 one home). Both the tenant Client Hub inbox and the operator Fleet Communications
// inbox render individual messages through THIS component, so the two surfaces read as one
// continuous system (§6) and never drift into divergent hand-rolled bubbles.
//
// It is deliberately DATA-SOURCE-AGNOSTIC: it takes normalized presentational props, never a
// tenant `MessageRow` or an operator `OperatorMessage` row. Each container maps its own row
// shape onto these props via its data-source adapter — so the same bubble serves SMS, email,
// WhatsApp, IG DM, and voice notes as inline messages in one thread (§49), tenant or operator.
//
// §11: token-only, AA both themes, motion-safe, gold NEVER spent here (a bubble is not an act).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export interface MessageBubbleProps {
  direction: "inbound" | "outbound";
  body: string;
  /** ISO timestamp for the relative "· 3m ago" stamp; null hides it. */
  timestamp?: string | null;
  /** Who sent it — "You" for outbound, the contact's name/handle for inbound. */
  senderLabel: string;
  /** Optional delivery pill (outbound only, e.g. <StatePill>Sent</StatePill>); pass null for inbound. */
  status?: ReactNode;
  /** Failure reason shown under the body when a send failed (§13 — surface the real error). */
  error?: string | null;
  /** Optional leading glyph (e.g. a channel icon) so SMS/email/DM read distinctly in one thread (§49). */
  channelIcon?: ReactNode;
}

export function MessageBubble({
  direction, body, timestamp, senderLabel, status, error, channelIcon,
}: MessageBubbleProps) {
  const outbound = direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-xl border p-3 shadow-card",
          // Inbound bubbles get a distinct muted fill so received messages lift off the pane;
          // outbound keeps the indigo tint. Gold is never used on a bubble (§11).
          outbound
            ? "rounded-br-md border-primary/25 bg-primary/[0.06]"
            : "rounded-bl-md border-border bg-muted",
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            {channelIcon}
            {senderLabel}
            {timestamp && (
              <span className="opacity-60">
                {" · "}
                {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
              </span>
            )}
          </span>
          {status && <span className="ml-auto">{status}</span>}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {body || "—"}
        </p>
        {error && <p className="mt-1.5 text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}
