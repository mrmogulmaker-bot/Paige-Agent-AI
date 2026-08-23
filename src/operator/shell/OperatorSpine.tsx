/**
 * The spine — column 3. PAIGE, docked on the right for the whole session.
 *
 * Geometry is the pack's `<aside>` (`v3.dc.html` L3821–L4186): `position:relative;
 * min-width:0; min-height:0; display:flex; flex-direction:column; background:var(--pg-spine);
 * border-left:1px solid var(--pg-line-strong); box-shadow:var(--pg-e3)`, with a `flex:none`
 * header, a `flex:none` face strip, one face body that owns its own scroll
 * (`flex:1; min-height:0; overflow:auto`), an optional execution strip, and the composer —
 * so the document never scrolls.
 *
 * THE SPINE COLLAPSES TWO WAYS AT ONCE, and both are required. The shell's third grid track
 * goes to `0px`, AND this component unmounts — the pack does both. Track-only would animate
 * the columns closed over a still-mounted 340px panel; unmount-only would leave a 340px hole.
 *
 * RULING C (Claude Design, 2026-08-23) — THE SPINE COLLAPSES TO 0 UNTIL PAIGE IS IN IT.
 * "416px reserved for absence is the blank-section failure at the largest scale in the shell. A
 * collapsed spine is honest; an empty one asserts a capability that isn't there."
 *
 * So the track is 0 while the spine has nothing to show, and it opens the moment it does. That
 * is driven by `SPINE_REGIONS` below — the regions this component actually renders — and NOT by
 * a hardcoded `false` in the shell. A region whose `content` is null is not wired yet; the day
 * PAIGE's thread or memory read lands, its `content` becomes a node, `spineHasContent()` turns
 * true on its own, and the shell opens the track with no second edit.
 *
 * ─── WHAT THIS ROUND PORTED, AND WHAT IT DELIBERATELY DID NOT ────────────────────────────────
 *
 * PORTED (structure and authored strings, verbatim): the header and its two window controls
 * (L3823–L3858), the five-face strip (L3860–L3864, `spineFaces` L10365–L10372), the chat
 * face — Trust Compass strip, transcript, reasoning strip, decision block, presence
 * (L4064–L4140) — the execution strip (L4142–L4150), and the composer with its sigil picker,
 * directive chips, three tools and the gold `Send` (L4152–L4186).
 *
 * NOT PORTED (fixtures, §13): every value the pack invents. Its transcript (`7c11`, `b204`, the
 * sweep prose, the three decision options, `took:'4s'`), its face counts (`Memory 5`,
 * `Team 5`, `Skills 4/7`, `Code 3` — computed at L10367–L10371 from `IA.SKILLS`/`IA.AGENTS`/
 * `IA.SANDBOX`), its Trust Compass rung and tally, its agent roster, memory list, skill list
 * and sandbox files. Each of those is a hole in the props, and the pack's OWN conditional
 * covers the hole: an absent count renders the empty `<b>` it renders for `Chat`
 * (`n === undefined ? '' : String(n)`, L10298); an absent picker pool leaves
 * `pickerOpen: !!sigil && items.length > 0` false (L10547); an absent trust read renders no
 * meter, because a rung IS the governance ceiling and a plausible one would be a lie.
 *
 * NOT PORTED (§18, deliberately): any chat engine. The platform already has one. Nothing here
 * stores a thread, sends a message, streams a token or calls a model — `regions`, `transcript`
 * and every callback come in as props and go back out. If a later round finds itself writing
 * that logic in this file, the seam has been crossed.
 *
 * THE FACE BODIES OTHER THAN CHAT ARE THE CALLER'S NODE. Memory (L3868–L3901), Team
 * (L3904–L3938), Skills (L3941–L3983) and Code (L3986–L4062) each read a registry that does
 * not exist here yet, so each arrives as a region `content`. The chat face has a ported body
 * (`SpineConversation`) because its shape is fully determined by the transcript contract.
 */
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { CommandMarkState } from "@/operator/shell/CommandMark";
import SpineHeader from "@/operator/shell/spine/SpineHeader";
import SpineFaceStrip, { type SpineFaceDescriptor } from "@/operator/shell/spine/SpineFaceStrip";
import SpineComposer from "@/operator/shell/spine/SpineComposer";
import type {
  SpineCommandState,
  SpineDirective,
  SpineFaceId,
  SpinePickerItem,
  SpineSigil,
  SpineTrust,
} from "@/operator/shell/spine/spineContract";

