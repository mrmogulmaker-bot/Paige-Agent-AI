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
import type { ReactNode } from "react";
import { Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEAM_LINE } from "./studio-copy";

export function StudioSplit({
  railHeader,
  railBody,
  railFooter,
  canvas,
  className,
}: {
  railHeader?: ReactNode;
  railBody: ReactNode;
  railFooter?: ReactNode;
  canvas: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row", className)}>
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
      <div className="relative z-10 flex flex-col border-b border-border/60 bg-gradient-to-b from-card to-background lg:min-h-0 lg:w-[380px] lg:shrink-0 lg:border-b-0 lg:border-r lg:shadow-[4px_0_16px_-12px_hsl(var(--shadow-ink)/0.16)]">
        {railHeader && <div className="shrink-0 border-b border-border/60 px-4 py-3">{railHeader}</div>}
        <div className="space-y-4 px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{railBody}</div>
        {railFooter && (
          // The pinned composer dock sits at the bottom — an upward shadow says so instead of a
          // bare top border carrying it alone (same `--shadow-ink` token as the rail's edge, for
          // the same dark-mode reason). It is NOT scroll-capped: the composer is one docked box
          // whose textarea grows then scrolls INTERNALLY, so the whole box never scrolls as a
          // unit and the send button never leaves the frame (the bug that made it feel like an
          // "isolated box scrolling up and down"). The conversation/canvas above is the scroll
          // region; this stays put — the Lovable/v0 dock pattern.
          <div className="shrink-0 border-t border-border/60 bg-background px-4 py-3 shadow-[0_-6px_16px_-10px_hsl(var(--shadow-ink)/0.18)]">
            {railFooter}
          </div>
        )}
      </div>
      {/* `.studio-drafting-grid` (src/index.css) carries the same muted top-to-bottom gradient
          this used to have inline, PLUS a faint 22px dot-grid on top — a recessed DRAFTING
          SURFACE the rendered page floats on (the Lovable/Figma pattern this file already
          named), not one flat gray fill. The dots are --foreground-tinted so they auto-invert
          to stay a low-contrast tonal mark in both themes (correct for a texture — the mirror
          of why the shadows use --shadow-ink). The existing inset shadow is preserved verbatim. */}
      <div className="studio-drafting-grid min-w-0 flex-1 p-4 shadow-[inset_0_2px_16px_-6px_hsl(var(--shadow-ink)/0.12)] md:p-6 lg:min-h-0 lg:overflow-y-auto">
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
