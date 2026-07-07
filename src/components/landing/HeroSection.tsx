import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import { supportsWebGL, prefersReducedMotion } from "@/lib/webgl";

// Code-split the WebGL scene so the Three.js bundle never blocks first paint.
const HeroScene = lazy(() => import("./three/HeroScene"));

/**
 * Hero — real-time 3D (WebGL) direction.
 *
 * The stage is a live Three.js scene: a glowing distorting "Paige core" in a
 * purple particle field, with the Runway film composited onto a floating 3D
 * panel you can grab and orbit. On devices without WebGL (or when the visitor
 * asked to reduce motion) it degrades to the flat looping film. Copy sits in a
 * slim caption bar over the stage.
 */
export function HeroSection() {
  const navigate = useNavigate();
  const [use3D, setUse3D] = useState(false);

  // Decide on the client — never during SSR/prerender.
  useEffect(() => {
    setUse3D(supportsWebGL() && !prefersReducedMotion());
  }, []);

  return (
    <section className="group relative isolate overflow-hidden bg-background min-h-[92vh] flex items-end">
      {/* Stage: 3D scene, or the flat film as a graceful fallback */}
      {use3D ? (
        <div className="absolute inset-0 cursor-grab active:cursor-grabbing">
          <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
            <HeroScene />
          </Suspense>
        </div>
      ) : (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-label="Paige — cinematic introduction"
        >
          <source src="/paige/paige-hero.mp4" type="video/mp4" />
        </video>
      )}

      {/* Brand tint — ties the frame to the purple identity */}
      <div className="absolute inset-0 z-[6] pointer-events-none bg-[radial-gradient(120%_90%_at_50%_115%,rgba(124,58,237,0.28),transparent_55%)] mix-blend-screen" />
      {/* Bottom blend — melts the stage into the page so the next section flows out of it */}
      <div className="absolute inset-x-0 bottom-0 h-52 z-[6] pointer-events-none bg-gradient-to-b from-transparent to-background" />

      {/* Slim caption bar — a single line across the bottom of the stage */}
      <div className="relative z-10 w-full animate-fade-in pointer-events-none">
        <h1 className="sr-only">
          Paige — the AI operating system for coaches, consultants, and agencies
        </h1>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 lg:pb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-3 text-sm sm:text-[15px] text-white/85 max-w-xl leading-snug drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
            <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-[#c084fc] animate-pulse" />
            <span>
              <span className="font-semibold text-white">Meet Paige</span>
              {" "}— the autonomous operating system for coaches, consultants &amp;
              agencies.
            </span>
          </p>
          <div className="flex gap-3 shrink-0 pointer-events-auto">
            <Button
              className="bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white hover:from-[#b06bff] hover:to-[#8b40f0] font-bold shadow-[0_10px_40px_rgba(124,58,237,0.5)] hover:scale-105 transition-all border-0"
              onClick={() => navigate("/auth?mode=signup")}
            >
              Start Your Workspace
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              className="bg-white/5 backdrop-blur-md text-white border-white/20 hover:bg-white/10 hover:text-white"
              onClick={() =>
                document
                  .getElementById("how-paige-works")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              See How It Works
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
