import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { usePlatformTrust } from "@/operator/data/usePlatformTrust";
import {
  CAMPAIGN_FOOT,
  CAMPAIGN_KINDS,
  CAMPAIGN_STATES,
  CAMPAIGNS_ABSENCE,
  CARD_FACTS,
  DEFAULT_CAMPAIGN_SCHEMA,
  clampGrant,
  money,
  type CampaignRow,
  type CampaignSchema,
  type CampaignState,
  type CampaignStep,
  type OfferRow,
  type SalesLine,
} from "@/operator/surfaces/campaigns/campaignContract";

/**
 * Campaigns · Active — ported from `PAIGE Super Admin Shell v3.dc.html` `campVals` (L5159–L5296) and its markup (L387–L446).
 *
 * BUILD-ORDER Layer 3b. This replaces `revenue/plans` + `revenue/metering` — the retired
 * console's billing panels, which stood where this surface belongs and described a different
 * product entirely.
 *
 * ─── WHAT THE SURFACE IS ─────────────────────────────────────────────────────────────────────
 *
 * A filter row over the five states, then one card per campaign. The card is three bands: the
 * identity row (kind glyph · name and provenance · state pill), THE STEP RAIL, and the fact
 * strip with its acts.
 *
 * THE RAIL IS THE GRAPHIC, and CD's own comment says why it is drawn the way it is: *"delivered
 * steps carry a solid line and a filled mark, the current step is ringed, and what has not gone
 * yet is dashed and hollow."* Three geometry notes from the pack are load-bearing rather than
 * decorative, and each is transcribed at its site below: `min-width: 0` on the track (without it
 * a long step name gives the whole surface a horizontal scroll), the head inset by the mark's
 * half-diagonal (the first diamond's corner was being shaved off at the card edge), and no line
 * on the last step (a line there is a wire running off the edge of the card).
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * `campaigns` arrives empty and that is the finished Layer 3 state. The pack's `P.CAMPAIGNS` is
 * CD's illustration — named motions with step bodies and reach figures — and shipping it would
 * put invented campaigns on an operator's screen. With no rows the filters read zero, the tally
 * reads honestly, and the slot's authored absence explains what is missing and why. Layer 6
 * hands this component real rows and nothing about the render changes.
 *
 * THE GRANT IS THE ONE FIGURE THAT IS ALREADY REAL. `clampGrant` runs a campaign's named grant
 * through the SAME scale the Trust Compass uses, against the stored platform ceiling — CD's
 * comment: *"Inventing a second scale here is what made every agent read Held at the default."*
 * With no ceiling stored it reads an em-dash rather than clamping against a rung that does not
 * exist.
 */

export type CampaignsActiveProps = {
  readonly campaigns?: readonly CampaignRow[];
  /** The catalogue, for the `Sells` fact — the join CD groups these three surfaces around. */
  readonly offers?: readonly OfferRow[];
  /** Booked lines, for the `Booked` fact. Summed, never typed. */
  readonly lines?: readonly SalesLine[];
  readonly schema?: CampaignSchema;
  /** `openSchema` — the Adjust door into `schemaVals` (Layer 4). Absent renders it disabled. */
  readonly onAdjust?: () => void;
  /** `st.open` — opens one step in the `campstep` summon (Layer 4). */
  readonly onOpenStep?: (campaign: CampaignRow, step: CampaignStep, index: number) => void;
  readonly onHalt?: (campaign: CampaignRow) => void;
  readonly onResume?: (campaign: CampaignRow) => void;
};

type FilterKey = "active" | "holding" | "halted" | "all";

