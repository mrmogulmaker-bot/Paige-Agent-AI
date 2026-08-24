import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CAMPAIGNS_ABSENCE,
  DEFAULT_CAMPAIGN_SCHEMA,
  PROCESSOR,
  SALES_DEFINITION,
  SALES_FOOT,
  money,
  type CampaignSchema,
  type OfferRow,
  type SalesLine,
  type SalesTarget,
} from "@/operator/surfaces/campaigns/campaignContract";

/**
 * Campaigns · Sales — ported from `PAIGE Super Admin Shell v3.dc.html` `salesVals` (L5848–L5962) and its markup (L533–L610).
 *
 * BUILD-ORDER Layer 3b, and the third view on Layer 2's priority list: this replaces
 * `revenue/invoices` + `revenue/at-risk`. CD's line about why it had to move is the design
 * constraint the whole surface is built on — *"Sales must derive from lines, never hold its own
 * ledger"* — and the pack states it twice more, in the builder's own header (*"Every figure is a
 * sum over the lines. Nothing on this surface is typed."*) and in the foot.
 *
 * SO THERE IS NO STORED TOTAL ANYWHERE IN THIS FILE. Booked, refunded, net, in-flight, the
 * percentage against target, the by-offering table, the by-campaign table — every one is a
 * reduction over `lines`. A refund does not delete a line; it reverses it and keeps the record,
 * which is why `Refunded` reads as a negative and the row dims rather than disappearing.
 *
 * ─── THE MONEY-MOVEMENT BLOCK IS THE §38 BOUNDARY, IN CD'S WORDS ─────────────────────────────
 *
 * `P.PROCESSOR` draws the five needs a provider has to satisfy and marks which are adapter work
 * and which are Stripe Connect, then closes: *"No tenant sale is ever split. Revenue share
 * exists in the marketplace and nowhere else."* That is §38's rule stated from the design side,
 * and it agrees exactly — the provider is an adapter, and a tenant's sale never routes through
 * a split. It ports verbatim.
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * `lines` arrives empty, so every figure reduces to zero rows and reads honestly rather than
 * showing CD's illustrative amounts. `target` arrives null: a target is set BY HAND (the pack
 * says so — *"Nothing enforces it — it is a line on a chart, not a gate"*), so with none set the
 * bar and the percentage are absent rather than measured against an invented number.
 */

export type SalesSurfaceProps = {
  readonly lines?: readonly SalesLine[];
  readonly offers?: readonly OfferRow[];
  /** Deals in flight, read from the pipeline board. Amounts need the money spine. */
  readonly deals?: readonly { name: string; stage: string; ageDays: number; amount: number | null }[];
  /** Null until an operator sets one — a target is typed by hand, never derived. */
  readonly target?: SalesTarget | null;
  readonly schema?: CampaignSchema;
};

