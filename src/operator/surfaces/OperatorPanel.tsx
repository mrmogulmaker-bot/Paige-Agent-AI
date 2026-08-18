import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * OperatorPanel — Claude Design's generic "panel" surface, as a typed React component.
 *
 * Ported from the CD pack's `isPanel` block (`Super Admin Shell.dc.html` lines 656–1868). That
 * one block renders MOST of the operator console's 78 sub-tabs: CD drives it from a `panel`
 * object (`pnEyebrow` · `pnTitle` · `pnSub` · `pnBanner` · `pnChip` · `pnOutCta` · `pnRailCta`
 * · `pnCta` · `pnAnchor` · `pnGroups` · `pnKpis` · `pnBlocks` · `pnActions` · `pnRead`) and
 * switches each block through an `sc-if` on `b.is<Layout>`. This component is the same engine:
 * one layout, a typed spec in, the body chosen by a discriminated union.
 *
 * WHAT CAME ACROSS AND WHAT DELIBERATELY DID NOT
 * ----------------------------------------------
 * • GEOMETRY is CD's, to the pixel — the 9px/.15em eyebrow, the 17px/-0.02em title, the 19px
 *   banner badge, the 1.5px/13px block card, the 290px rail, every padding and radius in the
 *   source. Arbitrary Tailwind values carry the odd sizes.
 * • COLOUR is tokens only. CD's hexes ARE the `.operator-console` palette in `src/index.css`
 *   (#FBFAF6 → --card, #DCD5C6 → --border, #6E6A61 → --muted-foreground, #C8A02E → --cd-gold),
 *   so every hex maps rather than pastes. CD's three status inks (#2A6B4C green, #6E5514 amber,
 *   #9F3A2A red) map to --success / --gold-dark / --destructive, and its indigo (#4A3FA0) to
 *   --primary. Zero hex at the call site.
 * • ELEMENTS are real. CD's panel is div+onClick throughout; here a CTA is a <button> or a
 *   <Link>, a group filter is a <button aria-pressed>, and the anchor/pager rows are lists.
 * • DATA IS NEVER INVENTED (§13). CD's panel object is full of mock figures — "$4,290 MRR",
 *   "94% health". None of them ship. Every number this component renders arrives through
 *   `spec`, a KPI whose value is `null` renders "—", and a surface with no data source yet
 *   carries the `notWired` body, which SAYS it is not connected instead of drawing a
 *   plausible-looking empty dashboard. That is CD's own posture too — the pack's `pnBanner`
 *   reads "No platform substrate exists yet — every figure on this surface is a stand-in."
 * • A CTA with neither `to` nor `onClick` renders DISABLED, for the same reason: a button that
 *   silently does nothing is a lie about what is built.
 *
 * CD block layouts covered here (the generic ones — the engine's job):
 *   isRows · isFields · isBars · isFeed · isCards · isTable · isRank · isHeat · isDonut ·
 *   isStacked · isGauge · isEscList · isDepList · isSetGroups · isScGrid · isRunLine ·
 *   isSteppers · isOverrides · isProvLanes — plus `notWired`, which is ours.
 * CD block layouts NOT covered here, by design: the bespoke single-tab surfaces that are their
 * own component, not a panel body — isMkStore (Marketplace Discover), isMkReview, isCalMonth,
 * isPipeBoard, isStageBoard, isPipeHead, isBench (Paige Sandbox), isSupThread, isCompose,
 * isIntGrid, isWeekGrid, isBufferDiagram, isSocialGrid, isSocialQueue, isArea. Each lands in
 * its own slice; none of them is silently faked here (§13).
 */

/* ══ tone ═══════════════════════════════════════════════════════════════════════════════ */

/**
 * CD's four status inks, as tokens. `neutral` is the resting state; `accent` is CD's indigo,
 * which it uses for "this is Paige speaking" surfaces. Gold is NOT a tone — per §11 it is spent
 * only on the primary act, which is why it appears exactly once here (the gold CTA).
 */
export type PanelTone = "neutral" | "success" | "warning" | "danger" | "accent";

const TONE_INK: Record<PanelTone, string> = {
  neutral: "text-foreground",
  success: "text-[hsl(var(--success))]",
  // CD's amber ink is a DARK amber (#6E5514) — --warning itself is a bright fill and would
  // fail AA as text, so gold-dark carries amber-as-text in both themes.
  warning: "text-[hsl(var(--gold-dark))]",
  danger: "text-[hsl(var(--destructive))]",
  accent: "text-[hsl(var(--primary))]",
};

const TONE_DOT: Record<PanelTone, string> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]",
  danger: "bg-[hsl(var(--destructive))]",
  accent: "bg-[hsl(var(--primary))]",
};

const TONE_BAR: Record<PanelTone, string> = TONE_DOT;

/** CD's pill = a tinted plate with the matching ink. */
const TONE_PILL: Record<PanelTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  danger: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  accent: "bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]",
};

/** CD's left band / lane edge. */
const TONE_BAND: Record<PanelTone, string> = {
  neutral: "border-l-border-strong",
  success: "border-l-[hsl(var(--success))]",
  warning: "border-l-[hsl(var(--warning))]",
  danger: "border-l-[hsl(var(--destructive))]",
  accent: "border-l-[hsl(var(--primary))]",
};

/** A figure the platform cannot substantiate renders as CD's em-dash, never as a number (§13). */
const NOT_KNOWN = "—";

function figure(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? NOT_KNOWN : value;
}

/* ══ spec ═══════════════════════════════════════════════════════════════════════════════ */

/** A CTA. With neither `to` nor `onClick` it renders disabled — an unwired button says so. */
export interface PanelCta {
  label: string;
  /** Router destination. Takes precedence over `onClick`. */
  to?: string;
  onClick?: () => void;
  /** Hover/description text — CD hangs a `title` off most of its CTAs. */
  note?: string;
}

/** CD's `pnChip` — a resting count/state pill at the right of the title row. */
export interface PanelChip {
  label: string;
  note?: string;
}

/** CD's `pnGroups` — the group filter chips under the header. */
export interface PanelGroup {
  key: string;
  label: string;
  /** CD renders this in the mono face at 10px, 70% opacity — a count, not a sentence. */
  meta?: string;
}

/** CD's `pnKpis`. `value: null` is the honest unknown and renders "—". */
export interface PanelKpi {
  label: string;
  value: string | null;
  unit?: string;
  delta?: string;
  deltaTone?: PanelTone;
  tone?: PanelTone;
  note?: string;
}

/* ── block bodies (CD's `b.is*` discriminants) ───────────────────────────────────────── */

/** `isRows` — the workhorse list row: plate/glyph · label + pill · note · meta · value · CTA. */
export interface PanelRow {
  id: string;
  label: string;
  note?: string;
  meta?: string;
  value?: string | null;
  valueTone?: PanelTone;
  pill?: string;
  pillTone?: PanelTone;
  /** A 27px initials plate (CD ringed it with the row's band colour). */
  initials?: string;
  /** A 27px glyph plate, when there are no initials to show. */
  glyph?: string;
  band?: PanelTone;
  /** CD's `big` rows lift the label from 12px to 12.5px. */
  big?: boolean;
  cta?: string;
  to?: string;
  onClick?: () => void;
}

