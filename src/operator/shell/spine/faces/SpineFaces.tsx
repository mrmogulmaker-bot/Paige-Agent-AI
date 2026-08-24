import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
/**
 * §18 — `clampGrant` already has a home. The campaigns contract transcribed the pack's
 * `clampGrant` (L5300) when Layer 3b landed, and CD's own note there is the reason a second one
 * must not exist: *"Inventing a second scale here is what made every agent read Held at the
 * default."* The Code face answers to the same arithmetic as the Trust Compass tally.
 */
import { clampGrant } from "@/operator/surfaces/campaigns/campaignContract";
import {
  CODE_MERGE_NOTE,
  CODE_NO_FILES,
  CODE_NO_REPO_NAME,
  CODE_NO_REPO_NOTE,
  CODE_RUN_OUTPUT,
  CODE_RUN_STATE,
  CODE_SAID,
  CODE_TOKEN_TONE,
  FACE_PLACEHOLDER,
  MEMORY_FOOT,
  MEMORY_KINDS,
  SKILL_GROUP_LIVE,
  SKILL_GROUP_OWED,
  codeFoot,
  codeLimits,
  newScratchFile,
  reviewActFor,
  tokenizeCode,
  type AgentRow,
  type CodeRepo,
  type CodeReview,
  type CodeRun,
  type CodeRunPhase,
  type MemoryProposal,
  type MemoryRow,
  type ScratchFile,
  type SkillRow,
} from "@/operator/shell/spine/faces/spineFaceContract";

/**
 * The four spine faces beside Chat, ported from v3 (`mindVals` L10427 · bodies L3897–L3990).
 * BUILD-ORDER Layer 5. Contract, sources and the fixture ruling: `spineFaceContract.ts`.
 *
 * All four take their rows as props and ship with none. Each renders the authored structure plus
 * a stated absence, so the face is honest when empty and truer as Layer 6 wires it — the same
 * shape every Layer 3 surface already follows.
 */

const PANE = "flex-1 min-h-0 overflow-auto px-4 pb-[18px] pt-3.5";
const CAPTION = "text-[10.5px] text-[var(--pg-faint)]";
const ABSENCE = "text-[11.5px] leading-[1.6] text-[var(--pg-faint)] [text-wrap:pretty]";

/* ── Memory ─────────────────────────────────────────────────────────────────────────────────── */

