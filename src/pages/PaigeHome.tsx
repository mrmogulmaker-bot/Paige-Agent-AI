import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  MessageSquare,
  CalendarCheck,
  Trophy,
  Users,
  Receipt,
  Workflow,
  Sunrise,
  Flag,
  Check,
  Sparkles as SparkIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";

/**
 * PaigeHome — the gold + indigo Paige landing (route "/"). A complete, from-
 * scratch build to the two-character spec; it does NOT reuse the old star-field
 * design (parked at /premium) or the legacy site (/legacy). Coaching only.
 */

const PaigeScene = lazy(() => import("@/components/PaigeScene"));

// Palette
const GOLD = "#D4A752";
const GOLD_HI = "#F0C86A";
const INK = "#140c27"; // deep indigo ground
const OFFWHITE = "#F8F5EE";
const HEAD = "'Bricolage Grotesque', 'Space Grotesk', sans-serif";

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
const rise: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return r;
}

const NAV = [
  { label: "Meet Paige", href: "#hero" },
  { label: "Workspace", href: "#workspace" },
  { label: "A day with her", href: "#day" },
  { label: "Coaches", href: "#proof" },
  { label: "Pricing", href: "#pricing" },
];

// Hero workspace panels (coaching only)
const PANELS = [
  { icon: MessageSquare, eyebrow: "Paige · replying to Maya", body: "Rescheduled your 3:00 to Thursday — sent the prep doc and confirmed she got it.", pos: "right-[5%] top-[15%]", depth: 0 },
  { icon: CalendarCheck, eyebrow: "Kickoff booked · Wed 11:00", body: "New client onboarded while you slept.", pos: "right-[30%] top-[30%]", depth: 0.5 },
  { icon: Trophy, eyebrow: "Client milestone", body: "James hit week 12 — celebration prepped.", pos: "right-[9%] top-[54%]", depth: 0.25 },
  { icon: Users, eyebrow: "Priya S. · Growth cohort", body: "Engagement dipping — a nudge is queued for your review.", pos: "right-[38%] top-[64%]", depth: 0.7 },
  { icon: Receipt, eyebrow: "Retainer · December", body: "Invoice sent · $4,200 · reminder scheduled for Friday.", pos: "right-[3%] top-[77%]", depth: 0.4 },
];

const DAY = [
  { t: "6:47 AM", icon: Sunrise, line: "I'm drafting your morning brief.", tag: "Morning brief ready" },
  { t: "8:15 AM", icon: Users, line: "I onboarded three new clients while you slept.", tag: "3 welcome sequences sent" },
  { t: "10:30 AM", icon: MessageSquare, line: "I drafted the follow-ups from yesterday's session.", tag: "Session follow-ups drafted" },
  { t: "12:00 PM", icon: Workflow, line: "I ran the check-in sequence for your Tier 2 cohort.", tag: "Tier 2 · check-ins sent" },
  { t: "2:15 PM", icon: Flag, line: "I flagged two clients who need attention this week.", tag: "2 clients flagged" },
  { t: "4:00 PM", icon: Receipt, line: "I sent this month's invoices and drafted the reminders.", tag: "Retainer invoices sent" },
  { t: "8:00 PM", icon: CalendarCheck, line: "I prepared tomorrow's calendar with your talking points.", tag: "Tomorrow prepped" },
];

const PROOF = [
  { q: "Paige runs the parts of my practice I used to dread. I got my evenings back.", a: "Business coach · Chicago" },
  { q: "The follow-through happens whether I remember it or not. My clients feel it.", a: "Executive coach · Austin" },
  { q: "Every client gets the follow-up I could never keep up with. Retention's up.", a: "Fitness coach · Los Angeles" },
  { q: "She handles the whole back office. I just show up and coach.", a: "Life coach · Denver" },
  { q: "My cohort has never been more looked-after, and I'm doing a fraction of the admin.", a: "Mindset coach · Miami" },
  { q: "Onboarding, check-ins, recaps — Paige runs all of it. It's like a full ops team.", a: "Sales coach · Dallas" },
];