export default function SalesSurface({
  lines = [],
  offers = [],
  deals = [],
  target = null,
  schema = DEFAULT_CAMPAIGN_SCHEMA,
}: SalesSurfaceProps) {
  const sums = useMemo(() => {
    const sum = (pred: (x: SalesLine) => boolean) =>
      lines.filter(pred).reduce((a, x) => a + (x.amount ?? 0), 0);
    const booked = sum((x) => x.state === "booked");
    const refunded = sum((x) => x.state === "refunded");
    const pending = sum((x) => x.state === "pending");
    return { booked, refunded, pending, net: booked - refunded };
  }, [lines]);

  /** `pct` — L5862. Absent when no target is set, rather than measured against a guess. */
  const pct =
    target?.target && target.target > 0
      ? Math.max(0, Math.min(100, Math.round((sums.net / target.target) * 100)))
      : null;

  const nameOf = (id: string) => offers.find((o) => o.id === id)?.name ?? id;

  /** `figs` — L5866–L5872. */
  const figs = [
    {
      k: "Booked",
      v: lines.length ? money(sums.booked) : "—",
      note: target?.period ?? "no period set",
      tone: "text-foreground",
    },
    {
      k: "Refunded",
      v: sums.refunded ? `−${money(sums.refunded)}` : lines.length ? money(0) : "—",
      note: "reverses the line, keeps the record",
      tone: sums.refunded ? "text-[hsl(var(--destructive))]" : "text-muted-foreground",
    },
    {
      k: "Net",
      v: lines.length ? money(sums.net) : "—",
      note: "booked less refunds",
      tone: "text-[hsl(var(--gold-dark))]",
    },
    {
      k: "In flight",
      v: lines.length ? money(sums.pending) : "—",
      note: "invoiced, not landed",
      tone: "text-[hsl(var(--warning))]",
    },
    {
      k: "Against target",
      v: pct === null ? "—" : `${pct}%`,
      note: target?.target ? `of ${money(target.target)}` : "no target set",
      tone: "text-foreground/80",
    },
  ];

  /** `byOffer` / `byCamp` — L5874–L5885. Booked lines only, summed from the catalogue. */
  const byOffer = offers.map((o) => {
    const ls = lines.filter((x) => x.offerId === o.id && x.state === "booked");
    return {
      name: o.name,
      meta: ls.length ? `${ls.length} ×` : "—",
      v: ls.length ? money(ls.reduce((a, x) => a + (x.amount ?? 0), 0)) : "—",
    };
  });

  const byCamp = useMemo(() => {
    const acc: Record<string, { total: number; n: number }> = {};
    lines
      .filter((x) => x.state === "booked")
      .forEach((x) => {
        const cur = acc[x.camp] ?? { total: 0, n: 0 };
        acc[x.camp] = { total: cur.total + (x.amount ?? 0), n: cur.n + 1 };
      });
    return Object.entries(acc).map(([name, v]) => ({
      name,
      meta: `${v.n} ×`,
      v: money(v.total),
    }));
  }, [lines]);

  const tables = [
    { title: "By offering", note: "booked lines only · summed from the catalogue", rows: byOffer },
    {
      title: "By campaign",
      note: "attribution is the campaign the line was closed under",
      rows: byCamp,
    },
    {
      title: "Deals in flight",
      note: "read from the pipeline board — amounts need the money spine",
      rows: deals.map((d) => ({
        name: d.name,
        meta: `${d.stage} · ${d.ageDays}d`,
        v: d.amount === null ? "—" : money(d.amount),
      })),
    },
    {
      title: "Close reasons",
      note: "your vocabulary — edit it in Adjust",
      rows: schema.reasons.map((r) => ({ name: r, meta: "—", v: "—" })),
    },
  ];

  const stageTone = (stage: string) =>
    stage === "Paid"
      ? "hsl(var(--success))"
      : stage === "Invoiced"
        ? "hsl(var(--warning))"
        : "hsl(var(--gold-dark))";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3.5">
      {/* ── the five figures · L534–L543 ───────────────────────────────────────────────── */}
      <div className="grid flex-none grid-cols-2 border-y border-border/60 bg-background sm:grid-cols-3 lg:grid-cols-5">
        {figs.map((f) => (
          <span
            key={f.k}
            className="flex min-w-0 flex-col gap-1 px-[13px] py-[11px]"
            style={{
              boxShadow:
                "inset -1px 0 0 hsl(var(--border)/0.6), inset 0 -1px 0 hsl(var(--border)/0.6)",
            }}
          >
            <small className="text-[10.5px] text-muted-foreground">{f.k}</small>
            <b className={cn("text-[21px] font-normal tabular-nums tracking-[-0.012em]", f.tone)}>
              {f.v}
            </b>
            <small className="text-[10px] text-muted-foreground [text-wrap:pretty]">{f.note}</small>
          </span>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-[22px] pr-3 pt-3.5 [scrollbar-gutter:stable]">
        {/* ── against target · L546–L551 ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <small className="flex-none whitespace-nowrap text-[10.5px] font-medium text-[hsl(var(--gold-dark))]">
            Against target
          </small>
          <small className="text-[10.5px] text-muted-foreground">
            {target?.note ??
              "No target is set. A target is typed by hand — nothing derives one, so none is shown."}
          </small>
        </div>
        {pct !== null && (
          <div className="relative mt-[9px] h-[7px] overflow-hidden rounded-full bg-border/60">
            <i
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-[hsl(var(--accent))]"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {/* ── what closed, and when · L553–L563 ────────────────────────────────────────── */}
        <p className="mt-5 text-[10.5px] text-muted-foreground">What closed, and when</p>
        {lines
          .slice()
          .sort((a, b) => b.day - a.day)
          .map((x) => (
            <div
              key={x.id}
              className="flex min-w-0 items-center gap-[11px] border-b border-border/60 py-[9px]"
              style={{ opacity: x.state === "refunded" ? 0.72 : 1 }}
            >
              <small className="w-[44px] flex-none font-mono text-[10.5px] text-muted-foreground">
                {x.when}
              </small>
              <i
                aria-hidden
                className="h-[7px] w-[7px] flex-none"
                style={{
                  rotate: "45deg",
                  background:
                    x.state === "booked"
                      ? "hsl(var(--accent))"
                      : x.state === "pending"
                        ? "hsl(var(--background))"
                        : "hsl(var(--destructive))",
                  border:
                    x.state === "pending" ? "1px solid hsl(var(--gold-dark))" : "1px solid transparent",
                }}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="truncate text-[12px] font-medium">
                  {nameOf(x.offerId)} · {x.tier}
                </b>
                <small className="truncate text-[10.5px] text-muted-foreground">
                  {x.who} · {x.camp === "— direct" ? "no campaign" : x.camp}
                </small>
              </span>
              <span className="flex-1" />
              <small
                className="flex-none whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[10px] font-medium"
                style={{
                  color:
                    x.state === "refunded" ? "hsl(var(--destructive))" : stageTone(x.stage),
                }}
              >
                {x.state === "refunded" ? "Refunded" : x.stage}
              </small>
              <b
                className={cn(
                  "min-w-[62px] flex-none text-right font-mono text-[12.5px] font-medium tabular-nums",
                  x.state === "refunded" ? "text-[hsl(var(--destructive))]" : "text-foreground",
                )}
              >
                {x.state === "refunded" ? "−" : ""}
                {money(x.amount)}
              </b>
            </div>
          ))}

        {lines.length === 0 && (
          <div className="mt-3 max-w-[74ch]">
            <b className="text-[12.5px] font-medium text-[hsl(var(--gold-dark))]">
              {CAMPAIGNS_ABSENCE.title}
            </b>
            <p className="mt-2 text-[12px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
              {CAMPAIGNS_ABSENCE.body}
            </p>
          </div>
        )}

        {/* ── the four tables · L565–L581 ──────────────────────────────────────────────── */}
        {tables.map((t) => (
          <div key={t.title} className="mt-[22px]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-border pb-[7px]">
              <small className="text-[10.5px] font-medium text-[hsl(var(--gold-dark))]">
                {t.title}
              </small>
              <small className="text-[10.5px] text-muted-foreground [text-wrap:pretty]">
                {t.note}
              </small>
            </div>
            {t.rows.map((r, i) => (
              <div
                key={`${t.title}-${r.name}-${i}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-b border-border/60 py-2"
              >
                <b className="min-w-0 truncate text-[12px] font-medium">{r.name}</b>
                <small className="whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                  {r.meta}
                </small>
                <b
                  className={cn(
                    "whitespace-nowrap font-mono text-[12px] font-medium tabular-nums",
                    r.v === "—" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {r.v}
                </b>
              </div>
            ))}
            {t.rows.length === 0 && (
              <p className="py-2 text-[11px] text-muted-foreground">Nothing to sum yet.</p>
            )}
          </div>
        ))}

        {/* ── money movement · L583–L604. The §38 boundary, in CD's words. ─────────────── */}
        <div className="mt-6 border-t border-border pt-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
            <b className="text-[13px] font-medium">Money movement</b>
            <small className="text-[10.5px] text-muted-foreground">
              the provider is an adapter, not the interface
            </small>
          </div>
          <p className="mt-[7px] max-w-[70ch] text-[12px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
            {PROCESSOR.deck}
          </p>
          {PROCESSOR.needs.map(([need, why, by]) => (
            <div
              key={need}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-baseline gap-3 border-b border-border/60 py-[7px]"
            >
              <b className="min-w-0 text-[11.5px] font-medium">{need}</b>
              <small className="min-w-0 text-[10.5px] text-muted-foreground [text-wrap:pretty]">
                {why}
              </small>
              <small
                className={cn(
                  "flex-none whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  by === "Adapter"
                    ? "border-border text-muted-foreground"
                    : "border-[hsl(var(--gold-dark))] text-[hsl(var(--gold-dark))]",
                )}
              >
                {by}
              </small>
            </div>
          ))}
          {PROCESSOR.adapters.map((a) => (
            <div
              key={a.name}
              className="mt-[11px] rounded-[9px] border border-border bg-card px-[13px] py-[11px] shadow-sm"
            >
              <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-[7px]">
                <b className="text-[12px] font-medium">{a.name}</b>
                <small
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={{ borderColor: a.tone, color: a.tone }}
                >
                  {a.state}
                </small>
              </span>
              <small className="mt-1.5 block max-w-[66ch] text-[11px] leading-[1.55] text-muted-foreground [text-wrap:pretty]">
                {a.note}
              </small>
            </div>
          ))}
          <p className="mt-3 max-w-[70ch] text-[11px] leading-[1.55] text-muted-foreground [text-wrap:pretty]">
            {PROCESSOR.foot}
          </p>
        </div>

        <p className="mb-0.5 mt-[18px] max-w-[74ch] text-[11px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
          {SALES_FOOT}
        </p>
      </div>

      <div className="flex min-h-[30px] flex-none items-center gap-3.5 border-t border-border">
        <small
          title={SALES_DEFINITION}
          className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
        >
          {SALES_DEFINITION}
        </small>
        <small className="flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
          {lines.length} line{lines.length === 1 ? "" : "s"}
          {lines.length ? ` · ${money(sums.net)} net` : ""}
        </small>
      </div>
    </div>
  );
}
