import { cn } from "@/lib/utils";

/**
 * Social — Claude Design's `isSocialGrid` (Super Admin Shell.dc.html, L1222–1241) and
 * `isSocialQueue` (L1242–1268) blocks.
 *
 *   • `SocialGrid`  — the horizontal strip of 118px network cards: the mark plate, the name,
 *     the connection dot, the follower figure and its growth chip.
 *   • `SocialQueue` — the scheduled-post list: per-post network marks, state pill, author pill,
 *     the scheduled time, the post body, its media note, its numbers, and its CTA.
 *
 * §13 — EVERY FIGURE ON THIS SURFACE IS A CLAIM ABOUT AN ACCOUNT WE DO NOT OWN. CD's pack
 * ships ten networks with follower counts, growth percentages, engagement rates and a queue of
 * written posts with reach numbers attached. None of it ships. A follower count arrives from
 * the caller or renders "—"; growth is drawn only when the caller supplies a real signed
 * percentage; a post body is never composed here. And "no posts" is not the same fact as "no
 * social source connected", so the two are separate props: `connected` decides which sentence
 * an empty list gets. A queue that invented a post would be worse than an empty one — it would
 * put words in the operator's mouth and imply they are about to be published.
 *
 * §11 GOLD BUDGET. CD paints the awaiting-approval post's left band in gold (#C8A02E) and
 * every post's CTA in gold ink. A resting 4px border is not an act, so the band maps to
 * --warning instead; the CTA keeps gold-as-text ONLY on a post that is genuinely waiting on
 * the operator (that one IS the act — review and approve), and reads muted on a post that is
 * merely scheduled or already out. The "Awaiting you" pill also carries --gold-dark ink, which
 * is NOT a third gold spend: plain --warning fails AA as text on a light card (~2:1), so
 * --gold-dark is this console's amber-as-text token and is what every sibling surface pairs
 * with a --warning/0.16 pill. No gold FILL is spent anywhere on this surface.
 *
 * NOT PORTED, deliberately: CD's per-network brand gradients (`linear-gradient(150deg,c1,c2)`
 * per platform, plus a matching ink). Those are third-party brand colours pasted as hex, they
 * do not re-tint with the theme, and several of them fail AA against the ink CD pairs them
 * with. The mark plate is a neutral token plate here and the CONNECTION STATE carries the
 * colour, which is the fact the operator is actually scanning for.
 */

/* ────────────────────────────────────────────────────────────────────────────
   shared
   ──────────────────────────────────────────────────────────────────────────── */

const NOT_KNOWN = "—";

