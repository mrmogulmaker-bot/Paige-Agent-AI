// The canvas half of the generation moment — the product demo.
//
// The phase ticker now lives in BuildProgress (rendered in the Studio's left rail, next
// to the conversation); this component owns what happens ON the canvas while a run is in
// flight: the real blocks materializing through the REAL <GrowthBlocks>, with shimmer
// skeletons trailing below for what's still coming.
//
// HONESTY IS THE DESIGN (§13): what you watch appear IS what publishes — same renderer,
// same theme resolver, same footer child. A failure narrates itself right here with a
// Retry; a dead model never paints a successful, empty page.
import { AlertTriangle } from "lucide-react";
import type { GrowthPageTheme } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { LivePreview } from "./LivePreview";
import { GENERATION_NOTES } from "./studio-copy";
import type { DeviceFrame, GenerationState } from "./studio-types";

export interface GenerationExperienceProps {
  generation: GenerationState;
  /** Passed straight through to the real <GrowthBlocks> — the published page's prop set. */
  theme: GrowthPageTheme | null;
  brandFloor: GrowthPageTheme | null;
  /** Lets an embedded_form resolve a live form exactly as the published page does. */
  tenantId?: string;
  device: DeviceFrame;
  /** Re-run after a failure. */
  onRetry?: () => void;
  className?: string;
}

/** Before the payload lands we have no honest count — so we scaffold a page shape, not a
 *  promise of a specific number of sections. */
const SCAFFOLD_SKELETONS = 3;

export function GenerationExperience({
  generation,
  theme,
  brandFloor,
  tenantId,
  device,
  onRetry,
  className,
}: GenerationExperienceProps) {
  const { phase, emitted, total, error } = generation;

  if (phase === "error") {
    return (
      <div className={cn("rounded-xl border border-border bg-card", className)}>
        <EmptyState
          icon={AlertTriangle}
          title="That didn't land"
          description={error?.message ?? GENERATION_NOTES.error}
          action={
            onRetry ? (
              <Button variant="outline" onClick={onRetry}>
                Try it again
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const trailing = total != null ? Math.max(0, total - emitted.length) : SCAFFOLD_SKELETONS;

  return (
    <LivePreview
      className={className}
      blocks={emitted}
      theme={theme}
      brandFloor={brandFloor}
      tenantId={tenantId}
      device={device}
      trailingSkeletons={trailing}
      interactive={false}
      showFooter={trailing === 0}
    />
  );
}

export default GenerationExperience;
