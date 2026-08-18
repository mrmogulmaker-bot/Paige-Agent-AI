import { cn } from "@/lib/utils";

/**
 * BufferDiagram — Claude Design's `isBufferDiagram` block (Super Admin Shell.dc.html, L1140–1160).
 *
 * The scheduling surface's "drawn to scale" strip: a 52px bar split into three parts — the
 * hatched buffer BEFORE a booking, the solid indigo block that is the call itself, the hatched
 * buffer AFTER — with CD's three captions ("before" · "the call" · "after") sitting under the
 * segments they label, each caption exactly as wide as its segment.
 *
 * §13 — THE WHOLE POINT OF THIS BLOCK IS THAT IT IS TO SCALE, so a width is a claim. CD hands
 * its template `beforeW: "18%" · meetW: "64%" · afterW: "18%"` alongside the labels "10 min" ·
 * "45 min" · "10 min" — three authored percentages that happen to agree with three authored
 * durations. Nothing here is authored. The caller supplies the real MINUTES and the bar is
 * computed from them; a segment whose duration the platform does not know cannot be given a
 * width, so the bar is not drawn at all and the surface says plainly that the booking geometry
 * is not connected. A strip drawn from a guess would tell the operator that a ten-minute buffer
 * is configured when it may not be.
 *
 * Labels are the caller's words too (`label`), because minute-formatting is a locale decision
 * that belongs where the data does. A label the caller omits renders "—", never "0 min".
 *
 * CD paints the meeting block with an 8%-lightness indigo ramp (#5B49C4 → #4A3FA0). Ours is a
 * FLAT --primary: on the dark theme the ramp's lighter stop measures ≈3.1:1 against the label
 * sitting on it, which misses AA — a gradient nobody can read the number on is not the design
 * CD intended. Flat --primary/--primary-foreground clears AA in both themes.
 *
 * §11 — NO GOLD. There is no act on this block: it is a picture of a setting, and the controls
 * that change that setting (CD's `isSteppers` row) are a different block owned by the panel.
 * CD paints the meeting block in its indigo gradient, which is our `--primary`; the buffers are
 * a token hatch over `--muted`. Nothing here is interactive, so nothing here is gold.
 *
 * NOT PORTED, deliberately: CD's `foot` string, which asserts an arithmetic conclusion about
 * the mock ("A 45-minute call occupies 65 minutes of your day"). The equivalent sentence here
 * arrives as `foot` from the caller, or not at all — we do not compose a claim about a number
 * we were not given.
 */

/** One part of the strip. `minutes` drives the width; `label` is what the caller prints. */
export interface BufferSegment {
  /** Human duration, e.g. "10 min". null → "—". */
  label: string | null;
  /** Real duration in minutes. null → the strip cannot be drawn to scale (see above). */
  minutes: number | null;
}

export interface BufferDiagramProps {
  before?: BufferSegment;
  meeting?: BufferSegment;
  after?: BufferSegment;
  /**
   * CD's three static caption words. They are chrome, not data, so they carry a default — but
   * they stay overridable because a tenant may not call the middle block "the call".
   */
  captions?: { before: string; meeting: string; after: string };
  /** The caller's sentence under the strip. Absent → nothing is printed (see above). */
  foot?: string | null;
  className?: string;
}

const NOT_KNOWN = "—";

function figure(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? NOT_KNOWN : value;
}

function minutesOf(segment: BufferSegment | undefined): number | null {
  const m = segment?.minutes;
  if (typeof m !== "number" || !Number.isFinite(m) || m < 0) return null;
  return m;
}

/**
 * CD's hatch, in tokens: its `repeating-linear-gradient(45deg,#F1EEE5 0 5px,#E7E3D9 5px 10px)`
 * is two steps of the same warm recess, so it becomes --muted against --border at the same
 * 5px/10px rhythm. It re-tints with the theme instead of carrying a pasted pair of hexes.
 */
