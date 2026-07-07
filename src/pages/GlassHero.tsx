import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Globe, ArrowRight, Instagram, Twitter } from "lucide-react";

// Spline background (code-split). Paste a Spline scene URL below to swap the
// video for a live, editable 3D scene behind the glass — Paige + a swirl you
// build/edit visually in Spline, no code. Empty string = keep the video.
const SplineScene = lazy(() => import("@splinetool/react-spline"));
const SPLINE_SCENE_URL = "";

/**
 * GlassHero — liquid-glass hero over a full-screen cinematic loop.
 * Faithful build of a Motion.ai reference: dark aesthetic, Instrument Serif
 * heading, glass UI, and a custom rAF fade-loop on the background video.
 * Standalone page (route /glass) — self-contained, no app theme dependency.
 */

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4";

const GLASS_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
.liquid-glass {
  background: rgba(255, 255, 255, 0.01);
  background-blend-mode: luminosity;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
  position: relative;
  overflow: hidden;
}
.liquid-glass::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.4px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.45) 0%,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0) 40%,
    rgba(255, 255, 255, 0) 60%,
    rgba(255, 255, 255, 0.15) 80%,
    rgba(255, 255, 255, 0.45) 100%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}
`;

export default function GlassHero() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const FADE_MS = 500;
    video.style.opacity = "0";

    const cancelRaf = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    // Fade opacity to `target` over `duration`, resuming from current value.
    const fade = (target: number, duration: number) => {
      cancelRaf();
      const from = parseFloat(video.style.opacity || "1");
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        video.style.opacity = String(from + (target - from) * t);
        if (t < 1) rafRef.current = requestAnimationFrame(step);
        else rafRef.current = null;
      };
      rafRef.current = requestAnimationFrame(step);
    };

    const startLoop = () => {
      fadingOutRef.current = false;
      void video.play();
      fade(1, FADE_MS);
    };

    const onTimeUpdate = () => {
      if (fadingOutRef.current) return;
      const remaining = video.duration - video.currentTime;
      if (isFinite(remaining) && remaining <= 0.55) {
        fadingOutRef.current = true;
        fade(0, FADE_MS);
      }
    };

    const onEnded = () => {
      cancelRaf();
      video.style.opacity = "0";
      window.setTimeout(() => {
        video.currentTime = 0;
        void video.play();
        fadingOutRef.current = false;
        fade(1, FADE_MS);
      }, 100);
    };

    video.addEventListener("loadeddata", startLoop);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);
    if (video.readyState >= 2) startLoop();

    return () => {
      cancelRaf();
      video.removeEventListener("loadeddata", startLoop);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  const navLinks = ["Features", "Pricing", "About"];

  return (
    <div className="min-h-screen bg-black overflow-hidden relative">
      <style>{GLASS_CSS}</style>

      {/* Background: live Spline 3D scene when a URL is set, else the video */}
      {SPLINE_SCENE_URL ? (
        <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
          <div className="absolute inset-0">
            <SplineScene scene={SPLINE_SCENE_URL} className="!absolute inset-0 h-full w-full" />
          </div>
        </Suspense>
      ) : (
        /* Full-screen background video with custom rAF fade-loop */
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          autoPlay
          playsInline
          preload="auto"
          style={{ opacity: 0 }}
          className="absolute inset-0 w-full h-full object-cover translate-y-[17%]"
        />
      )}

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Navigation */}
        <nav className="relative z-20 pl-6 pr-6 py-6">
          <div className="rounded-full px-6 py-3 flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <Globe size={24} className="text-white" />
                <span className="text-white font-semibold text-lg">Asme</span>
              </div>
              <div className="hidden md:flex items-center gap-8">
                {navLinks.map((label) => (
                  <a
                    key={label}
                    href="#"
                    className="text-white/80 hover:text-white transition-colors text-sm font-medium"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button type="button" className="text-white text-sm font-medium">
                Sign Up
              </button>
              <button
                type="button"
                className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium"
              >
                Login
              </button>
            </div>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center -translate-y-[20%]">
          <h1
            style={{ fontFamily: "'Instrument Serif', serif" }}
            className="text-5xl md:text-6xl lg:text-7xl text-white mb-8 tracking-tight whitespace-nowrap"
          >
            Built for the curious
          </h1>

          <div className="max-w-xl w-full space-y-4">
            <form
              onSubmit={(e) => e.preventDefault()}
              className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 min-w-0 bg-transparent outline-none text-white placeholder:text-white/40 text-base"
              />
              <button
                type="submit"
                aria-label="Subscribe"
                className="bg-white rounded-full p-3 text-black shrink-0"
              >
                <ArrowRight size={20} />
              </button>
            </form>

            <p className="text-white text-sm leading-relaxed px-4">
              Stay updated with the latest news and insights. Subscribe to our
              newsletter today and never miss out on exciting updates.
            </p>
          </div>

          <button
            type="button"
            className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors mt-6"
          >
            Read our manifesto
          </button>
        </div>

        {/* Social icons */}
        <div className="relative z-10 flex justify-center gap-4 pb-12">
          <button
            type="button"
            aria-label="Instagram"
            className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
          >
            <Instagram size={20} />
          </button>
          <button
            type="button"
            aria-label="Twitter"
            className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
          >
            <Twitter size={20} />
          </button>
          <button
            type="button"
            aria-label="Website"
            className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 transition-all"
          >
            <Globe size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