export default function CampaignsActive({
  campaigns = [],
  offers = [],
  lines = [],
  schema = DEFAULT_CAMPAIGN_SCHEMA,
  onAdjust,
  onOpenStep,
  onHalt,
  onResume,
}: CampaignsActiveProps) {
  const trust = usePlatformTrust(true);
  const [filter, setFilter] = useState<FilterKey>("active");

  const counts = useMemo(() => {
    const out: Record<string, number> = {
      active: campaigns.filter((c) => CAMPAIGN_STATES[c.state].active).length,
      all: campaigns.length,
    };
    (Object.keys(CAMPAIGN_STATES) as CampaignState[]).forEach((k) => {
      out[k] = campaigns.filter((c) => c.state === k).length;
    });
    return out;
  }, [campaigns]);

  const list = useMemo(() => {
    if (filter === "active") return campaigns.filter((c) => CAMPAIGN_STATES[c.state].active);
    if (filter === "all") return campaigns;
    return campaigns.filter((c) => c.state === filter);
  }, [campaigns, filter]);

  const dense = schema.density === "compact";

  /** `filters` — L5172–L5185. The two toned entries carry their state's dot. */
  const filters: Array<{ key: FilterKey; label: string; note: string; tone?: string }> = [
    { key: "active", label: "Active", note: "Audience bound, motion unfinished, not halted" },
    {
      key: "holding",
      label: CAMPAIGN_STATES.holding.label,
      note: CAMPAIGN_STATES.holding.note,
      tone: CAMPAIGN_STATES.holding.tone,
    },
    {
      key: "halted",
      label: CAMPAIGN_STATES.halted.label,
      note: CAMPAIGN_STATES.halted.note,
      tone: CAMPAIGN_STATES.halted.tone,
    },
    { key: "all", label: "Everything", note: "Every campaign in every state" },
  ];

  const tally =
    list.length === campaigns.length
      ? `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} · all states`
      : `${list.length} of ${campaigns.length} shown`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3.5">
      {/* ── filter row · L388–L397 ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-[5px] border-b border-border/60 pb-[11px]">
        {filters.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              title={f.note}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex min-h-[28px] items-center gap-[7px] border-0 bg-transparent px-0.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "font-medium text-foreground" : "text-muted-foreground",
              )}
              style={on ? { boxShadow: "inset 0 -1px 0 hsl(var(--gold-dark))" } : undefined}
            >
              {f.tone && (
                <i
                  aria-hidden
                  className="h-[5px] w-[5px]"
                  style={{ rotate: "45deg", background: f.tone }}
                />
              )}
              {f.label}
              <b className="font-mono text-[10.5px] font-normal text-muted-foreground">
                {counts[f.key] ?? 0}
              </b>
            </button>
          );
        })}
        <span className="min-w-[8px] flex-1" />
        {/* `Adjust` opens `schemaVals` — Layer 4. Disabled until that summon lands, rather
            than a control that looks live and goes nowhere. */}
        <button
          type="button"
          onClick={onAdjust}
          disabled={!onAdjust}
          title="Rename it, choose what a card shows"
          className="min-h-[26px] flex-none whitespace-nowrap rounded-full border border-border bg-card px-2.5 text-[11px] text-muted-foreground shadow-sm transition-colors hover:text-[hsl(var(--gold-dark))] disabled:opacity-50 disabled:hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Adjust
        </button>
      </div>

      {/* ── the cards · L399–L440 ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto pb-[22px] pr-3 pt-0.5 [scrollbar-gutter:stable]">
        {list.map((c) => {
          const kind = CAMPAIGN_KINDS[c.kind];
          const state = CAMPAIGN_STATES[c.state];
          const doneN = c.steps.filter((x) => x.done).length;
          const cur = c.steps.findIndex((x) => !x.done);

          const bound = c.offerId ? offers.find((o) => o.id === c.offerId) : undefined;
          const booked = lines
            .filter((x) => x.camp === c.name && x.state === "booked")
            .reduce((a, x) => a + (x.amount ?? 0), 0);

          /** `facts` — L5251–L5266. A fact nobody records reads as an em-dash, never a guess. */
          const values: Record<string, string | null> = {
            step: `${doneN} of ${c.steps.length}`,
            opened: c.opened,
            reach: c.reach,
            grant: clampGrant(c.grant, trust.level),
            offer: bound ? bound.name : c.offerId === null ? "— brand, sells nothing" : null,
            booked: booked ? money(booked) : null,
          };

          return (
            <div
              key={c.id}
              className="border-b border-border/60"
              style={{ padding: dense ? "12px 0 11px" : "17px 0 16px" }}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span
                  title={kind.note}
                  className="grid h-[30px] w-[30px] place-items-center rounded-full border border-border text-muted-foreground"
                >
                  <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" aria-hidden>
                    <path
                      d={kind.glyph}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-[15px] font-medium tracking-[-0.008em]">{c.name}</b>
                  <small className="mt-[3px] truncate text-[11.5px] text-muted-foreground">
                    {kind.label} · {c.channel} · against {c.segment}
                  </small>
                </span>
                <span
                  title={state.note}
                  className="inline-flex min-h-[24px] items-center gap-[7px] whitespace-nowrap rounded-full border border-border px-[11px] text-[10.5px] font-medium tracking-[0.02em]"
                  style={{ color: state.tone }}
                >
                  <i
                    aria-hidden
                    className="h-[5px] w-[5px]"
                    style={{ rotate: "45deg", background: state.tone }}
                  />
                  {state.label}
                </span>
              </div>

              {/* THE STEP RAIL · L411–L421. One equal track per step. */}
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${c.steps.length},minmax(0,1fr))`,
                  marginTop: dense ? "10px" : "16px",
                }}
              >
                {c.steps.map((x, i) => {
                  const isCur = i === cur;
                  const tone = x.done
                    ? "hsl(var(--accent))"
                    : x.held || isCur
                      ? "hsl(var(--gold-dark))"
                      : "hsl(var(--border))";
                  return (
                    <button
                      key={`${c.id}-${i}`}
                      type="button"
                      onClick={onOpenStep ? () => onOpenStep(c, x, i) : undefined}
                      disabled={!onOpenStep}
                      title={`${x.name} · ${x.at}${x.held ? " · held for your word" : x.done ? " · delivered" : " · not sent"}`}
                      /* `min-w-0` is what keeps the rail inside the card: without it the track
                         cannot shrink under a long step name and the whole surface gains a
                         horizontal scroll. The head is inset by the mark's own half-diagonal,
                         label and all — at the card edge the first diamond's corner fell outside
                         the scroll box and was shaved off. */
                      className="relative flex min-w-0 flex-col items-start gap-[7px] border-0 bg-transparent pb-0.5 pr-2.5 pt-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{ paddingLeft: i === 0 ? "7px" : 0 }}
                    >
                      {/* The last step draws no line — its track has nothing to its right, so a
                          line there is a wire running off the edge of the card. */}
                      <span
                        aria-hidden
                        className="absolute right-0 top-3 h-0"
                        style={{
                          left: i === 0 ? "7px" : 0,
                          borderTop:
                            i === c.steps.length - 1
                              ? "none"
                              : `1px ${x.done ? "solid" : "dashed"} ${tone}`,
                        }}
                      />
                      <i
                        aria-hidden
                        className="relative"
                        style={{
                          width: isCur ? "9px" : "7px",
                          height: isCur ? "9px" : "7px",
                          marginTop: isCur ? "-4.5px" : "-3.5px",
                          rotate: "45deg",
                          background: x.done || x.held ? tone : "hsl(var(--background))",
                          border: `1px solid ${tone}`,
                          boxShadow: isCur
                            ? `0 0 0 3px hsl(var(--background)), 0 0 0 4px ${tone}`
                            : "none",
                        }}
                      />
                      <b
                        className={cn(
                          "mt-1 max-w-full truncate text-[12px]",
                          x.done
                            ? "font-normal text-foreground/80"
                            : isCur
                              ? "font-medium text-foreground"
                              : "font-normal text-muted-foreground",
                        )}
                      >
                        {x.name}
                      </b>
                      {!dense && (
                        <small className="font-mono text-[10px] text-muted-foreground">{x.at}</small>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* fact strip + acts · L423–L438 */}
              <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/60 pt-[11px]">
                {schema.facts.map((id) => {
                  const fact = CARD_FACTS.find((f) => f.id === id);
                  const raw = values[id];
                  const shown = raw ?? "—";
                  return (
                    <span key={id} className="flex items-baseline gap-1.5">
                      <small className="text-[10.5px] text-muted-foreground">
                        {id === "step" ? schema.stageWord : (fact?.label ?? id)}
                      </small>
                      <b
                        className={cn(
                          "font-mono text-[11.5px] font-medium",
                          String(shown).startsWith("—") ? "text-muted-foreground" : "text-foreground/80",
                        )}
                      >
                        {shown}
                      </b>
                    </span>
                  );
                })}
                <span className="flex-1" />
                {c.state === "halted" ? (
                  <ActButton label="Resume" onClick={onResume ? () => onResume(c) : undefined} />
                ) : (
                  <>
                    {c.state === "holding" && (
                      <ActButton
                        label="Review the step"
                        onClick={
                          onOpenStep && cur >= 0
                            ? () => onOpenStep(c, c.steps[cur], cur)
                            : undefined
                        }
                      />
                    )}
                    <ActButton label="Halt" stop onClick={onHalt ? () => onHalt(c) : undefined} />
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* The slot's absence, authored on the design side and lifted verbatim. It renders while
            nothing is wired — naming the tables so the slot is not rebuilt from scratch, and the
            one genuinely missing seam so a wiring round does not assume the join exists. */}
        {campaigns.length === 0 && (
          <div className="mt-4 max-w-[74ch]">
            <b className="text-[12.5px] font-medium text-[hsl(var(--gold-dark))]">
              {CAMPAIGNS_ABSENCE.title}
            </b>
            <p className="mt-2 text-[12px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
              {CAMPAIGNS_ABSENCE.body}
            </p>
          </div>
        )}

        <p className="mb-0.5 mt-4 max-w-[74ch] text-[11px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
          {CAMPAIGN_FOOT}
        </p>
      </div>

      {/* the definition strip · L442–L445 */}
      <div className="flex min-h-[30px] flex-none items-center gap-3.5 border-t border-border">
        <small
          title={schema.definition}
          className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
        >
          {schema.definition}
        </small>
        <small className="flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
          {tally}
        </small>
      </div>
    </div>
  );
}

/** `btn()` — L5187–L5192. `stop` edges negative; everything else is a quiet pill. */
function ActButton({
  label,
  stop = false,
  onClick,
}: {
  label: string;
  stop?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "min-h-[28px] flex-none whitespace-nowrap rounded-full border bg-transparent px-[11px] text-[11.5px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        stop
          ? "border-[hsl(var(--destructive))] text-[hsl(var(--destructive))]"
          : "border-border text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}
