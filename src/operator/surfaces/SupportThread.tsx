import { cn } from "@/lib/utils";

/**
 * Support thread — Claude Design's `isSupThread` block (Super Admin Shell.dc.html, L973–1005).
 *
 * One escalation, as the operator sees it: the SLA clock strip with its context pills and
 * opened-at stamp, the "read the whole thread" link, and the card carrying the reply Paige
 * drafted with its send / edit / hold row.
 *
 * §13 — THE CONVERSATION IS NOT INVENTED. CD's data block hands this surface a named tenant,
 * a written subject, a clock reading, four context pills, two rendered messages and a complete
 * drafted reply with a confidence figure. Every one is a claim about a real person waiting on
 * a real answer, and the primary control here SENDS that answer. So the surface carries no
 * copy: the clock, the pills, the messages and the draft all arrive from the caller, an
 * unsupplied value renders "—", a thread with no messages says the conversation is not
 * connected instead of showing an empty transcript, and a card with no draft says she has not
 * written one rather than showing a blank body that reads as ready to send.
 *
 * §11 gold — the ONE gold element is "Send it", the act. CD's clock strip is also painted
 * amber, but that is SLA STATUS, not an act: it resolves to --warning (tint and dot) with
 * --gold-dark as its text, which is the one gold that holds AA at 10–11px in both themes.
 * And because that amber IS the claim "this thread is running against its clock", the strip
 * degrades to neutral when no clock was reported — a colour asserts as loudly as a figure.
 *
 * DEVIATION — CD's L973–1005 template renders the clock strip, the earlier-messages link and
 * the drafted-reply card, but NOT the messages themselves: its `msgs` array (with the
 * hers/theirs tint pair) is supplied to the block and never drawn, and the message-bubble
 * geometry in the pack belongs to other surfaces (the workspace thread at L1960+, the side
 * thread at L2308+, both owned elsewhere). Rather than ship a "thread" that cannot show the
 * conversation, the transcript is rendered here from CD's own `msgs` contract, in a compact
 * bubble using its hers/theirs tint vocabulary. It is optional: pass no messages and the strip
 * says so.
 */

/** One turn in the conversation. `from` decides the tint, exactly as CD's `hers`/`theirs` do. */
export type SupportMessage = {
  id: string;
  /** Who said it. null → "—"; never inferred from the tint. */
  who: string | null;
  /** Human timestamp, e.g. "2h ago". null → "—". */
  when: string | null;
  text: string;
  from: "paige" | "tenant" | "operator";
};

/** A context pill on the clock strip. CD hangs the full label off the pill as a `title`. */
export type SupportContext = { id: string; label: string; value: string | null };

