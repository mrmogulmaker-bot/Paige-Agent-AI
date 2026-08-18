import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The operator SETTINGS group — Claude Design's five settings surfaces, on CD's one panel
 * layout (Super Admin Shell.dc.html):
 *
 *   • Setup            — the `st.view === "config"` panel, L5024–5124 (six tabs)
 *   • Integrations     — the `st.view === "integrations"` panel, L6382–6462 (three tabs)
 *   • Platform Team    — the `st.view === "team"` panel, L6857–6886 (Seats · Roles)
 *   • Platform Vault   — the `st.view === "vault"` panel, L6334–6381 (three tabs)
 *   • Governance       — the `st.view === "governance"` panel, L4968–5017 (four tabs)
 *
 * The chrome they share is CD's generic panel (template L656–1866): eyebrow + 17px title with
 * its notice badge, sub-line, chip and gold CTA; the violet anchor strip; the four-up KPI
 * strip; the block column (rows · fields · feed); and the 290px right rail carrying the
 * action cards and her read. That is ONE layout in CD and it is ONE layout here (§18) — the
 * five surfaces differ in content, not in construction. The settings back-menu that reaches
 * them already ships in OperatorApp.tsx (its own port of the pack's L205–224); this file is
 * only what renders to the right of it.
 *
 * §13 — THE PACK'S FIGURES DO NOT SHIP. CD's own header says it plainly: "No platform
 * substrate exists yet — every figure on this surface is a stand-in, not a platform record."
 * Its $184,000 committed, its "14 obligations", its three named platform roles with seat
 * counts, its "18 operator actions today" are all stand-ins. Porting them as literals would
 * put invented seat counts against real role names and invented money against a real vault —
 * on the exact surfaces an operator uses to decide who can reach what. So every row, field,
 * event, count and figure arrives through props; a surface handed nothing says so in as many
 * words, and a figure the platform cannot substantiate renders "—".
 *
 * §53/§60 in particular: the Roles surface renders whatever role taxonomy the caller hands
 * it. It does NOT carry its own list — the real one is the platform's (`super_admin`,
 * `platform_admin`, and whatever else the tier matrix defines), and a hardcoded copy here
 * would be a second home for the taxonomy that drifts the moment the real one changes.
 */

/* ────────────────────────────────────────────────────────────────────────────
   Shared vocabulary
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * CD paints each state with its own hex pair. These map onto the platform's semantic tokens:
 * `warn` and `gold` both resolve to --gold-dark, the one gold that is AA as TEXT in both
 * themes (--warning is a fill/dot value and sinks below AA at 10px on a tint).
 */
export type Tone = "neutral" | "ok" | "warn" | "risk" | "info" | "gold";

const PILL: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  ok: "bg-[hsl(var(--success)/0.14)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))]",
  info: "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]",
  gold: "bg-cd-gold/[0.16] text-[hsl(var(--gold-dark))]",
};

const BAND: Record<Tone, string> = {
  neutral: "bg-muted-foreground/40",
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
  info: "bg-[hsl(var(--primary))]",
  gold: "bg-cd-gold",
};

const VALUE_INK: Record<Tone, string> = {
  neutral: "text-foreground",
  ok: "text-[hsl(var(--success))]",
  warn: "text-[hsl(var(--gold-dark))]",
  risk: "text-[hsl(var(--destructive))]",
  info: "text-[hsl(var(--primary))]",
  gold: "text-[hsl(var(--gold-dark))]",
};

/** CD's `rowOf` — one row of a rows-block. */
export type PanelRow = {
  id: string;
  label: string;
  note?: string | null;
  /** CD's mono right-hand meta: a date, a count, a last-used stamp. */
  meta?: string | null;
  /** CD's bold right-hand figure. Null renders "—" rather than nothing. */
  value?: string | null;
  valueTone?: Tone;
  pill?: string | null;
  pillTone?: Tone;
  /** Left colour band, as CD uses for tier and severity. */
  band?: Tone;
  glyph?: string | null;
  initials?: string | null;
  /** The row's action. Absent → no button, rather than a button that does nothing. */
  cta?: string | null;
  onAct?: () => void;
  /** Extra detail chips — used by Roles to make the permission ceiling readable. */
  tags?: readonly string[];
};

/** CD's `fieldOf` — one labelled value in a fields-block. */
export type PanelField = {
  id: string;
  label: string;
  value: string | null;
  tone?: Tone;
  /** CD marks a value the operator cannot edit here with "⚿ managed". */
  locked?: boolean;
  onEdit?: () => void;
};

/** CD's `feed` — one event in the governance timeline. */
export type PanelEvent = {
  id: string;
  kind: string;
  kindTone?: Tone;
  who: string;
  what: string;
  note?: string | null;
  when: string;
  tone?: Tone;
};

