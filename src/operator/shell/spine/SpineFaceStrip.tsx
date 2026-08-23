/**
 * The face strip — `v3.dc.html` L3860–L3864, styled by `f()` at L10298–L10304 and built by
 * `spineFaces` at L10365–L10372.
 *
 * Container, verbatim: `flex:none; display:flex; flex-wrap:wrap; gap:2px 14px;
 * padding:9px 16px 8px; border-bottom:1px solid var(--pg-line-soft)`.
 *
 * ONE CONTROL PER FACE, and the count beside the label is the pack's `n`. THE COUNTS ARE NOT
 * PORTED: `Memory 5`, `Team 5`, `Skills 4/7`, `Code 3` are computed in the pack from its own
 * fixture registries (`IA.SKILLS`, `IA.AGENTS`, `IA.SANDBOX.files`). Here a count is a real
 * read handed in on the region, and the pack's own conditional covers its absence —
 * `n === undefined ? '' : String(n)` (L10298), i.e. the `<b>` renders empty. `Chat` is passed
 * `undefined` by the pack itself (L10366), so an empty count is the DESIGNED state, not a gap.
 *
 * §21 — this is NOT an artifact-type picker. It switches which face of one conversation you
 * are looking at inside one session; the operator never classifies a request before Paige has
 * heard it. That distinction is the pack's, not an interpretation: one composer serves all
 * faces (L10376–L10383) and the transcript is continuous underneath.
 */
import type { SpineFaceId } from "@/operator/shell/spine/spineContract";

export type SpineFaceDescriptor = {
  readonly id: SpineFaceId;
  /** The pack's label, L10366–L10371. */
  readonly label: string;
  /** The pack's `note`, used as the control's title. */
  readonly note: string;
  /** A real count. `null`/absent renders the pack's empty `<b>` (L10298). */
  readonly count?: string | null;
};

export default function SpineFaceStrip({
  faces,
  face,
  onFace,
}: {
  readonly faces: readonly SpineFaceDescriptor[];
  readonly face: SpineFaceId;
  readonly onFace?: (id: SpineFaceId) => void;
}) {
  return (
    <div
      data-spine-faces
      className="flex min-w-0 flex-none flex-wrap gap-x-[14px] gap-y-[2px] border-b border-[var(--pg-line-soft)] px-4 pb-2 pt-[9px]"
    >
      {faces.map((f) => {
        const on = f.id === face;
        return (
          <button
            key={f.id}
            type="button"
            data-spine-face={f.id}
            aria-current={on ? "true" : undefined}
            title={f.note}
            onClick={onFace ? () => onFace(f.id) : undefined}
            disabled={!onFace}
            className="inline-flex min-h-[24px] items-baseline gap-[5px] border-0 bg-transparent px-px text-[length:var(--pg-t-label)] disabled:cursor-not-allowed"
            style={{
              color: on ? "var(--pg-ink)" : "var(--pg-muted)",
              fontWeight: on ? 500 : 400,
              boxShadow: on ? "inset 0 -1px 0 var(--pg-gold)" : "none",
            }}
          >
            {f.label}
            <b className="font-mono text-[length:var(--pg-t-label)] font-normal text-[var(--pg-faint)]">
              {f.count ?? ""}
            </b>
          </button>
        );
      })}
    </div>
  );
}