export type { SpineFaceId } from "@/operator/shell/spine/spineContract";
export { default as SpineConversation } from "@/operator/shell/spine/SpineConversation";

/** The pack's five faces are the spine's regions (L10365–L10372). */
export type SpineRegionId = SpineFaceId;

export type SpineRegion = {
  readonly id: SpineRegionId;
  /** The pack's face label (L10366–L10371). */
  readonly label: string;
  /** The pack's `note` — the control's title. */
  readonly note: string;
  /** A real count. Absent renders the empty `<b>` the pack renders for `Chat` (L10298). */
  readonly count?: string | null;
  /** What the face's body renders. `null` means the read behind it is not wired yet. */
  readonly content: ReactNode | null;
};

/**
 * The spine's regions, in the pack's order. Every `content` is `null` because no read behind
 * any of the five exists yet — the chat engine, the memory read, the agent roster, the skill
 * registry and the sandbox are all wiring, and wiring is a later round. The labels and notes
 * ARE the pack's, verbatim; the counts are not, because they are computed from fixtures.
 */
export const SPINE_REGIONS: readonly SpineRegion[] = [
  { id: "chat", label: "Chat", note: "What she is saying and doing", content: null },
  { id: "memory", label: "Memory", note: "What she holds about you and the work", content: null },
  { id: "team", label: "Team", note: "Who works for her", content: null },
  { id: "sandbox", label: "Skills", note: "What she can do", content: null },
  { id: "code", label: "Code", note: "Where she writes it", content: null },
];

/**
 * Whether the spine has anything to show. The shell reserves its track on THIS, so an empty
 * spine can never claim a quarter of the viewport, and a wired one opens without a flag flip.
 */
export function spineHasContent(regions: readonly SpineRegion[] = SPINE_REGIONS): boolean {
  return regions.some((region) => region.content !== null);
}

export type OperatorSpineProps = {
  readonly regions?: readonly SpineRegion[];
  /** Which face is showing. Uncontrolled by default; the first wired face wins. */
  readonly face?: SpineFaceId;
  readonly onFace?: (id: SpineFaceId) => void;
  /** Drives `data-cm` on the mark — colour and pulse period. */
  readonly markState?: CommandMarkState;
  readonly state?: SpineCommandState | null;
  readonly detached?: boolean;
  readonly onDetach?: () => void;
  readonly onFold?: () => void;
  readonly trust?: SpineTrust | null;
  /** `busy` — L10685–L10689. What is actually running, one line each. Empty → no strip. */
  readonly busy?: readonly string[];
  readonly onInterrupt?: () => void;
  /** `running` — L10683. Drives the edge light and the interrupt's negative treatment. */
  readonly running?: boolean;
  readonly composerValue?: string;
  readonly onComposerChange?: (next: string) => void;
  readonly directives?: readonly SpineDirective[];
  readonly onDropDirective?: (id: string) => void;
  readonly onStakeDirective?: (sigil: SpineSigil, item: SpinePickerItem) => void;
  readonly onResolvePicker?: (sigil: SpineSigil) => readonly SpinePickerItem[];
  readonly onSend?: (text: string, directives: readonly SpineDirective[]) => void;
  readonly readOnly?: boolean;
  readonly listening?: boolean;
  readonly onVoice?: () => void;
  readonly onAttach?: () => void;
  readonly onDownload?: () => void;
};