export type PanelKpi = {
  id: string;
  label: string;
  /** Real, or null → "—". Never a plausible stand-in (§13). */
  value: string | null;
  unit: string;
  tone?: Tone;
};

export type PanelAction = {
  id: string;
  text: string;
  cta: string;
  tone?: Tone;
  onAct?: () => void;
};

/* ────────────────────────────────────────────────────────────────────────────
   Blocks
   ──────────────────────────────────────────────────────────────────────────── */

function BlockShell({
  title, sub, action, onAction, foot, children,
}: {
  title: string; sub?: string | null;
  action?: string | null; onAction?: () => void;
  foot?: string | null; children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-none flex-col rounded-[13px] border-[1.5px] border-border bg-card shadow-sm">
      <div className="min-w-0 px-[15px] pb-[9px] pt-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h3 className="truncate text-[14px] font-semibold">{title}</h3>
          {action && (
            <button
              type="button"
              onClick={onAction}
              disabled={!onAction}
              className="ml-auto flex-none whitespace-nowrap text-[11.5px] font-semibold text-[hsl(var(--gold-dark))] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {action}
            </button>
          )}
        </div>
        {sub && <p className="mt-[3px] truncate text-[11.5px] text-muted-foreground">{sub}</p>}
      </div>
      {children}
      {foot && (
        <p className="border-t border-border bg-muted/40 px-[15px] py-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          {foot}
        </p>
      )}
    </section>
  );
}

/** The honest stand-in for a block whose source is not wired — never an empty-looking table. */
function NotWired({ what }: { what: string }) {
  return (
    <p className="border-t border-border px-[15px] py-6 text-center text-[11.5px] leading-relaxed text-muted-foreground">
      {what} is not connected to this surface yet, so there is nothing real to show. Nothing is
      being hidden — this surface will not invent a stand-in.
    </p>
  );
}

