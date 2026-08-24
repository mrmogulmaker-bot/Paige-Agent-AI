import { cn } from "@/lib/utils";
import {
  FACE_PLACEHOLDER,
  MEMORY_FOOT,
  MEMORY_KINDS,
  SCRATCH_HELD,
  SCRATCH_OPEN,
  SKILL_GROUP_LIVE,
  SKILL_GROUP_OWED,
  type AgentRow,
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

export function SpineCode({
  files = [],
  ceilingHeld = false,
}: {
  readonly files?: readonly ScratchFile[];
  /** At or below "Draft only" she reads this surface and does not write to it. */
  readonly ceilingHeld?: boolean;
}) {
  const active = files[0] ?? null;
  return (
    <div className={PANE}>
      {files.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {files.map((f, i) => (
            <span
              key={f.name}
              className={cn(
                "flex-none whitespace-nowrap rounded-t-[6px] px-2.5 py-1.5 font-mono text-[11px]",
                i === 0
                  ? "text-foreground shadow-[shadow:inset_0_-1px_0_var(--pg-gold)]"
                  : "text-[var(--pg-faint)]",
              )}
            >
              {f.name}
            </span>
          ))}
        </div>
      )}

      {active ? (
        <p className="font-mono text-[10.5px] text-[var(--pg-faint)]">
          {active.lang} · {active.size} · {active.when} — {active.summary}
        </p>
      ) : (
        <p className={ABSENCE}>
          No scratch file is read yet. This is where she writes, and the ceiling decides whether
          she may: held at draft-only she reads this surface and does not write to it.
        </p>
      )}

      {/* `scratchBody` — both arms verbatim, chosen by the ceiling rather than by preference. */}
      <pre
        className="mt-[9px] whitespace-pre-wrap rounded-[var(--pg-r-chip)] border border-dashed border-[var(--pg-line-strong)] bg-[var(--pg-canvas)] px-[13px] py-3 font-mono text-[11.5px] leading-[1.7] text-[var(--pg-faint)]"
      >
        {ceilingHeld ? SCRATCH_HELD : SCRATCH_OPEN}
      </pre>
    </div>
  );
}

/** Re-exported so the spine's composer reads its prompt from the one home. */
export { FACE_PLACEHOLDER };
