import { useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Workspace — Claude Design's `isWorkspace` block (Super Admin Shell.dc.html, L1868–2093).
 *
 * Paige's operator chat: CD's 236px left rail (New chat · search · PROJECTS · TODAY · EARLIER ·
 * the rail foot), and the conversation pane — header with her mark, live status, model and
 * scope chips; the thread with her department trace, evidence rows, citations and act buttons;
 * the streaming placeholder; and the composer with its suggestion chips, tool row, voice key
 * and gold Send.
 *
 * §13 — NOTHING HERE IS INVENTED. CD's pack ships a fully-written conversation: a morning
 * brief, a pipeline she "built", "41 chats · 4 projects", "2.8s · 11k tokens", named
 * departments with millisecond timings. Porting any of that as a literal would put words in
 * Paige's mouth that she never said and figures against work she never did — the worst class
 * of fabrication on a surface whose entire job is reporting what she actually did (§13/§14).
 * So every message, project, chat, chip, trace step, citation and count is handed in by the
 * caller. No thread → the pane says the chat is not connected yet, in as many words. The rail
 * foot counts the lists we were actually given; with nothing given it reads "—", never a
 * plausible number.
 *
 * §10 — the caller owns the seam. `onSend` is the one write; without it the composer is
 * disabled and SAYS it is disabled rather than swallowing what the operator typed.
 *
 * §21/§36 — one session, no artifact-type tabs, and nothing here asks the operator to learn
 * how to ask: the suggestion chips write the prompt for them.
 */

export type WorkspaceProject = {
  id: string;
  label: string;
  /** How many chats sit in it. Null when the caller does not know — renders "—". */
  count: number | null;
  glyph?: string;
};

export type WorkspaceChat = {
  id: string;
  title: string;
  /** First line of the last message. Optional — never invented here. */
  preview?: string | null;
  /** Already-formatted by the caller, who owns the operator's timezone. */
  when: string;
  pinned?: boolean;
};

/** One department's step inside a trace — what the sub-agent did, and how long it took. */
export type TraceStep = {
  id: string;
  who: string;
  what: string;
  /** Real elapsed time from the run record. Null → "—". */
  took?: string | null;
  tone?: MessageTone;
};

export type MessageRow = { id: string; label: string; value: string | null; tone?: MessageTone };
export type MessageCite = { id: string; n: string; doc: string; where?: string | null };
export type MessageAct = { id: string; label: string; tone?: "gold" | "default"; onAct?: () => void };
export type MessageTone = "neutral" | "ok" | "warn" | "risk" | "info";

export type WorkspaceMessage = {
  id: string;
  /** `you` renders CD's right-aligned bubble; `paige` renders her full answer block. */
  from: "you" | "paige";
  who: string;
  when: string;
  text: string;
  /** How it arrived — CD shows "typed" / "voice" under the operator's own message. */
  via?: string | null;
  /** Wall time she took. Null → the label is simply absent, never a guessed duration. */
  took?: string | null;
  /** Her team's real working (§14). Empty/absent → no trace toggle is drawn at all. */
  trace?: readonly TraceStep[];
  traceLabel?: string | null;
  /** Real cost/latency from the run record. Null → "—". */
  traceCost?: string | null;
  rows?: readonly MessageRow[];
  cites?: readonly MessageCite[];
  acts?: readonly MessageAct[];
};

export type WorkspaceSurfaceProps = {
  projects: readonly WorkspaceProject[];
  /** CD splits the chat list in two: today's, and everything older. */
  recent: readonly WorkspaceChat[];
  earlier: readonly WorkspaceChat[];
  /** The open conversation. Empty → the pane says the chat seam is not connected. */
  thread: readonly WorkspaceMessage[];
  activeChatId?: string | null;
  onSelectChat?: (id: string) => void;
  onNewChat?: () => void;
  /** The one write. Absent → composer disabled, and it says why. */
  onSend?: (text: string) => void;
  /**
   * The LIVE conversation, mounted inside CD's chrome.
   *
   * The platform already ships a working operator chat — real threads, voice dictation, spoken
   * playback, artifact cards, the whole seam. CD's pack draws its own thread and composer, but
   * those are a DESIGN of a chat, not a chat. Rendering them here in place of the working one
   * would replace a shipped capability with a picture of it (§58). So when a caller passes the
   * real chat, CD's rail and header render exactly as designed and the pane hosts the live
   * conversation instead of the drawn one — the design around the thing that works, not instead
   * of it.
   */
  chatSlot?: ReactNode;
  /** Prompt suggestions. Absent → the chip row is not drawn (§13 — no invented prompts). */
  chips?: readonly string[];
  /** Which model tier answered, from the router record. Null → "—". */
  model?: string | null;
  modelNote?: string | null;
  /** The authority this session runs at, from the session — not a label we choose. */
  scope?: string | null;
  /** Live connection state. Absent → no dot and no claim that she is listening. */
  status?: { label: string; live: boolean } | null;
  /** Set while a real generation is in flight. */
  streaming?: { who: string; what: string } | null;
  loading?: boolean;
  error?: string | null;
};

const TONE_DOT: Record<MessageTone, string> = {
  neutral: "bg-muted-foreground/50",
  ok: "bg-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning))]",
  risk: "bg-[hsl(var(--destructive))]",
  info: "bg-[hsl(var(--primary))]",
};

/** CD's rail count and every metered figure: real, or an em dash. Never a plausible stand-in. */
function num(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "—";
}

export default function WorkspaceSurface({
  projects, recent, earlier, thread,
  activeChatId = null, onSelectChat, onNewChat, onSend, chatSlot,
  chips, model = null, modelNote = null, scope = null, status = null,
  streaming = null, loading = false, error = null,
}: WorkspaceSurfaceProps) {
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [project, setProject] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openTrace, setOpenTrace] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");

  const needle = q.trim().toLowerCase();
  const match = useCallback(
    (c: WorkspaceChat) =>
      !needle || `${c.title} ${c.preview ?? ""}`.toLowerCase().includes(needle),
    [needle],
  );
  const shownRecent = useMemo(() => recent.filter(match), [recent, match]);
  const shownEarlier = useMemo(() => earlier.filter(match), [earlier, match]);

  const chatCount = recent.length + earlier.length;
  const railFoot =
    chatCount === 0 && projects.length === 0
      ? "— chats · — projects"
      : `${num(chatCount)} ${chatCount === 1 ? "chat" : "chats"} · ${num(projects.length)} ${
          projects.length === 1 ? "project" : "projects"
        }`;

  const send = () => {
    const text = draft.trim();
    if (!text || !onSend) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 items-stretch gap-3.5">
      {/* ── CHAT RAIL (CD 236px) ──────────────────────────────────────────── */}
      <div className="hidden w-[236px] flex-none flex-col gap-[9px] lg:flex">
        <button
          type="button"
          onClick={onNewChat}
          disabled={!onNewChat}
          className="flex flex-none items-center gap-2 rounded-[10px] bg-cd-gold px-3 py-[9px] text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden className="text-[11px]">＋</span>New chat
        </button>

        <div className="flex min-w-0 flex-none items-center gap-2 rounded-[10px] border border-border bg-card px-[11px] py-[7px]">
          <span aria-hidden className="flex-none text-[11px] text-muted-foreground">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search your chats"
            placeholder="Search your chats"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-0.5">
          {/* PROJECTS */}
          <div>
            <button
              type="button"
              onClick={() => setFoldersOpen((o) => !o)}
              aria-expanded={foldersOpen}
              className="flex w-full items-center gap-[7px] rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">
                PROJECTS
              </span>
              <span aria-hidden className="ml-auto text-[9px] text-muted-foreground">
                {foldersOpen ? "▾" : "▸"}
              </span>
            </button>
            {foldersOpen && (
              <div className="mt-[7px] flex flex-col gap-[3px]">
                {projects.length === 0 && (
                  <p className="px-[9px] text-[10.5px] leading-relaxed text-muted-foreground">
                    No projects yet.
                  </p>
                )}
                {projects.map((p) => {
                  const on = project === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setProject(on ? null : p.id)}
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-lg px-[9px] py-1.5 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        on ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex-none text-[11px]",
                          on ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {p.glyph ?? "◫"}
                      </span>
                      <span className={cn("min-w-0 truncate text-[12px]", on ? "font-semibold" : "font-medium")}>
                        {p.label}
                      </span>
                      <span className="ml-auto flex-none font-mono text-[9.5px] tabular-nums text-muted-foreground">
                        {num(p.count)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* TODAY */}
          <div>
            <div className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">TODAY</div>
            <div className="mt-[7px] flex flex-col gap-0.5">
              {shownRecent.length === 0 && (
                <p className="px-[9px] text-[10.5px] leading-relaxed text-muted-foreground">
                  {recent.length === 0 ? "Nothing today." : "Nothing matches that."}
                </p>
              )}
              {shownRecent.map((c) => {
                const on = c.id === activeChatId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => onSelectChat?.(c.id)}
                    className={cn(
                      "min-w-0 rounded-lg border-l-2 px-[9px] py-[7px] text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-l-cd-gold bg-muted" : "border-l-transparent hover:bg-muted/60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-[7px]">
                      <span className={cn("min-w-0 truncate text-[11.5px]", on ? "font-semibold" : "font-medium")}>
                        {c.title}
                      </span>
                      {c.pinned && (
                        <span aria-label="Pinned" className="flex-none text-[9px] text-[hsl(var(--gold-dark))]">
                          ◆
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                        {c.preview ?? "—"}
                      </span>
                      <span className="ml-auto flex-none font-mono text-[9px] text-muted-foreground">
                        {c.when}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* EARLIER */}
          {earlier.length > 0 && (
            <div>
              <div className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">EARLIER</div>
              <div className="mt-[7px] flex flex-col gap-0.5">
                {shownEarlier.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-current={c.id === activeChatId ? "true" : undefined}
                    onClick={() => onSelectChat?.(c.id)}
                    className="min-w-0 rounded-lg px-[9px] py-[7px] text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 truncate text-[11.5px]">{c.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{c.when}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-[7px] border-t border-border pt-2">
          <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">{railFoot}</span>
        </div>
      </div>

      {/* ── CONVERSATION ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card">
        {/* header */}
        <div className="flex min-w-0 flex-none items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
          <span
            aria-hidden
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-[hsl(var(--primary))] text-[11px] text-[hsl(var(--primary-foreground))]"
          >
            ✦
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-[7px]">
              <span className="truncate text-[13px] font-semibold">Paige</span>
              {status && (
                <span className="flex flex-none items-center gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      status.live ? "bg-[hsl(var(--success))] motion-safe:animate-pulse" : "bg-muted-foreground/50",
                    )}
                  />
                  <span className="text-[10px] font-semibold text-muted-foreground">{status.label}</span>
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
              {/* The authority this session runs at — and NOTHING about its reach. CD's line
                  reads "· every tenant, every seam", which is false for a scoped platform_admin:
                  they are redirected out of the owner-only sections entirely (§13/§53). */}
              {scope ? `Signed in at ${scope}` : "Scope not resolved"}
            </div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-1.5">
            <span
              title={modelNote ?? undefined}
              className="whitespace-nowrap rounded-full bg-muted px-[9px] py-[3px] text-[10px] font-semibold text-muted-foreground"
            >
              {model ?? "—"}
            </span>
            <span className="whitespace-nowrap rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-[3px] text-[10.5px] font-semibold text-[hsl(var(--primary))]">
              {scope ?? "—"}
            </span>
            <button
              type="button"
              onClick={onNewChat}
              disabled={!onNewChat}
              aria-label="New thread"
              className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg border border-border bg-card text-[12px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span aria-hidden>＋</span>
            </button>
          </div>
        </div>

        {/* The live conversation, when the caller mounted one. CD's rail and header stay exactly
            as designed above; only the drawn thread and drawn composer step aside for the real
            ones, which bring their own scrolling, their own composer, the mic and playback. */}
        {chatSlot ? (
          <div className="flex min-h-0 flex-1 flex-col">{chatSlot}</div>
        ) : (
        <>
        {/* thread */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-4 py-3.5">
          {loading && (
            <div className="flex flex-col gap-2.5">
              <div className="h-2.5 w-[78%] rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-2.5 w-[54%] rounded bg-muted motion-safe:animate-pulse" />
            </div>
          )}

          {!loading && error && (
            <div className="px-4 py-10 text-center">
              <div className="text-[13px] font-semibold">The conversation could not be read.</div>
              <div className="mx-auto mt-1 max-w-md text-[11.5px] text-muted-foreground">{error}</div>
            </div>
          )}

          {!loading && !error && thread.length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="text-[13px] font-semibold">No conversation here yet.</div>
              <div className="mx-auto mt-1 max-w-md text-[11.5px] leading-relaxed text-muted-foreground">
                {onSend
                  ? "Ask her something — the platform, the fleet, the rails. Everything she does streams back into this one session."
                  : "The operator chat seam is not connected to this surface yet, so nothing can be sent or read from here."}
              </div>
            </div>
          )}

          {!loading &&
            !error &&
            thread.map((m) =>
              m.from === "you" ? (
                <div key={m.id} className="flex min-w-0 justify-end">
                  <div className="min-w-0 max-w-[76%] rounded-[14px_14px_4px_14px] border border-border bg-muted px-[13px] py-2.5">
                    <div className="whitespace-pre-line text-[13.5px] leading-[1.6]">{m.text}</div>
                    <div className="mt-1.5 flex items-center justify-end gap-1.5">
                      <span className="font-mono text-[9.5px] text-muted-foreground">{m.when}</span>
                      {m.via && <span className="text-[10px] text-muted-foreground">{m.via}</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex min-w-0 gap-[11px]">
                  <span
                    aria-hidden
                    className="mt-px grid h-6 w-6 flex-none place-items-center rounded-full bg-[hsl(var(--primary))] text-[10px] text-[hsl(var(--primary-foreground))]"
                  >
                    ✦
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-[11px] font-semibold text-[hsl(var(--primary))]">{m.who}</span>
                      <span className="font-mono text-[9.5px] text-muted-foreground">{m.when}</span>
                      {m.took && (
                        <span className="font-mono text-[9.5px] text-muted-foreground/80">{m.took}</span>
                      )}
                    </div>

                    {/* Her team's working — drawn only when a real trace exists (§14/§13). */}
                    {m.trace && m.trace.length > 0 && (
                      <>
                        <button
                          type="button"
                          aria-expanded={!!openTrace[m.id]}
                          onClick={() => setOpenTrace((o) => ({ ...o, [m.id]: !o[m.id] }))}
                          className="mt-[7px] flex min-w-0 w-full items-center gap-2 rounded-[9px] border border-border bg-muted/40 px-2.5 py-1.5 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span aria-hidden className="flex-none text-[10px] text-[hsl(var(--primary))]">
                            {openTrace[m.id] ? "▾" : "▸"}
                          </span>
                          <span className="min-w-0 truncate text-[11px]">
                            {m.traceLabel ??
                              `${m.trace.length} ${m.trace.length === 1 ? "specialist" : "specialists"} worked on this`}
                          </span>
                          <span className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground">
                            {m.traceCost ?? "—"}
                          </span>
                        </button>
                        {openTrace[m.id] && (
                          <div className="mt-1.5 flex flex-col gap-px border-l-2 border-[hsl(var(--primary)/0.35)] pl-[11px]">
                            {m.trace.map((s) => (
                              <div key={s.id} className="flex min-w-0 items-center gap-2.5 py-[5px]">
                                <span
                                  aria-hidden
                                  className={cn("h-1.5 w-1.5 flex-none rounded-full", TONE_DOT[s.tone ?? "info"])}
                                />
                                <span className="flex-none text-[11.5px] font-semibold">{s.who}</span>
                                <span className="min-w-0 truncate text-[11px] text-muted-foreground">{s.what}</span>
                                <span className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground">
                                  {s.took ?? "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    <div className="mt-2 whitespace-pre-line text-[13.5px] leading-[1.66]">{m.text}</div>

                    {m.rows && m.rows.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-[5px]">
                        {m.rows.map((r) => (
                          <div
                            key={r.id}
                            className="flex min-w-0 items-center gap-2.5 rounded-[9px] border border-border bg-muted/40 px-[11px] py-[7px]"
                          >
                            <span
                              aria-hidden
                              className={cn("h-[7px] w-[7px] flex-none rounded-full", TONE_DOT[r.tone ?? "neutral"])}
                            />
                            <span className="min-w-0 truncate text-[12px]">{r.label}</span>
                            <span className="ml-auto flex-none font-mono text-[11px] tabular-nums text-muted-foreground">
                              {r.value ?? "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {m.cites && m.cites.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="flex-none text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
                          FROM
                        </span>
                        {m.cites.map((c) => (
                          <span
                            key={c.id}
                            title={c.where ?? undefined}
                            className="flex flex-none items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.06)] px-[9px] py-1"
                          >
                            <span className="font-mono text-[9px] text-[hsl(var(--primary))]">{c.n}</span>
                            <span className="whitespace-nowrap text-[10.5px] text-[hsl(var(--primary))]">{c.doc}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {m.acts && m.acts.length > 0 && (
                      <div className="mt-[11px] flex flex-wrap items-center gap-2">
                        {m.acts.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={a.onAct}
                            disabled={!a.onAct}
                            className={cn(
                              "whitespace-nowrap rounded-[9px] px-[13px] py-[7px] text-[12px] font-semibold transition-[filter,background-color]",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "disabled:cursor-not-allowed disabled:opacity-60",
                              a.tone === "gold"
                                ? "bg-cd-gold text-[hsl(var(--accent-foreground))] hover:brightness-[1.04]"
                                : "border border-border bg-card hover:bg-muted",
                            )}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}

          {/* CD's streaming placeholder — shown only while a real generation is in flight. */}
          {streaming && (
            <div className="flex min-w-0 gap-[11px]">
              <span
                aria-hidden
                className="mt-px grid h-6 w-6 flex-none place-items-center rounded-full bg-[hsl(var(--primary))] text-[10px] text-[hsl(var(--primary-foreground))]"
              >
                ✦
              </span>
              <div className="min-w-0 flex-1" aria-live="polite">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[hsl(var(--primary))]">{streaming.who}</span>
                  <span className="text-[10.5px] text-muted-foreground">{streaming.what}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  <div className="h-[9px] w-[78%] rounded-[5px] bg-muted motion-safe:animate-pulse" />
                  <div className="h-[9px] w-[54%] rounded-[5px] bg-muted motion-safe:animate-pulse" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* composer */}
        <div className="flex-none border-t border-border bg-muted/40 px-3 pb-[11px] pt-[9px]">
          {chips && chips.length > 0 && (
            <div className="flex items-center gap-[7px] overflow-x-auto pb-2">
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDraft(c)}
                  disabled={!onSend}
                  className="flex-none whitespace-nowrap rounded-full border border-border bg-card px-[11px] py-1.5 text-[11px] transition-colors hover:border-border-strong hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-card focus-within:border-border-strong">
            <div className="flex min-w-0 items-start gap-2.5 px-3 pb-1 pt-2.5">
              <span aria-hidden className="mt-0.5 flex-none text-[12px] text-muted-foreground">✦</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                disabled={!onSend}
                aria-label="Ask Paige"
                placeholder={
                  onSend
                    ? "Ask about the platform — the fleet, the rails, the machine"
                    : "The chat seam is not connected yet, so nothing can be sent from here."
                }
                className="min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-[1.5] outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex min-w-0 items-center gap-1.5 px-2.5 pb-2 pt-1.5">
              <span className="ml-auto flex-none font-mono text-[9.5px] text-muted-foreground">⌘↵ to send</span>
              <button
                type="button"
                onClick={send}
                disabled={!onSend || draft.trim().length === 0}
                className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-cd-gold px-3.5 py-[7px] text-[12px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span aria-hidden className="text-[10px]">↑</span>Send
              </button>
            </div>
          </div>
          <div className="mt-[7px] text-[10px] text-muted-foreground">
            She acts inside the lanes you set. Anything red waits for you.
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