/** `isFields` — the read-only detail pane: a labelled value grid. */
export interface PanelField {
  id: string;
  label: string;
  value: string | null;
  dot?: PanelTone;
  /** CD shows a caret on an editable field and "⚿ managed" on a locked one. */
  caret?: boolean;
  locked?: boolean;
  onClick?: () => void;
}

/** `isBars` — label · value · tail, over a 6px track. */
export interface PanelBar {
  id: string;
  label: string;
  value: string | null;
  tail?: string;
  /** 0–1. Absent leaves the track empty rather than guessing a width. */
  fraction?: number;
  tone?: PanelTone;
}

/** `isFeed` — a dotted event list. */
export interface PanelFeedEvent {
  id: string;
  kind: string;
  kindTone?: PanelTone;
  who?: string;
  when?: string;
  what: string;
  note?: string;
  dot?: PanelTone;
}

/** `isCards` — the small stat card grid. */
export interface PanelCard {
  id: string;
  label: string;
  value: string | null;
  note?: string;
  dot?: PanelTone;
  to?: string;
  onClick?: () => void;
}

/** `isTable` — a real <table>; CD's version is nested flex divs. */
export interface PanelTableColumn {
  key: string;
  label: string;
  /** CD's `hd.w` flex basis, e.g. "2.1". */
  flex?: string;
  align?: "left" | "right";
}

export interface PanelTableRow {
  id: string;
  /** Column key → cell text. A missing/`null` cell renders "—" (§13). */
  cells: Record<string, string | null | undefined>;
  tone?: PanelTone;
}

/** `isRank` — a numbered bar chart. */
export interface PanelRankItem {
  id: string;
  label: string;
  note?: string;
  value: string | null;
  fraction?: number;
  tone?: PanelTone;
}

/** `isHeat` — a labelled cell matrix. */
export interface PanelHeatRow {
  id: string;
  label: string;
  /** One per column. `intensity` 0–1 drives the tint; `text` is what the cell prints. */
  cells: Array<{ text: string | null; intensity?: number }>;
}

/** `isDonut` / `isStacked` legends. */
export interface PanelSeries {
  id: string;
  name: string;
  value: string | null;
  /** 0–1 share of the whole. Absent means the ring/segment is not drawn. */
  fraction?: number;
  tone?: PanelTone;
}

/** `isEscList` — what she held, why, and what clears it. */
export interface PanelEscalation {
  id: string;
  what: string;
  why?: string;
  whyTone?: PanelTone;
  held?: string;
  reason?: string;
  cost?: string;
  clears?: string;
  band?: PanelTone;
  settledNote?: string;
  approveLabel?: string;
  onApprove?: () => void;
  routeLabel?: string;
  routeTo?: string;
}

/** `isDepList` — a department/lane row. */
export interface PanelDepartment {
  id: string;
  name: string;
  lane?: string;
  laneTone?: PanelTone;
  state?: string;
  carries?: string;
  fallback?: string;
  note?: string;
  dot?: PanelTone;
}

/** `isScGrid` — the Systems Check category grid. */
export interface PanelCheckCategory {
  id: string;
  name: string;
  count: string | null;
  swept?: string;
  tone?: PanelTone;
  to?: string;
  onClick?: () => void;
}

/** `isRunLine` — the automation firing timeline. */
export interface PanelRun {
  id: string;
  at: string;
  name: string;
  state: string;
  stateTone?: PanelTone;
  duration?: string | null;
  cost?: string | null;
  department?: string;
  note?: string;
  to?: string;
}

/** `isSteppers` — the −/value/+ row (CD's booking-buffer controls). */
export interface PanelStepper {
  id: string;
  label: string;
  value: string | null;
  unit?: string;
  onDecrement?: () => void;
  onIncrement?: () => void;
}

/** `isOverrides` — dated exceptions to a schedule. */
export interface PanelOverride {
  id: string;
  date: string;
  note?: string;
  state?: string;
  tone?: PanelTone;
}

/** `isProvLanes` — the two-column provisioning board. */
export interface PanelLaneItem {
  id: string;
  name: string;
  initials?: string;
  state?: string;
  stateTone?: PanelTone;
  ask?: string;
  note?: string;
  cta?: string;
  ctaTone?: "gold" | "danger";
  to?: string;
  onClick?: () => void;
  band?: PanelTone;
}

export interface PanelLane {
  id: string;
  label: string;
  count?: string;
  tone?: PanelTone;
  items: PanelLaneItem[];
  note?: string;
}

/** The body union. `kind` is the discriminant CD encodes as `b.is<Layout>`. */
export type PanelBody =
  | { kind: "notWired"; what?: string; needs?: string }
  | { kind: "rows"; rows: PanelRow[]; empty?: string }
  | { kind: "fields"; fields: PanelField[]; columns?: number }
  | { kind: "bars"; bars: PanelBar[]; empty?: string }
  | { kind: "feed"; events: PanelFeedEvent[]; empty?: string }
  | { kind: "cards"; cards: PanelCard[]; columns?: number }
  | { kind: "table"; columns: PanelTableColumn[]; rows: PanelTableRow[]; filterPlaceholder?: string; empty?: string }
  | { kind: "rank"; items: PanelRankItem[]; empty?: string }
  | { kind: "heat"; columns: string[]; rows: PanelHeatRow[] }
  | { kind: "donut"; centre: string | null; centreNote?: string; legend: PanelSeries[] }
  | { kind: "stacked"; legend: PanelSeries[]; columns: Array<{ id: string; label: string; segments: Array<{ id: string; fraction: number; tone?: PanelTone }> }> }
  | { kind: "gauge"; value: string | null; percent?: number; floor?: string; target?: string; note?: string; tone?: PanelTone }
  | { kind: "escalations"; items: PanelEscalation[]; empty?: string }
  | { kind: "departments"; items: PanelDepartment[] }
  | { kind: "groups"; groups: PanelGroup[]; activeKey?: string; onSelect?: (key: string) => void }
  | { kind: "checkGrid"; categories: PanelCheckCategory[]; columns?: number }
  | { kind: "runs"; runs: PanelRun[]; empty?: string }
  | { kind: "steppers"; steppers: PanelStepper[] }
  | { kind: "overrides"; rows: PanelOverride[]; addLabel?: string; onAdd?: () => void }
  | { kind: "lanes"; lanes: PanelLane[] };

/** One card in the body column — CD's `pnBlocks` entry. */
export interface PanelBlock {
  id: string;
  title?: string;
  sub?: string;
  action?: PanelCta;
  /** CD's `b.foot` — a muted footer strip inside the card. */
  foot?: string;
  /** CD's `b.wide` — span both columns when the body column is a grid. */
  wide?: boolean;
  body: PanelBody;
}

/** CD's right rail: her prompts, then her read. */
export interface PanelRailAction {
  id: string;
  text: string;
  cta?: PanelCta;
  tone?: PanelTone;
}

export interface PanelRail {
  actionsTitle?: string;
  actions?: PanelRailAction[];
  readTitle?: string;
  read?: string;
  askCta?: PanelCta;
}

/** The whole surface. This is what `panelSpecs.ts` returns and what the component consumes. */
export interface OperatorPanelSpec {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** CD's `pnBanner` — the "!" badge beside the title, with the warning as its tooltip. */
  banner?: string;
  chip?: PanelChip;
  /** CD's `pnOutCta` — the plain secondary. */
  secondaryCta?: PanelCta;
  /** CD's `pnCta` — the single gold act (§11: gold is spent here and nowhere else). */
  primaryCta?: PanelCta;
  /** CD's `pnAnchor` — the indigo callout strip under the header. */
  anchor?: string;
  groups?: PanelGroup[];
  kpis?: PanelKpi[];
  blocks: PanelBlock[];
  rail?: PanelRail;
}

