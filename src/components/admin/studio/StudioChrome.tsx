// The Studio's shared frame pieces — pure layout, zero IO.
//
// Every mode fills the same two-region body: a 380px conversational rail on the left
// (header strip → scrollable body → pinned composer) and the canvas well on the right.
// Below lg the regions stack (rail above canvas) and the PAGE scrolls — no trapped inner
// scroll on mobile; at lg+ each region scrolls itself inside the full-height frame.
//
// The composer (railFooter) is the one region that ISN'T bounded by the rail body's own
// scroll — it sits below it, `shrink-0`, so its own natural height (a growing textarea +
// attachments + chips + the submit button) has to fit. At lg+ it gets its own scroll cap
// so a long brief never pushes the submit button past the frame's edge with nothing to
// reach it. Below lg there's no cap — the composer just takes its natural height and the
// page (not this component) scrolls, per the paragraph above.
//
// Everything is token-only. The Studio root carries the `dark` scope, so these resolve
// to the dark chrome automatically; the canvas well (a muted top-to-bottom gradient with a
// soft inset shadow, not a flat fill) reads as the deep charcoal working surface the light
// rendered page floats on — the Lovable pattern. The rail's own edges (its right border at
// lg+, the pinned composer's top edge) carry a matching shadow rather than a bare hairline —
// premium chrome separates regions with border + shadow together, never a border alone (§11).
import { useEffect, useRef, type ReactNode } from "react";
import { Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEAM_LINE } from "./studio-copy";

