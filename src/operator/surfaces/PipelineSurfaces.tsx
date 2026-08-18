import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The PIPELINE group — Claude Design's three deal surfaces (Super Admin Shell.dc.html):
 *
 *   • PipelineHead  — the `isPipeHead`  block, L1178–1221 (set chips · pipeline actions ·
 *                     filter chips · the forecast card with its weighted total and category bar)
 *   • PipelineBoard — the `isPipeBoard` block, L1269–1349 (the drag-and-drop kanban: won/lost
 *                     drop zones, 182px stage columns, deal cards with their move menu)
 *   • StageBoard    — the `isStageBoard` block, L1350–1378 (the four-lane read-only stage grid)
 *
 * §13 — NOT ONE FIGURE ON THIS SURFACE IS OURS. CD drives all three blocks from a `DEALS`
 * fixture: named companies, MRR amounts, close dates, win probabilities, owner names, health
 * scores, and a forecast computed from them. A pipeline is the surface an operator uses to
 * decide where the business is — an invented deal or an invented forecast here is the §57
 * failure exactly (a console asserting money the platform has no record of). So every figure
 * arrives from the caller; a value that was not supplied renders "—"; a stage with no deals
 * renders EMPTY with a stated reason rather than seeded with sample cards; and a board handed
 * no columns says the pipeline is not connected instead of drawing a plausible-looking shell.
 *
 * §11 gold — the ONE gold element across all three is "+ New pipeline", the primary act on the
 * head. Category tones, stage tones, score pills and the untouched-deal warning are STATUS and
 * resolve to --success / --warning (as --gold-dark text) / --destructive / --primary. Nothing
 * gold marks a resting border, a selected chip or a selected column.
 *
 * NOT PORTED — CD's per-category and per-stage hex pairs (`catTone`, `sg.color`, `scoreTone`),
 * and the alpha-suffixed tints derived from them. A colour that means "this stage is late" is a
 * classification, so it arrives as a semantic `tone` and resolves to our status tokens. Also
 * not ported: CD's `bar` per-column progress fill, which encodes a share of the weighted total
 * the caller has not been asked for.
 *
 * DEVIATION — CD keeps the in-flight drag in its own app state (`b.dragging`, `landDeal`).
 * Here the board owns that state and reports one completed move through `onMoveDeal(dealId,
 * target)`, where `target` is a column id or the `"won"` / `"lost"` sentinels. With no
 * `onMoveDeal` the cards are NOT draggable and the move menu renders disabled and titled —
 * a card that can be dragged but cannot land is a lie about what the board can do. Drag is
 * never the only path: the ⋯ move menu is the keyboard- and screen-reader-reachable one, which
 * is why it is a real button and a real list.
 */

/* ────────────────────────────────────────────────────────────────────────────
   Shared vocabulary
   ──────────────────────────────────────────────────────────────────────────── */

/** CD paints each state with its own hex pair; these are the semantic tones behind them. */
export type PipelineTone = "neutral" | "info" | "ok" | "warn" | "risk";

/** Amber-as-text is --gold-dark: --warning is a fill value and sinks below AA at these sizes. */
const TEXT: Record<PipelineTone, string> = {
  neutral: "text-muted-foreground",
  info: "text-[hsl(var(--primary))]",
  ok: "text-[hsl(var(--success))]",
  warn: "text-[hsl(var(--gold-dark))]",
  risk: "text-[hsl(var(--destructive))]",
};

const DOT: Record<PipelineTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-[hsl(var(--primary))]",
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
};

const TINT: Record<PipelineTone, string> = {
  neutral: "bg-muted/40",
  info: "bg-[hsl(var(--primary)/0.06)]",
  ok: "bg-[hsl(var(--success)/0.07)]",
  warn: "bg-[hsl(var(--warning)/0.08)]",
  risk: "bg-[hsl(var(--destructive)/0.06)]",
};