function figure(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? NOT_KNOWN : value;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** CD's mark plate, in tokens (see the note above about its brand gradients). */
function MarkPlate({
  mark,
  name,
  size,
}: {
  mark: string;
  name: string;
  size: 19 | 22;
}) {
  return (
    <span
      title={name}
      style={{ width: size, height: size }}
      className={cn(
        "grid flex-none place-items-center bg-muted font-bold text-foreground/75",
        size === 22 ? "rounded-[7px] text-[11px]" : "rounded-[6px] text-[9.5px]",
      )}
    >
      {mark}
    </span>
  );
}

function StatePlate({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[11px] border border-dashed border-border bg-muted/40 px-[13px] py-[14px]">
      <div className="text-[12.5px] font-semibold">{title}</div>
      <div className="mt-1.5 max-w-xl text-[11.5px] leading-[1.5] text-muted-foreground">{body}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   SocialGrid — CD `isSocialGrid`, L1222–1241
   ──────────────────────────────────────────────────────────────────────────── */

/** The four states CD distinguishes, as a closed union rather than a string compare. */
export type SocialConnectionState = "connected" | "needs_reauth" | "internal" | "not_connected";

export interface SocialNetwork {
  id: string;
  name: string;
  /** The one- or two-character mark CD puts on the plate. */
  mark: string;
  state: SocialConnectionState;
  /** The handle, for the card's tooltip. null → left out of the tooltip entirely. */
  handle?: string | null;
  /** Formatted follower figure — the caller owns the locale. null → "—". */
  followers: string | null;
  /**
   * Signed percentage change since the last reading. null → NO growth chip at all, because
   * "we have not measured a change" and "it did not change" are different facts (§13).
   */
  growthPercent?: number | null;
  /** What the network is for, in the caller's words. Tooltip only. */
  note?: string | null;
  /** Opens the network. Absent → the card is a plain, non-interactive tile. */
  onOpen?: () => void;
}

export interface SocialGridProps {
  networks: readonly SocialNetwork[];
  /**
   * True only when a social source is genuinely attached. Left false, an empty strip is
   * reported as "not connected" rather than as "you have no accounts".
   */
  connected?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const STATE_LABEL: Record<SocialConnectionState, string> = {
  connected: "Connected",
  needs_reauth: "Needs reauth",
  internal: "Internal",
  not_connected: "Not connected",
};

const STATE_DOT: Record<SocialConnectionState, string> = {
  connected: "bg-[hsl(var(--success))]",
  needs_reauth: "bg-[hsl(var(--destructive))]",
  internal: "bg-[hsl(var(--primary))]",
  not_connected: "bg-border-strong",
};

export function SocialGrid({
  networks,
  connected = false,
  loading = false,
  error = null,
  className,
}: SocialGridProps) {
  if (loading) {
    return (
      <div className={cn("flex min-w-0 gap-2 pb-1.5", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[64px] flex-none basis-[118px] rounded-[11px] bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("min-w-0", className)}>
        <StatePlate title="The social accounts could not be read." body={error} />
      </div>
    );
  }

  if (networks.length === 0) {
    return (
      <div className={cn("min-w-0", className)}>
        <StatePlate
          title={connected ? "No accounts on this workspace yet." : "No social source is connected."}
          body={
            connected
              ? "Accounts appear here as soon as one is linked. Nothing is shown for an account that does not exist."
              : "Follower counts, growth and engagement are claims about accounts we do not own, so none are drawn until a source is actually attached."
          }
        />
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 gap-2 overflow-x-auto pb-1.5", className)}>
      {networks.map((n) => {
        const growth = typeof n.growthPercent === "number" && Number.isFinite(n.growthPercent)
          ? n.growthPercent
          : null;
        const tip = [
          n.name,
          STATE_LABEL[n.state],
          n.handle ?? null,
          n.note ?? null,
        ]
          .filter((part): part is string => !!part)
          .join(" · ");

        const inner = (
          <>
            <span className="flex min-w-0 items-center gap-[7px]">
              <MarkPlate mark={n.mark} name={n.name} size={22} />
              <span className="min-w-0 truncate text-[10.5px] font-semibold">{n.name}</span>
              <span
                aria-hidden
                className={cn("h-1.5 w-1.5 flex-none rounded-full", STATE_DOT[n.state])}
              />
            </span>
            <span className="mt-[5px] flex min-w-0 items-baseline gap-1">
              <span className="text-[12px] font-bold tabular-nums tracking-[-0.02em]">
                {figure(n.followers)}
              </span>
              {growth !== null && (
                <span
                  className={cn(
                    "flex-none font-mono text-[8px]",
                    growth >= 0
                      ? "text-[hsl(var(--success))]"
                      : "text-[hsl(var(--destructive))]",
                  )}
                >
                  {growth >= 0 ? "▲" : "▼"} {Math.abs(growth)}%
                </span>
              )}
            </span>
            {/* The state is what the dot means. Said in words too, so it is not colour-only. */}
            <span className="sr-only">{STATE_LABEL[n.state]}</span>
          </>
        );

        const shell = cn(
          "flex-none basis-[118px] rounded-[11px] border-[1.5px] border-border bg-card px-[9px] py-[7px] text-left",
          n.state === "not_connected" && "opacity-60",
        );

        if (n.onOpen) {
          return (
            <button
              key={n.id}
              type="button"
              onClick={n.onOpen}
              title={tip}
              className={cn(
                shell,
                "transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md",
                FOCUS,
              )}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={n.id} title={tip} className={shell}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   SocialQueue — CD `isSocialQueue`, L1242–1268
   ──────────────────────────────────────────────────────────────────────────── */

/** CD's three post states. `awaiting` is the only one that carries an act. */
export type SocialPostState = "awaiting" | "scheduled" | "published";

export interface SocialPostMark {
  id: string;
  name: string;
  mark: string;
}

export interface SocialPost {
  id: string;
  /** Which networks it goes to. Empty → no marks are drawn. */
  marks?: readonly SocialPostMark[];
  state: SocialPostState;
  /** Who wrote it — "Paige" or a person. null → the author pill is left off. */
  author?: string | null;
  /** True when Paige wrote it; tints the author pill indigo the way CD's does. */
  authoredByPaige?: boolean;
  /** When it goes out, or went out, in the caller's words. null → "—". */
  when: string | null;
  /** The post itself. Never composed here. */
  body: string;
  /** "1 image", "no media" — the caller's words. null → left off. */
  media?: string | null;
  /** Reach/engagement, already formatted. null → left off (never a zero). */
  metrics?: string | null;
  /** CD's per-post CTA label. Without `onOpen` it renders as plain text, not a live control. */
  cta?: string | null;
  onOpen?: () => void;
}

export interface SocialQueueProps {
  posts: readonly SocialPost[];
  /** As on the grid: distinguishes "nothing queued" from "nothing connected". */
  connected?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

const POST_STATE_LABEL: Record<SocialPostState, string> = {
  awaiting: "Awaiting you",
  scheduled: "Scheduled",
  published: "Published",
};

const POST_STATE_PILL: Record<SocialPostState, string> = {
  awaiting: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  scheduled: "bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]",
  published: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
};

/** CD's 4px left band. Gold on `awaiting` becomes --warning here (§11, see the header note). */
const POST_STATE_BAND: Record<SocialPostState, string> = {
  awaiting: "border-l-[hsl(var(--warning))]",
  scheduled: "border-l-[hsl(var(--primary))]",
  published: "border-l-[hsl(var(--success))]",
};

export function SocialQueue({
  posts,
  connected = false,
  loading = false,
  error = null,
  className,
}: SocialQueueProps) {
  if (loading) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-[7px]", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[92px] rounded-[11px] bg-muted motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("min-w-0", className)}>
        <StatePlate title="The queue could not be read." body={error} />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className={cn("min-w-0", className)}>
        <StatePlate
          title={connected ? "Nothing is queued." : "No social source is connected."}
          body={
            connected
              ? "Drafts and scheduled posts appear here as soon as one exists."
              : "A post in this list would read as something about to be published under the operator's name, so nothing is drawn until a real queue is attached."
          }
        />
      </div>
    );
  }

  return (
    <ol
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col gap-[7px] overflow-y-auto overflow-x-hidden pr-0.5",
        className,
      )}
    >
      {posts.map((p) => {
        const inner = (
          <>
            <span className="flex min-w-0 items-center gap-[7px]">
              {!!p.marks?.length && (
                <span className="flex flex-none items-center gap-[3px]">
                  {p.marks.map((mk) => (
                    <MarkPlate key={mk.id} mark={mk.mark} name={mk.name} size={19} />
                  ))}
                </span>
              )}
              <span
                className={cn(
                  "flex-none whitespace-nowrap rounded-full px-2 py-[2px] text-[9px] font-bold",
                  POST_STATE_PILL[p.state],
                )}
              >
                {POST_STATE_LABEL[p.state]}
              </span>
              {p.author && (
                <span
                  className={cn(
                    "flex-none whitespace-nowrap rounded-full px-[7px] py-[2px] text-[9px] font-semibold",
                    p.authoredByPaige
                      ? "bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {p.author}
                </span>
              )}
              <span className="ml-auto flex-none whitespace-nowrap font-mono text-[9px] text-muted-foreground">
                {figure(p.when)}
              </span>
            </span>
            <span className="mt-[7px] block text-[12px] leading-[1.5] text-foreground">{p.body}</span>
            <span className="mt-[7px] flex min-w-0 items-center gap-2.5">
              {p.media && (
                <span className="flex-none whitespace-nowrap text-[9px] text-muted-foreground">
                  {p.media}
                </span>
              )}
              {p.metrics && (
                <span className="flex-none whitespace-nowrap font-mono text-[9px] text-[hsl(var(--success))]">
                  {p.metrics}
                </span>
              )}
              {p.cta && (
                <span
                  className={cn(
                    "ml-auto flex-none whitespace-nowrap text-[10px] font-semibold",
                    /* Gold-as-text only where there is a real act to take (§11). */
                    p.state === "awaiting" && p.onOpen
                      ? "text-[hsl(var(--gold-dark))]"
                      : "text-muted-foreground",
                  )}
                >
                  {p.cta} →
                </span>
              )}
            </span>
          </>
        );

        const shell = cn(
          "block w-full min-w-0 rounded-[11px] border-[1.5px] border-l-4 border-border bg-card px-3 py-2.5 text-left",
          POST_STATE_BAND[p.state],
        );

        return (
          <li key={p.id} className="min-w-0">
            {p.onOpen ? (
              <button
                type="button"
                onClick={p.onOpen}
                className={cn(
                  shell,
                  "transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-md",
                  FOCUS,
                )}
              >
                {inner}
              </button>
            ) : (
              <div className={shell}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default SocialGrid;
