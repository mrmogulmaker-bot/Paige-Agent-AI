// RiveEmbed — WRAPPER ONLY for Rive (rive.app) interactive animations (§29).
//
// SCOPE (this wave): a wrapper that lazy-loads the Rive runtime and proves the
// dependency imports + typechecks. It does NOT ship a real .riv scene — no Rive
// asset is bundled and no live scene is wired. When `src` is omitted (the
// default this wave), it renders the crafted skeleton so a build stays green and
// nothing half-wired ships. A future wave passes a real `src` to light it up.
//
// Doctrine:
//  - §11/§22 lazy so the Rive canvas runtime is code-split out of the main entry.
//  - Reduced motion renders the static skeleton (a Rive scene is motion).
//  - §13 honesty: the wrapper does not pretend to play a scene it wasn't given.
//  - Token-only skeleton (bg-muted / border-border).
import { Suspense, lazy, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// Lazy inner that actually mounts the Rive runtime — only loaded when a real
// `src` is provided, so @rive-app/react-canvas never enters the main bundle
// until a scene is genuinely wired in a later wave.
const RiveRuntime = lazy(() => import("./RiveRuntime"));

export interface RiveEmbedProps {
  /** Public URL of a .riv file. Omitted this wave → skeleton only. */
  src?: string;
  /** Artboard / state-machine name, forwarded to the runtime when wired. */
  stateMachine?: string;
  className?: string;
  fallback?: ReactNode;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative h-full w-full overflow-hidden rounded-2xl border border-border bg-muted/40",
        className,
      )}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/20 via-transparent to-muted/30" />
    </div>
  );
}

export function RiveEmbed({ src, stateMachine, className, fallback }: RiveEmbedProps) {
  const reduce = useReducedMotion();

  // No scene wired (default this wave) OR reduced motion → static skeleton.
  if (!src || reduce) {
    return <div className={cn("h-full w-full", className)}>{fallback ?? <Skeleton />}</div>;
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <Suspense fallback={fallback ?? <Skeleton />}>
        <RiveRuntime src={src} stateMachine={stateMachine} />
      </Suspense>
    </div>
  );
}

export default RiveEmbed;
