// The Studio's shared frame pieces — pure layout, zero IO.
//
// Every mode fills the same two-region body: a 380px conversational rail on the left
// (header strip → scrollable body → pinned composer) and the canvas well on the right.
// Below lg the regions stack (rail above canvas) and the PAGE scrolls — no trapped inner
// scroll on mobile; at lg+ each region scrolls itself inside the full-height frame.
//
// Everything is token-only. The Studio root carries the `dark` scope, so these resolve
// to the dark chrome automatically; the canvas well (`bg-muted/30`) reads as the deep
// charcoal working surface the light rendered page floats on — the Lovable pattern.
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
    <div className={cn("flex min-h-0 flex-1 flex-col lg:flex-row", className)}>
      <div className="flex flex-col border-b border-border bg-background lg:min-h-0 lg:w-[380px] lg:shrink-0 lg:border-b-0 lg:border-r">
        {railHeader && <div className="shrink-0 border-b border-border px-4 py-3">{railHeader}</div>}
        <div className="space-y-4 px-4 py-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">{railBody}</div>
        {railFooter && <div className="shrink-0 border-t border-border px-4 py-3">{railFooter}</div>}
      </div>
      <div className="min-w-0 flex-1 bg-muted/30 p-4 md:p-6 lg:min-h-0 lg:overflow-y-auto">{canvas}</div>
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
