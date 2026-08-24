import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import ComposeOutbound, {
  CHANNELS,
  DM_NETWORKS,
  type ComposeSnippet,
} from "@/operator/surfaces/ComposeOutbound";
import {
  RELATIONSHIPS_ABSENCE,
  type ThreadRow,
} from "@/operator/surfaces/relationships/relationshipsContract";

/**
 * Relationships · Conversations — the console.
 *
 * PORTED FROM `PAIGE Super Admin Shell v3.dc.html`: `convoVals` L5300–L5525, markup L737–L905.
 * BUILD-ORDER Layer 3a, and the slice that gives `ComposeOutbound` its home.
 *
 * ─── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────────────────────
 *
 * `ComposeOutbound` was ported ahead of its host and has been sitting unmounted behind a
 * reachability exemption ever since, with the reason recorded in `SlotSurfaceBody`: *"Mounting
 * it alone at relationships/conversations would put a v3 composer on screen with no threads to
 * compose against… So Conversations keeps its current panels until `convoVals` is ported, and
 * that port is the slice that mounts this."* This is that slice. The exemption comes off with it.
 *
 * ─── WHAT REPLACES WHAT (§58) ────────────────────────────────────────────────────────────────
 *
 * This view carried five panels off the retired tree — `comms/outbound`, `comms/templates`,
 * `comms/sent-log`, `support/inbox`, `support/escalations`. Those were PORTED CD SPECS from the
 * pack the owner ruled dead on 2026-08-22, not live capabilities: they render `OperatorPanel`
 * with stand-in figures, and none of them reads or writes. The real operator comms capability
 * (task #22's Twilio seam) lives at its own address and is not touched here. Their keys stay in
 * `carries` so the addresses are not lost track of.
 *
 * ─── THE THREE PANES, AND WHY A FOLD IS NOT A LOSS ───────────────────────────────────────────
 *
 * Threads · the conversation · the person. CD, L5324: *"Panes answer to real width. Below the
 * floor the person rail moves into the slide-over the shell already has, and below that the list
 * becomes a back step — rather than three tracks shrinking until nothing is legible."* And when
 * a pane folds away, its contents come back as a HEADER ACT (L5480): *"a fold is a change of
 * geometry, never a loss of the surface."* Both are ported: the grid drops tracks at each floor,
 * and the header grows the Threads / New / The person glyphs exactly where the pack grows them.
 *
 * ─── STRUCTURE BEFORE DATA ───────────────────────────────────────────────────────────────────
 *
 * `threads` arrives empty and that is the finished Layer 3 state. `P.THREADS` is CD's
 * illustration — every row is labelled "design fixture A/B" in the pack itself — and its message
 * bodies, phone numbers and drafts do not come over. The TAPE above the console counts what is
 * actually there, so with no threads it reads zero rather than hiding, and the one figure that
 * is real either way is `channels live`: five channels with a substrate claim about THIS repo,
 * which is vocabulary, not a fixture.
 *
 * EVERY CONTROL IS REAL OR VISIBLY UNAVAILABLE. Send, call, export and the thread acts are
 * `disabled` with a title saying what they need when no handler is supplied — never a control
 * that looks live and silently does nothing.
 */

export type ConversationsSurfaceProps = {
  readonly threads?: readonly ThreadRow[];
  readonly snippets?: readonly ComposeSnippet[];
  readonly onSend?: (thread: ThreadRow, body: string, channel: string) => void;
  readonly onSaveDraft?: (thread: ThreadRow, body: string) => void;
  readonly onCall?: (thread: ThreadRow) => void;
  readonly onOpenInPeople?: (thread: ThreadRow) => void;
  readonly onExport?: (thread: ThreadRow) => void;
  readonly onFollowUp?: (thread: ThreadRow) => void;
  readonly onAnnounce?: (message: string) => void;
};

const PANE_LABEL =
  "text-[11px] font-medium tracking-[0.005em] text-[var(--pg-faint)]";

/** `convoVals` L5495 — glyphs for the header acts, verbatim. */
const G_THREADS = "M2.6 4h10.8 M2.6 8h10.8 M2.6 12h6.4";
const G_PLUS = "M8 3.4v9.2 M3.4 8h9.2";
const G_CALL =
  "M3 3.4h2.8l1.2 2.8-1.6 1.2a8 8 0 0 0 3.2 3.2l1.2-1.6 2.8 1.2v2.8a10.6 10.6 0 0 1-9.6-9.6z";
const G_PERSON =
  "M5.2 5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0 M2.6 13.4c0-2.6 2.4-4.2 5.4-4.2s5.4 1.6 5.4 4.2";
const G_DOWN = "M8 2.6v7.6 M5 7.6L8 10.6l3-3 M3 12.4h10";

