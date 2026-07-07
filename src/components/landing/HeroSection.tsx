import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback, useRef, useState } from "react";

/**
 * Hero — cinematic video direction.
 *
 * A full-bleed, seamlessly looping Runway-generated film of Paige is the
 * stage; the copy is layered over it like a title card. Interactive: a purple
 * spotlight tracks the cursor across the footage, and a small cinema control
 * cluster lets the visitor replay the intro or unmute the sound. Brand accent
 * shifts to purple to live inside the video's own light.
 */
export function HeroSection() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [muted, setMuted] = useState(true);

  // Cursor-tracked spotlight — writes CSS vars the overlay reads.
  const onMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }, []);

  const replay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play();
  }, []);

  const toggleSound = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) void v.play();
    setMuted(v.muted);
  }, []);

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMove}
      className="relative isolate overflow-hidden bg-background min-h-[92vh] flex items-end"
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "42%" }}
    >
      {/* Cinematic film — full-bleed, seamless loop */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster=""
        aria-label="Paige — cinematic introduction"
      >
        <source src="/paige/paige-hero.mp4" type="video/mp4" />
      </video>

      {/* Legibility gradient — subtle, clearest at the top */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/15 pointer-events-none" />
      {/* Brand tint — ties the frame to the purple identity */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_115%,rgba(124,58,237,0.35),transparent_55%)] pointer-events-none mix-blend-screen" />
      {/* Bottom blend — melts the film into the page so the next section flows out of it */}
      <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-b from-transparent to-background pointer-events-none" />
      {/* Cursor spotlight — follows the mouse across the footage */}
      <div
        className="absolute inset-0 pointer-events-none opacity-70 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(340px circle at var(--mx) var(--my), rgba(168,85,247,0.22), transparent 65%)",
        }}
      />

      {/* Cinema controls — top-right */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={replay}
          aria-label="Replay the intro"
          className="group flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/20 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5 transition-transform group-hover:-rotate-180 duration-500" />
          Replay
        </button>
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Unmute" : "Mute"}
          className="flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/15 w-8 h-8 text-white/90 hover:bg-white/20 transition-all"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Slim caption bar — a single line across the bottom of the film */}
      <div className="relative z-10 w-full animate-fade-in">
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
          <div className="flex gap-3 shrink-0">
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
