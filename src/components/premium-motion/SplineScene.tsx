// SplineScene — lazy-loaded Spline (spline.design) 3D embed (§29 premium motion).
//
// Doctrine:
//  - §11/§22 heavy GPU work is spent only where it earns its pixels; this
//    primitive is LAZY (React.lazy + Suspense) so the ~MB Spline runtime never
//    lands in the main bundle. It also SKIPS entirely under reduced motion,
//    rendering the poster/skeleton fallback instead (a real 3D scene is motion).
//  - §25 the loading state is a crafted skeleton, never a bare "Loading…".
//  - Token-only skeleton (bg-muted / border-border).
import { Suspense, lazy, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// @splinetool/react-spline default export is the <Spline scene=… /> component.
const Spline = lazy(() => import("@splinetool/react-spline"));

export interface SplineSceneProps {
  /** Public URL of the exported .splinecode scene. */
  scene: string;
  className?: string;
  /** Static fallback shown while loading AND when motion is reduced. */
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

export function SplineScene({ scene, className, fallback }: SplineSceneProps) {
  const reduce = useReducedMotion();

  // Reduced motion: never boot the 3D runtime; show the poster/skeleton.
  if (reduce) {
    return <div className={cn("h-full w-full", className)}>{fallback ?? <Skeleton />}</div>;
  }

  return (
    <div className={cn("h-full w-full", className)}>
      <Suspense fallback={fallback ?? <Skeleton />}>
        <Spline scene={scene} />
      </Suspense>
    </div>
  );
}

export default SplineScene;