export interface OperatorPanelProps {
  spec: OperatorPanelSpec;
  /** Which group chip reads as selected. */
  activeGroup?: string;
  onSelectGroup?: (key: string) => void;
  /** CD lays the analytics body out as two columns; every other surface is one. */
  bodyColumns?: 1 | 2;
  className?: string;
}

/* ══ shared bits ════════════════════════════════════════════════════════════════════════ */

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * CD's CTAs, as real elements. A spec that carries a label but no destination renders
 * disabled and says why — the console never ships a button that quietly does nothing.
 */
function Cta({
  cta,
  variant,
  className,
}: {
  cta: PanelCta;
  variant: "gold" | "plain" | "accent" | "link";
  className?: string;
}) {
  const base = cn(FOCUS, "whitespace-nowrap font-semibold transition-[filter,background-color,color]");
  const skin =
    variant === "gold"
      ? "rounded-[9px] bg-cd-gold px-[14px] py-2 text-[12.5px] text-[hsl(var(--accent-foreground))] hover:brightness-[1.06]"
      : variant === "accent"
        ? "rounded-[9px] border border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.06)] px-[11px] py-1.5 text-[11.5px] text-[hsl(var(--primary))]"
        : variant === "plain"
          ? "rounded-[9px] border border-border bg-card px-[11px] py-1.5 text-[11.5px] text-foreground hover:bg-muted"
          : "text-[11.5px] text-[hsl(var(--gold-dark))] hover:underline";
  const dead = !cta.to && !cta.onClick;

  if (cta.to && !dead) {
    return (
      <Link to={cta.to} title={cta.note} className={cn(base, skin, className)}>
        {cta.label}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={cta.onClick}
      disabled={dead}
      title={dead ? "Not wired to an action yet." : cta.note}
      className={cn(base, skin, dead && "cursor-not-allowed opacity-50", className)}
    >
      {cta.label}
    </button>
  );
}

/** CD's 20px-radius state pill. */
function Pill({ label, tone = "neutral" }: { label: string; tone?: PanelTone }) {
  return (
    <span
      className={cn(
        "flex-none whitespace-nowrap rounded-full px-[9px] py-[2.5px] text-[10px] font-semibold",
        TONE_PILL[tone],
      )}
    >
      {label}
    </span>
  );
}

function Dot({ tone = "neutral", size = 7 }: { tone?: PanelTone; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn("flex-none rounded-full", TONE_DOT[tone])}
    />
  );
}

/** A width the data actually supports, or zero. Never a guessed bar. */
function widthOf(fraction: number | undefined): string {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return "0%";
  return `${Math.max(0, Math.min(1, fraction)) * 100}%`;
}

/* ══ bodies ═════════════════════════════════════════════════════════════════════════════ */

/**
 * The honest stand-in. CD's own panel banner says the same thing about its mock data — this is
 * that posture made structural: a tab with no source states it plainly rather than drawing an
 * empty dashboard the operator would read as "you have no data" (§13).
 */
function NotWiredBody({ what, needs }: { what?: string; needs?: string }) {
  return (
    <div className="px-[15px] pb-[18px] pt-[6px]">
      <div className="rounded-[11px] border border-dashed border-border bg-muted/40 px-[13px] py-[14px]">
        <div className="text-[12.5px] font-semibold">
          {what ?? "This surface is not connected to a data source yet."}
        </div>
        <div className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          {needs ??
            "It has an address and a layout; nothing here is being read from the platform. Rather than " +
              "render a plausible-looking figure, it shows nothing at all until its source lands."}
        </div>
      </div>
    </div>
  );
}