export function RowsBlock({
  title, sub, rows, foot, source, wrapNotes = false,
}: {
  title: string; sub?: string | null; rows?: readonly PanelRow[];
  foot?: string | null;
  /** Named in the not-wired line, e.g. "The platform role taxonomy". */
  source: string;
  /** Roles need their ceiling readable in full; CD truncates notes to one line elsewhere. */
  wrapNotes?: boolean;
}) {
  return (
    <BlockShell title={title} sub={sub} foot={rows && rows.length ? foot : null}>
      {!rows || rows.length === 0 ? (
        <NotWired what={source} />
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex min-w-0 items-center gap-[11px] border-t border-border/60 px-[15px] py-[9px]"
            >
              {r.band && (
                <span aria-hidden className={cn("w-[3px] flex-none self-stretch rounded-sm", BAND[r.band])} />
              )}
              {r.initials && (
                <span
                  aria-hidden
                  className="grid h-[27px] w-[27px] flex-none place-items-center rounded-[9px] bg-muted text-[10px] font-bold text-foreground/70"
                >
                  {r.initials}
                </span>
              )}
              {!r.initials && r.glyph && (
                <span
                  aria-hidden
                  className="grid h-[27px] w-[27px] flex-none place-items-center rounded-[9px] bg-[hsl(var(--primary)/0.12)] text-[11px] text-[hsl(var(--primary))]"
                >
                  {r.glyph}
                </span>
              )}
              <div className="min-w-[70px] flex-1 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-semibold">{r.label}</span>
                  {r.pill && (
                    <span
                      className={cn(
                        "flex-none whitespace-nowrap rounded-full px-[9px] py-[2.5px] text-[10px] font-semibold",
                        PILL[r.pillTone ?? "neutral"],
                      )}
                    >
                      {r.pill}
                    </span>
                  )}
                </div>
                {r.note && (
                  <p
                    className={cn(
                      "mt-0.5 text-[10.5px] leading-[1.4] text-muted-foreground",
                      wrapNotes ? "whitespace-normal" : "truncate",
                    )}
                  >
                    {r.note}
                  </p>
                )}
                {r.tags && r.tags.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-border bg-muted/50 px-2 py-[1.5px] font-mono text-[9.5px] text-muted-foreground"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {r.meta && (
                <span className="flex-none whitespace-nowrap font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  {r.meta}
                </span>
              )}
              {"value" in r && (
                <span
                  className={cn(
                    "flex-none whitespace-nowrap text-[13px] font-bold tabular-nums",
                    VALUE_INK[r.valueTone ?? "neutral"],
                  )}
                >
                  {r.value ?? "—"}
                </span>
              )}
              {r.cta && (
                <button
                  type="button"
                  onClick={r.onAct}
                  disabled={!r.onAct}
                  className="flex-none whitespace-nowrap rounded-lg border border-border bg-card px-[11px] py-[5px] text-[11px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {r.cta}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </BlockShell>
  );
}

export function FieldsBlock({
  title, sub, fields, source, cols = 2,
}: {
  title: string; sub?: string | null; fields?: readonly PanelField[];
  source: string; cols?: 2 | 3;
}) {
  return (
    <BlockShell title={title} sub={sub}>
      {!fields || fields.length === 0 ? (
        <NotWired what={source} />
      ) : (
        <dl
          className={cn(
            "grid gap-x-[18px] gap-y-[11px] px-[15px] pb-3.5",
            cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {fields.map((f) => {
            const body = (
              <>
                {f.tone && (
                  <span aria-hidden className={cn("h-[7px] w-[7px] flex-none rounded-full", BAND[f.tone])} />
                )}
                <span className="min-w-0 truncate text-[12.5px]">{f.value ?? "—"}</span>
                {f.locked && (
                  <span className="ml-auto flex-none text-[10px] text-muted-foreground">⚿ managed</span>
                )}
                {!f.locked && f.onEdit && (
                  <span aria-hidden className="ml-auto flex-none text-[10px] text-muted-foreground">▾</span>
                )}
              </>
            );
            return (
              <div key={f.id} className="min-w-0">
                <dt className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                  {f.label}
                </dt>
                <dd className="mt-[5px]">
                  {f.onEdit && !f.locked ? (
                    <button
                      type="button"
                      onClick={f.onEdit}
                      className="flex w-full min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-card px-[11px] py-[9px] text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {body}
                    </button>
                  ) : (
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-2.5 rounded-[10px] border px-[11px] py-[9px]",
                        f.locked ? "border-border/60 bg-muted/40 text-muted-foreground" : "border-border bg-card",
                      )}
                    >
                      {body}
                    </div>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </BlockShell>
  );
}

export function FeedBlock({
  title, sub, events, foot, source,
}: {
  title: string; sub?: string | null; events?: readonly PanelEvent[];
  foot?: string | null; source: string;
}) {
  return (
    <BlockShell title={title} sub={sub} foot={events && events.length ? foot : null}>
      {!events || events.length === 0 ? (
        <NotWired what={source} />
      ) : (
        <ol className="flex flex-col">
          {events.map((e) => (
            <li key={e.id} className="flex min-w-0 items-start gap-2.5 border-t border-border/60 px-[15px] py-[9px]">
              <span aria-hidden className={cn("mt-[5px] h-[7px] w-[7px] flex-none rounded-full", BAND[e.tone ?? "neutral"])} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-[7px]">
                  <span
                    className={cn(
                      "whitespace-nowrap rounded-full px-[9px] py-[2.5px] text-[10px] font-semibold",
                      PILL[e.kindTone ?? "neutral"],
                    )}
                  >
                    {e.kind}
                  </span>
                  <span className="min-w-0 truncate text-[11px] text-muted-foreground">{e.who}</span>
                  <span className="ml-auto flex-none whitespace-nowrap font-mono text-[10.5px] text-muted-foreground">
                    {e.when}
                  </span>
                </div>
                <p className="mt-1 text-[12.5px] font-semibold leading-[1.35]">{e.what}</p>
                {e.note && <p className="mt-[3px] text-[11px] leading-[1.45] text-muted-foreground">{e.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </BlockShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The panel every settings surface is built on (CD's generic panel chrome)
   ──────────────────────────────────────────────────────────────────────────── */

export type SettingsPanelProps = {
  eyebrow: string;
  title: string;
  sub: string;
  /** CD's neutral count chip. Null → not drawn, rather than a chip reading "0". */
  chip?: string | null;
  chipNote?: string | null;
  cta?: string | null;
  onCta?: () => void;
  /** CD's violet isolation strip. */
  anchor?: string | null;
  kpis?: readonly PanelKpi[];
  actionsTitle?: string;
  actions?: readonly PanelAction[];
  /** Paige's read of this surface. Absent → the rail card says she has not read it. */
  read?: string | null;
  onAskPaige?: () => void;
  loading?: boolean;
  error?: string | null;
  children: ReactNode;
};

export function SettingsPanel({
  eyebrow, title, sub, chip, chipNote, cta, onCta, anchor,
  kpis, actionsTitle = "Worth a look", actions, read, onAskPaige,
  loading = false, error = null, children,
}: SettingsPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* title row */}
      <div className="flex flex-none items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2.5">
            <span className="flex-none text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">
              {eyebrow}
            </span>
            <h2 className="flex-none whitespace-nowrap text-[17px] font-bold tracking-[-0.02em]">{title}</h2>
          </div>
          <p title={sub} className="mt-[3px] min-w-0 truncate text-[11.5px] text-muted-foreground">
            {sub}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-2">
          {chip && (
            <span
              title={chipNote ?? undefined}
              className="whitespace-nowrap rounded-full border border-border bg-muted px-[11px] py-[5px] text-[12px] font-semibold text-muted-foreground"
            >
              {chip}
            </span>
          )}
          {cta && (
            <button
              type="button"
              onClick={onCta}
              disabled={!onCta}
              className="whitespace-nowrap rounded-[9px] bg-cd-gold px-3.5 py-2 text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cta}
            </button>
          )}
        </div>
      </div>

      {/* CD's isolation anchor */}
      {anchor && (
        <p className="flex min-w-0 flex-none items-center gap-2.5 rounded-[10px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-3 py-2 text-[11.5px] leading-[1.45] text-[hsl(var(--primary))]">
          <span aria-hidden className="flex-none text-[11px]">⌖</span>
          {anchor}
        </p>
      )}

      {/* KPI strip */}
      {kpis && kpis.length > 0 && (
        <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.id}
              className="min-w-0 rounded-xl border-[1.5px] border-border bg-card px-[15px] py-[13px] shadow-sm"
            >
              <div className="truncate text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
                {k.label}
              </div>
              <div className="mt-1 flex min-w-0 items-baseline gap-[7px]">
                <span
                  className={cn(
                    "whitespace-nowrap text-[23px] font-bold tabular-nums tracking-[-0.02em]",
                    VALUE_INK[k.tone ?? "neutral"],
                  )}
                >
                  {loading ? "—" : k.value ?? "—"}
                </span>
              </div>
              <div className="mt-[3px] truncate text-[10.5px] leading-[1.35] text-muted-foreground">{k.unit}</div>
            </div>
          ))}
        </div>
      )}

      {/* blocks + rail */}
      <div className="flex min-h-0 flex-1 gap-3.5">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
          {error ? (
            <div className="rounded-[13px] border-[1.5px] border-border bg-card px-4 py-10 text-center shadow-sm">
              <div className="text-[13px] font-semibold">This surface could not be read.</div>
              <p className="mx-auto mt-1 max-w-md text-[11.5px] text-muted-foreground">{error}</p>
            </div>
          ) : (
            children
          )}
        </div>

        <aside className="hidden w-[290px] flex-none flex-col gap-2.5 overflow-y-auto xl:flex">
          <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
            <h3 className="text-[13.5px] font-semibold">{actionsTitle}</h3>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {(!actions || actions.length === 0) && (
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Nothing is queued here. She raises something when the platform record gives her a
                  reason to — not on a schedule.
                </p>
              )}
              {actions?.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-[10px] border border-border border-l-[3px] bg-muted/40 px-[11px] py-2.5",
                    a.tone === "risk"
                      ? "border-l-[hsl(var(--destructive))]"
                      : a.tone === "ok"
                        ? "border-l-[hsl(var(--success))]"
                        : a.tone === "gold"
                          ? "border-l-cd-gold"
                          : "border-l-[hsl(var(--warning))]",
                  )}
                >
                  <p className="text-[11.5px] leading-[1.5]">{a.text}</p>
                  <button
                    type="button"
                    onClick={a.onAct}
                    disabled={!a.onAct}
                    className="mt-2 inline-flex rounded-lg bg-cd-gold px-[11px] py-1.5 text-[11px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {a.cta}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-none rounded-[13px] border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-[12px] text-[hsl(var(--primary))]">✦</span>
              <h3 className="text-[12.5px] font-semibold text-[hsl(var(--primary))]">Her read</h3>
            </div>
            <p className="mt-[7px] text-[12px] leading-[1.6]">
              {read ?? "She has not read this surface yet — nothing here is her opinion."}
            </p>
            {onAskPaige && (
              <button
                type="button"
                onClick={onAskPaige}
                className="mt-2.5 inline-flex rounded-[9px] border border-[hsl(var(--primary)/0.3)] bg-card px-3 py-[7px] text-[11.5px] font-semibold text-[hsl(var(--primary))] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Take it to the workspace →
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Everything a settings surface shares with the panel it renders into. */
type SurfaceShell = {
  actions?: readonly PanelAction[];
  read?: string | null;
  onAskPaige?: () => void;
  loading?: boolean;
  error?: string | null;
};

/* ────────────────────────────────────────────────────────────────────────────
   Setup — CD L5024–5124
   ──────────────────────────────────────────────────────────────────────────── */

export type SetupTab =
  | "operator" | "brand-kit" | "model-router" | "capabilities" | "feature-flags" | "api-mcp";

export type SetupSurfaceProps = SurfaceShell & {
  tab: SetupTab;
  /** Operator — who you are and how she signs as you. */
  operatorFields?: readonly PanelField[];
  accessRows?: readonly PanelRow[];
  /** Brand kit. */
  brandTokens?: readonly PanelRow[];
  brandIdentity?: readonly PanelField[];
  /** Model router — the routing table and its behaviour, from the router record. */
  modelRoutes?: readonly PanelRow[];
  routerBehaviour?: readonly PanelField[];
  capabilities?: readonly PanelRow[];
  featureFlags?: readonly PanelRow[];
  apiKeys?: readonly PanelRow[];
  /** The MCP endpoint the desktop client and any agent point at. Null → "—". */
  mcpEndpoint?: string | null;
  onNewKey?: () => void;
};

const SETUP_COPY: Record<SetupTab, { title: string; sub: string }> = {
  operator: { title: "Operator", sub: "You, your access, and how she signs as you." },
  "brand-kit": {
    title: "Brand kit",
    sub: "The platform's own identity — what every asset she generates inherits.",
  },
  "model-router": { title: "Model router", sub: "Which model answers, per tier, with the fallback behind it." },
  capabilities: { title: "Capability catalog", sub: "What Paige can do, and which tiers see it." },
  "feature-flags": { title: "Feature flags", sub: "What's on, for whom, and what it costs to turn off." },
  "api-mcp": { title: "API and MCP", sub: "How anything outside the platform reaches her, and under what scope." },
};

export function SetupSurface({
  tab, operatorFields, accessRows, brandTokens, brandIdentity,
  modelRoutes, routerBehaviour, capabilities, featureFlags, apiKeys,
  mcpEndpoint, onNewKey, ...shell
}: SetupSurfaceProps) {
  const copy = SETUP_COPY[tab];
  return (
    <SettingsPanel
      eyebrow="PLATFORM"
      title={copy.title}
      sub={copy.sub}
      anchor={
        tab === "api-mcp"
          ? "Every key is scoped. No key can read one tenant's data from another tenant's context, whatever its scope says."
          : null
      }
      cta={tab === "api-mcp" ? "+ New key" : null}
      onCta={onNewKey}
      {...shell}
    >
      {tab === "operator" && (
        <>
          <FieldsBlock
            title="You"
            sub="What she uses when she signs or speaks as you."
            fields={operatorFields}
            source="Your operator profile"
          />
          <RowsBlock
            title="Access"
            sub="The one seat that can do everything, and what guards it."
            rows={accessRows}
            source="The access record for your seat"
          />
        </>
      )}

      {tab === "brand-kit" && (
        <>
          <RowsBlock
            title="Tokens"
            sub="Every asset she generates for the platform inherits these."
            rows={brandTokens}
            source="The platform brand token set"
          />
          <FieldsBlock
            title="Type and mark"
            sub="The rest of the identity."
            fields={brandIdentity}
            source="The platform identity record"
          />
        </>
      )}

      {tab === "model-router" && (
        <>
          <RowsBlock
            title="Routing by tier"
            sub="The lane, the fallback, and the ceiling."
            rows={modelRoutes}
            source="The model router table"
            foot="Super Admin runs the largest lane with no ceiling — God dogfoods at maximum permission."
          />
          <FieldsBlock
            title="Router behaviour"
            sub="What happens when a lane is busy or a call fails."
            fields={routerBehaviour}
            source="The router's failure policy"
          />
        </>
      )}

      {tab === "capabilities" && (
        <RowsBlock
          title="Every capability"
          sub="Tier visibility is the contract — a tenant sees exactly what their tier lists."
          rows={capabilities}
          source="The capability catalog"
        />
      )}

      {tab === "feature-flags" && (
        <RowsBlock
          title="Flags"
          sub="Each one names who has it and what breaks without it."
          rows={featureFlags}
          source="The feature flag register"
        />
      )}

      {tab === "api-mcp" && (
        <RowsBlock
          title="Keys"
          sub="Scope, last use, and what each one may reach."
          rows={apiKeys}
          source="The platform API key register"
          foot={`MCP endpoint · ${mcpEndpoint ?? "—"} — the desktop client and any agent you point at it use the same scoped keys.`}
        />
      )}
    </SettingsPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Integrations — CD L6382–6462
   ──────────────────────────────────────────────────────────────────────────── */

export type IntegrationHealth = "green" | "amber" | "red" | "unknown";

export type IntegrationConnection = {
  id: string;
  name: string;
  category: string;
  note?: string | null;
  /** What the platform records as the connection's state, e.g. "Connected". */
  state: string;
  health: IntegrationHealth;
  /** Registered webhooks on this connection. Null → "—". */
  hooks?: number | null;
  /** Deliveries currently failing. Null → unknown, and it is not counted as zero. */
  failing?: number | null;
  /** Already-formatted last successful call. Null → "—". */
  lastCall?: string | null;
  needsReauth?: boolean;
  onOpen?: () => void;
};

export type IntegrationsTab = "connected" | "health" | "available";

export type IntegrationsSurfaceProps = SurfaceShell & {
  tab: IntegrationsTab;
  connections?: readonly IntegrationConnection[];
  /** Services the platform could connect and has not. */
  available?: readonly PanelRow[];
  onConnect?: () => void;
};

const HEALTH_TONE: Record<IntegrationHealth, Tone> = {
  green: "ok",
  amber: "warn",
  red: "risk",
  unknown: "neutral",
};

/** Sums only over what the caller actually gave us; an unknown never becomes a zero (§13). */
function total(list: readonly IntegrationConnection[], pick: (c: IntegrationConnection) => number | null | undefined) {
  const known = list.map(pick).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return known.length === 0 ? null : String(known.reduce((a, b) => a + b, 0));
}

export function IntegrationsSurface({
  tab, connections, available, onConnect, ...shell
}: IntegrationsSurfaceProps) {
  const list = connections ?? [];
  const wired = list.length > 0;
  const failing = list.filter((c) => c.health === "amber" || c.health === "red");
  const connected = list.filter((c) => c.state.trim().toLowerCase() === "connected");
  const reauth = list.filter((c) => c.needsReauth).length;
  const failingTotal = total(list, (c) => c.failing);

  const kpis: PanelKpi[] = [
    {
      id: "connected",
      label: "CONNECTED",
      value: wired ? `${connected.length} of ${list.length}` : null,
      unit: wired ? `across ${new Set(list.map((c) => c.category)).size} categories` : "no register read",
    },
    { id: "hooks", label: "WEBHOOKS", value: total(list, (c) => c.hooks), unit: "registered" },
    {
      id: "failing",
      label: "FAILING",
      value: failingTotal,
      unit: "deliveries",
      // Red only when something is actually failing — a red "0" reads as an alarm that isn't.
      tone: failingTotal && failingTotal !== "0" ? "risk" : "neutral",
    },
    {
      id: "reauth",
      label: "REAUTH NEEDED",
      value: wired ? String(reauth) : null,
      unit: reauth === 1 ? "connection" : "connections",
      tone: reauth > 0 ? "warn" : "neutral",
    },
  ];

  const asRow = (c: IntegrationConnection, mode: IntegrationsTab): PanelRow => ({
    id: c.id,
    label: c.name,
    note: c.note ?? null,
    meta:
      mode === "health"
        ? `${typeof c.hooks === "number" ? `${c.hooks} ${c.hooks === 1 ? "hook" : "hooks"}` : "— hooks"} · last ${c.lastCall ?? "—"}`
        : c.category,
    pill: mode === "health" ? c.state : c.state,
    pillTone: HEALTH_TONE[c.health],
    band: HEALTH_TONE[c.health],
    glyph: mode === "health" ? "◐" : "⚯",
    cta: c.onOpen ? (c.health === "green" ? (mode === "health" ? "Test" : "Open") : "Repair") : null,
    onAct: c.onOpen,
  });

  return (
    <SettingsPanel
      eyebrow="PLATFORM"
      title={tab === "health" ? "Health" : tab === "available" ? "Available" : "Connected"}
      sub={
        tab === "health"
          ? "Delivery, tokens and last successful call — the honest state of every connection."
          : tab === "available"
            ? "What the platform could connect to and has not."
            : "Every service the platform holds a connection to, and what each one is for."
      }
      anchor="Every integration is scoped. No connection can read one tenant's data from another tenant's context, whatever its scope says."
      chip={wired ? (failing.length ? `${failing.length} need attention` : "All connected") : null}
      chipNote={failing.length ? "Anything not green is listed under Health." : null}
      cta="+ Connect a service"
      onCta={onConnect}
      kpis={tab === "available" ? undefined : kpis}
      {...shell}
    >
      {tab === "available" ? (
        <RowsBlock
          title="Available"
          sub="Nothing here is connected yet."
          rows={available}
          source="The available-integration catalog"
          foot="Connecting anything here grants a scope. The scope is shown before you agree to it, never after."
        />
      ) : tab === "health" ? (
        <RowsBlock
          title="Health"
          sub="Last successful call, hook count, and what is wrong."
          rows={wired ? list.map((c) => asRow(c, "health")) : undefined}
          source="The integration health register"
          foot="A green row means a probe ran and answered. It does not mean the service was merely reachable."
        />
      ) : (
        <RowsBlock
          title="Connected"
          sub="What each one is for, and its current state."
          rows={wired ? list.map((c) => asRow(c, "connected")) : undefined}
          source="The platform integration register"
          foot="Every connection is scoped. No integration can read one tenant's data from another tenant's context."
        />
      )}
    </SettingsPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Platform Team — CD L6857–6886. Seats · Roles.
   ──────────────────────────────────────────────────────────────────────────── */

export type PlatformSeat = {
  id: string;
  who: string;
  /** The role key the platform actually holds for this person (§53). */
  role: string;
  scope?: string | null;
  /** Two-factor state as the platform records it. Null → unknown, shown as unknown. */
  twoFactor?: boolean | null;
  /** Already-formatted last sign-in. Null → "—". */
  lastSeen?: string | null;
  /** The sole God-tier seat gets CD's gold band; it is a fact about the seat, not a style. */
  sole?: boolean;
  onManage?: () => void;
};

/**
 * One role in the platform's OWN taxonomy. This type is a shape, not a list: the roles come
 * from the platform (§53 — `super_admin` is God-tier and invite-only, `platform_admin` is the
 * delegated operator tier), and a copy hardcoded in this file would be a second home that
 * drifts (§18/§60).
 */
export type PlatformRole = {
  id: string;
  /** The role key exactly as the platform stores it — not a prettified label. */
  name: string;
  /** What the role may reach, and where its ceiling is. Rendered in full, never truncated. */
  ceiling: string;
  /** Seats currently holding it. Null → "—", never a guessed count. */
  seats: number | null;
  tone?: Tone;
  /** Named capabilities, when the caller can enumerate them. */
  permissions?: readonly string[];
};

export type PlatformTeamTab = "seats" | "roles";

export type PlatformTeamSurfaceProps = SurfaceShell & {
  tab: PlatformTeamTab;
  seats?: readonly PlatformSeat[];
  /** The platform role taxonomy, handed in. Never authored here (§53/§60). */
  roles?: readonly PlatformRole[];
  onInvite?: () => void;
};

export function PlatformTeamSurface({ tab, seats, roles, onInvite, ...shell }: PlatformTeamSurfaceProps) {
  const seatRows: PanelRow[] | undefined = seats?.map((s) => ({
    id: s.id,
    label: s.who,
    note: [s.role, s.scope].filter(Boolean).join(" · ") || null,
    meta: s.lastSeen ?? "—",
    initials: s.who
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "—",
    band: s.sole ? "gold" : "info",
    pill: s.twoFactor == null ? "2FA unknown" : s.twoFactor ? "2FA on" : "2FA missing",
    pillTone: s.twoFactor == null ? "neutral" : s.twoFactor ? "ok" : "risk",
    cta: s.onManage ? "Manage" : null,
    onAct: s.onManage,
  }));

  const roleRows: PanelRow[] | undefined = roles?.map((r) => ({
    id: r.id,
    label: r.name,
    note: r.ceiling,
    pill: r.seats == null ? "— seats" : `${r.seats} ${r.seats === 1 ? "seat" : "seats"}`,
    pillTone: r.tone ?? "neutral",
    tags: r.permissions,
  }));

  return (
    <SettingsPanel
      eyebrow="PLATFORM"
      title={tab === "roles" ? "Roles" : "Platform seats"}
      sub={
        tab === "roles"
          ? "What each platform role can reach. Distinct from any tenant's own team."
          : "Who operates the platform, and the ceiling each seat runs at."
      }
      chip={
        tab === "roles"
          ? roles
            ? `${roles.length} ${roles.length === 1 ? "role" : "roles"}`
            : null
          : seats
            ? `${seats.length} ${seats.length === 1 ? "seat" : "seats"}`
            : null
      }
      chipNote="Platform seats only — tenant teams live inside each tenant."
      cta={tab === "roles" ? null : "+ Invite a seat"}
      onCta={onInvite}
      actionsTitle="Seat hygiene"
      {...shell}
    >
      {tab === "roles" ? (
        <RowsBlock
          title="Roles"
          sub="Every role names its ceiling."
          rows={roleRows}
          source="The platform role taxonomy"
          wrapNotes
          foot="Act-as is read-write for the God-tier seat and read-only for everyone else. Every entry is logged either way."
        />
      ) : (
        <RowsBlock
          title="Seats"
          sub="A sole God-tier seat is a deliberate constraint, not an oversight."
          rows={seatRows}
          source="The platform seat register"
        />
      )}
    </SettingsPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Platform Vault — CD L6334–6381
   ──────────────────────────────────────────────────────────────────────────── */

export type PlatformVaultTab = "obligations" | "vendors" | "documents";

export type PlatformVaultSurfaceProps = SurfaceShell & {
  tab: PlatformVaultTab;
  obligations?: readonly PanelRow[];
  vendors?: readonly PanelRow[];
  documents?: readonly PanelRow[];
  /**
   * The vault's four figures. Money is the fastest way to lose an operator's trust, so these
   * are the caller's to supply from the record — this surface totals nothing itself (§13/§57).
   */
  kpis?: readonly PanelKpi[];
  chip?: string | null;
  onAdd?: () => void;
};

export function PlatformVaultSurface({
  tab, obligations, vendors, documents, kpis, chip, onAdd, ...shell
}: PlatformVaultSurfaceProps) {
  return (
    <SettingsPanel
      eyebrow="VAULT"
      title={tab === "vendors" ? "Vendors" : tab === "documents" ? "Documents" : "Obligations"}
      sub={
        tab === "vendors"
          ? "What the platform pays, and what happens if each one stops."
          : tab === "documents"
            ? "Contracts, policies and filings the platform itself holds."
            : "The platform's own commitments — dates she watches so you do not have to."
      }
      chip={chip ?? null}
      cta={tab === "documents" ? null : "+ Add an obligation"}
      onCta={onAdd}
      kpis={tab === "documents" ? undefined : kpis}
      actionsTitle="Worth doing now"
      {...shell}
    >
      {tab === "vendors" ? (
        <RowsBlock
          title="Vendors"
          sub="Cost, and the blast radius if they stop."
          rows={vendors}
          source="The vendor register"
          foot="A vendor with no second option takes the whole platform with it — that is what the single/redundant mark records."
        />
      ) : tab === "documents" ? (
        <RowsBlock
          title="Documents"
          sub="Sealed where they should be."
          rows={documents}
          source="The platform document vault"
        />
      ) : (
        <RowsBlock
          title="Obligations"
          sub="Ranked by what it costs to miss."
          rows={obligations}
          source="The platform obligation register"
        />
      )}
    </SettingsPanel>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Governance — CD L4968–5017
   ──────────────────────────────────────────────────────────────────────────── */

export type GovernanceTab = "approvals" | "audit-log" | "act-as-history" | "security";

export type GovernanceSurfaceProps = SurfaceShell & {
  tab: GovernanceTab;
  /** Drafted decisions waiting on the operator. */
  approvals?: readonly PanelRow[];
  /** The audit timeline for whichever lens is open — the caller filters, this renders. */
  events?: readonly PanelEvent[];
  /** Compliance posture — every value is a claim, so every value comes from the record. */
  posture?: readonly PanelField[];
  kpis?: readonly PanelKpi[];
};

const GOV_COPY: Record<GovernanceTab, { title: string; sub: string }> = {
  approvals: {
    title: "Approvals",
    sub: "Everything she has drafted and is holding for your ruling.",
  },
  "audit-log": {
    title: "Audit log",
    sub: "Every operator action on the platform, in order, with a name against it.",
  },
  "act-as-history": {
    title: "Act-as history",
    sub: "Every tenant you entered, how long, and what you could reach while you were there.",
  },
  security: { title: "Security posture", sub: "Seats, sign-ins, and anything that tried a door it shouldn't." },
};

export function GovernanceSurface({
  tab, approvals, events, posture, kpis, ...shell
}: GovernanceSurfaceProps) {
  const copy = GOV_COPY[tab];
  return (
    <SettingsPanel
      eyebrow="GOVERNANCE"
      title={copy.title}
      sub={copy.sub}
      chip={
        tab === "approvals"
          ? approvals
            ? `${approvals.length} waiting`
            : null
          : events
            ? `${events.length} ${events.length === 1 ? "event" : "events"}`
            : null
      }
      chipNote={
        tab === "approvals"
          ? "She drafted each one. None of them move without you."
          : "Retained for seven years. Nothing here can be edited or deleted."
      }
      kpis={kpis}
      actionsTitle="Worth a look"
      {...shell}
    >
      {tab === "approvals" && (
        <RowsBlock
          title="Waiting on you"
          sub="She drafted each one. None of them move without you."
          rows={approvals}
          source="The approvals queue"
          wrapNotes
        />
      )}

      {tab !== "approvals" && (
        <FeedBlock
          title={tab === "act-as-history" ? "Where you have been" : "What happened"}
          sub="Newest first."
          events={events}
          source="The platform audit log"
        />
      )}

      {(tab === "security" || tab === "approvals") && (
        <FieldsBlock
          title="Compliance posture"
          sub="Where the platform stands, honestly."
          fields={posture}
          source="The compliance posture record"
          cols={3}
        />
      )}
    </SettingsPanel>
  );
}