const EDGE: Record<PipelineTone, string> = {
  neutral: "border-border",
  info: "border-[hsl(var(--primary)/0.28)]",
  ok: "border-[hsl(var(--success)/0.30)]",
  warn: "border-[hsl(var(--warning)/0.38)]",
  risk: "border-[hsl(var(--destructive)/0.28)]",
};

const PILL: Record<PipelineTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  ok: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const NOT_KNOWN = "—";

function figure(v: string | null | undefined): string {
  return v === null || v === undefined || v === "" ? NOT_KNOWN : v;
}

/** CD's ▲ / ▼ move glyphs. A direction we were not given draws nothing rather than "flat". */
function moveGlyph(dir: "up" | "down" | null | undefined): string | null {
  return dir === "up" ? "▲" : dir === "down" ? "▼" : null;
}

function moveTone(dir: "up" | "down" | null | undefined): PipelineTone {
  return dir === "up" ? "ok" : dir === "down" ? "risk" : "neutral";
}

/* ────────────────────────────────────────────────────────────────────────────
   PipelineHead — CD `isPipeHead`, L1178–1221
   ──────────────────────────────────────────────────────────────────────────── */

/** A pipeline/source set chip. `count` is a claim about the book — null renders "—". */
export type PipelineSet = {
  id: string;
  label: string;
  count: string | null;
  /** CD hangs an explanation off each set as a `title`. */
  note?: string;
  selected?: boolean;
  onSelect?: () => void;
};

/** A filter chip (CD: All · Mine · Hers · Rotting · Enterprise — all caller-supplied). */
export type PipelineFilter = {
  id: string;
  label: string;
  count: string | null;
  selected?: boolean;
  onSelect?: () => void;
};

/** A forecast category. `share` (0–100) drives the segmented bar and is a computed fact. */
export type PipelineCategory = {
  id: string;
  label: string;
  /** Weighted value, already formatted by the caller. null → "—". */
  value: string | null;
  tone?: PipelineTone;
  /** Percentage of the raw total. null anywhere → the whole bar is withheld. */
  share?: number | null;
  /** CD's hover: how many deals and what raw value sit behind this slice. */
  note?: string;
};

/** A head action. CD ships three; each renders disabled unless the caller wires it. */
export type PipelineAction = { label?: string; onClick?: () => void };

export type PipelineHeadProps = {
  sets?: readonly PipelineSet[];
  filters?: readonly PipelineFilter[];
  /** The weighted forecast, already formatted. null → "—". */
  weighted: string | null;
  weightedNote?: string | null;
  /** The unweighted total, already formatted. null → "—". */
  rawTotal: string | null;
  rawNote?: string | null;
  categories?: readonly PipelineCategory[];
  spend?: PipelineAction;
  editStages?: PipelineAction;
  newPipeline?: PipelineAction;
};

/** CD's chips are `<div onClick>`; here they are real toggles that say when they cannot act. */
function ChipToggle({
  label,
  count,
  note,
  selected = false,
  onSelect,
  skin,
}: {
  label: string;
  count: string | null;
  note?: string;
  selected?: boolean;
  onSelect?: () => void;
  skin: "set" | "filter";
}) {
  const dead = !onSelect;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={dead}
      onClick={onSelect}
      title={dead ? note ?? "Not wired to an action yet." : note}
      className={cn(
        FOCUS,
        "flex flex-none items-center whitespace-nowrap border font-semibold transition-colors",
        skin === "set"
          ? "gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
          : "gap-[5px] rounded-lg px-2.5 py-[5px] text-[10.5px]",
        selected
          ? skin === "set"
            ? "border-foreground bg-foreground text-background"
            : "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.08)] text-[hsl(var(--primary))]"
          : "border-border bg-card text-muted-foreground",
        !selected && !dead && "hover:bg-muted",
        dead && "cursor-not-allowed opacity-60",
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono tabular-nums",
          skin === "set" ? "text-[9px] opacity-65" : "text-[9px] opacity-60",
        )}
      >
        {figure(count)}
      </span>
    </button>
  );
}