export default function ConversationsSurface({
  threads = [],
  snippets = [],
  onSend,
  onSaveDraft,
  onCall,
  onOpenInPeople,
  onExport,
  onFollowUp,
  onAnnounce,
}: ConversationsSurfaceProps) {
  const [filter, setFilter] = useState<string>("All");
  const [threadId, setThreadId] = useState<string | null>(null);
  /** `s.pane1` — which pane a narrow console is showing. */
  const [solo, setSolo] = useState<"list" | "convo" | "person">("convo");
  const [sendAs, setSendAs] = useState<string | undefined>(undefined);
  const [body, setBody] = useState("");

  const list = useMemo(
    () => (filter === "All" ? threads : threads.filter((t) => t.channel === filter)),
    [threads, filter],
  );
  const active = useMemo(
    () => threads.find((t) => t.id === threadId) ?? list[0] ?? threads[0] ?? null,
    [threads, list, threadId],
  );

  const glyphOf = (channel: string, network?: string | null) =>
    (network && DM_NETWORKS[network]?.glyph) ||
    CHANNELS.find((c) => c.key === channel)?.glyph ||
    CHANNELS[0].glyph;

  const liveChannels = CHANNELS.filter((c) => c.substrate === "Live").length;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* ── THE TAPE · v3 L5518–L5524 ───────────────────────────────────────────────────────────
          A tape, not a ladder. CD: *"these are orienting figures, and a ladder was spending a
          third of the surface saying what a line of type says."* Every figure is a count over
          what is actually loaded, so with nothing read they are zeros rather than em-dashes —
          "0 open" is a true statement about an empty console, where "—" would be a shrug. */}
      <div className="mb-3 flex flex-none flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-[var(--pg-line-soft)] pb-2.5">
        <TapeFigure value={String(threads.length)} label="open" />
        <TapeFigure value={String(threads.filter((t) => t.unread > 0).length)} label="unread" />
        <TapeFigure value={String(threads.filter((t) => t.draft).length)} label="drafted" />
        <TapeFigure value={`${liveChannels} of ${CHANNELS.length}`} label="channels live" />
      </div>

      {/* ── THE CONSOLE · v3 L738–L905 ─────────────────────────────────────────────────────────
          Three tracks at full width, two below the rail floor, one below the list floor. The
          pack measures a canvas width; the same floors expressed as container breakpoints put
          the rail out first and the list second, which is the order CD folds them in. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] border-y border-[var(--pg-line-strong)] md:grid-cols-[minmax(190px,0.9fr)_minmax(240px,1.9fr)] xl:grid-cols-[minmax(200px,0.86fr)_minmax(300px,1.78fr)_minmax(190px,0.88fr)]">
        {/* ── the threads ─────────────────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col bg-[var(--pg-spine)] shadow-[inset_-1px_0_0_var(--pg-line-strong)] md:flex",
            solo === "list" ? "flex" : "hidden",
          )}
        >
          <div className="flex min-h-[40px] flex-none items-center gap-2 border-b border-[var(--pg-line)] pl-3 pr-2.5">
            {solo !== "convo" && (
              <button
                type="button"
                onClick={() => setSolo("convo")}
                className="mr-auto inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--pg-r-chip)] border-0 bg-transparent px-2 text-[11px] text-[var(--pg-muted)] md:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ‹ Conversation
              </button>
            )}
            <small className={cn(PANE_LABEL, "flex-1")}>Threads</small>
            {/* Icon-only, because CD found the labels *"were spending a whole band of the
                surface on a control you use once."* */}
            <FilterGlyph label="All" on={filter === "All"} onClick={() => setFilter("All")} />
            {CHANNELS.map((c) => (
              <FilterGlyph
                key={c.key}
                title={c.substrate === "Live" ? c.key : `${c.key} — ${c.substrate}`}
                glyph={c.glyph}
                on={filter === c.key}
                onClick={() => setFilter(c.key)}
              />
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {list.map((t) => {
              const on = active?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setThreadId(t.id);
                    setSolo("convo");
                  }}
                  className={cn(
                    "grid min-h-[62px] w-full grid-cols-[2px_14px_minmax(0,1fr)_auto] items-center gap-2.5 border-0 border-b border-[var(--pg-line-soft)] py-2.5 pl-0 pr-3 text-left",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    on ? "bg-[var(--pg-lift)]" : "bg-transparent",
                  )}
                >
                  <i
                    aria-hidden
                    className="self-stretch"
                    style={{ background: on ? "var(--pg-gold)" : "transparent" }}
                  />
                  <Glyph
                    d={glyphOf(t.channel, t.network)}
                    className={cn(
                      "h-3.5 w-3.5",
                      t.unread > 0 ? "text-[var(--pg-gold-deep)]" : "text-[var(--pg-faint)]",
                    )}
                  />
                  <span className="flex min-w-0 flex-col">
                    <b
                      className={cn(
                        "truncate text-[12.5px] text-foreground",
                        t.unread > 0 ? "font-semibold" : "font-medium",
                      )}
                    >
                      {t.who}
                    </b>
                    <small className="mt-[3px] truncate text-[11px] text-[var(--pg-faint)]">
                      {t.preview}
                    </small>
                  </span>
                  <span className="flex flex-col items-end gap-[5px]">
                    <small className="font-mono text-[10px] text-[var(--pg-faint)]">{t.when}</small>
                    {t.unread > 0 && (
                      <i
                        aria-hidden
                        className="h-1.5 w-1.5 rotate-45 bg-[var(--pg-gold)]"
                      />
                    )}
                  </span>
                </button>
              );
            })}

            {threads.length === 0 && (
              <div className="px-3 py-5">
                <b className="block text-[12px] font-semibold text-foreground">
                  {RELATIONSHIPS_ABSENCE.title}
                </b>
                <p className="mt-2 text-[12px] leading-[1.6] text-muted-foreground [text-wrap:pretty]">
                  {RELATIONSHIPS_ABSENCE.body}
                </p>
              </div>
            )}
            {threads.length > 0 && list.length === 0 && (
              <p className="px-3 py-4 text-[11.5px] text-[var(--pg-faint)]">
                No thread on this channel.
              </p>
            )}
          </div>
        </div>

        {/* ── the conversation ────────────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col bg-[var(--pg-canvas)] shadow-[inset_-1px_0_0_var(--pg-line-strong)] md:flex",
            solo === "convo" ? "flex" : "hidden",
          )}
        >
          <div className="grid min-h-[40px] flex-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[var(--pg-line)] px-3.5">
            <Glyph
              d={active ? glyphOf(active.channel, active.network) : CHANNELS[0].glyph}
              className="h-3.5 w-3.5 text-[var(--pg-gold-deep)]"
            />
            <b className="truncate text-[12px] font-medium">
              {active?.who ?? "No thread"}
            </b>
            <span className="flex gap-0.5">
              {/* A folded pane returns as a header act — a fold is a change of geometry, never
                  a loss of the surface (CD, L5480). These two exist only below the floors. */}
              <span className="flex gap-0.5 md:hidden">
                <HeadAct title="Threads" glyph={G_THREADS} onClick={() => setSolo("list")} />
                <HeadAct
                  title="New conversation"
                  glyph={G_PLUS}
                  onClick={
                    threads.length
                      ? () => {
                          setSolo("list");
                          onAnnounce?.("Starting a conversation opens the thread list.");
                        }
                      : undefined
                  }
                />
              </span>
              <HeadAct
                title="Call"
                glyph={G_CALL}
                onClick={active && onCall ? () => onCall(active) : undefined}
              />
              <span className="xl:hidden">
                <HeadAct title="The person" glyph={G_PERSON} onClick={() => setSolo("person")} />
              </span>
              <span className="hidden xl:inline-flex">
                <HeadAct
                  title="Open in People"
                  glyph={G_PERSON}
                  onClick={active && onOpenInPeople ? () => onOpenInPeople(active) : undefined}
                />
              </span>
              <HeadAct
                title="Download the thread"
                glyph={G_DOWN}
                onClick={active && onExport ? () => onExport(active) : undefined}
              />
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-2 pt-4">
            {(active?.msgs ?? []).map((m, i) => {
              const inbound = m.dir === "in";
              return (
                <div
                  key={`${m.when}-${i}`}
                  className={cn(
                    "max-w-[86%]",
                    inbound
                      ? "self-start border-l border-[var(--pg-line-strong)] pl-[13px] text-left"
                      : "self-end border-r border-[var(--pg-gold-deep)] pr-[13px] text-right",
                  )}
                >
                  <small className="block font-mono text-[10px] tracking-[0.06em] text-[var(--pg-faint)]">
                    {(inbound ? active?.who.split("·")[1]?.trim() || "Them" : m.by || "You") +
                      " · " +
                      m.when}
                  </small>
                  <p
                    className={cn(
                      "mt-1.5 text-[13.5px] leading-[1.6]",
                      m.call ? "italic text-[var(--pg-faint)]" : "text-[var(--pg-ink-2)]",
                    )}
                  >
                    {m.body}
                  </p>
                </div>
              );
            })}
            {!active && (
              <p className="text-[11.5px] leading-[1.6] text-[var(--pg-faint)]">
                No thread is open because none is read yet. The pane is the conversation itself —
                every message on every channel, in one place, with the composer beneath it.
              </p>
            )}
          </div>

          {/* The composer, finally at its own address. Every handler is optional and a missing
              one leaves its control visibly unavailable rather than inert. */}
          <ComposeOutbound
            sendAs={sendAs}
            onSendAs={setSendAs}
            network={active?.network ?? null}
            draft={active?.draft ?? null}
            snippets={snippets}
            value={body}
            onChange={setBody}
            onSend={
              active && onSend
                ? () => {
                    onSend(active, body, sendAs ?? active.channel);
                    setBody("");
                  }
                : undefined
            }
            onSaveDraft={active && onSaveDraft ? () => onSaveDraft(active, body) : undefined}
            onDownload={active && onExport ? () => onExport(active) : undefined}
          />
        </div>

        {/* ── the person ──────────────────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "min-h-0 min-w-0 flex-col bg-[var(--pg-spine)] xl:flex",
            solo === "person" ? "flex" : "hidden",
          )}
        >
          <div className="flex min-h-[40px] flex-none items-center border-b border-[var(--pg-line)] px-3.5">
            {solo === "person" && (
              <button
                type="button"
                onClick={() => setSolo("convo")}
                className="mr-auto inline-flex min-h-[26px] items-center gap-1.5 rounded-[var(--pg-r-chip)] border-0 bg-transparent px-2 text-[11px] text-[var(--pg-muted)] xl:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ‹ Conversation
              </button>
            )}
            <small className={PANE_LABEL}>The person</small>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3.5 pb-4 pt-1.5">
            {!active ? (
              <p className="text-[11.5px] leading-[1.6] text-[var(--pg-faint)]">
                The rail carries whoever the open thread is with — their channel, their contact
                details, the stage they are at, and whether she is holding a reply.
              </p>
            ) : (
              <>
                <b className="block text-[13px] font-medium">{active.who}</b>
                <dl className="mt-3.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-[7px]">
                  <PersonFact k="Channel" v={active.network ? `DM · ${active.network}` : active.channel} />
                  <PersonFact k="Phone" v={active.phone} />
                  <PersonFact k="Email" v={active.email} />
                  <PersonFact k="Stage" v={active.stage} />
                  <PersonFact k="Owner" v={active.owner} />
                  <PersonFact k="State" v={active.state} />
                </dl>
                <p className="mt-4 border-t border-[var(--pg-line-soft)] pt-[13px] font-[var(--pg-font-editorial)] text-[13.5px] italic leading-[1.58] text-[var(--pg-muted)] [text-wrap:pretty]">
                  {active.draft
                    ? "She has a reply ready and is holding it — ask first is the grant on this channel."
                    : "Nothing drafted. She is watching the thread and will surface it if it goes quiet."}
                </p>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  <RailAct
                    label="Open in People"
                    onClick={onOpenInPeople && (() => onOpenInPeople(active))}
                  />
                  <RailAct
                    label="Ask for a follow-up"
                    onClick={onFollowUp && (() => onFollowUp(active))}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TapeFigure({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <b className="tabular-nums text-[15px] font-medium text-foreground">{value}</b>
      <small className="text-[11px] text-[var(--pg-faint)]">{label}</small>
    </span>
  );
}

function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterGlyph({
  label,
  glyph,
  title,
  on,
  onClick,
}: {
  label?: string;
  glyph?: string;
  title?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      aria-label={title ?? label}
      onClick={onClick}
      className={cn(
        "grid min-h-[26px] place-items-center rounded-[var(--pg-r-chip)] border-0 text-[10.5px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        glyph ? "h-[26px] w-[26px]" : "px-[7px]",
        on
          ? "bg-[var(--pg-lift)] font-semibold text-foreground shadow-[inset_0_0_0_1px_var(--pg-line)]"
          : "bg-transparent font-normal text-[var(--pg-faint)]",
      )}
    >
      {glyph ? <Glyph d={glyph} className="h-[13px] w-[13px]" /> : label}
    </button>
  );
}

function HeadAct({
  title,
  glyph,
  onClick,
}: {
  title: string;
  glyph: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={onClick ? title : `${title} — no seam wired yet`}
      aria-label={title}
      onClick={onClick}
      disabled={!onClick}
      className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[var(--pg-r-chip)] border-0 bg-transparent text-[var(--pg-faint)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Glyph d={glyph} className="h-3.5 w-3.5" />
    </button>
  );
}

function PersonFact({ k, v }: { k: string; v?: string }) {
  return (
    <>
      <dt className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.07em] text-[var(--pg-faint)]">
        {k}
      </dt>
      <dd
        className={cn(
          "m-0 truncate font-mono text-[11.5px]",
          v ? "text-[var(--pg-ink-2)]" : "text-[var(--pg-faint)]",
        )}
      >
        {v ?? "—"}
      </dd>
    </>
  );
}

function RailAct({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? undefined : `${label} has no seam wired yet`}
      className="min-h-[32px] flex-none whitespace-nowrap rounded-[2px] border border-[var(--pg-line)] bg-transparent px-3 text-[11.5px] text-[var(--pg-muted)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}
