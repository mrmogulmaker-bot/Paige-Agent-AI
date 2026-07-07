import { motion, type Variants } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";

const PaigeHero3D = lazy(() => import("@/components/PaigeHero3D"));

/**
 * PremiumHero — the premium Framer-Motion layout with the real 3D Paige popped
 * out front. Copy enters with a staggered blur-to-sharp reveal on the left;
 * the interactive 3D Paige (grab to rotate) floats over the glow orbs on the
 * right. Route: /premium.
 */

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(12px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] },
  },
};

const STATS: [string, string][] = [
  ["50K+", "Tasks Automated"],
  ["18", "Sub-Agents"],
  ["360°", "Intelligence"],
];

export default function PremiumHero() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0510] text-white">
      {/* Floating glow orbs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-[38rem] w-[38rem] rounded-full bg-[#7c3aed]/30 blur-[130px]"
        animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-[42rem] w-[42rem] rounded-full bg-[#a855f7]/25 blur-[150px]"
        animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Masked tech grid */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-center gap-4 px-6 py-16 lg:grid lg:grid-cols-2 lg:items-center lg:gap-8">
        {/* Copy */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex max-w-xl flex-col items-center gap-6 text-center lg:items-start lg:text-left"
        >
          <motion.div
            variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 backdrop-blur-md"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#c084fc]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">
              The AI Operating System
            </span>
          </motion.div>

          <motion.h1
            variants={item}
            className="text-6xl font-black leading-[0.9] tracking-tight md:text-7xl xl:text-8xl"
          >
            Meet{" "}
            <span className="bg-gradient-to-br from-[#c084fc] via-[#a855f7] to-[#7c3aed] bg-clip-text text-transparent drop-shadow-[0_0_50px_rgba(168,85,247,0.5)]">
              Paige.
            </span>
          </motion.h1>

          <motion.p
            variants={item}
            className="max-w-md text-lg leading-relaxed text-white/70 md:text-xl"
          >
            The autonomous operating system that runs your clients, your
            workflows, and your entire operation — so you can scale.
          </motion.p>

          <motion.div variants={item} className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => navigate("/auth?mode=signup")}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] px-7 py-3 font-bold shadow-[0_10px_40px_rgba(124,58,237,0.5)] transition-transform hover:scale-105"
            >
              Start Your Workspace
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              type="button"
              className="rounded-full border border-white/20 bg-white/5 px-7 py-3 font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-white/10"
            >
              See How It Works
            </button>
          </motion.div>

          <motion.div variants={item} className="mt-6 flex items-center gap-8 border-t border-white/10 pt-6">
            {STATS.map(([n, l]) => (
              <div key={l} className="text-center lg:text-left">
                <div className="text-2xl font-bold tabular-nums">{n}</div>
                <div className="text-[11px] uppercase tracking-widest text-white/50">{l}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* 3D Paige — popped out front */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-[52vh] w-full lg:h-[82vh]"
        >
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]/20 blur-[90px]" />
          <Suspense fallback={<div className="h-full w-full" />}>
            <PaigeHero3D />
          </Suspense>
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-white/40">
            Drag to rotate · Paige is live 3D
          </p>
        </motion.div>
      </div>
    </div>
  );
}