export function StudioSplit({
  railHeader,
  railBody,
  railFooter,
  canvas,
  immersive = false,
  railBare = false,
  canvasFirstOnMobile = false,
  className,
}: {
  railHeader?: ReactNode;
  railBody: ReactNode;
  railFooter?: ReactNode;
  canvas: ReactNode;
  /** First-build full-width moment: retract the conversation rail to 0 so the canvas fills the
   *  frame edge-to-edge (the Lovable/Replit "watch it build" state). Optional — the other modes
   *  (Form/Image/Copy/Funnel) render StudioSplit without it and stay in the normal split. */
  immersive?: boolean;
  /** The rail body manages its OWN scroll + docked composer (e.g. StudioChat, the #292 session
   *  conversation). Skip the default padded/scrolling wrapper + header/footer strips so the child
   *  fills the column edge-to-edge — no double scroll, no double padding, composer pins. */
  railBare?: boolean;
  /** On a CHAT surface, below lg the live preview belongs ON TOP (capped) and the conversation —
   *  the thing the customer actually drives, with its pinned composer — fills the rest. */
  canvasFirstOnMobile?: boolean;
  className?: string;
}) {
  // React 18 renders a declarative `inert={false}` as the string "false" — still inert. Set the DOM
  // property so the retracted (w-0) rail's controls leave the tab order + a11y tree while hidden.
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = railRef.current;
    if (el) el.inert = immersive;
  }, [immersive]);

  return (
    <div className={cn("flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row", canvasFirstOnMobile && "max-lg:flex-col-reverse", className)}>
      {/* The rail/canvas seam was a hairline border doing all the separation work (§11) — a
          faint horizontal shadow now carries it at lg+, so the border can soften instead of
          sitting at full strength right next to it. Directional/inset shadows like this one
          aren't expressible with the named shadow-{sm,md,lg,xl} tokens (those are all
          straight-down casts), so they reference the shared `--shadow-ink` token
          (src/index.css) instead of hsl(var(--foreground)) — foreground flips to near-white
          in dark mode, which would turn a "shadow" into a light-colored highlight instead of
          staying dark ink in both themes the way every other --shadow-* in the system does.
          `relative z-10` is load-bearing: the rail is EARLIER in DOM order than the canvas
          well it sits beside, and non-positioned siblings paint in tree order — without a
          stacking context, the canvas's own opaque gradient (painted later) would silently
          cover this shadow's rightward bleed, the same no-op risk the top bar has above. */}
      <div
        ref={railRef}
        className={cn(
          // The conversation rail is a LIT indigo glass column (was platform card→background,
          // two near-neutral grays) — a soft top→deeper gradient off the committed studio rail
          // tokens so it reads as a saturated panel, not a flat gray box (§6/§11).
          "relative z-10 flex flex-col border-b border-[hsl(var(--studio-chrome-border)/0.5)] bg-gradient-to-b from-[hsl(var(--studio-rail-solid))] to-[hsl(var(--studio-canvas))]",
          "lg:min-h-0 lg:shrink-0 lg:border-b-0",
          "transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
          // Immersive first build: at lg+ the rail width animates 380→0; below lg the stacked rail
          // is simply hidden (no width tween expected on a mobile stack). The canvas `flex-1` div
          // reflows to fill as the rail retracts — it needs no transition of its own.
          immersive
            ? "overflow-hidden max-lg:hidden lg:w-0 lg:border-r-0"
            : "lg:w-[380px] lg:border-r lg:border-[hsl(var(--studio-chrome-border)/0.5)] lg:shadow-[4px_0_16px_-12px_hsl(var(--shadow-ink)/0.16)]",
        )}
      >
        {railBare ? (
          // Self-managing rail (StudioChat): fill the column; the child owns scroll + composer.
          <div className="flex min-h-0 flex-1 flex-col">{railBody}</div>
        ) : (
        <>
        {railHeader && <div className="shrink-0 border-b border-[hsl(var(--studio-chrome-border)/0.5)] px-4 py-3">{railHeader}</div>}
        <div className="space-y-4 px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{railBody}</div>
        {railFooter && (
          // The pinned composer dock sits at the bottom — an upward shadow says so instead of a
          // bare top border carrying it alone (same `--shadow-ink` token as the rail's edge, for
          // the same dark-mode reason). It is NOT scroll-capped: the composer is one docked box
          // whose textarea grows then scrolls INTERNALLY, so the whole box never scrolls as a
          // unit and the send button never leaves the frame (the bug that made it feel like an
          // "isolated box scrolling up and down"). The conversation/canvas above is the scroll
          // region; this stays put — the Lovable/v0 dock pattern.
          // The pinned composer dock lifts a step above the rail (its own --studio-dock tone, a
          // notch lighter + more saturated than the rail) so the primary input reads RAISED —
          // the Lovable/v0 lit dock, not a gray shelf. Indigo tint, never gold (§11).
          <div className="shrink-0 border-t border-[hsl(var(--studio-chrome-border)/0.5)] bg-[hsl(var(--studio-dock))] px-4 py-3 shadow-[0_-6px_16px_-10px_hsl(var(--shadow-ink)/0.18)]">
            {railFooter}
          </div>
        )}
        </>
        )}
      </div>
      {/* `.studio-drafting-grid` (src/index.css) is a recessed PHOTOGRAPHIC well the rendered page
          floats on (the Lovable/v0 preview pane) — a top-light glow + a bottom vignette over a
          solid well color, NOT the old wireframe dot-grid (the "sketch" the owner named). Here we
          layer the deep inset shadow that gives the well its concave lip: a 1px top highlight
          (--foreground, so it stays a faint light edge in both themes) plus a large soft inset
          cast in fixed shadow-ink. Roomier padding (p-6 → md:p-10) so the artifact breathes and
          reads as a hero on a surface, not a full-bleed fill jammed to the edges (§11). */}
      <div className={cn(
        "studio-drafting-grid min-w-0 flex-1 p-6 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),inset_0_18px_50px_-24px_hsl(var(--studio-ink)/0.7)] md:p-10 lg:min-h-0 lg:overflow-y-auto",
        // Chat surface on mobile: cap the preview so the conversation (below it) leads the screen.
        canvasFirstOnMobile && "max-lg:h-[42vh] max-lg:shrink-0 max-lg:overflow-y-auto",
      )}>
        {canvas}
      </div>
    </div>
  );
}

/** The rail's header strip: what this mode does, plus the §8/§14 team line. */
export function StudioRailHeading({
  heading,
  description,
  teamLine = false,
}: {
  heading: string;
  description?: string;
  teamLine?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h2 className="font-display text-sm font-semibold text-foreground">{heading}</h2>
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      {teamLine && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {TEAM_LINE}
        </p>
      )}
    </div>
  );
}