const PLANS = [
  { name: "Solo", price: "$58", tagline: "Just you, fully covered.", features: ["Paige runs your CRM & pipeline", "Auto-drafted follow-ups & recaps", "Client welcome sequences", "Cohort check-ins & at-risk flags"], highlight: false },
  { name: "Practice", price: "$149", tagline: "Most coaches land here.", features: ["Everything in Solo", "Custom playbooks per coach", "Advanced signals & analytics", "Priority support"], highlight: true },
  { name: "Studio", price: "$349", tagline: "For the coach running the whole show.", features: ["Everything in Practice", "Multi-coach roster & routing", "White-label workspace", "Dedicated success partner"], highlight: false },
];

/** Degrade gracefully: if the 3D scene ever throws, drop it and keep the
 *  gradient + copy — the homepage must never white-screen. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Section({ id, className = "", children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <motion.section
      id={id}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-90px" }}
      className={`relative mx-auto w-full max-w-6xl px-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/** Idle 20s → a gentle nudge in Paige's voice. */
function IdleNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let timer: number;
    const reset = () => {
      setShow(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setShow(true), 20000);
    };
    reset();
    const evts = ["pointermove", "scroll", "keydown", "pointerdown"] as const;
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);
  return (
    <motion.div
      initial={false}
      animate={show ? { opacity: 1, y: 0, pointerEvents: "auto" } : { opacity: 0, y: 20, pointerEvents: "none" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-6 right-6 z-40 w-72 rounded-2xl border border-[#D4A752]/30 bg-[#1a1033]/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-md"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#D4A752]/20 text-[#F0C86A]">
          <SparkIcon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[13px] font-semibold" style={{ color: OFFWHITE, fontFamily: HEAD }}>Still there?</span>
      </div>
      <p className="text-[12.5px] leading-snug text-white/70">Want a demo? I can walk you through a day in my life.</p>
      <a href="#day" onClick={() => setShow(false)} className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#F0C86A]">
        Show me <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </motion.div>
  );
}

function FloatingPanels() {
  return (
    <>
      {PANELS.map((p, i) => {
        const scale = 1 - p.depth * 0.28;
        const opacity = 1 - p.depth * 0.45;
        return (
          <motion.div
            key={i}
            aria-hidden
            className={`absolute hidden w-[15rem] rounded-2xl border border-white/12 bg-[#1a1033]/55 p-3.5 backdrop-blur-md lg:block ${p.pos}`}
            style={{ scale, opacity, boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity, y: [0, -12, 0] }}
            transition={{
              opacity: { delay: 0.7 + i * 0.15, duration: 0.8 },
              y: { duration: 7 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 },
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#D4A752]/18 text-[#F0C86A]">
                <p.icon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-semibold text-[#F0C86A]">{p.eyebrow}</span>
            </div>
            <p className="text-[12px] leading-snug text-white/75">{p.body}</p>
          </motion.div>
        );
      })}
    </>
  );
}

/** Paige brand mark — orbital orb + companion spark (design crew, owned SVG). */
function PaigeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" role="img" aria-label="Paige" className={className}>
      <defs>
        <radialGradient id="pg-orb" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#FCE7B6" />
          <stop offset="42%" stopColor="#F0C86A" />
          <stop offset="100%" stopColor="#D4A752" />
        </radialGradient>
        <linearGradient id="pg-ring" x1="4" y1="40" x2="44" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4A752" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#F0C86A" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#D4A752" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="pg-spark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF4D8" />
          <stop offset="60%" stopColor="#F0C86A" />
          <stop offset="100%" stopColor="#D4A752" />
        </radialGradient>
        <radialGradient id="pg-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F0C86A" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#F0C86A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="17" fill="url(#pg-halo)" />
      <g transform="rotate(-27 24 24)">
        <ellipse cx="24" cy="24" rx="18" ry="7.5" stroke="url(#pg-ring)" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="24" cy="24" r="8" fill="url(#pg-orb)" />
        <circle cx="21.4" cy="21" r="2.4" fill="#FFF6E2" opacity="0.85" />
        <circle cx="37.8" cy="29.1" r="3.4" fill="url(#pg-spark)" />
      </g>
    </svg>
  );
}

/**
 * IntroSequence — the phone-opening: a phone rises, its screen shows Paige
 * working a live client thread, then the phone dives forward and the Paige
 * world is revealed behind it. Plays once per session; skipped for
 * prefers-reduced-motion. Robust framer-motion overlay (no 3D dependency).
 */
const INTRO_THREAD = [
  { who: "Maya R.", side: "in", text: "Can't make Thursday — this week got away from me 😞" },
  { who: "Paige", side: "out", text: "Moved Maya to Tuesday 10 AM, sent the invite, and carried her prep notes over. Drafted a warm reply so she doesn't feel like a bother." },
  { who: "Paige", side: "out", text: "Devin from last night's webinar — follow-up drafted before it goes cold. And Jordan's gone quiet 12 days: flagging at-risk." },
];
function IntroSequence({ reduced }: { reduced: boolean }) {
  // Read reduced-motion synchronously here — the parent hook is false on first
  // render (it flips in an effect), so we must check the media query directly
  // or the intro would play for reduced-motion users.
  const [done, setDone] = useState(() => {
    try {
      if (reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      return sessionStorage.getItem("paige_intro_v1") === "1";
    } catch {
      return true;
    }
  });
  const finish = () => {
    try {
      sessionStorage.setItem("paige_intro_v1", "1");
    } catch {
      /* ignore */
    }
    setDone(true);
  };
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  if (done) return null;
  return (
    <motion.div
      role="presentation"
      aria-hidden
      onClick={finish}
      className="fixed inset-0 z-[70] flex cursor-pointer items-center justify-center overflow-hidden [perspective:1200px]"
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 1, 0] }}
      transition={{ duration: 3.1, times: [0, 0.72, 0.92, 1] }}
      onAnimationComplete={finish}
      style={{ background: "radial-gradient(90% 70% at 50% 42%, #3A2668 0%, #2A1B4E 46%, #120A24 100%)" }}
    >
      <span className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-white/40">
        Click to skip
      </span>
      {/* gold bloom behind the phone */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F0C86A]/15 blur-[120px]" />
      <motion.div
        initial={{ y: 90, opacity: 0, scale: 0.92 }}
        animate={{ y: [90, 0, 0, -20], opacity: [0, 1, 1, 0], scale: [0.92, 1, 1, 7] }}
        transition={{ duration: 3.1, times: [0, 0.22, 0.72, 1], ease: ["easeOut", "linear", "easeIn"] }}
        style={{ transformOrigin: "center 46%" }}
        className="relative"
      >
        {/* Phone */}
        <div className="relative h-[560px] w-[276px] rounded-[2.75rem] border border-[#D4A752]/25 bg-[#120A24] p-3 shadow-[0_40px_120px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(240,200,106,0.15)]">
          <div className="absolute left-1/2 top-3 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
          {/* Screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[2.1rem] bg-gradient-to-b from-[#1a1338] to-[#0d0820]">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3.5 pt-7">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] text-[11px] font-black text-[#2A1B4E]">P</span>
              <div className="leading-tight">
                <div className="text-[12px] font-semibold text-white" style={{ fontFamily: HEAD }}>Paige</div>
                <div className="text-[9px] text-[#7ee0a8]">working your inbox…</div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 py-4">
              {INTRO_THREAD.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.55, duration: 0.4 }}
                  className={m.side === "out" ? "self-end" : "self-start"}
                >
                  <div
                    className={`max-w-[190px] rounded-2xl px-3 py-2 text-[11px] leading-snug ${
                      m.side === "out"
                        ? "rounded-br-sm bg-gradient-to-br from-[#D4A752]/25 to-[#F0C86A]/15 text-[#F8F5EE] ring-1 ring-[#F0C86A]/25"
                        : "rounded-bl-sm bg-white/[0.06] text-white/85"
                    }`}
                  >
                    {m.text}
                  </div>
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.35, duration: 0.3 }}
                className="mt-1 flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] py-2 text-[11px] font-bold text-[#2A1B4E]"
              >
                <Check className="h-3.5 w-3.5" /> Approve all
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PaigeHome() {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: `radial-gradient(120% 90% at 70% 15%, #241645 0%, ${INK} 55%, #0c0718 100%)`, color: OFFWHITE, fontFamily: "'Inter', sans-serif" }}
    >
      {/* Persistent Paige — fixed behind the whole page; she stays in the
          background and her head tracks the cursor no matter how you scroll. */}
      <div aria-hidden className="fixed inset-0 z-0">
        <SceneBoundary>
          <Suspense fallback={<div className="absolute inset-0" />}>
            <PaigeScene />
          </Suspense>
        </SceneBoundary>
      </div>

      <IntroSequence reduced={reduced} />
      {!reduced && <IdleNudge />}

      {/* All page content rides above the fixed Paige layer */}
      <div className="relative z-10">
      {/* Nav */}
      <header className="relative z-30 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <a href="#hero" className="flex items-center gap-2.5">
          <PaigeMark className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight text-[#F8F5EE]" style={{ fontFamily: HEAD }}>
            Paige <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F0C86A]/90">Agent</span>
          </span>
        </a>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((l) => (
            <a key={l.label} href={l.href} className="text-sm font-medium text-white/65 transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <button
          onClick={() => navigate("/auth?mode=signup")}
          className="rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] px-4 py-2 text-sm font-bold text-[#241645] transition-transform hover:scale-105"
        >
          Hire Paige
        </button>
      </header>

      {/* HERO — transparent so the fixed Paige shows behind the copy */}
      <section id="hero" className="relative min-h-[92vh] w-full">
        <div className="pointer-events-none absolute inset-0">
          <FloatingPanels />
        </div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="absolute left-6 top-[52%] w-[min(90%,620px)] -translate-y-1/2 sm:left-[7%]"
        >
          <motion.div variants={rise} className="mb-6 flex items-center gap-3">
            <span className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#F0C86A]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Give coaches back their time.
            </span>
            <span aria-hidden className="h-px w-10 bg-gradient-to-r from-[#D4A752]/70 to-transparent" />
          </motion.div>
          <motion.h1
            variants={rise}
            className="font-bold tracking-tight text-[#F8F5EE]"
            style={{ fontFamily: HEAD, fontSize: "clamp(40px, 6.4vw, 92px)", letterSpacing: "-0.03em", lineHeight: 0.96, textShadow: "0 2px 40px rgba(0,0,0,0.85)" }}
          >
            Paige runs your <br /> coaching{" "}
            <span className="bg-gradient-to-br from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">business.</span>
          </motion.h1>
          <motion.p
            variants={rise}
            className="mt-4 font-semibold text-[#F8F5EE] sm:mt-5"
            style={{ fontFamily: HEAD, fontSize: "clamp(28px, 4.2vw, 56px)", lineHeight: 1.0, letterSpacing: "-0.02em" }}
          >
            You just <span className="bg-gradient-to-r from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">coach.</span>
          </motion.p>
          <motion.p variants={rise} className="mt-6 max-w-lg text-lg leading-relaxed text-[#F8F5EE]/70 md:text-xl [text-shadow:0_2px_20px_rgba(0,0,0,0.7)]">
            The admin, the follow-ups, the onboarding, the at-risk clients — Paige handles all of it, and runs every move past you before it goes out.
          </motion.p>
          <motion.div variants={rise} className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] px-8 py-3.5 text-sm font-bold text-[#2A1B4E] shadow-[0_10px_40px_rgba(212,167,82,0.4)] transition-transform hover:scale-105 sm:w-auto"
            >
              Start with Paige
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <a href="#day" className="w-full rounded-full border border-[#F8F5EE]/15 bg-[#F8F5EE]/[0.06] px-8 py-3.5 text-center text-sm font-semibold text-[#F8F5EE]/90 backdrop-blur-md transition-colors hover:border-[#D4A752]/40 hover:bg-[#F8F5EE]/10 sm:w-auto">
              See a day with Paige
            </a>
          </motion.div>
        </motion.div>

        <div className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
          Scroll into Paige
        </div>
      </section>

      {/* Below-hero content — frosted so Paige stays a soft glow behind it */}
      <div className="relative bg-[#140c27]/72 backdrop-blur-md">
      {/* WORKSPACE */}
      <Section id="workspace" className="py-28">
        <motion.div variants={rise} className="mx-auto mb-14 max-w-2xl text-center">
          <div className="mb-4 text-[12px] font-medium uppercase tracking-[0.18em] text-[#F0C86A]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Inside Paige · workspace</div>
          <h2 className="text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            Step inside where <span className="bg-gradient-to-r from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">she works.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/60">
            Pipeline, drafting, workflows, and client engagement — one operation, running whether you're watching or not.
          </p>
        </motion.div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Users, t: "Pipeline board", d: "Every client and where they are — Paige keeps it moving." },
            { icon: MessageSquare, t: "Drafting window", d: "Follow-ups and recaps written in your voice, ready to send." },
            { icon: Workflow, t: "Workflow diagram", d: "Onboarding and check-ins that run themselves." },
            { icon: Trophy, t: "Engagement dashboard", d: "Who's thriving, who needs a nudge — flagged before it slips." },
          ].map((c) => (
            <motion.div key={c.t} variants={rise} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-[#D4A752]/40 hover:bg-white/[0.06]">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#D4A752]/25 to-[#F0C86A]/15 text-[#F0C86A]">
                <c.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold" style={{ fontFamily: HEAD }}>{c.t}</h3>
              <p className="text-sm leading-relaxed text-white/60">{c.d}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* DAY IN THE LIFE */}
      <section id="day" className="relative overflow-hidden py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(212,167,82,0.10) 0%, rgba(111,75,216,0.05) 48%, rgba(20,12,39,0.0) 100%)" }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-72 max-w-4xl blur-3xl" style={{ background: "radial-gradient(ellipse at 12% 0%, rgba(240,200,106,0.18), transparent 55%), radial-gradient(ellipse at 88% 100%, rgba(111,75,216,0.16), transparent 55%)" }} />
        <div className="relative mx-auto max-w-3xl px-6">
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-16 text-center">
            <motion.div variants={rise} className="mb-4 text-[12px] font-medium uppercase tracking-[0.18em] text-[#F0C86A]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>A day with Paige</motion.div>
            <motion.h2 variants={rise} className="text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
              One day. <span className="bg-gradient-to-r from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">Fully handled.</span>
            </motion.h2>
            <motion.p variants={rise} className="mx-auto mt-4 max-w-xl text-white/60">
              From your first coffee to lights-out, Paige runs the operation in the background — you show up for the work only you can do.
            </motion.p>
          </motion.div>
          <div className="relative">
            <div aria-hidden className="absolute bottom-2 top-2 left-[76px] w-px bg-gradient-to-b from-[#D4A752]/50 via-white/15 to-[#6f4bd8]/50 sm:left-[92px]" />
            <div className="space-y-7">
              {DAY.map((d) => (
                <motion.div key={d.t} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5 }} className="relative flex items-start gap-5">
                  <div className="w-[52px] shrink-0 pt-1.5 text-right text-[11px] font-medium uppercase tracking-wide text-[#F0C86A] sm:w-[68px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.t}</div>
                  <div className="relative mt-2 shrink-0">
                    <span className="block h-3 w-3 rounded-full bg-[#F0C86A] shadow-[0_0_14px_3px_rgba(240,200,106,0.7)]" />
                    {!reduced && <span className="absolute inset-0 animate-ping rounded-full bg-[#F0C86A]/60" style={{ animationDuration: "2.4s" }} />}
                  </div>
                  <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                    <p className="text-lg font-medium text-white/90" style={{ fontFamily: HEAD }}>“{d.line}”</p>
                    <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-[#6f4bd8]/25 bg-[#6f4bd8]/10 px-3 py-1 text-[11px] text-[#c9b8f5]">
                      <d.icon className="h-3.5 w-3.5" /> {d.tag}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <Section id="proof" className="py-28">
        <motion.h2 variants={rise} className="mb-12 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
          Coaches who <span className="bg-gradient-to-r from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">hired Paige.</span>
        </motion.h2>
        <div className="grid gap-5 md:grid-cols-3">
          {PROOF.map((t) => (
            <motion.blockquote key={t.a} variants={rise} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="mb-4 text-white/85">“{t.q}”</p>
              <footer className="text-sm text-[#F0C86A]">— {t.a}</footer>
            </motion.blockquote>
          ))}
        </div>
      </Section>

      {/* PRICING */}
      <Section id="pricing" className="py-28">
        <motion.h2 variants={rise} className="mb-3 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
          Ready to <span className="bg-gradient-to-r from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">hire me?</span>
        </motion.h2>
        <motion.p variants={rise} className="mx-auto mb-14 max-w-md text-center text-white/60">
          Every plan · 14-day pilot · no contract · Paige works on day one.
        </motion.p>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <motion.div
              key={p.name}
              variants={rise}
              whileHover={{ y: -6, rotateX: 3, rotateY: -3 }}
              style={{ transformPerspective: 900 }}
              className={`relative flex flex-col rounded-2xl border p-7 ${p.highlight ? "border-[#D4A752]/55 bg-gradient-to-b from-[#D4A752]/[0.12] to-transparent shadow-[0_0_50px_rgba(212,167,82,0.2)]" : "border-white/10 bg-white/[0.03]"}`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#241645]">Most Popular</span>
              )}
              <div className="text-sm text-white/60">{p.tagline}</div>
              <div className="mb-1 mt-2 text-lg font-semibold" style={{ fontFamily: HEAD }}>{p.name}</div>
              <div className="mb-6 text-4xl font-black" style={{ fontFamily: HEAD }}>
                {p.price}
                <span className="text-base font-medium text-white/50">/mo</span>
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {p.features.map((ft) => (
                  <li key={ft} className="flex items-start gap-2 text-sm text-white/75">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F0C86A]" />
                    {ft}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate("/auth?mode=signup")}
                className={`rounded-full px-6 py-3 text-sm font-bold transition-transform hover:scale-105 ${p.highlight ? "bg-gradient-to-br from-[#F0C86A] to-[#D4A752] text-[#241645]" : "border border-white/20 bg-white/5 text-white"}`}
              >
                Hire Paige
              </button>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* CTA */}
      <Section className="py-24">
        <motion.div variants={rise} className="relative overflow-hidden rounded-3xl border border-[#D4A752]/30 bg-gradient-to-br from-[#D4A752]/[0.14] to-[#6f4bd8]/[0.06] px-8 py-16 text-center">
          <div aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#F0C86A]/60 to-transparent" />
          <h2 className="mx-auto max-w-2xl text-4xl font-black md:text-5xl" style={{ fontFamily: HEAD }}>Give yourself back your time.</h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">Start free. No card required. Paige is running your operation the moment you connect her.</p>
          <button onClick={() => navigate("/auth?mode=signup")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] px-8 py-3 font-bold text-[#241645] transition-transform hover:scale-105">
            Start with Paige <ArrowRight className="h-4 w-4" />
          </button>
        </motion.div>
      </Section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl px-6 py-12 text-sm text-white/40">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <div className="flex items-center gap-2 text-white/70">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] text-xs font-black text-[#241645]">P</span>
            Paige Agent
          </div>
          <div>© 2026 Paige · The operating system for coaches</div>
        </div>
      </footer>
      </div>{/* /frosted below-hero wrapper */}
      </div>{/* /z-10 content wrapper */}
    </div>
  );
}