export default function OperatorSpine({
  regions = SPINE_REGIONS,
  face,
  onFace,
  markState,
  state,
  detached = false,
  onDetach,
  onFold,
  trust,
  busy = [],
  onInterrupt,
  running = false,
  composerValue,
  onComposerChange,
  directives,
  onDropDirective,
  onStakeDirective,
  onResolvePicker,
  onSend,
  readOnly = false,
  listening = false,
  onVoice,
  onAttach,
  onDownload,
}: OperatorSpineProps) {
  const reduce = useReducedMotion();
  const shown = useMemo(() => regions.filter((region) => region.content !== null), [regions]);

  /** Face selection is chrome, so it works uncontrolled; a caller may take it over. */
  const [localFace, setLocalFace] = useState<SpineFaceId | null>(null);
  /** The composer likewise: uncontrolled text, until a caller supplies a value. */
  const [localText, setLocalText] = useState("");

  const activeFace: SpineFaceId | null =
    (face && shown.some((r) => r.id === face) ? face : null) ??
    (localFace && shown.some((r) => r.id === localFace) ? localFace : null) ??
    shown[0]?.id ??
    null;

  if (shown.length === 0 || !activeFace) return null;

  const faces: readonly SpineFaceDescriptor[] = shown.map((r) => ({
    id: r.id,
    label: r.label,
    note: r.note,
    count: r.count ?? null,
  }));

  const body = shown.find((r) => r.id === activeFace)?.content ?? null;
  const composerText = composerValue ?? localText;

  /** `stripText` — L11157–L11159. One line, or the first plus how many more. */
  const stripText =
    busy.length === 1 ? busy[0] : busy.length ? `${busy[0]} · ${busy.length - 1} more` : "";

  return (
    <aside
      data-operator-spine
      aria-label="PAIGE"
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--pg-line-strong)] bg-[var(--pg-spine)]"
      style={{ boxShadow: "var(--pg-e3)" }}
    >
      {/* `spineEdgeStyle` — L11072. The column's lit inner edge, alive only while work runs. */}
      <i
        aria-hidden
        style={{
          position: "absolute",
          left: "-1px",
          top: 0,
          bottom: 0,
          width: "1px",
          background:
            "linear-gradient(180deg,transparent,var(--pg-gold-deep) 18%,var(--pg-violet) 55%,transparent 85%)",
          opacity: 0.6,
          animation: running && !reduce ? "pg-edge 1.8s linear infinite" : "none",
        }}
      />

      <SpineHeader
        markState={markState}
        state={state}
        detached={detached}
        trust={trust}
        onDetach={onDetach}
        onFold={onFold}
      />

      <SpineFaceStrip
        faces={faces}
        face={activeFace}
        onFace={onFace ?? ((id) => setLocalFace(id))}
      />

      <div data-spine-region={activeFace} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {body}
      </div>

      {/* EXECUTION STRIP · L4142–L4150. One control. She reports the work herself, in the
          transcript — a roster here only duplicated it. */}
      {busy.length ? (
        <div
          data-strip="1"
          className="flex min-w-0 flex-none items-center gap-[10px] border-t border-[var(--pg-line)] px-4 pb-[10px] pt-[9px]"
        >
          <i
            aria-hidden
            style={{
              flex: "none",
              width: "5px",
              height: "5px",
              rotate: "45deg",
              background: "var(--pg-violet)",
              animation: reduce ? "none" : "pg-think 1.15s ease-in-out infinite",
            }}
          />
          <small className="min-w-0 flex-1 truncate font-mono text-[length:var(--pg-t-label)] text-[var(--pg-muted)]">
            {stripText}
          </small>
          {/* `interruptStyle` — L11163. Negative while something is genuinely running. */}
          <button
            type="button"
            onClick={onInterrupt}
            disabled={!onInterrupt}
            className="min-h-[24px] whitespace-nowrap border px-[9px] font-mono text-[length:var(--pg-t-label)] tracking-[0.06em] disabled:cursor-not-allowed"
            style={{
              borderColor: running ? "var(--pg-negative)" : "var(--pg-line)",
              background: "transparent",
              color: running ? "var(--pg-negative)" : "var(--pg-faint)",
            }}
          >
            Interrupt ⌘.
          </button>
        </div>
      ) : null}

      <SpineComposer
        face={activeFace}
        value={composerText}
        onChange={onComposerChange ?? setLocalText}
        directives={directives}
        onDropDirective={onDropDirective}
        onStakeDirective={onStakeDirective}
        onResolvePicker={onResolvePicker}
        onSend={onSend}
        readOnly={readOnly}
        listening={listening}
        onVoice={onVoice}
        onAttach={onAttach}
        onDownload={onDownload}
      />
    </aside>
  );
}