function RowsBody({ rows, empty }: { rows: PanelRow[]; empty?: string }) {
  if (!rows.length) return <EmptyBody text={empty ?? "Nothing here."} />;
  return (
    <div>
      {rows.map((r) => {
        const inner = (
          <>
            {r.band && (
              <span aria-hidden className={cn("w-[3px] flex-none self-stretch rounded-sm", TONE_BAR[r.band])} />
            )}
            {r.initials && (
              <span
                className={cn(
                  "grid h-[27px] w-[27px] flex-none place-items-center rounded-[9px] bg-muted text-[10px] font-bold text-foreground/75",
                  r.band && "ring-2 ring-inset",
                  r.band === "success" && "ring-[hsl(var(--success))]",
                  r.band === "warning" && "ring-[hsl(var(--warning))]",
                  r.band === "danger" && "ring-[hsl(var(--destructive))]",
                  r.band === "accent" && "ring-[hsl(var(--primary))]",
                )}
              >
                {r.initials}
              </span>
            )}
            {!r.initials && r.glyph && (
              <span
                aria-hidden
                className="grid h-[27px] w-[27px] flex-none place-items-center rounded-[9px] bg-[hsl(var(--primary)/0.10)] text-[11px] text-[hsl(var(--primary))]"
              >
                {r.glyph}
              </span>
            )}
            <span className="min-w-[70px] flex-1 overflow-hidden">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "truncate font-semibold",
                    r.big ? "text-[12.5px]" : "text-[12px]",
                  )}
                >
                  {r.label}
                </span>
                {r.pill && <Pill label={r.pill} tone={r.pillTone} />}
              </span>
              {r.note && (
                <span className="mt-0.5 block truncate text-[10.5px] leading-[1.4] text-muted-foreground">
                  {r.note}
                </span>
              )}
            </span>
            {r.meta && (
              <span className="flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                {r.meta}
              </span>
            )}
            {r.value !== undefined && (
              <span
                className={cn(
                  "flex-none whitespace-nowrap text-[13px] font-bold tabular-nums",
                  TONE_INK[r.valueTone ?? "neutral"],
                )}
              >
                {figure(r.value)}
              </span>
            )}
            {r.cta && (
              <span className="flex-none whitespace-nowrap rounded-lg border border-border bg-card px-[11px] py-[5px] text-[11px] font-semibold">
                {r.cta}
              </span>
            )}
          </>
        );

        const shell = "flex min-w-0 items-center gap-[11px] border-t border-border/60 px-[15px] py-[9px] text-left";

        if (r.to) {
          return (
            <Link key={r.id} to={r.to} className={cn(shell, "transition-colors hover:bg-muted/40", FOCUS)}>
              {inner}
            </Link>
          );
        }
        if (r.onClick) {
          return (
            <button
              key={r.id}
              type="button"
              onClick={r.onClick}
              className={cn(shell, "w-full transition-colors hover:bg-muted/40", FOCUS)}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={r.id} className={shell}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function FieldsBody({ fields, columns = 2 }: { fields: PanelField[]; columns?: number }) {
  return (
    <dl
      className="grid gap-x-[18px] gap-y-[11px] px-[15px] pb-[14px]"
      style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
    >
      {fields.map((f) => {
        const inner = (
          <>
            {f.dot && <Dot tone={f.dot} />}
            <span className={cn("min-w-0 truncate text-[12.5px]", f.locked ? "text-muted-foreground" : "text-foreground")}>
              {figure(f.value)}
            </span>
            {f.caret && !f.locked && (
              <span aria-hidden className="ml-auto flex-none text-[10px] text-muted-foreground">▾</span>
            )}
            {f.locked && (
              <span className="ml-auto flex-none whitespace-nowrap text-[10px] text-muted-foreground">
                ⚿ managed
              </span>
            )}
          </>
        );
        return (
          <div key={f.id} className="min-w-0">
            <dt className="text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">{f.label}</dt>
            <dd className="mt-[5px]">
              {f.onClick && !f.locked ? (
                <button
                  type="button"
                  onClick={f.onClick}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-[9px] rounded-[10px] border border-border bg-card px-[11px] py-[9px] text-left transition-colors hover:border-border-strong",
                    FOCUS,
                  )}
                >
                  {inner}
                </button>
              ) : (
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-[9px] rounded-[10px] border px-[11px] py-[9px]",
                    f.locked ? "border-border/60 bg-muted/50" : "border-border bg-card",
                  )}
                >
                  {inner}
                </div>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function BarsBody({ bars, empty }: { bars: PanelBar[]; empty?: string }) {
  if (!bars.length) return <EmptyBody text={empty ?? "Nothing to measure yet."} />;
  return (
    <div className="flex flex-col gap-[9px] px-[15px] pb-[14px]">
      {bars.map((b) => (
        <div key={b.id} className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-[9px]">
            <span className="min-w-0 truncate text-[11.5px] font-semibold">{b.label}</span>
            <span className="ml-auto flex-none whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
              {figure(b.value)}
            </span>
            {b.tail && <span className="flex-none whitespace-nowrap text-[10px] text-muted-foreground">{b.tail}</span>}
          </div>
          <div className="mt-[5px] h-1.5 overflow-hidden rounded-[3px] bg-muted">
            <div
              className={cn("h-full rounded-[3px]", TONE_BAR[b.tone ?? "accent"])}
              style={{ width: widthOf(b.fraction) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedBody({ events, empty }: { events: PanelFeedEvent[]; empty?: string }) {
  if (!events.length) return <EmptyBody text={empty ?? "Nothing has happened here yet."} />;
  return (
    <ul>
      {events.map((e) => (
        <li key={e.id} className="flex min-w-0 items-start gap-[10px] border-t border-border/60 px-[15px] py-[9px]">
          <span className="mt-[5px]">
            <Dot tone={e.dot} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
              <Pill label={e.kind} tone={e.kindTone} />
              {e.who && <span className="min-w-0 truncate text-[11px] text-muted-foreground">{e.who}</span>}
              {e.when && (
                <span className="ml-auto flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                  {e.when}
                </span>
              )}
            </div>
            <div className="mt-1 text-[12.5px] font-semibold leading-[1.35]">{e.what}</div>
            {e.note && <div className="mt-[3px] text-[11px] leading-[1.45] text-muted-foreground">{e.note}</div>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CardsBody({ cards, columns = 3 }: { cards: PanelCard[]; columns?: number }) {
  return (
    <div
      className="grid gap-2.5 px-[15px] pb-[14px]"
      style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
    >
      {cards.map((c) => {
        const inner = (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <Dot tone={c.dot} size={8} />
              <span className="min-w-0 truncate text-[12px] font-semibold">{c.label}</span>
            </span>
            <span className="mt-1.5 block whitespace-nowrap text-[17px] font-bold tabular-nums tracking-[-0.02em]">
              {figure(c.value)}
            </span>
            {c.note && (
              <span className="mt-[3px] block text-[10.5px] leading-[1.4] text-muted-foreground">{c.note}</span>
            )}
          </>
        );
        const shell = "min-w-0 rounded-[11px] border border-border/70 bg-muted/40 px-[13px] py-[11px] text-left";
        if (c.to) {
          return (
            <Link key={c.id} to={c.to} className={cn(shell, "transition-colors hover:border-border-strong hover:bg-card", FOCUS)}>
              {inner}
            </Link>
          );
        }
        if (c.onClick) {
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onClick}
              className={cn(shell, "transition-colors hover:border-border-strong hover:bg-card", FOCUS)}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={c.id} className={shell}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function TableBody({
  columns,
  rows,
  filterPlaceholder,
  empty,
}: {
  columns: PanelTableColumn[];
  rows: PanelTableRow[];
  filterPlaceholder?: string;
  empty?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-[15px] pb-[14px]">
      {filterPlaceholder && (
        <div className="flex min-w-0 items-center gap-2 rounded-[9px] border border-border bg-muted/40 px-[10px] py-1.5">
          <span aria-hidden className="flex-none text-[10px] text-muted-foreground">⌕</span>
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">{filterPlaceholder}</span>
        </div>
      )}
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.flex ? `${(Number(c.flex) || 1) * 10}%` : undefined }}
                  className={cn(
                    "truncate px-2 pb-1 text-[9px] font-bold tracking-[0.1em] text-muted-foreground",
                    c.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-2 py-6 text-center text-[11.5px] text-muted-foreground">
                  {empty ?? "Nothing to show."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "truncate rounded-[5px] px-2 py-1.5 text-[11px] font-semibold tabular-nums",
                      c.align === "right" ? "text-right" : "text-left",
                      r.tone ? TONE_INK[r.tone] : "text-foreground",
                    )}
                  >
                    {figure(r.cells[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RankBody({ items, empty }: { items: PanelRankItem[]; empty?: string }) {
  if (!items.length) return <EmptyBody text={empty ?? "Nothing ranked yet."} />;
  return (
    <ol className="flex flex-col gap-[9px] px-[15px] pb-[14px]">
      {items.map((rk, i) => (
        <li key={rk.id} className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="flex-none font-mono text-[9px] tabular-nums text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 truncate text-[11.5px] font-semibold">{rk.label}</span>
            {rk.note && <span className="min-w-0 truncate text-[10px] text-muted-foreground">{rk.note}</span>}
            <span className="ml-auto flex-none text-[12px] font-bold tabular-nums">{figure(rk.value)}</span>
          </div>
          <div className="mt-[5px] h-[7px] overflow-hidden rounded-[4px] bg-muted">
            <div
              className={cn("h-full rounded-[4px]", TONE_BAR[rk.tone ?? "accent"])}
              style={{ width: widthOf(rk.fraction) }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function HeatBody({ columns, rows }: { columns: string[]; rows: PanelHeatRow[] }) {
  return (
    <div className="min-w-0 overflow-hidden px-[15px] pb-[14px]">
      <div className="flex gap-[3px] pl-[96px]">
        {columns.map((c) => (
          <span key={c} className="min-w-0 flex-1 text-center font-mono text-[8.5px] text-muted-foreground">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-1 flex flex-col gap-[3px]">
        {rows.map((r) => (
          <div key={r.id} className="flex min-w-0 items-center gap-[3px]">
            <span className="w-[93px] flex-none truncate text-[10.5px]">{r.label}</span>
            {r.cells.map((cell, i) => (
              <span
                key={`${r.id}-${columns[i] ?? i}`}
                style={{
                  backgroundColor:
                    typeof cell.intensity === "number"
                      ? `hsl(var(--primary) / ${Math.max(0, Math.min(1, cell.intensity)) * 0.7 + 0.05})`
                      : undefined,
                }}
                className={cn(
                  "grid h-[26px] min-w-0 flex-1 place-items-center rounded-[5px] font-mono text-[9px] font-semibold tabular-nums",
                  typeof cell.intensity === "number" ? "text-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {figure(cell.text)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutBody({
  centre,
  centreNote,
  legend,
}: {
  centre: string | null;
  centreNote?: string;
  legend: PanelSeries[];
}) {
  // CD paints the ring with a conic gradient. Only the slices whose share the data actually
  // supports are drawn; the remainder stays on the muted track (§13 — never a filled guess).
  let cursor = 0;
  const stops = legend
    .filter((s) => typeof s.fraction === "number")
    .map((s) => {
      const start = cursor;
      cursor += Math.max(0, Math.min(1, s.fraction ?? 0));
      const varName =
        s.tone === "success"
          ? "--success"
          : s.tone === "warning"
            ? "--warning"
            : s.tone === "danger"
              ? "--destructive"
              : "--primary";
      return `hsl(var(${varName})) ${start * 360}deg ${Math.min(cursor, 1) * 360}deg`;
    });
  const ring =
    stops.length > 0
      ? `conic-gradient(${stops.join(",")}, hsl(var(--muted)) ${Math.min(cursor, 1) * 360}deg 360deg)`
      : undefined;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-[18px] px-[15px] pb-[14px]">
      <div
        aria-hidden
        style={{ background: ring }}
        className={cn("grid h-[120px] w-[120px] flex-none place-items-center rounded-full", !ring && "bg-muted")}
      >
        <div className="flex h-[78px] w-[78px] flex-col items-center justify-center rounded-full bg-card">
          <div className="text-[17px] font-bold tabular-nums tracking-[-0.02em]">{figure(centre)}</div>
          {centreNote && <div className="mt-px text-[8.5px] text-muted-foreground">{centreNote}</div>}
        </div>
      </div>
      <ul className="flex min-w-[150px] flex-1 flex-col gap-[7px]">
        {legend.map((s) => (
          <li key={s.id} className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={cn("h-2 w-2 flex-none rounded-sm", TONE_BAR[s.tone ?? "accent"])} />
            <span className="min-w-0 truncate text-[11.5px] font-semibold">{s.name}</span>
            <span className="ml-auto flex-none font-mono text-[10.5px] tabular-nums text-muted-foreground">
              {typeof s.fraction === "number" ? `${Math.round(s.fraction * 100)}%` : NOT_KNOWN}
            </span>
            <span className="flex-none text-[11.5px] font-semibold tabular-nums">{figure(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StackedBody({
  legend,
  columns,
}: {
  legend: PanelSeries[];
  columns: Array<{ id: string; label: string; segments: Array<{ id: string; fraction: number; tone?: PanelTone }> }>;
}) {
  return (
    <div className="min-w-0 px-[15px] pb-[14px]">
      <div className="flex flex-wrap items-center gap-3">
        {legend.map((l) => (
          <div key={l.id} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 flex-none rounded-sm", TONE_BAR[l.tone ?? "accent"])} />
            <span className="whitespace-nowrap text-[10px]">{l.name}</span>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex h-[128px] min-w-0 items-end gap-1.5">
        {columns.map((col) => {
          const total = col.segments.reduce((n, s) => n + Math.max(0, s.fraction), 0);
          return (
            <div key={col.id} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div style={{ height: `${Math.max(0, 1 - Math.min(1, total)) * 100}%` }} className="flex-none" />
              {col.segments.map((s) => (
                <div
                  key={s.id}
                  style={{ height: `${Math.max(0, Math.min(1, s.fraction)) * 100}%` }}
                  className={cn("flex-none", TONE_BAR[s.tone ?? "accent"])}
                />
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-[5px] flex min-w-0 gap-1.5">
        {columns.map((col) => (
          <div key={col.id} className="min-w-0 flex-1 text-center font-mono text-[8.5px] text-muted-foreground">
            {col.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function GaugeBody({
  value,
  percent,
  floor,
  target,
  note,
  tone = "accent",
}: {
  value: string | null;
  percent?: number;
  floor?: string;
  target?: string;
  note?: string;
  tone?: PanelTone;
}) {
  // CD's 120×70 half-dial. The fill arc is drawn with a dash offset so the geometry is exact
  // and an unknown percentage simply leaves the track empty rather than inventing a needle.
  const RADIUS = 44;
  const LENGTH = Math.PI * RADIUS;
  const pct = typeof percent === "number" ? Math.max(0, Math.min(1, percent)) : undefined;
  const angle = pct === undefined ? undefined : Math.PI * (1 - pct);
  const stroke =
    tone === "success"
      ? "hsl(var(--success))"
      : tone === "warning"
        ? "hsl(var(--warning))"
        : tone === "danger"
          ? "hsl(var(--destructive))"
          : "hsl(var(--primary))";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-4 px-[15px] pb-[14px]">
      <div className="flex-none">
        <svg viewBox="0 0 120 70" role="img" aria-label={`${figure(value)} of target`} className="block h-[88px] w-[150px]">
          <path
            d={`M16 56 A ${RADIUS} ${RADIUS} 0 0 1 104 56`}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {pct !== undefined && (
            <path
              d={`M16 56 A ${RADIUS} ${RADIUS} 0 0 1 104 56`}
              fill="none"
              stroke={stroke}
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={`${LENGTH} ${LENGTH}`}
              strokeDashoffset={LENGTH * (1 - pct)}
            />
          )}
          {angle !== undefined && (
            <line
              x1="60"
              y1="56"
              x2={60 + Math.cos(angle) * (RADIUS - 8)}
              y2={56 - Math.sin(angle) * (RADIUS - 8)}
              stroke="hsl(var(--foreground))"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          )}
          <circle cx="60" cy="56" r="3.6" fill="hsl(var(--foreground))" />
        </svg>
        <div className="-mt-1 flex justify-between">
          <span className="font-mono text-[8.5px] text-muted-foreground">{floor ?? NOT_KNOWN}</span>
          <span className="font-mono text-[8.5px] text-muted-foreground">{target ?? NOT_KNOWN}</span>
        </div>
      </div>
      <div className="min-w-[110px] flex-1">
        <div className="text-[24px] font-bold tabular-nums tracking-[-0.02em]">{figure(value)}</div>
        <div className="mt-1 flex items-center gap-[7px]">
          <span className={cn("rounded-full px-[9px] py-0.5 text-[10px] font-bold", TONE_PILL[tone])}>
            {pct === undefined ? NOT_KNOWN : `${Math.round(pct * 100)}%`}
          </span>
          <span className="text-[10.5px] text-muted-foreground">of target</span>
        </div>
        {note && <div className="mt-[7px] text-[10.5px] leading-[1.45] text-muted-foreground">{note}</div>}
      </div>
    </div>
  );
}

function EscalationsBody({ items, empty }: { items: PanelEscalation[]; empty?: string }) {
  if (!items.length) return <EmptyBody text={empty ?? "Nothing is being held."} />;
  return (
    <div className="flex min-w-0 flex-col gap-2 px-[14px] pb-[13px]">
      {items.map((e) => (
        <div
          key={e.id}
          className={cn(
            "min-w-0 rounded-[11px] border border-border/70 border-l-[3px] bg-card px-[13px] py-[11px]",
            TONE_BAND[e.band ?? "warning"],
          )}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 text-[12.5px] font-semibold">{e.what}</span>
            {e.why && <Pill label={e.why} tone={e.whyTone ?? "warning"} />}
            {e.held && (
              <span className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground">{e.held}</span>
            )}
          </div>
          {e.reason && <p className="mt-[5px] text-[11.5px] leading-[1.5] text-muted-foreground">{e.reason}</p>}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2.5">
            {e.cost && <span className="min-w-0 text-[11px] text-[hsl(var(--destructive))]">{e.cost}</span>}
            {e.clears && (
              <span title={e.clears} className="flex-none text-[10.5px] text-muted-foreground">
                Clears when ⌄
              </span>
            )}
          </div>
          {e.settledNote ? (
            <div className="mt-[9px] flex min-w-0 items-center gap-[9px] rounded-[9px] border border-border/70 bg-[hsl(var(--success)/0.10)] px-[11px] py-2">
              <span aria-hidden className="flex-none text-[10px] text-[hsl(var(--success))]">✓</span>
              <span className="min-w-0 text-[11px] leading-[1.45] text-[hsl(var(--success))]">{e.settledNote}</span>
            </div>
          ) : (
            (e.approveLabel || e.routeLabel) && (
              <div className="mt-[9px] flex flex-wrap items-center gap-2">
                {e.approveLabel && (
                  <Cta cta={{ label: e.approveLabel, onClick: e.onApprove }} variant="gold" className="!px-[13px] !py-[7px] !text-[11.5px]" />
                )}
                {e.routeLabel && (
                  <span className="ml-auto flex-none">
                    <Cta cta={{ label: `${e.routeLabel} →`, to: e.routeTo }} variant="link" className="!text-[10.5px]" />
                  </span>
                )}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}

function DepartmentsBody({ items }: { items: PanelDepartment[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-[7px] px-[14px] pb-[13px]">
      {items.map((d) => (
        <div key={d.id} className="min-w-0 rounded-[11px] border border-border/70 bg-muted/30 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-[9px]">
            <Dot tone={d.dot} />
            <span className="flex-none text-[12.5px] font-semibold">{d.name}</span>
            {d.lane && <Pill label={d.lane} tone={d.laneTone} />}
            {d.state && <span className="ml-auto flex-none text-[10px] text-muted-foreground">{d.state}</span>}
          </div>
          {(d.carries || d.fallback) && (
            <div className="mt-1.5 flex min-w-0 flex-wrap gap-3.5">
              {d.carries && <span className="min-w-0 text-[10.5px] text-muted-foreground">Carries · {d.carries}</span>}
              {d.fallback && (
                <span className="min-w-0 text-[10.5px] text-muted-foreground">Without it · {d.fallback}</span>
              )}
            </div>
          )}
          {d.note && <div className="mt-1 text-[10.5px] leading-[1.45] text-muted-foreground">{d.note}</div>}
        </div>
      ))}
    </div>
  );
}

function GroupsBody({
  groups,
  activeKey,
  onSelect,
}: {
  groups: PanelGroup[];
  activeKey?: string;
  onSelect?: (key: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-[7px] px-[15px] pb-[14px]">
      {groups.map((g) => (
        <GroupChip key={g.key} group={g} active={g.key === activeKey} onSelect={onSelect} />
      ))}
    </div>
  );
}

function CheckGridBody({ categories, columns = 3 }: { categories: PanelCheckCategory[]; columns?: number }) {
  return (
    <div
      className="grid gap-x-2.5 gap-y-[7px] px-[14px] pb-[12px] pt-2.5"
      style={{ gridTemplateColumns: `repeat(${columns},minmax(0,1fr))` }}
    >
      {categories.map((c) => {
        const inner = (
          <>
            <span className="flex min-w-0 items-center gap-[7px]">
              <Dot tone={c.tone} />
              <span className="min-w-0 truncate text-[11.5px] leading-[1.35]">{c.name}</span>
            </span>
            <span className="flex min-w-0 items-baseline gap-[7px] pl-[14px]">
              <span className={cn("flex-none font-mono text-[9px] tabular-nums", TONE_INK[c.tone ?? "neutral"])}>
                {figure(c.count)}
              </span>
              {c.swept && <span className="min-w-0 truncate text-[9.5px] text-muted-foreground">{c.swept}</span>}
            </span>
          </>
        );
        const shell =
          "flex min-w-0 flex-col justify-center gap-[3px] rounded-lg border border-border/70 bg-muted/30 px-2.5 py-[7px] text-left";
        if (c.to) {
          return (
            <Link key={c.id} to={c.to} className={cn(shell, "transition-colors hover:border-border-strong", FOCUS)}>
              {inner}
            </Link>
          );
        }
        if (c.onClick) {
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onClick}
              className={cn(shell, "transition-colors hover:border-border-strong", FOCUS)}
            >
              {inner}
            </button>
          );
        }
        return (
          <div key={c.id} className={shell}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function RunsBody({ runs, empty }: { runs: PanelRun[]; empty?: string }) {
  if (!runs.length) return <EmptyBody text={empty ?? "Nothing has fired yet."} />;
  return (
    <ol className="px-[14px] pb-[13px]">
      {runs.map((r) => {
        const inner = (
          <>
            <span className="w-[38px] flex-none pt-[9px] text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {r.at}
            </span>
            <span aria-hidden className="flex w-[22px] flex-none flex-col items-center">
              <span className="h-[9px] w-px bg-border" />
              <Dot tone={r.stateTone} size={8} />
              <span className="min-h-[12px] w-px flex-1 bg-border" />
            </span>
            <span className="min-w-0 flex-1 pb-2 pt-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-semibold">{r.name}</span>
                <Pill label={r.state} tone={r.stateTone} />
                <span className="ml-auto flex-none font-mono text-[9.5px] tabular-nums text-muted-foreground">
                  {figure(r.duration)}
                </span>
                <span className="w-[46px] flex-none text-right font-mono text-[9.5px] tabular-nums text-muted-foreground">
                  {figure(r.cost)}
                </span>
              </span>
              {(r.department || r.note) && (
                <span className="mt-0.5 block min-w-0 truncate text-[11px] text-muted-foreground">
                  {[r.department, r.note].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={r.id} className="min-w-0">
            {r.to ? (
              <Link to={r.to} className={cn("flex min-w-0 items-start transition-colors hover:bg-muted/40", FOCUS)}>
                {inner}
              </Link>
            ) : (
              <div className="flex min-w-0 items-start">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SteppersBody({ steppers }: { steppers: PanelStepper[] }) {
  return (
    <div
      className="grid min-w-0 gap-2 px-[15px] pb-[14px]"
      style={{ gridTemplateColumns: `repeat(${Math.min(5, Math.max(1, steppers.length))},minmax(0,1fr))` }}
    >
      {steppers.map((s) => (
        <div key={s.id} className="min-w-0 rounded-[11px] border border-border/70 bg-muted/30 px-2.5 py-[9px]">
          <div className="truncate text-[8.5px] font-semibold tracking-[0.11em] text-muted-foreground">{s.label}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={s.onDecrement}
              disabled={!s.onDecrement}
              aria-label={`Decrease ${s.label}`}
              className={cn(
                "grid h-[18px] w-[18px] flex-none place-items-center rounded-md border border-border bg-card text-[11px] text-muted-foreground",
                !s.onDecrement && "cursor-not-allowed opacity-50",
                FOCUS,
              )}
            >
              −
            </button>
            <span className="text-[16px] font-bold tabular-nums tracking-[-0.02em]">{figure(s.value)}</span>
            <button
              type="button"
              onClick={s.onIncrement}
              disabled={!s.onIncrement}
              aria-label={`Increase ${s.label}`}
              className={cn(
                "grid h-[18px] w-[18px] flex-none place-items-center rounded-md border border-border bg-card text-[11px] text-muted-foreground",
                !s.onIncrement && "cursor-not-allowed opacity-50",
                FOCUS,
              )}
            >
              +
            </button>
          </div>
          {s.unit && <div className="mt-[3px] text-[9.5px] text-muted-foreground">{s.unit}</div>}
        </div>
      ))}
    </div>
  );
}

function OverridesBody({
  rows,
  addLabel,
  onAdd,
}: {
  rows: PanelOverride[];
  addLabel?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-[15px] pb-[14px]">
      {rows.map((o) => (
        <div
          key={o.id}
          className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-border/70 bg-card px-[11px] py-2"
        >
          <span className="flex-none font-mono text-[11px] tabular-nums">{o.date}</span>
          {o.note && <span className="min-w-0 truncate text-[11.5px] text-muted-foreground">{o.note}</span>}
          {o.state && (
            <span className="ml-auto">
              <Pill label={o.state} tone={o.tone} />
            </span>
          )}
        </div>
      ))}
      {addLabel && (
        <button
          type="button"
          onClick={onAdd}
          disabled={!onAdd}
          className={cn(
            "mt-0.5 inline-flex self-start rounded-[9px] border border-dashed border-border px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--gold-dark))]",
            !onAdd && "cursor-not-allowed opacity-50",
            FOCUS,
          )}
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

function LanesBody({ lanes }: { lanes: PanelLane[] }) {
  return (
    <div className="grid min-w-0 gap-[11px] px-[14px] pb-[13px] md:grid-cols-2">
      {lanes.map((ln) => (
        <section
          key={ln.id}
          className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border/70 bg-muted/25"
        >
          <h4 className="flex items-center gap-2 border-b border-border/70 px-[13px] pb-2 pt-2.5">
            <Dot tone={ln.tone} />
            <span className={cn("min-w-0 truncate text-[12px] font-semibold", TONE_INK[ln.tone ?? "neutral"])}>
              {ln.label}
            </span>
            <span className="ml-auto flex-none font-mono text-[11px] tabular-nums text-muted-foreground">
              {figure(ln.count)}
            </span>
          </h4>
          <div className="flex min-w-0 flex-col gap-2 px-[11px] pb-[11px] pt-2.5">
            {ln.items.length === 0 && (
              <p className="py-2 text-[11px] text-muted-foreground">Nothing in this lane.</p>
            )}
            {ln.items.map((it) => {
              const inner = (
                <>
                  <span className="flex min-w-0 items-center gap-2">
                    {it.initials && (
                      <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] bg-muted text-[8.5px] font-bold text-foreground/75">
                        {it.initials}
                      </span>
                    )}
                    <span className="min-w-0 truncate text-[12px] font-semibold">{it.name}</span>
                    {it.state && (
                      <span className="ml-auto">
                        <Pill label={it.state} tone={it.stateTone} />
                      </span>
                    )}
                  </span>
                  {it.ask && <span className="mt-[5px] block truncate text-[10.5px] leading-[1.4] text-muted-foreground">{it.ask}</span>}
                  {it.note && <span className="mt-[3px] block truncate text-[10px] leading-[1.4] text-muted-foreground">{it.note}</span>}
                  {it.cta && (
                    <span
                      className={cn(
                        "mt-2 inline-flex rounded-lg px-[11px] py-[5px] text-[10.5px] font-semibold",
                        it.ctaTone === "danger"
                          ? "border border-border bg-card text-[hsl(var(--destructive))]"
                          : "bg-cd-gold text-[hsl(var(--accent-foreground))]",
                      )}
                    >
                      {it.cta}
                    </span>
                  )}
                </>
              );
              const shell = cn(
                "block min-w-0 rounded-[11px] border border-border/70 border-l-[3px] bg-card px-[11px] py-[9px] text-left",
                TONE_BAND[it.band ?? "neutral"],
              );
              if (it.to) {
                return (
                  <Link key={it.id} to={it.to} className={cn(shell, "transition-shadow hover:shadow-md", FOCUS)}>
                    {inner}
                  </Link>
                );
              }
              if (it.onClick) {
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={it.onClick}
                    className={cn(shell, "w-full transition-shadow hover:shadow-md", FOCUS)}
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <div key={it.id} className={shell}>
                  {inner}
                </div>
              );
            })}
            {ln.note && <p className="truncate text-[10px] leading-[1.4] text-muted-foreground">{ln.note}</p>}
          </div>
        </section>
      ))}
    </div>
  );
}

function EmptyBody({ text }: { text: string }) {
  return <div className="px-[15px] pb-[16px] pt-1 text-[11.5px] leading-[1.5] text-muted-foreground">{text}</div>;
}

function Body({ body, activeGroup, onSelectGroup }: { body: PanelBody; activeGroup?: string; onSelectGroup?: (k: string) => void }) {
  switch (body.kind) {
    case "notWired":
      return <NotWiredBody what={body.what} needs={body.needs} />;
    case "rows":
      return <RowsBody rows={body.rows} empty={body.empty} />;
    case "fields":
      return <FieldsBody fields={body.fields} columns={body.columns} />;
    case "bars":
      return <BarsBody bars={body.bars} empty={body.empty} />;
    case "feed":
      return <FeedBody events={body.events} empty={body.empty} />;
    case "cards":
      return <CardsBody cards={body.cards} columns={body.columns} />;
    case "table":
      return (
        <TableBody
          columns={body.columns}
          rows={body.rows}
          filterPlaceholder={body.filterPlaceholder}
          empty={body.empty}
        />
      );
    case "rank":
      return <RankBody items={body.items} empty={body.empty} />;
    case "heat":
      return <HeatBody columns={body.columns} rows={body.rows} />;
    case "donut":
      return <DonutBody centre={body.centre} centreNote={body.centreNote} legend={body.legend} />;
    case "stacked":
      return <StackedBody legend={body.legend} columns={body.columns} />;
    case "gauge":
      return (
        <GaugeBody
          value={body.value}
          percent={body.percent}
          floor={body.floor}
          target={body.target}
          note={body.note}
          tone={body.tone}
        />
      );
    case "escalations":
      return <EscalationsBody items={body.items} empty={body.empty} />;
    case "departments":
      return <DepartmentsBody items={body.items} />;
    case "groups":
      return (
        <GroupsBody
          groups={body.groups}
          activeKey={body.activeKey ?? activeGroup}
          onSelect={body.onSelect ?? onSelectGroup}
        />
      );
    case "checkGrid":
      return <CheckGridBody categories={body.categories} columns={body.columns} />;
    case "runs":
      return <RunsBody runs={body.runs} empty={body.empty} />;
    case "steppers":
      return <SteppersBody steppers={body.steppers} />;
    case "overrides":
      return <OverridesBody rows={body.rows} addLabel={body.addLabel} onAdd={body.onAdd} />;
    case "lanes":
      return <LanesBody lanes={body.lanes} />;
  }
}

/* ══ chrome ═════════════════════════════════════════════════════════════════════════════ */

function GroupChip({
  group,
  active,
  onSelect,
}: {
  group: PanelGroup;
  active: boolean;
  onSelect?: (key: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect ? () => onSelect(group.key) : undefined}
      disabled={!onSelect}
      className={cn(
        "flex flex-none items-center gap-[7px] whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
        active
          ? "border-border-strong bg-muted text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        !onSelect && "cursor-default",
        FOCUS,
      )}
    >
      {group.label}
      {group.meta && <span className="font-mono text-[10px] tabular-nums opacity-70">{group.meta}</span>}
    </button>
  );
}

function Kpi({ kpi }: { kpi: PanelKpi }) {
  return (
    <div
      title={kpi.note}
      className="min-w-0 rounded-xl border-[1.5px] border-border bg-card px-[14px] py-3 shadow-sm"
    >
      <div className="truncate text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">{kpi.label}</div>
      <div className="mt-1 flex min-w-0 items-baseline gap-[7px]">
        <span
          className={cn(
            "whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.02em]",
            TONE_INK[kpi.tone ?? "neutral"],
          )}
        >
          {figure(kpi.value)}
        </span>
        {kpi.delta && (
          <span className={cn("flex-none whitespace-nowrap text-[10px] font-bold", TONE_INK[kpi.deltaTone ?? "neutral"])}>
            {kpi.delta}
          </span>
        )}
      </div>
      {kpi.unit && (
        <div className="mt-[3px] truncate text-[10.5px] leading-[1.35] text-muted-foreground">{kpi.unit}</div>
      )}
    </div>
  );
}

function Block({
  block,
  activeGroup,
  onSelectGroup,
}: {
  block: PanelBlock;
  activeGroup?: string;
  onSelectGroup?: (k: string) => void;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[13px] border-[1.5px] border-border bg-card shadow-sm",
        block.wide && "md:col-span-full",
      )}
    >
      {(block.title || block.sub || block.action) && (
        <header className="min-w-0 px-[15px] pb-[9px] pt-3">
          <div className="flex min-w-0 items-center gap-[9px]">
            {block.title && <h3 className="min-w-0 truncate text-[14px] font-semibold">{block.title}</h3>}
            {block.action && (
              <span className="ml-auto flex-none">
                <Cta cta={block.action} variant="link" />
              </span>
            )}
          </div>
          {block.sub && <p className="mt-[3px] truncate text-[11.5px] text-muted-foreground">{block.sub}</p>}
        </header>
      )}
      <Body body={block.body} activeGroup={activeGroup} onSelectGroup={onSelectGroup} />
      {block.foot && (
        <footer className="border-t border-border/70 bg-muted/30 px-[15px] py-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          {block.foot}
        </footer>
      )}
    </section>
  );
}

function Rail({ rail }: { rail: PanelRail }) {
  const hasActions = !!rail.actions?.length;
  if (!hasActions && !rail.read) return null;
  return (
    <aside className="hidden w-[290px] flex-none flex-col gap-2.5 overflow-y-auto xl:flex">
      {hasActions && (
        <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-[14px] py-3 shadow-sm">
          <h3 className="text-[13.5px] font-semibold">{rail.actionsTitle ?? "Worth acting on"}</h3>
          <div className="mt-[9px] flex flex-col gap-[9px]">
            {rail.actions?.map((a) => (
              <div
                key={a.id}
                className={cn(
                  "rounded-[10px] border border-border/70 border-l-[3px] bg-muted/40 px-[11px] py-[9px]",
                  TONE_BAND[a.tone ?? "warning"],
                )}
              >
                <p className="text-[11.5px] leading-[1.5]">{a.text}</p>
                {a.cta && (
                  <span className="mt-2 inline-flex">
                    <Cta cta={a.cta} variant="gold" className="!px-[11px] !py-1.5 !text-[11px]" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {rail.read && (
        <div className="flex-none rounded-[13px] border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.05)] px-[14px] py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-[12px] text-[hsl(var(--primary))]">✦</span>
            <h3 className="text-[12.5px] font-semibold text-[hsl(var(--primary))]">{rail.readTitle ?? "Her read"}</h3>
          </div>
          <p className="mt-[7px] text-[12px] leading-[1.6]">{rail.read}</p>
          {rail.askCta && (
            <span className="mt-[9px] inline-flex">
              <Cta cta={rail.askCta} variant="accent" />
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

/* ══ the panel ══════════════════════════════════════════════════════════════════════════ */

export default function OperatorPanel({
  spec,
  activeGroup,
  onSelectGroup,
  bodyColumns = 1,
  className,
}: OperatorPanelProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 gap-3.5", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* ── title row (CD 656–686) ─────────────────────────────────────── */}
        <div className="flex min-w-0 flex-none items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-[9px]">
              <span className="flex-none text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">
                {spec.eyebrow}
              </span>
              <h2 className="flex-none whitespace-nowrap text-[17px] font-bold tracking-[-0.02em]">{spec.title}</h2>
              {spec.banner && (
                <span
                  title={spec.banner}
                  aria-label={spec.banner}
                  className="grid h-[19px] w-[19px] flex-none cursor-help place-items-center rounded-md border border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.16)] text-[11px] font-bold text-[hsl(var(--gold-dark))]"
                >
                  !
                </span>
              )}
            </div>
            <p title={spec.subtitle} className="mt-[3px] min-w-0 truncate text-[11.5px] text-muted-foreground">
              {spec.subtitle}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {spec.chip && (
              <span
                title={spec.chip.note}
                className="flex-none whitespace-nowrap rounded-full border border-border bg-muted px-[11px] py-[5px] text-[12px] font-semibold text-foreground"
              >
                {spec.chip.label}
              </span>
            )}
            {spec.secondaryCta && <Cta cta={spec.secondaryCta} variant="plain" />}
            {spec.primaryCta && <Cta cta={spec.primaryCta} variant="gold" />}
          </div>
        </div>

        {/* ── anchor strip (CD 688–693) ──────────────────────────────────── */}
        {spec.anchor && (
          <div className="flex min-w-0 flex-none items-center gap-[9px] rounded-[10px] border border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.05)] px-3 py-2">
            <span aria-hidden className="flex-none text-[11px] text-[hsl(var(--primary))]">⌖</span>
            <span className="min-w-0 text-[11.5px] leading-[1.45] text-[hsl(var(--primary))]">{spec.anchor}</span>
          </div>
        )}

        {/* ── group filter chips (CD 695–706) ────────────────────────────── */}
        {spec.groups && spec.groups.length > 0 && (
          <div className="flex flex-none items-center gap-[7px] overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {spec.groups.map((g) => (
              <GroupChip key={g.key} group={g} active={g.key === activeGroup} onSelect={onSelectGroup} />
            ))}
          </div>
        )}

        {/* ── KPI strip (CD 708–726) ─────────────────────────────────────── */}
        {spec.kpis && spec.kpis.length > 0 && (
          <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
            {spec.kpis.map((k) => (
              <Kpi key={k.label} kpi={k} />
            ))}
          </div>
        )}

        {/* ── the blocks (CD 728–1840) ───────────────────────────────────── */}
        <div
          className={cn(
            "min-h-0 flex-1 content-start gap-2.5 overflow-y-auto pr-0.5",
            bodyColumns === 2 ? "grid md:grid-cols-2" : "flex flex-col",
          )}
        >
          {spec.blocks.map((b) => (
            <Block key={b.id} block={b} activeGroup={activeGroup} onSelectGroup={onSelectGroup} />
          ))}
        </div>
      </div>

      {/* ── right rail (CD 1842–1866) ─────────────────────────────────────── */}
      {spec.rail && <Rail rail={spec.rail} />}
    </div>
  );
}