export function SpineMemory({
  memories = [],
  proposal = null,
  onKeep,
  onForget,
  onAcceptProposal,
  onRefuseProposal,
}: {
  readonly memories?: readonly MemoryRow[];
  readonly proposal?: MemoryProposal | null;
  readonly onKeep?: (what: string) => void;
  readonly onForget?: (m: MemoryRow) => void;
  readonly onAcceptProposal?: () => void;
  readonly onRefuseProposal?: () => void;
}) {
  return (
    <div className={PANE}>
      {/* A PROPOSAL, NOT A WRITE. `mindVals` L10521: at ask-first she may not put anything into
          memory on her own — she says what she noticed and the operator rules on it. */}
      {proposal && (
        <div
          className="mb-[18px] rounded-[var(--pg-r-chip)] bg-[var(--pg-raised)] px-3.5 py-[13px]"
          style={{ boxShadow: "inset 0 0 0 1px var(--pg-line-authority)" }}
        >
          <small className="text-[10.5px] font-medium text-[var(--pg-gold-deep)]">
            She wants to remember
          </small>
          <p className="mt-[7px] font-[var(--pg-font-editorial)] text-[13px] leading-[1.55] text-[var(--pg-ink-2)] [text-wrap:pretty]">
            {proposal.what}
          </p>
          <small className="mt-1.5 block font-mono text-[10px] text-[var(--pg-faint)]">
            {proposal.from} · would change {proposal.acts}
          </small>
          <div className="mt-[11px] flex gap-1.5">
            <button
              type="button"
              onClick={onAcceptProposal}
              disabled={!onAcceptProposal}
              className="min-h-[28px] flex-none rounded-[var(--pg-r-pill)] border border-[var(--pg-gold)] bg-[var(--pg-gold)] px-3 text-[11px] font-medium text-[#17120c] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Let her keep it
            </button>
            <button
              type="button"
              onClick={onRefuseProposal}
              disabled={!onRefuseProposal}
              className="min-h-[28px] flex-none rounded-[var(--pg-r-pill)] border border-[var(--pg-line)] bg-transparent px-3 text-[11px] text-[var(--pg-muted)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              No
            </button>
          </div>
        </div>
      )}

      {MEMORY_KINDS.map(({ kind, note, tone }) => {
        const items = memories.filter((m) => m.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind} className="mb-[18px]">
            <p className={CAPTION}>
              {kind} — {note}
            </p>
            {items.map((m) => (
              <div
                key={m.id}
                className="grid grid-cols-[2px_minmax(0,1fr)_auto] gap-2.5 border-b border-[var(--pg-line-soft)] py-[11px]"
              >
                <i
                  aria-hidden
                  className="self-stretch"
                  style={{ background: tone, opacity: m.pinned ? 1 : 0.45 }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-[var(--pg-font-editorial)] text-[13px] leading-[1.55] text-[var(--pg-ink-2)] [text-wrap:pretty]">
                    {m.what}
                  </span>
                  <small className="mt-1 truncate font-mono text-[10px] text-[var(--pg-faint)]">
                    {m.from} · {m.acts}
                  </small>
                </span>
                <button
                  type="button"
                  title="Forget this"
                  aria-label="Forget this"
                  onClick={onForget && (() => onForget(m))}
                  disabled={!onForget}
                  className="grid h-[22px] w-[22px] self-center place-items-center rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-transparent font-mono text-[11px] text-[var(--pg-faint)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        );
      })}

      {memories.length === 0 && !proposal && (
        <p className={cn(ABSENCE, "mb-4")}>
          She holds nothing yet. What lands here is of three kinds — what you told her, which
          stands until you retract it; what she worked out, which she drops the moment you
          disagree; and what is true for this session only.
        </p>
      )}

      <MemoryComposer onKeep={onKeep} />
      <p className="mt-3 text-[10.5px] leading-[1.5] text-[var(--pg-faint)] [text-wrap:pretty]">
        {MEMORY_FOOT}
      </p>
    </div>
  );
}

function MemoryComposer({ onKeep }: { onKeep?: (what: string) => void }) {
  return (
    <form
      className="mt-1 flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("mem") as HTMLInputElement | null;
        if (input?.value.trim() && onKeep) {
          onKeep(input.value.trim());
          input.value = "";
        }
      }}
    >
      <input
        name="mem"
        placeholder="Tell her something to remember"
        aria-label="Tell her something to remember"
        disabled={!onKeep}
        className="min-h-[32px] min-w-0 flex-1 rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-[var(--pg-canvas)] px-[11px] text-[12.5px] text-[var(--pg-ink)] placeholder:text-[var(--pg-faint)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={!onKeep}
        title={onKeep ? undefined : "Keeping a memory has no write path at operator scope yet"}
        className="min-h-[32px] flex-none rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-[var(--pg-raised)] px-[13px] text-[11.5px] font-medium text-[var(--pg-ink-2)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Keep
      </button>
    </form>
  );
}

/* ── Team ───────────────────────────────────────────────────────────────────────────────────── */

export function SpineTeam({
  agents = [],
  onSpinUp,
}: {
  readonly agents?: readonly AgentRow[];
  readonly onSpinUp?: () => void;
}) {
  const stateTone = (s: string) =>
    s === "Ready" ? "var(--pg-positive)" : s === "Queued" ? "var(--pg-gold-deep)" : "var(--pg-faint)";
  return (
    <div className={PANE}>
      {agents.map((a) => (
        <div key={a.id} className="border-b border-[var(--pg-line-soft)] py-[13px]">
          <div className="flex items-baseline gap-[9px]">
            <b className="font-display text-[11px] font-semibold tracking-[0.1em]">{a.name}</b>
            <span
              className="font-mono text-[10px] tracking-[0.02em]"
              style={{ color: stateTone(a.state) }}
            >
              {a.state}
            </span>
            <span className="ml-auto whitespace-nowrap text-[10.5px] text-[var(--pg-gold-deep)]">
              {a.grant}
            </span>
          </div>
          <p className="mt-[5px] text-[12px] leading-[1.5] text-[var(--pg-muted)]">{a.role}</p>
          <div className="mt-[9px] grid grid-cols-[auto_minmax(0,1fr)] gap-x-[9px] gap-y-1">
            <small className="text-[10px] text-[var(--pg-faint)]">Now</small>
            <small
              className={cn(
                "truncate font-mono text-[10.5px]",
                a.now ? "text-[var(--pg-ink-2)]" : "text-[var(--pg-faint)]",
              )}
            >
              {a.now ?? "—"}
            </small>
            <small className="text-[10px] text-[var(--pg-faint)]">Last</small>
            <small className="truncate font-mono text-[10px] text-[var(--pg-faint)]">
              {a.last ?? "—"}
            </small>
          </div>
        </div>
      ))}

      {agents.length === 0 && (
        <p className={ABSENCE}>
          Her roster is not read yet. Each agent shows the one job it holds, the grant it was
          given, and what it is doing right now — and no agent can ever be raised above her own
          ceiling.
        </p>
      )}

      <button
        type="button"
        onClick={onSpinUp}
        disabled={!onSpinUp}
        title={onSpinUp ? undefined : "Spinning up an agent has no registry write at operator scope yet"}
        className="mt-3.5 min-h-[32px] rounded-[var(--pg-r-pill)] border border-[var(--pg-line)] bg-transparent px-[13px] text-[11.5px] font-medium text-[var(--pg-ink-2)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Spin up an agent
      </button>
    </div>
  );
}

/* ── Skills ─────────────────────────────────────────────────────────────────────────────────── */

export function SpineSkills({ skills = [] }: { readonly skills?: readonly SkillRow[] }) {
  const live = skills.filter((s) => s.live);
  const owed = skills.filter((s) => !s.live);
  return (
    <div className={PANE}>
      {skills.length === 0 ? (
        <p className={ABSENCE}>
          Her skills are not read yet. They group by what she can ACTUALLY do — one list she can
          run now, one waiting on substrate that does not exist at operator scope — so the face
          reads as an answer rather than a menu with half its items dead.
        </p>
      ) : (
        <>
          <SkillGroup title={`${SKILL_GROUP_LIVE} — ${live.length}`} items={live} />
          <SkillGroup title={`${SKILL_GROUP_OWED} — ${owed.length}`} items={owed} />
        </>
      )}
    </div>
  );
}

function SkillGroup({ title, items }: { title: string; items: readonly SkillRow[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <p className={cn(CAPTION, "mt-0.5")}>{title}</p>
      <div className="mb-4 mt-[9px]">
        {items.map((k) => (
          <div
            key={k.name}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-b border-[var(--pg-line-soft)] py-[9px]"
          >
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-[12px] font-medium">{k.name}</b>
              <small className="mt-0.5 truncate text-[10.5px] text-[var(--pg-faint)]">
                {k.note}
              </small>
            </span>
            <span
              className={cn(
                "flex-none whitespace-nowrap font-mono text-[10px] tracking-[0.02em]",
                k.live ? "text-[var(--pg-gold-deep)]" : "text-[var(--pg-faint)]",
              )}
            >
              {k.live ? "Ask first" : "Not yet"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Code ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * The Code face — `codeVals` L10256–L10424, markup L4015–L4120. BUILD-ORDER Layer 5b.
 *
 * Layer 5 shipped a thinner version of this (a file line and a scratch pre-block) and named the
 * gap in the tier matrix rather than leaving it to be found. This is the rest: the tab strip with
 * dirty marks and close controls, the meta line, the repo strip and its review block, the
 * tokenized line-numbered editor and its plain edit buffer, the output block with its run log,
 * the act row derived from the ceiling, and the limits drawer.
 *
 * THE BUFFER IS REAL, and that is not a stretch of the word. `+` creates a scratch file, the
 * editor edits it, ⌘S saves the buffer, Revert drops it, × closes it, and the tab's dirty
 * diamond tracks all of it. The pack scopes the capability honestly in its own foot —
 * *"Scratch files live for this session"* — so session-local state IS the whole feature here,
 * not a stand-in for a persisted one. What does not exist says so: no runtime is provisioned, so
 * `Run` requests one, is refused, and the refusal lands on the record. CD's comment at L6968:
 * *"Run is therefore a design state: the grant gate is real and resolves against the ceiling,
 * and the run itself refuses honestly."*
 *
 * THE CEILING IS A REAL READ. `OperatorSpine` clones this node with the rung from
 * `usePlatformTrust`, the same wire the header readout and the chat strip already run on. So
 * `held`, the review act, `Run — held` and the foot's grant are decided by the platform's actual
 * autonomy record. With no rung stored, `ceiling` is null: the grant reads as an em-dash and
 * nothing is held, because clamping against a ceiling that does not exist would report a gate
 * the platform is not holding (§13, and `clampGrant`'s own note in `campaignContract.ts`).
 *
 * MERGE IS ABSENT, NOT DISABLED. Every branch of `reviewActFor` produces exactly one act and
 * none of them merges — `paige-writes-code.md` §1: *"No level of the compass grants it, so no
 * branch of the UI produces a merge control."* There is nothing here to gate.
 */
export function SpineCode({
  files = [],
  repos = [],
  reviews = [],
  ceiling = null,
  onAskHer,
  onDetach,
  onReview,
}: {
  /** Files read from a binding. Layer 6 fills this; scratch files are added on top, in session. */
  readonly files?: readonly ScratchFile[];
  /** Repository bindings. None today — `paige-writes-code.md` §5 puts the provider at `planned`. */
  readonly repos?: readonly CodeRepo[];
  readonly reviews?: readonly CodeReview[];
  /** The Trust Compass rung, 0–4. `null` means the platform holds none and nothing is clamped. */
  readonly ceiling?: number | null;
  readonly onAskHer?: () => void;
  readonly onDetach?: () => void;
  readonly onReview?: (label: string) => void;
}) {
  const [scratch, setScratch] = useState<readonly ScratchFile[]>([]);
  const [closed, setClosed] = useState<Readonly<Record<string, true>>>({});
  const [at, setAt] = useState(0);
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [editing, setEditing] = useState(false);
  const [phase, setPhase] = useState<CodeRunPhase>("idle");
  const [runs, setRuns] = useState<readonly CodeRun[]>([]);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [said, setSaid] = useState("");

  /** `runCode`'s 700ms refusal is a timer; it must not fire into an unmounted face. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const open = useMemo(
    () => [...files, ...scratch].filter((f) => !closed[f.name]),
    [files, scratch, closed],
  );

  const grant = clampGrant("Ask first", ceiling);
  /** `held` — L10275. At or below Draft only she reads this surface and writes nothing to it. */
  const held = grant !== null && (grant === "Observe" || grant === "Held");
  const canRun = !held;

  const idx = Math.min(at, Math.max(open.length - 1, 0));
  const active = open[idx] ?? null;
  const activeBody = active ? (drafts[active.name] ?? active.body ?? "") : "";
  const dirty = !!active && drafts[active.name] !== undefined && drafts[active.name] !== (active.body ?? "");

  const repo = active?.repo ? (repos.find((r) => r.id === active.repo) ?? null) : null;
  const repoCeiling = repo ? clampGrant(repo.ceiling, ceiling) : null;
  const reviewAct = repo ? reviewActFor(repoCeiling) : null;
  const repoReviews = repo ? reviews.filter((r) => r.repo === repo.id) : [];

  const newScratch = () => {
    const next = newScratchFile(scratch.length + 1);
    setScratch((x) => [...x, next]);
    setClosed((x) => { const { [next.name]: _dropped, ...rest } = x; return rest; });
    setAt(open.length);
    setEditing(true);
    setSaid(CODE_SAID.created);
  };

  const save = () => { setEditing(false); setSaid(CODE_SAID.saved); };

  const revert = () => {
    if (!active) return;
    setDrafts((x) => { const { [active.name]: _dropped, ...rest } = x; return rest; });
    setEditing(false);
    setSaid(CODE_SAID.reverted);
  };

  /** `runCode` — L7010–L7018. A run is a lifecycle even when it cannot succeed. */
  const run = () => {
    if (!active) return;
    if (!canRun) { setSaid(CODE_SAID.runHeld); return; }
    setPhase("queued");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPhase("refused");
      setRuns((x) => [
        { when: "now", what: `${active.name} · requested by you`, state: "Refused", tone: "var(--pg-negative)" },
        ...x,
      ]);
      setSaid(CODE_SAID.refused);
    }, 700);
  };

  const acts: readonly {
    key: string;
    label: string;
    title?: string;
    gold?: boolean;
    onClick?: () => void;
  }[] = [
    { key: "run", label: canRun ? "Run" : "Run — held", gold: canRun,
      title: canRun ? "Requests a runtime — ⌘↵" : "The ceiling holds this", onClick: run },
    ...(reviewAct
      ? [{ key: "review", label: reviewAct.label, title: reviewAct.title,
          onClick: onReview ? () => onReview(reviewAct.label) : undefined }]
      : []),
    ...(editing
      ? [
          { key: "save", label: dirty ? "Save" : "Done", title: "⌘S", onClick: save },
          { key: "revert", label: "Revert", title: "Drop the unsaved buffer", onClick: revert },
        ]
      : [
          { key: "edit", label: held ? "Edit — held" : "Edit",
            title: held ? "The ceiling holds this" : "Edit the buffer by hand",
            onClick: active
              ? () => (held ? setSaid(CODE_SAID.editHeld) : setEditing(true))
              : undefined },
        ]),
    { key: "ask", label: "Ask her to write", title: "She writes into this file",
      onClick: onAskHer ? () => { onAskHer(); setSaid(CODE_SAID.askHer); } : undefined },
    { key: "detach", label: "Detach", title: "Put the sandbox on its own monitor", onClick: onDetach },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* The pack's `announcement` channel. It lives on the face because the spine has no
          shell-level live region — the same reasoning `SlotSurfaceBody` records for its own. */}
      <p aria-live="polite" className="sr-only">{said}</p>

      {/* FILE TABS · L4018–L4027. The dirty mark is a 4px diamond, gold only while unsaved. */}
      <div className="flex min-w-0 flex-none items-center gap-[5px] overflow-x-auto px-[14px] pt-[9px]">
        {open.map((f, i) => (
          <span
            key={f.name}
            className="inline-flex flex-none items-center rounded-t-[var(--pg-r-chip)]"
            style={{
              background: i === idx ? "var(--pg-canvas)" : "transparent",
              boxShadow: i === idx ? "inset 0 1px 0 var(--pg-gold)" : "none",
            }}
          >
            <button
              type="button"
              onClick={() => { setAt(i); setEditing(false); }}
              className="inline-flex min-h-[26px] flex-none items-center gap-[5px] whitespace-nowrap border-0 bg-transparent py-0 pl-[9px] pr-1 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                color: i === idx ? "var(--pg-ink)" : "var(--pg-muted)",
                fontWeight: i === idx ? 500 : 400,
              }}
            >
              {f.name}
              <i
                aria-hidden
                style={{
                  width: "4px",
                  height: "4px",
                  rotate: "45deg",
                  background:
                    drafts[f.name] !== undefined && drafts[f.name] !== (f.body ?? "")
                      ? "var(--pg-gold)"
                      : "transparent",
                }}
              />
            </button>
            <button
              type="button"
              title="Close"
              aria-label={`Close ${f.name}`}
              onClick={() => {
                setClosed((x) => ({ ...x, [f.name]: true }));
                setAt(0);
                setEditing(false);
                setSaid(CODE_SAID.closed(f.name));
              }}
              className="grid h-[26px] w-[18px] flex-none place-items-center border-0 bg-transparent font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ color: i === idx ? "var(--pg-faint)" : "transparent" }}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={newScratch}
          title="New scratch file"
          aria-label="New scratch file"
          className="grid h-6 w-6 flex-none place-items-center rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-transparent font-mono text-[12px] text-[var(--pg-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +
        </button>
      </div>

      {/* META · L4029–L4032. Language, size or `unsaved`, and when it was touched. */}
      <div className="flex min-w-0 flex-none flex-wrap items-baseline gap-[9px] px-[14px] pb-[10px] pt-[9px]">
        <small className="font-mono text-[10px] tracking-[0.04em] text-[var(--pg-faint)]">
          {active ? `${active.lang} · ${dirty ? "unsaved" : active.size} · ${active.when}` : CODE_NO_FILES.meta}
        </small>
        <small className="min-w-0 flex-1 truncate font-[var(--pg-font-editorial)] text-[11.5px] italic text-[var(--pg-muted)]">
          {active ? active.summary : CODE_NO_FILES.note}
        </small>
      </div>

      {active && (
        <>
          {/* REPO STRIP · L4034–L4045. The unbound arm is the honest one today. */}
          <div className="flex min-w-0 flex-none flex-wrap items-center gap-2 px-[14px] pb-[9px]">
            <span
              className="min-w-0 truncate font-mono text-[11px]"
              style={{ color: repo ? "var(--pg-ink-2)" : "var(--pg-faint)" }}
            >
              {repo ? repo.name : CODE_NO_REPO_NAME}
            </span>
            {repo && (
              <>
                <span className="flex-none font-mono text-[11px] text-[var(--pg-faint)]">⁄</span>
                <span className="flex-none whitespace-nowrap font-mono text-[11px] text-[var(--pg-gold-deep)]">
                  {/* `repoBranch` — L10303. The file's own branch wins over the repo's default. */}
                  {active.at || repo.branch}
                </span>
                <span className="inline-flex min-h-5 flex-none items-center whitespace-nowrap rounded-[var(--pg-r-pill)] border border-[var(--pg-line)] px-2 text-[9.5px] font-medium uppercase tracking-[0.05em] text-[var(--pg-gold-deep)]">
                  {repoCeiling ?? "—"}
                </span>
                {repo.protected && (
                  <span className="flex-none whitespace-nowrap text-[9.5px] uppercase tracking-[0.05em] text-[var(--pg-faint)]">
                    protected · merge is yours
                  </span>
                )}
              </>
            )}
          </div>
          <p className="m-0 min-w-0 flex-none px-[14px] pb-[10px] text-[11px] leading-[1.55] text-[var(--pg-muted)] [text-wrap:pretty]">
            {repo ? repo.may : CODE_NO_REPO_NOTE}
          </p>

          {/* REVIEWS · L4047–L4062, behind the pack's own `onRepo`. Each row carries the grant it
              was opened UNDER — a pull request is an act, and an act has a ceiling behind it. */}
          {repo && (
            <div className="mx-[14px] mb-[11px] flex min-w-0 flex-none flex-col gap-[7px] rounded-[var(--pg-r-chip)] border border-[var(--pg-line-soft)] bg-[var(--pg-surface)] px-3 py-[10px]">
              {repoReviews.map((r) => (
                <div key={r.title} className="flex min-w-0 flex-col gap-[3px]">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-[11.5px] font-medium text-[var(--pg-ink-2)] [text-wrap:pretty]">
                      {r.title}
                    </span>
                    <small className="flex-none whitespace-nowrap text-[9.5px] font-medium tracking-[0.04em] text-[var(--pg-faint)]">
                      {r.state}
                    </small>
                  </div>
                  <small className="font-mono text-[10px] tracking-[0.03em] text-[var(--pg-faint)]">
                    {r.at} · under {r.under}
                  </small>
                  <small className="font-[var(--pg-font-editorial)] text-[11px] italic text-[var(--pg-muted)] [text-wrap:pretty]">
                    {r.note}
                  </small>
                </div>
              ))}
              <small className="text-[10.5px] leading-[1.5] text-[var(--pg-faint)] [text-wrap:pretty]">
                {CODE_MERGE_NOTE}
              </small>
            </div>
          )}

          {/* EDITOR · L4064–L4080. Two modes, never a highlighted textarea — CD's own reason at
              L10346: *"a fake highlighted textarea drifts the moment you type."* */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-[var(--pg-line)] bg-[var(--pg-canvas)]">
            {editing ? (
              <textarea
                aria-label="Edit code"
                spellCheck={false}
                value={activeBody}
                onChange={(e) => setDrafts((x) => ({ ...x, [active.name]: e.target.value }))}
                onKeyDown={(e) => {
                  const meta = e.metaKey || e.ctrlKey;
                  if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
                  else if (meta && e.key === "Enter") { e.preventDefault(); run(); }
                  else if (e.key === "Escape") setEditing(false);
                }}
                className="min-h-0 w-full flex-1 resize-none border-0 bg-[var(--pg-canvas)] px-[13px] pb-[14px] pt-[11px] font-mono text-[11.5px] leading-[1.7] text-[var(--pg-ink-2)] outline-none [tab-size:4]"
              />
            ) : (
              <div
                className="min-h-0 min-w-0 flex-1 overflow-auto pb-[14px] pt-[11px]"
                style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", alignContent: "start" }}
              >
                {activeBody.split("\n").map((line, i) => (
                  <Fragment key={`${active.name}:${i}`}>
                    <span className="select-none py-0 pl-3 pr-[9px] text-right font-mono text-[10.5px] leading-[1.7] text-[var(--pg-faint)] opacity-65">
                      {i + 1}
                    </span>
                    <span className="min-w-0 overflow-x-auto whitespace-pre pr-[13px] font-mono text-[11.5px] leading-[1.7]">
                      {(line === "" ? [{ t: "​", c: "" as const }] : tokenizeCode(line, active.lang)).map(
                        (tk, j) => (
                          <i
                            key={j}
                            className="not-italic"
                            style={{ color: CODE_TOKEN_TONE[tk.c], whiteSpace: "pre" }}
                          >
                            {tk.t}
                          </i>
                        ),
                      )}
                    </span>
                  </Fragment>
                ))}
              </div>
            )}
          </div>

          {/* OUTPUT · L4082–L4098. Never a success — no runtime is provisioned at any tier. */}
          <div className="flex max-h-[32%] min-h-0 flex-none flex-col gap-[7px] border-t border-[var(--pg-line)] bg-[var(--pg-surface)] px-[14px] pb-[11px] pt-[10px]">
            <div className="flex flex-none items-baseline justify-between gap-2.5">
              <small className="text-[10px] tracking-[0.04em] text-[var(--pg-faint)]">Output</small>
              <small
                className="whitespace-nowrap text-[10px] font-medium tracking-[0.04em]"
                style={{
                  color:
                    phase === "refused" ? "var(--pg-negative)"
                    : phase === "queued" ? "var(--pg-violet)"
                    : "var(--pg-faint)",
                }}
              >
                {CODE_RUN_STATE[phase]}
              </small>
            </div>
            <p
              className="m-0 flex-none font-mono text-[11px] leading-[1.6] [text-wrap:pretty]"
              style={{ color: phase === "idle" ? "var(--pg-faint)" : "var(--pg-ink-2)" }}
            >
              {CODE_RUN_OUTPUT[phase]}
            </p>
            {runs.length > 0 && (
              <div className="flex-none border-t border-[var(--pg-line-soft)] pt-2">
                {runs.slice(0, 4).map((r, i) => (
                  <div
                    key={`${r.what}:${i}`}
                    className="grid items-baseline gap-[9px] py-[3px]"
                    style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}
                  >
                    <small className="font-mono text-[9.5px] text-[var(--pg-faint)]">{r.when}</small>
                    <small className="min-w-0 truncate font-mono text-[10.5px] text-[var(--pg-muted)]">
                      {r.what}
                    </small>
                    <small
                      className="whitespace-nowrap text-[9.5px] font-medium tracking-[0.03em]"
                      style={{ color: r.tone }}
                    >
                      {r.state}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ACTS · L4100–L4106. `btn` L10496 — gold on the one act, everything else neutral. */}
          <div className="flex min-w-0 flex-none flex-wrap items-center gap-1.5 border-t border-[var(--pg-line-soft)] px-[14px] pb-1 pt-2.5">
            {acts.map((a) => (
              <button
                key={a.key}
                type="button"
                title={a.title}
                onClick={a.onClick}
                disabled={!a.onClick}
                className="min-h-[30px] flex-none whitespace-nowrap rounded-[var(--pg-r-pill)] border px-[13px] text-[11.5px] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  borderColor: a.gold ? "var(--pg-gold)" : "var(--pg-line)",
                  background: a.gold ? "var(--pg-gold)" : "transparent",
                  color: a.gold ? "#17120c" : "var(--pg-muted)",
                }}
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setLimitsOpen((x) => !x)}
              aria-expanded={limitsOpen}
              className="ml-auto min-h-[28px] flex-none whitespace-nowrap border-0 bg-transparent px-1 font-mono text-[10.5px] text-[var(--pg-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {limitsOpen ? "Limits ›" : "Limits ‹"}
            </button>
          </div>

          {/* LIMITS · L4108–L4117. Every row states what is not provisioned. */}
          {limitsOpen && (
            <div className="max-h-[34%] flex-none overflow-y-auto px-[14px] pb-3 pt-2.5">
              <dl className="m-0 grid gap-x-3 gap-y-[5px]" style={{ gridTemplateColumns: "auto minmax(0,1fr)" }}>
                {codeLimits(repos.length).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="font-mono text-[10px] tracking-[0.04em] text-[var(--pg-faint)]">{k}</dt>
                    <dd className="m-0 truncate font-mono text-[10.5px] text-[var(--pg-ink-2)]">{v}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          )}
        </>
      )}

      {/* FOOT · L4119. The `noFiles` arm is a state, not an error. */}
      <p className="flex-none px-[14px] pb-3 pt-2 text-[10.5px] leading-[1.5] text-[var(--pg-faint)] [text-wrap:pretty]">
        {active ? codeFoot(held, grant) : CODE_NO_FILES.foot}
      </p>
    </div>
  );
}

/** Re-exported so the spine's composer reads its prompt from the one home. */
export { FACE_PLACEHOLDER };
