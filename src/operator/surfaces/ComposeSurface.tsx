import { cn } from "@/lib/utils";

/**
 * Compose — Claude Design's `isCompose` block (Super Admin Shell.dc.html, L932–972).
 *
 * The operator's outbound message composer: the kind pill and "WHO GETS IT" audience chips,
 * the "HOW" channel chips, the subject/body card with its four-up meta footer, and the action
 * row (gold approve-and-send, edit first, preview as a tenant, and the foot note on the right).
 *
 * §13 — NOTHING IN CD'S DRAFT SHIPS AS A LITERAL. The pack hands this block a fully written
 * incident notice: a subject line, a paragraph of body copy about a webhook that timed out,
 * four audience segments with tenant counts, and a REACH figure. Every one of those is an
 * assertion about the platform — how many tenants exist, who was affected, what actually
 * broke — and rendering any of it from a constant would put an invented outage in front of an
 * operator whose next click SENDS it. So the surface holds no copy of its own: subject, body,
 * audiences, channels and meta all arrive from the caller, a value the caller did not supply
 * renders "—", and a surface handed no draft at all says in words that no draft is loaded
 * rather than showing an empty card that reads like a blank message ready to go.
 *
 * §11 gold — the ONE gold element is "Approve and send", the act. The kind pill, the selected
 * audience chip (CD paints it as a dark ink plate) and the selected channel chip (CD paints it
 * violet) are state, not acts, so they resolve to foreground/primary tokens, never to gold.
 *
 * A control that cannot act says so: with no `onApproveAndSend` the send button renders
 * disabled and titled, because a send button that quietly does nothing is worse on this
 * surface than anywhere else in the console.
 *
 * NOT PORTED — CD's `kindBg`/`kindInk` hex pairs. The kind's colour is a classification, so it
 * arrives as a semantic `kindTone` and resolves to our status tokens.
 */

/** CD paints each state with its own hex pair; these are the semantic tones behind them. */
export type ComposeTone = "neutral" | "ok" | "warn" | "risk" | "info";

const TONE_PILL: Record<ComposeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  // --warning is a fill/dot value and sinks below AA as 10.5px text on a tint, so amber-as-text
  // is --gold-dark, which is AA in both themes. Same mapping the other ported surfaces use.
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  info: "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
};

/** Who the message goes to. `count` is a claim about the fleet — null renders "—". */
export type ComposeAudience = {
  id: string;
  label: string;
  /** Human count for this segment, already formatted by the caller. null → "—". */
  count: string | null;
  selected?: boolean;
  /** Absent → the chip is inert and says why, rather than looking selectable. */
  onSelect?: () => void;
};

/** How it goes out — email, in-app, both. Same contract as the audience chips. */
export type ComposeChannel = {
  id: string;
  label: string;
  selected?: boolean;
  onSelect?: () => void;
};

/** A footer stat under the draft. CD ships four: reach, channel, sender, timing. */
export type ComposeMeta = { id: string; label: string; value: string | null };

export type ComposeSurfaceProps = {
  /** What kind of message this is, in the caller's words. Absent → no pill. */
  kind?: string | null;
  kindTone?: ComposeTone;
  /** The drafted subject. null → "—" inside the card. */
  subject: string | null;
  /** The drafted body. null → "—" inside the card. */
  body: string | null;
  audiences?: readonly ComposeAudience[];
  channels?: readonly ComposeChannel[];
  meta?: readonly ComposeMeta[];
  /** CD's trailing note on the action row (e.g. what happens after the send). */
  foot?: string | null;
  /** The act. Absent → the gold button renders disabled and titled. */
  onApproveAndSend?: () => void;
  onEditFirst?: () => void;
  onPreviewAsTenant?: () => void;
  loading?: boolean;
  error?: string | null;
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const NOT_KNOWN = "—";

function figure(v: string | null | undefined): string {
  return v === null || v === undefined || v === "" ? NOT_KNOWN : v;
}

/**
 * CD's chips are `<div onClick>`. Here they are real toggle buttons with `aria-pressed`, and a
 * chip the caller gave no handler renders disabled rather than pretending to be selectable.
 */
function Chip({
  label,
  trailing,
  selected = false,
  onSelect,
  skin,
}: {
  label: string;
  trailing?: string;
  selected?: boolean;
  onSelect?: () => void;
  skin: "ink" | "violet";
}) {
  const dead = !onSelect;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={dead}
      onClick={onSelect}
      title={dead ? "Not wired to an action yet." : undefined}
      className={cn(
        FOCUS,
        "flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border text-[10.5px] transition-colors",
        skin === "ink" ? "px-2.5 py-1" : "px-[11px] py-1",
        selected
          ? skin === "ink"
            ? "border-foreground bg-foreground text-background"
            : "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]"
          : "border-border bg-card text-muted-foreground",
        !selected && !dead && "hover:bg-muted",
        dead && "cursor-not-allowed opacity-60",
      )}
    >
      {label}
      {trailing !== undefined && <span className="opacity-60 tabular-nums">{trailing}</span>}
    </button>
  );
}