export type SupportThreadProps = {
  /** The SLA clock, in the caller's words. null → the strip says the clock is not reported. */
  clock: string | null;
  /** When it opened, e.g. "opened 09:14". null → "—". */
  opened?: string | null;
  context?: readonly SupportContext[];
  messages?: readonly SupportMessage[];
  /**
   * The link to the rest of the thread. Rendered only with a handler — a link that opens
   * nothing is worse than no link on a surface about an unanswered person.
   */
  earlierLabel?: string | null;
  onOpenThread?: () => void;
  /** The reply she drafted. null → the card says she has not drafted one. */
  draft: string | null;
  /** Her stated confidence, already formatted. null → "—". */
  confidence?: string | null;
  /** The act. Absent → the gold button renders disabled and titled. */
  onSend?: () => void;
  onEditFirst?: () => void;
  onHold?: () => void;
  loading?: boolean;
  error?: string | null;
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const NOT_KNOWN = "—";

function figure(v: string | null | undefined): string {
  return v === null || v === undefined || v === "" ? NOT_KNOWN : v;
}

function SecondaryAction({
  label,
  onClick,
  muted = false,
}: {
  label: string;
  onClick?: () => void;
  muted?: boolean;
}) {
  const dead = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dead}
      title={dead ? "Not wired to an action yet." : undefined}
      className={cn(
        FOCUS,
        "flex-none whitespace-nowrap rounded-[9px] border border-border bg-card px-[13px] py-2 text-[12.5px] transition-colors",
        muted ? "text-muted-foreground" : "text-foreground",
        dead ? "cursor-not-allowed opacity-50" : "hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

export function SupportThread({
  clock,
  opened = null,
  context,
  messages,
  earlierLabel = null,
  onOpenThread,
  draft,
  confidence = null,
  onSend,
  onEditFirst,
  onHold,
  loading = false,
  error = null,
}: SupportThreadProps) {
  const sendDead = !onSend || !draft;
  /**
   * Amber IS an assertion here — it says this thread is running against its clock. With no
   * clock reported we know nothing of the kind, so the strip degrades to neutral rather than
   * painting urgency the caller never claimed (§13: colour is a claim, same as a figure).
   */
  const hasClock = !!clock;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-[13px] px-3.5 pb-[13px]">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[9px]">
        {/* ── SLA clock strip · amber here is STATUS, not the act (§11) ──── */}
        <div
          className={cn(
            "flex min-w-0 flex-none flex-wrap items-center gap-[7px] rounded-[10px] border px-[11px] py-[7px]",
            hasClock
              ? "border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.10)]"
              : "border-border bg-muted/40",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-[7px] w-[7px] flex-none rounded-full",
              hasClock ? "bg-[hsl(var(--warning))]" : "bg-muted-foreground/50",
            )}
          />
          <span
            className={cn(
              "min-w-0 truncate whitespace-nowrap text-[11.5px] font-semibold",
              hasClock ? "text-[hsl(var(--gold-dark))]" : "text-muted-foreground",
            )}
          >
            {clock ?? "Time-to-answer is not reported for this thread."}
          </span>
          {context?.map((c) => (
            <span
              key={c.id}
              title={c.label}
              className={cn(
                "flex-none whitespace-nowrap rounded-full bg-muted px-[7px] py-px text-[9.5px]",
                hasClock ? "text-[hsl(var(--gold-dark))]" : "text-muted-foreground",
              )}
            >
              {figure(c.value)}
            </span>
          ))}
          <span
            className={cn(
              "ml-auto flex-none font-mono text-[10px] tabular-nums",
              hasClock ? "text-[hsl(var(--gold-dark))]" : "text-muted-foreground",
            )}
          >
            {figure(opened)}
          </span>
        </div>

        {/* ── the rest of the thread ──────────────────────────────────────── */}
        {earlierLabel && onOpenThread && (
          <button
            type="button"
            onClick={onOpenThread}
            className={cn(
              FOCUS,
              "flex-none self-start rounded text-[11px] font-semibold text-[hsl(var(--gold-dark))] hover:underline",
            )}
          >
            {earlierLabel}
          </button>
        )}

        {/* ── the conversation ────────────────────────────────────────────── */}
        {loading && (
          <div className="min-w-0 flex-none space-y-2">
            <div className="h-10 rounded-[10px] bg-muted motion-safe:animate-pulse" />
            <div className="h-10 w-[82%] rounded-[10px] bg-muted motion-safe:animate-pulse" />
          </div>
        )}

        {!loading && error && (
          <div className="min-w-0 flex-none rounded-[10px] border border-[hsl(var(--destructive)/0.32)] bg-[hsl(var(--destructive)/0.06)] px-[13px] py-2.5">
            <div className="text-[12px] font-semibold">The thread could not be read.</div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{error}</div>
          </div>
        )}

        {!loading && !error && !messages?.length && (
          <div className="min-w-0 flex-none rounded-[10px] border border-dashed border-border bg-card px-[13px] py-3">
            <div className="text-[12px] font-semibold">The conversation is not connected.</div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              No messages have been handed to this thread, so none are shown. What the tenant
              actually wrote is the whole basis for the reply below — it is left blank rather than
              filled with a stand-in transcript.
            </div>
          </div>
        )}

        {!loading && !error && !!messages?.length && (
          <ol className="flex min-h-0 flex-[0_1_auto] flex-col gap-[7px] overflow-y-auto overflow-x-hidden pr-0.5">
            {messages.map((m) => {
              const hers = m.from === "paige";
              return (
                <li
                  key={m.id}
                  className={cn(
                    "min-w-0 rounded-[10px] border px-[11px] py-2",
                    hers
                      ? "border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.06)]"
                      : "border-border bg-muted/50",
                  )}
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span
                      className={cn(
                        "min-w-0 truncate whitespace-nowrap text-[9.5px] font-semibold tracking-[0.06em]",
                        hers ? "text-[hsl(var(--primary))]" : "text-muted-foreground",
                      )}
                    >
                      {figure(m.who)}
                    </span>
                    <span className="ml-auto flex-none font-mono text-[9px] tabular-nums text-muted-foreground">
                      {figure(m.when)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-[1.55] text-foreground">
                    {m.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        {/* ── the reply she drafted ───────────────────────────────────────── */}
        <div className="flex min-h-0 flex-[0_1_auto] flex-col overflow-hidden rounded-[11px] border border-[hsl(var(--primary)/0.28)] border-l-[3px] border-l-[hsl(var(--primary))] bg-card px-[13px] py-[11px]">
          <div className="flex flex-none items-center gap-2">
            <span aria-hidden className="text-[11px] text-[hsl(var(--primary))]">
              ✦
            </span>
            <span className="text-[9.5px] font-semibold tracking-[0.13em] text-[hsl(var(--primary))]">
              SHE DRAFTED THIS REPLY
            </span>
            <span className="ml-auto flex-none text-[10px] text-muted-foreground">
              {figure(confidence)}
            </span>
          </div>

          <div className="mt-[7px] min-h-[36px] flex-[1_1_auto] overflow-y-auto text-[13px] leading-[1.6]">
            {draft ? (
              <p className="whitespace-pre-wrap text-foreground">{draft}</p>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                She has not drafted a reply for this thread. Nothing is shown in its place — a
                blank body under a send button reads as a message ready to go, and there is no
                message.
              </p>
            )}
          </div>

          <div className="mt-[11px] flex flex-none flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSend}
              disabled={sendDead}
              title={
                !draft
                  ? "There is no drafted reply to send."
                  : !onSend
                    ? "Not wired to a send path yet — this button would not deliver anything."
                    : undefined
              }
              className={cn(
                FOCUS,
                "flex flex-none items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-cd-gold px-[15px] py-2 text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter]",
                sendDead ? "cursor-not-allowed opacity-50" : "hover:brightness-[1.06]",
              )}
            >
              <span aria-hidden className="text-[10px]">
                ✓
              </span>
              Send it
            </button>
            <SecondaryAction label="Edit first" onClick={onEditFirst} />
            <SecondaryAction label="Not yet" onClick={onHold} muted />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SupportThread;
