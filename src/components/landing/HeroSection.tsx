import { Button } from "@/components/ui/button";
import { ArrowRight, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hero — cinematic video direction.
 *
 * A full-bleed, seamlessly looping Runway-generated film of Paige is the stage.
 * The film is *tactile*: it responds to the cursor with a soft parallax and can
 * be grabbed and dragged around (spring-easing back to center on release). The
 * cinema controls (replay + sound) stay tucked out of view until the visitor
 * hovers the hero. A purple spotlight tracks the cursor; copy sits in a slim
 * caption bar; the whole frame lives inside the video's own purple light.
 */
const MAX_PAN = 70; // px the film can be dragged from center
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function HeroSection() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [dragging, setDragging] = useState(false);

  // Pan state lives in refs so the rAF loop never triggers React re-renders.
  const pos = useRef({ cur: { x: 0, y: 0 }, target: { x: 0, y: 0 } });
  const draggingRef = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const reduce = useRef(false);

  // Smoothly ease the film toward its target offset every frame.
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      const p = pos.current;
      p.cur.x += (p.target.x - p.cur.x) * 0.12;
      p.cur.y += (p.target.y - p.cur.y) * 0.12;
      v.style.transform = `scale(1.14) translate3d(${p.cur.x}px, ${p.cur.y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Spotlight follows the cursor across the footage.
  const setSpotlight = (clientX: number, clientY: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((clientY - r.top) / r.height) * 100}%`);
  };

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setDragging(true);
    dragStart.current = {
      x: e.clientX - pos.current.target.x,
      y: e.clientY - pos.current.target.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    setSpotlight(e.clientX, e.clientY);
    if (draggingRef.current) {
      // Grab-and-move: film follows the drag, clamped so edges never show.
      pos.current.target.x = clamp(e.clientX - dragStart.current.x, -MAX_PAN, MAX_PAN);
      pos.current.target.y = clamp(e.clientY - dragStart.current.y, -MAX_PAN, MAX_PAN);
    } else if (!reduce.current) {
      // Ambient parallax toward the cursor when not dragging.
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      pos.current.target.x = dx * 24;
      pos.current.target.y = dy * 24;
    }
  }, []);

  const endDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    // Spring the film back to center; ambient parallax resumes on next move.
    pos.current.target = { x: 0, y: 0 };
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
      className="group relative isolate overflow-hidden bg-background min-h-[92vh] flex items-end"
      style={{ ["--mx" as string]: "50%", ["--my" as string]: "42%" }}
    >
      {/* Cinematic film — full-bleed, seamless loop, transformed by the rAF loop */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
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

      {/* Drag surface — grab the film and move it. Sits above the video, below
          the caption/controls so buttons stay clickable. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        className={`absolute inset-0 z-[5] touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        aria-hidden="true"
      />

      {/* Bottom blend — melts the film into the page so the next section flows out of it */}
      <div className="absolute inset-x-0 bottom-0 h-52 z-[6] bg-gradient-to-b from-transparent to-background pointer-events-none" />
      {/* Cursor spotlight — follows the mouse across the footage */}
      <div
        className="absolute inset-0 z-[6] pointer-events-none opacity-70 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(340px circle at var(--mx) var(--my), rgba(168,85,247,0.22), transparent 65%)",
        }}
      />

      {/* Cinema controls — tucked away until the hero is hovered */}
      <div className="absolute top-5 right-5 z-20 flex items-center gap-2 opacity-0 translate-y-[-6px] transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 focus-within:opacity-100 focus-within:translate-y-0">
        <button
          type="button"
          onClick={replay}
          aria-label="Replay the intro"
          className="group/btn flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/20 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5 transition-transform group-hover/btn:-rotate-180 duration-500" />
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