const HATCH =
  "repeating-linear-gradient(45deg,hsl(var(--muted)) 0 5px,hsl(var(--border)) 5px 10px)";

export default function BufferDiagram({
  before,
  meeting,
  after,
  captions = { before: "before", meeting: "the call", after: "after" },
  foot,
  className,
}: BufferDiagramProps) {
  const beforeMin = minutesOf(before);
  const meetingMin = minutesOf(meeting);
  const afterMin = minutesOf(after);

  const total =
    beforeMin !== null && meetingMin !== null && afterMin !== null
      ? beforeMin + meetingMin + afterMin
      : null;
  /** A zero-length day cannot be drawn either — dividing by it would invent three equal parts. */
  const drawable = total !== null && total > 0;

  const widths = drawable
    ? {
        before: `${((beforeMin as number) / (total as number)) * 100}%`,
        meeting: `${((meetingMin as number) / (total as number)) * 100}%`,
        after: `${((afterMin as number) / (total as number)) * 100}%`,
      }
    : null;

  return (
    <figure className={cn("m-0 min-w-0", className)}>
      {widths ? (
        <>
          <div
            role="img"
            aria-label={`${captions.before} ${figure(before?.label)}, ${captions.meeting} ${figure(
              meeting?.label,
            )}, ${captions.after} ${figure(after?.label)}`}
            className="flex h-[52px] items-stretch overflow-hidden rounded-[10px] border border-border"
          >
            <div
              style={{ width: widths.before, backgroundImage: HATCH }}
              className="grid place-items-center"
            >
              <span className="px-1 text-center text-[9px] font-bold text-muted-foreground">
                {figure(before?.label)}
              </span>
            </div>
            <div
              style={{ width: widths.meeting }}
              className="grid place-items-center bg-[hsl(var(--primary))]"
            >
              <span className="px-1 text-center text-[11.5px] font-bold text-[hsl(var(--primary-foreground))]">
                {figure(meeting?.label)}
              </span>
            </div>
            <div
              style={{ width: widths.after, backgroundImage: HATCH }}
              className="grid place-items-center"
            >
              <span className="px-1 text-center text-[9px] font-bold text-muted-foreground">
                {figure(after?.label)}
              </span>
            </div>
          </div>
          <div aria-hidden className="mt-[5px] flex">
            <span
              style={{ width: widths.before }}
              className="text-center text-[8.5px] text-muted-foreground"
            >
              {captions.before}
            </span>
            <span
              style={{ width: widths.meeting }}
              className="text-center text-[8.5px] text-muted-foreground"
            >
              {captions.meeting}
            </span>
            <span
              style={{ width: widths.after }}
              className="text-center text-[8.5px] text-muted-foreground"
            >
              {captions.after}
            </span>
          </div>
        </>
      ) : (
        /* §13 — no scale, no strip. The block says which part it is missing rather than
           drawing three plausible-looking segments the operator would read as configured. */
        <div className="rounded-[10px] border border-dashed border-border bg-muted/40 px-[13px] py-[14px]">
          <div className="text-[12.5px] font-semibold">
            The booking geometry is not connected.
          </div>
          <div className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
            This strip is drawn to scale, so it needs the real duration of the call and of the
            buffer either side of it. Until all three are known it shows nothing rather than a
            shape that would read as a configured setting.
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-x-[11px]">
            {[
              { key: "before", caption: captions.before, seg: before },
              { key: "meeting", caption: captions.meeting, seg: meeting },
              { key: "after", caption: captions.after, seg: after },
            ].map((part) => (
              <div key={part.key} className="min-w-0">
                <dt className="truncate text-[8.5px] font-semibold tracking-[0.13em] text-muted-foreground">
                  {part.caption}
                </dt>
                <dd className="mt-[3px] truncate text-[11.5px] font-semibold tabular-nums">
                  {figure(part.seg?.label)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {foot && (
        <figcaption className="mt-2 text-[10.5px] leading-[1.5] text-muted-foreground">
          {foot}
        </figcaption>
      )}
    </figure>
  );
}