function HeadAction({
  action,
  fallbackLabel,
  variant,
}: {
  action: PipelineAction | undefined;
  fallbackLabel: string;
  variant: "strong" | "plain" | "gold";
}) {
  const label = action?.label ?? fallbackLabel;
  const onClick = action?.onClick;
  const dead = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dead}
      title={dead ? "Not wired to an action yet." : undefined}
      className={cn(
        FOCUS,
        "flex-none whitespace-nowrap rounded-lg px-[11px] py-[5px] text-[10.5px] font-semibold transition-[filter,background-color]",
        variant === "gold"
          ? "bg-cd-gold text-[hsl(var(--accent-foreground))]"
          : variant === "strong"
            ? "border-[1.5px] border-border-strong bg-card text-foreground"
            : "border border-border bg-card text-foreground",
        dead
          ? "cursor-not-allowed opacity-50"
          : variant === "gold"
            ? "hover:brightness-[1.06]"
            : "hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

export function PipelineHead({
  sets,
  filters,
  weighted,
  weightedNote = null,
  rawTotal,
  rawNote = null,
  categories,
  spend,
  editStages,
  newPipeline,
}: PipelineHeadProps) {
  /**
   * The segmented bar is drawn ONLY when every category reported its share. A bar with one
   * slice missing silently misstates the proportions of the rest, which is a worse lie than
   * no bar at all (§13).
   */
  const shares = categories?.every((c) => typeof c.share === "number") ? categories : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {/* ── sets · actions · filters ────────────────────────────────────── */}
      <div className="flex min-w-0 flex-nowrap items-center gap-[7px] overflow-x-auto pb-0.5">
        {sets?.map((s) => (
          <ChipToggle
            key={s.id}
            skin="set"
            label={s.label}
            count={s.count}
            note={s.note}
            selected={s.selected}
            onSelect={s.onSelect}
          />
        ))}

        <span className="ml-auto flex-none" />
        <HeadAction action={spend} fallbackLabel="Campaign spend →" variant="strong" />
        <HeadAction action={editStages} fallbackLabel="Edit stages" variant="plain" />
        <HeadAction action={newPipeline} fallbackLabel="+ New pipeline" variant="gold" />

        <span aria-hidden className="h-4 w-px flex-none bg-border" />

        {filters?.map((f) => (
          <ChipToggle
            key={f.id}
            skin="filter"
            label={f.label}
            count={f.count}
            selected={f.selected}
            onSelect={f.onSelect}
          />
        ))}
      </div>

      {/* ── forecast ────────────────────────────────────────────────────── */}
      <div className="min-w-0 rounded-xl border-[1.5px] border-border-strong bg-card px-[13px] py-[9px] shadow-sm">
        <dl className="flex min-w-0 items-baseline gap-3">
          <dt className="flex-none text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
            FORECAST
          </dt>
          <dd className="flex-none text-[19px] font-bold tabular-nums tracking-[-0.02em]">
            {figure(weighted)}
          </dd>
          <dd className="flex-none text-[10px] text-muted-foreground">{figure(weightedNote)}</dd>
          <dd className="ml-auto flex-none font-mono text-[11px] tabular-nums text-muted-foreground">
            {figure(rawTotal)}
            {rawNote ? ` ${rawNote}` : ""}
          </dd>
        </dl>

        {!!categories?.length && (
          <div className="mt-1.5 flex min-w-0 flex-nowrap items-center gap-3 overflow-x-auto">
            {shares && (
              <div
                aria-hidden
                className="flex h-2 w-[74px] flex-none items-stretch gap-0.5 overflow-hidden rounded-[5px]"
              >
                {shares.map((c) => (
                  <div
                    key={c.id}
                    style={{ width: `${c.share ?? 0}%` }}
                    className={cn("min-w-[3px]", DOT[c.tone ?? "neutral"])}
                  />
                ))}
              </div>
            )}
            {categories.map((c) => (
              <div key={c.id} title={c.note} className="flex flex-none items-baseline gap-1.5">
                <span
                  aria-hidden
                  className={cn("h-1.5 w-1.5 flex-none rounded-sm", DOT[c.tone ?? "neutral"])}
                />
                <span
                  className={cn(
                    "whitespace-nowrap text-[10.5px] font-semibold",
                    TEXT[c.tone ?? "neutral"],
                  )}
                >
                  {c.label}
                </span>
                <span className="whitespace-nowrap text-[12px] font-bold tabular-nums">
                  {figure(c.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!categories?.length && (
          <div className="mt-1.5 text-[10.5px] text-muted-foreground">
            No category breakdown was supplied, so none is drawn.
          </div>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   PipelineBoard — CD `isPipeBoard`, L1269–1349
   ──────────────────────────────────────────────────────────────────────────── */

/** One deal card. Every figure is the caller's; nothing is computed or invented here. */
export type PipelineDeal = {
  id: string;
  name: string;
  /** Recurring value, already formatted. null → "—". */
  mrr: string | null;
  /** A change in value, already formatted (without the glyph). */
  valueMove?: string | null;
  valueMoveDirection?: "up" | "down" | null;
  tier: string | null;
  /** The next move, in the caller's words. */
  next: string | null;
  /** Expected close, already formatted. */
  close: string | null;
  /** A slipped close date, already formatted. Rendered as a risk. */
  dateMove?: string | null;
  owner: string | null;
  /** CD tints Paige-owned deals differently from human-owned ones. */
  ownerIsPaige?: boolean;
  /** Health score, already formatted. */
  score: string | null;
  scoreTone?: PipelineTone;
  scoreDirection?: "up" | "down" | null;
  /** How long since it was touched, in the caller's words. */
  touch: string | null;
  touchTone?: PipelineTone;
  /** CD's `rot` — untouched past the stage's expected window. */
  stale?: boolean;
  onOpen?: () => void;
};

export type PipelineColumn = {
  id: string;
  label: string;
  /** How many deals sit here. null → "—". */
  count: string | null;
  /** Weighted value of the column, already formatted. null → "—". */
  value: string | null;
  /** Win probability, already formatted (CD prints "45%"). null → "—". */
  prob: string | null;
  tone?: PipelineTone;
  /** CD's `headTip` — probability, expected days and entry criteria. */
  headNote?: string;
  cards: readonly PipelineDeal[];
  /** Why this column is empty, in the caller's words. */
  emptyNote?: string | null;
  /** CD's "+N more" link. Rendered only with a handler. */
  more?: { label: string; onClick?: () => void } | null;
};

/** CD's won/lost drop zones. `target` reaches `onMoveDeal` as these sentinel strings. */
export type PipelineOutcome = { label: string; note: string };

export type PipelineBoardProps = {
  columns: readonly PipelineColumn[];
  /**
   * Landing a deal. `target` is a column id, or `"won"` / `"lost"`. Absent → cards are not
   * draggable and the move menu renders disabled, because a move that cannot land is a lie.
   */
  onMoveDeal?: (dealId: string, target: string) => void;
  won?: PipelineOutcome;
  lost?: PipelineOutcome;
  loading?: boolean;
  error?: string | null;
};

const WON_TARGET = "won";
const LOST_TARGET = "lost";

function DealCard({
  deal,
  columnId,
  columns,
  canMove,
  menuOpen,
  onToggleMenu,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  deal: PipelineDeal;
  columnId: string;
  columns: readonly PipelineColumn[];
  canMove: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onMove: (target: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const glyph = moveGlyph(deal.valueMoveDirection);
  const scoreGlyph = moveGlyph(deal.scoreDirection);
  const openable = !!deal.onOpen;

  return (
    <li
      draggable={canMove}
      onDragStart={canMove ? onDragStart : undefined}
      onDragEnd={canMove ? onDragEnd : undefined}
      className={cn(
        "relative min-w-0 rounded-[9px] border-[1.5px] border-border border-l-4 bg-card px-[9px] py-2 transition-shadow hover:border-border-strong hover:shadow-md",
        deal.scoreTone === "ok" && "border-l-[hsl(var(--success))]",
        deal.scoreTone === "warn" && "border-l-[hsl(var(--warning))]",
        deal.scoreTone === "risk" && "border-l-[hsl(var(--destructive))]",
        deal.scoreTone === "info" && "border-l-[hsl(var(--primary))]",
        (!deal.scoreTone || deal.scoreTone === "neutral") && "border-l-border-strong",
        canMove && "cursor-grab active:cursor-grabbing",
      )}
    >
      {deal.stale && (
        <span
          title="Untouched past this stage's expected window."
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[hsl(var(--destructive))]"
        >
          <span className="sr-only">Untouched past this stage&apos;s expected window.</span>
        </span>
      )}

      <div className="flex min-w-0 items-start gap-[5px]">
        {openable ? (
          <button
            type="button"
            onClick={deal.onOpen}
            className={cn(
              FOCUS,
              "min-w-0 truncate whitespace-nowrap rounded text-left text-[11.5px] font-semibold leading-[1.25] hover:underline",
            )}
          >
            {deal.name}
          </button>
        ) : (
          <span
            title="Not wired to a deal record yet."
            className="min-w-0 truncate whitespace-nowrap text-[11.5px] font-semibold leading-[1.25]"
          >
            {deal.name}
          </span>
        )}
        <button
          type="button"
          aria-label={`Move ${deal.name} to another stage`}
          aria-expanded={menuOpen}
          disabled={!canMove}
          onClick={onToggleMenu}
          title={canMove ? "Move this deal" : "Moving deals is not wired to an action yet."}
          className={cn(
            FOCUS,
            "ml-auto flex-none rounded px-0.5 text-[11px] leading-none text-muted-foreground",
            canMove ? "hover:text-foreground" : "cursor-not-allowed opacity-50",
          )}
        >
          ⋯
        </button>
      </div>

      {menuOpen && canMove && (
        <div className="absolute right-1.5 top-6 z-20 w-[150px] overflow-hidden rounded-[10px] border border-border bg-popover shadow-lg motion-safe:animate-in motion-safe:fade-in-0">
          <div className="px-[9px] pb-1 pt-1.5 text-[8px] font-semibold tracking-[0.12em] text-muted-foreground">
            MOVE TO
          </div>
          <ul>
            {columns
              .filter((c) => c.id !== columnId)
              .map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onMove(c.id)}
                    className={cn(
                      FOCUS,
                      "flex w-full min-w-0 items-center gap-[7px] px-[9px] py-1.5 text-left hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT[c.tone ?? "neutral"])}
                    />
                    <span className="min-w-0 truncate whitespace-nowrap text-[10.5px]">
                      {c.label}
                    </span>
                  </button>
                </li>
              ))}
            <li>
              <button
                type="button"
                onClick={() => onMove(WON_TARGET)}
                className={cn(
                  FOCUS,
                  "flex w-full min-w-0 items-center gap-[7px] border-t border-border px-[9px] py-1.5 text-left hover:bg-muted",
                )}
              >
                <span aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT.ok)} />
                <span className="min-w-0 truncate whitespace-nowrap text-[10.5px]">Won</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => onMove(LOST_TARGET)}
                className={cn(
                  FOCUS,
                  "flex w-full min-w-0 items-center gap-[7px] px-[9px] py-1.5 text-left hover:bg-muted",
                )}
              >
                <span aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT.risk)} />
                <span className="min-w-0 truncate whitespace-nowrap text-[10.5px]">Lost</span>
              </button>
            </li>
          </ul>
        </div>
      )}

      <div className="mt-[5px] flex min-w-0 items-baseline gap-1.5">
        <span className="flex-none text-[13px] font-bold tabular-nums tracking-[-0.02em]">
          {figure(deal.mrr)}
        </span>
        {deal.valueMove && (
          <span
            className={cn(
              "flex-none font-mono text-[8.5px] tabular-nums",
              TEXT[moveTone(deal.valueMoveDirection)],
            )}
          >
            {glyph ? `${glyph} ` : ""}
            {deal.valueMove}
          </span>
        )}
        <span className="ml-auto flex-none text-[8.5px] text-muted-foreground">
          {figure(deal.tier)}
        </span>
      </div>

      <div className="mt-[5px] text-[10px] leading-[1.35] text-muted-foreground">
        {figure(deal.next)}
      </div>

      <div className="mt-1.5 flex min-w-0 items-center gap-[5px]">
        <span
          className={cn(
            "flex flex-none items-center gap-[3px] rounded-[5px] px-[5px] py-px text-[8.5px] font-bold",
            PILL[deal.scoreTone ?? "neutral"],
          )}
        >
          {figure(deal.score)}
          {scoreGlyph && (
            <span aria-hidden className={cn("text-[7px]", TEXT[moveTone(deal.scoreDirection)])}>
              {scoreGlyph}
            </span>
          )}
        </span>
        <span
          className={cn(
            "flex-none rounded-[5px] px-[5px] py-px text-[8.5px] font-semibold",
            deal.ownerIsPaige ? PILL.info : PILL.neutral,
          )}
        >
          {figure(deal.owner)}
        </span>
        <span
          className={cn(
            "ml-auto flex-none font-mono text-[8.5px] tabular-nums",
            TEXT[deal.touchTone ?? "neutral"],
          )}
        >
          {figure(deal.touch)}
        </span>
      </div>

      <div className="mt-[5px] flex min-w-0 items-center gap-1.5 border-t border-border/50 pt-[5px]">
        <span className="flex-none font-mono text-[8.5px] tabular-nums text-muted-foreground">
          {figure(deal.close)}
        </span>
        {deal.dateMove && (
          <span className="flex-none font-mono text-[8.5px] tabular-nums text-[hsl(var(--destructive))]">
            {deal.dateMove}
          </span>
        )}
      </div>
    </li>
  );
}

export function PipelineBoard({
  columns,
  onMoveDeal,
  won = { label: "Won", note: "Provision and celebrate" },
  lost = { label: "Lost", note: "Log the reason" },
  loading = false,
  error = null,
}: PipelineBoardProps) {
  const canMove = !!onMoveDeal;
  const [dragging, setDragging] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  function land(target: string, dealId: string | null) {
    if (!onMoveDeal || !dealId) return;
    onMoveDeal(dealId, target);
    setDragging(null);
    setMenuFor(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-40 flex-none basis-[182px] rounded-xl bg-muted motion-safe:animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-w-0 rounded-xl border border-[hsl(var(--destructive)/0.32)] bg-[hsl(var(--destructive)/0.06)] px-[13px] py-4">
        <div className="text-[12.5px] font-semibold">The pipeline could not be read.</div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!columns.length) {
    return (
      <div className="min-w-0 rounded-xl border border-dashed border-border bg-card px-[13px] py-6 text-center">
        <div className="text-[12.5px] font-semibold">The pipeline is not connected.</div>
        <div className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
          No stages have been handed to this board, so no board is drawn. Stages, their
          probabilities and the deals in them are the platform&apos;s record — an example board
          here would put invented money in front of the person deciding where the business is.
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── outcome drop zones · CD shows these only mid-drag ───────────── */}
      {dragging && canMove && (
        <div className="mb-2 flex min-w-0 gap-2 motion-safe:animate-in motion-safe:fade-in-0">
          {[
            { key: WON_TARGET, o: won, tone: "ok" as PipelineTone },
            { key: LOST_TARGET, o: lost, tone: "risk" as PipelineTone },
          ].map(({ key, o, tone }) => (
            <div
              key={key}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={() => land(key, dragging)}
              className={cn(
                "min-w-0 flex-1 rounded-[11px] border border-dashed px-3 py-2.5 text-center",
                EDGE[tone],
                TINT[tone],
              )}
            >
              <div className={cn("text-[12px] font-bold", TEXT[tone])}>{o.label}</div>
              <div className={cn("mt-0.5 text-[9.5px] opacity-80", TEXT[tone])}>{o.note}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── the stages ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden pb-[9px]">
        {columns.map((c) => {
          const tone = c.tone ?? "neutral";
          return (
            <section
              key={c.id}
              onDragOver={
                canMove
                  ? (e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }
                  : undefined
              }
              onDrop={canMove ? () => land(c.id, dragging) : undefined}
              className={cn(
                "flex min-h-0 min-w-0 flex-none basis-[182px] flex-col self-stretch overflow-hidden rounded-xl border-2",
                EDGE[tone],
                TINT[tone],
                dragging && canMove && "border-dashed",
              )}
            >
              <header
                title={c.headNote}
                className={cn("min-w-0 flex-none border-b-[1.5px] px-[9px] pb-[5px] pt-1.5", EDGE[tone])}
              >
                <div className="flex min-w-0 items-baseline gap-[5px]">
                  <h3
                    className={cn(
                      "min-w-0 truncate whitespace-nowrap text-[10.5px] font-bold",
                      TEXT[tone],
                    )}
                  >
                    {c.label}
                  </h3>
                  <span className="ml-auto flex-none font-mono text-[8.5px] tabular-nums text-muted-foreground">
                    {figure(c.count)}
                  </span>
                </div>
                <div className="mt-0.5 flex min-w-0 items-baseline gap-[5px]">
                  <span className="flex-none text-[12px] font-bold tabular-nums tracking-[-0.02em]">
                    {figure(c.value)}
                  </span>
                  <span className="flex-none font-mono text-[8px] tabular-nums text-muted-foreground">
                    {figure(c.prob)}
                  </span>
                </div>
              </header>

              <ul className="flex min-h-0 flex-1 flex-col gap-[5px] overflow-y-auto overflow-x-hidden p-[7px]">
                {c.cards.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    columnId={c.id}
                    columns={columns}
                    canMove={canMove}
                    menuOpen={menuFor === d.id}
                    onToggleMenu={() => setMenuFor(menuFor === d.id ? null : d.id)}
                    onMove={(target) => land(target, d.id)}
                    onDragStart={() => setDragging(d.id)}
                    onDragEnd={() => setDragging(null)}
                  />
                ))}

                {!c.cards.length && (
                  <li className="px-1 py-3 text-center text-[10px] leading-relaxed text-muted-foreground">
                    {c.emptyNote ?? "No deals in this stage."}
                  </li>
                )}

                {c.more && (
                  <li>
                    <button
                      type="button"
                      onClick={c.more.onClick}
                      disabled={!c.more.onClick}
                      title={c.more.onClick ? undefined : "Not wired to an action yet."}
                      className={cn(
                        FOCUS,
                        "w-full rounded p-[5px] text-center text-[10px] font-semibold text-[hsl(var(--gold-dark))]",
                        c.more.onClick ? "hover:underline" : "cursor-not-allowed opacity-50",
                      )}
                    >
                      {c.more.label}
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {!canMove && (
        <p className="flex-none text-[10px] text-muted-foreground">
          Deals cannot be moved from here yet — no move path is wired, so the cards are not
          draggable rather than draggable and inert.
        </p>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   StageBoard — CD `isStageBoard`, L1350–1378
   ──────────────────────────────────────────────────────────────────────────── */

/** A card on the read-only stage grid. Same rule: every figure is the caller's. */
export type StageCard = {
  id: string;
  name: string;
  /** How long it has sat here, already formatted. null → "—". */
  age: string | null;
  ageTone?: PipelineTone;
  mrr: string | null;
  tier: string | null;
  next: string | null;
  /** CD prints "via {from}" — where the deal came from. */
  source: string | null;
  onOpen?: () => void;
};

export type StageLane = {
  id: string;
  label: string;
  tone?: PipelineTone;
  count: string | null;
  value: string | null;
  cards: readonly StageCard[];
  emptyNote?: string | null;
};

export type StageBoardProps = {
  lanes: readonly StageLane[];
  loading?: boolean;
  error?: string | null;
};

export function StageBoard({ lanes, loading = false, error = null }: StageBoardProps) {
  if (loading) {
    return (
      <div className="grid min-w-0 grid-cols-2 gap-[9px] xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted motion-safe:animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-w-0 rounded-xl border border-[hsl(var(--destructive)/0.32)] bg-[hsl(var(--destructive)/0.06)] px-[13px] py-4">
        <div className="text-[12.5px] font-semibold">The stages could not be read.</div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{error}</div>
      </div>
    );
  }

  if (!lanes.length) {
    return (
      <div className="min-w-0 rounded-xl border border-dashed border-border bg-card px-[13px] py-6 text-center">
        <div className="text-[12.5px] font-semibold">No stages are connected.</div>
        <div className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
          The lanes, their counts and their values come from the platform&apos;s own stage
          record. None were supplied, so none are drawn.
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-2 gap-[9px] xl:grid-cols-4">
      {lanes.map((ln) => {
        const tone = ln.tone ?? "neutral";
        return (
          <section
            key={ln.id}
            className={cn(
              "flex min-w-0 flex-col overflow-hidden rounded-xl border",
              EDGE[tone],
              TINT[tone],
            )}
          >
            <header
              className={cn(
                "flex min-w-0 items-center gap-[7px] border-b px-[11px] pb-2 pt-[9px]",
                EDGE[tone],
              )}
            >
              <span aria-hidden className={cn("h-1.5 w-1.5 flex-none rounded-full", DOT[tone])} />
              <h3
                className={cn(
                  "min-w-0 truncate whitespace-nowrap text-[10.5px] font-bold tracking-[0.04em]",
                  TEXT[tone],
                )}
              >
                {ln.label}
              </h3>
              <span className="ml-auto flex-none font-mono text-[9.5px] tabular-nums text-muted-foreground">
                {figure(ln.count)} · {figure(ln.value)}
              </span>
            </header>

            <ul className="flex flex-col gap-1.5 p-2">
              {ln.cards.map((c) => {
                const body = (
                  <>
                    <div className="flex min-w-0 items-baseline gap-[7px]">
                      <span className="min-w-0 truncate whitespace-nowrap text-[12px] font-semibold">
                        {c.name}
                      </span>
                      <span
                        className={cn(
                          "ml-auto flex-none font-mono text-[9.5px] tabular-nums",
                          TEXT[c.ageTone ?? "neutral"],
                        )}
                      >
                        {figure(c.age)}
                      </span>
                    </div>
                    <div className="mt-[5px] flex items-baseline gap-1.5">
                      <span className="text-[13px] font-bold tabular-nums tracking-[-0.02em]">
                        {figure(c.mrr)}
                      </span>
                      <span className="text-[9.5px] text-muted-foreground">{figure(c.tier)}</span>
                    </div>
                    <div className="mt-[5px] text-[10.5px] leading-[1.4] text-muted-foreground">
                      {figure(c.next)}
                    </div>
                    <div className="mt-1 truncate whitespace-nowrap text-[9px] text-muted-foreground">
                      via {figure(c.source)}
                    </div>
                  </>
                );
                return (
                  <li key={c.id} className="min-w-0">
                    {c.onOpen ? (
                      <button
                        type="button"
                        onClick={c.onOpen}
                        className={cn(
                          FOCUS,
                          "w-full min-w-0 rounded-[10px] border border-border bg-card px-2.5 py-2.5 text-left transition-shadow hover:border-border-strong hover:shadow-md",
                        )}
                      >
                        {body}
                      </button>
                    ) : (
                      <div
                        title="Not wired to a deal record yet."
                        className="min-w-0 rounded-[10px] border border-border bg-card px-2.5 py-2.5"
                      >
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}

              {!ln.cards.length && (
                <li className="px-1 py-3 text-center text-[10px] leading-relaxed text-muted-foreground">
                  {ln.emptyNote ?? "No deals in this stage."}
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The three surfaces above are the file's real exports and are imported by name. A default is
 * provided only because every surface file in this directory carries one; `PipelineBoard` is
 * the block the panel is built around.
 */
export default PipelineBoard;