/** CD's secondary action — a plain bordered button that says so when it cannot act. */
function SecondaryAction({ label, onClick }: { label: string; onClick?: () => void }) {
  const dead = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dead}
      title={dead ? "Not wired to an action yet." : undefined}
      className={cn(
        FOCUS,
        "flex-none whitespace-nowrap rounded-[9px] border border-border bg-card px-[13px] py-[9px] text-[12.5px] text-foreground transition-colors",
        dead ? "cursor-not-allowed opacity-50" : "hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

export function ComposeSurface({
  kind = null,
  kindTone = "neutral",
  subject,
  body,
  audiences,
  channels,
  meta,
  foot = null,
  onApproveAndSend,
  onEditFirst,
  onPreviewAsTenant,
  loading = false,
  error = null,
}: ComposeSurfaceProps) {
  const hasDraft = !!(subject || body);
  const sendDead = !onApproveAndSend;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 px-3.5 pb-[13px]">
      {/* ── who gets it ─────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-wrap items-center gap-[9px]">
        {kind && (
          <span
            className={cn(
              "flex-none whitespace-nowrap rounded-full px-[9px] py-0.5 text-[10.5px] font-semibold",
              TONE_PILL[kindTone],
            )}
          >
            {kind}
          </span>
        )}
        <span className="flex-none text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
          WHO GETS IT
        </span>
        {audiences?.length ? (
          audiences.map((a) => (
            <Chip
              key={a.id}
              skin="ink"
              label={a.label}
              trailing={figure(a.count)}
              selected={a.selected}
              onSelect={a.onSelect}
            />
          ))
        ) : (
          <span className="text-[10.5px] text-muted-foreground">
            No audience segments — the fleet is not connected to this composer.
          </span>
        )}
      </div>

      {/* ── how it goes out ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
        <span className="flex-none text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
          HOW
        </span>
        {channels?.length ? (
          channels.map((c) => (
            <Chip
              key={c.id}
              skin="violet"
              label={c.label}
              selected={c.selected}
              onSelect={c.onSelect}
            />
          ))
        ) : (
          <span className="text-[10.5px] text-muted-foreground">
            No delivery channels are wired.
          </span>
        )}
      </div>

      {/* ── the draft ───────────────────────────────────────────────────── */}
      {loading && (
        <div className="min-w-0 rounded-xl border border-border bg-card p-[13px]">
          <div className="h-2.5 w-40 rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-3 h-2.5 w-[78%] rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-2 h-2.5 w-[54%] rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-3 text-[11px] text-muted-foreground">Reading the draft…</div>
        </div>
      )}

      {!loading && error && (
        <div className="min-w-0 rounded-xl border border-[hsl(var(--destructive)/0.32)] bg-[hsl(var(--destructive)/0.06)] px-[13px] py-3">
          <div className="text-[12.5px] font-semibold">The draft could not be read.</div>
          <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{error}</div>
        </div>
      )}

      {!loading && !error && !hasDraft && (
        <div className="min-w-0 rounded-xl border border-dashed border-border bg-card px-[13px] py-5 text-center">
          <div className="text-[12.5px] font-semibold">No draft is loaded.</div>
          <div className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
            The composer holds no message of its own. A subject and body arrive from the draft
            she wrote; until one is passed, nothing is shown here — an empty card would read as a
            blank message sitting ready to send, and there is nothing to send.
          </div>
        </div>
      )}

      {!loading && !error && hasDraft && (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border/60 bg-muted/40 px-[13px] py-2.5">
            <div className="text-[8.5px] font-semibold tracking-[0.13em] text-muted-foreground">
              SUBJECT
            </div>
            <div className="mt-1 text-[13.5px] font-semibold">{figure(subject)}</div>
          </div>
          <div className="px-[13px] py-3">
            <div className="whitespace-pre-wrap text-[13px] leading-[1.7] text-foreground">
              {figure(body)}
            </div>
          </div>
          {!!meta?.length && (
            <dl className="grid grid-cols-2 gap-2.5 border-t border-border/60 bg-muted/40 px-[13px] py-2.5 md:grid-cols-4">
              {meta.map((m) => (
                <div key={m.id} className="min-w-0">
                  <dt className="text-[8.5px] font-semibold tracking-[0.12em] text-[hsl(var(--primary))]">
                    {m.label}
                  </dt>
                  <dd className="mt-0.5 truncate whitespace-nowrap text-[11.5px] font-semibold tabular-nums">
                    {figure(m.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {/* ── the act ─────────────────────────────────────────────────────── */}
      {!loading && !error && hasDraft && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApproveAndSend}
            disabled={sendDead}
            title={
              sendDead
                ? "Not wired to a send path yet — this button would not deliver anything."
                : undefined
            }
            className={cn(
              FOCUS,
              "flex flex-none items-center gap-[7px] whitespace-nowrap rounded-[9px] bg-cd-gold px-4 py-[9px] text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter]",
              sendDead ? "cursor-not-allowed opacity-50" : "hover:brightness-[1.06]",
            )}
          >
            <span aria-hidden className="text-[10px]">
              ✓
            </span>
            Approve and send
          </button>
          <SecondaryAction label="Edit first" onClick={onEditFirst} />
          <SecondaryAction label="Preview as a tenant" onClick={onPreviewAsTenant} />
          <span className="ml-auto flex-none text-[10.5px] text-muted-foreground">
            {figure(foot)}
          </span>
        </div>
      )}
    </div>
  );
}

export default ComposeSurface;
