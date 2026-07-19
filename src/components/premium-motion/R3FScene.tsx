// R3FScene — a lazy react-three-fiber <Canvas> wrapper (§29 premium motion).
//
// Doctrine:
//  - §11/§22 heavy WebGL is spent only where it earns its pixels; this wrapper
//    is LAZY so three/fiber never bloats the main bundle, and it CAPS the DPR
//    ([1, 2]) so it stays performant on hi-DPI displays.
//  - Reduced motion renders the crafted skeleton/poster instead of booting a
//    live canvas (a 3D scene is motion).
//  - Token-only skeleton. Callers pass their own scene as children.
//
// NOTE: postprocessing (@react-three/postprocessing <EffectComposer/>) is a peer
// the caller composes INSIDE `children` when a scene needs it — this wrapper
// stays scene-agnostic so it doesn't force the effects bundle on every use.
import { Suspense, lazy, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// Lazy-load the Canvas so @react-three/fiber is code-split out of the main entry.
const Canvas = lazy(() =>
  import("@react-three/fiber").then((m) => ({ default: m.Canvas })),
);

export interface R3FSceneProps {
  children: ReactNode;
  className?: string;
  /** Static fallback while the canvas boots AND under reduced motion. */
  fallback?: ReactNode;
  /** Camera position; sensible default so callers can omit it. */
  cameraPosition?: [number, number, number];
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

export function R3FScene({
  children,
  className,
  fallback,
  cameraPosition = [0, 0, 5],
}: R3FSceneProps) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={cn("h-full w-full", className)}>{fallback ?? <Skeleton />}</div>;
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <Suspense fallback={fallback ?? <Skeleton />}>
        <Canvas dpr={[1, 2]} camera={{ position: cameraPosition, fov: 45 }}>
          {children}
        </Canvas>
      </Suspense>
    </div>
  );
}

export default R3FScene;
