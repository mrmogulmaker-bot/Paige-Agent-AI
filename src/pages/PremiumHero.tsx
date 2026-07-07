import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Users,
  Workflow,
  Brain,
  BarChart3,
  CalendarClock,
  CalendarCheck,
  MessageSquare,
  Trophy,
  Receipt,
  Sunrise,
  Flag,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useParticleEngine } from "@/hooks/useParticleEngine";

gsap.registerPlugin(ScrollTrigger);

/**
 * PremiumHero — the full premium Paige landing (route /premium).
 *
 * Hero centerpiece is the brand "traveling wave orb": thousands of helical
 * particles form a rotating amethyst sphere on a fixed canvas; on scroll the
 * hero pins and the orb powers up, then splits into a six-orb constellation
 * (five violet satellites + one cyan agent). Ported from the Kimi reference and
 * fully rebranded from green/gold to Paige purple. The sections below frost
 * over the living constellation for depth.
 */

const HEAD = "'Bricolage Grotesque', 'Space Grotesk', sans-serif";

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(10px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={`relative mx-auto w-full max-w-6xl px-6 ${className}`}
    >
      {children}
    </motion.section>
  );
}

/** A faint gold hairline — a subtle premium trim between sections. */
const GoldRule = () => (
  <div className="mx-auto max-w-6xl px-6">
    <div className="h-px bg-gradient-to-r from-transparent via-[#d4af37]/40 to-transparent" />
  </div>
);

/**
 * Floating workspace panels — the "operation running around Paige." Each is a
 * glass card of real coaching work (drafts, kickoffs, milestones, retainers)
 * that drifts slowly at its own depth. Coaching only — no finance language.
 */
type Panel = {
  icon: typeof MessageSquare;
  eyebrow: string;
  body: string;
  tone: "violet" | "gold";
  pos: string; // absolute placement
  depth: number; // 0 near … 1 far (smaller + fainter)
  dur: number;
};
const PANELS: Panel[] = [
  { icon: MessageSquare, eyebrow: "Paige · replying to Maya", body: "Rescheduled your 3:00 to Thursday — sent the prep doc and confirmed she got it.", tone: "violet", pos: "right-[6%] top-[16%]", depth: 0, dur: 7 },
  { icon: CalendarCheck, eyebrow: "Kickoff booked · Wed 11:00", body: "New client onboarded while you slept.", tone: "gold", pos: "right-[30%] top-[30%]", depth: 0.5, dur: 9 },
  { icon: Trophy, eyebrow: "Client milestone", body: "James hit week 12 — celebration prepped.", tone: "gold", pos: "right-[10%] top-[52%]", depth: 0.25, dur: 8 },
  { icon: Users, eyebrow: "Priya S. · Growth cohort", body: "Engagement dipping — a nudge is queued for your review.", tone: "violet", pos: "right-[40%] top-[62%]", depth: 0.7, dur: 10 },
  { icon: Receipt, eyebrow: "Retainer · December", body: "Invoice sent · $4,200 · reminder scheduled for Friday.", tone: "violet", pos: "right-[3%] top-[76%]", depth: 0.4, dur: 8.5 },
  { icon: Workflow, eyebrow: "Welcome sequence", body: "Running for 3 new clients — recaps queued.", tone: "gold", pos: "right-[52%] top-[20%]", depth: 0.85, dur: 11 },
];

/**
 * Day in the Life — Paige narrates a full day of coaching operations, each line
 * lighting a real artifact. Dawn-gold → dusk-violet "sun arc" runs top to bottom.
 * Coaching only — invoicing here is billing coaching clients, not consumer finance.
 */
const DAY = [
  { t: "6:47 AM", icon: Sunrise, line: "I'm drafting your morning brief.", tag: "Morning brief ready" },
  { t: "8:15 AM", icon: Users, line: "I onboarded three new clients while you slept.", tag: "3 welcome sequences sent" },
  { t: "10:30 AM", icon: MessageSquare, line: "I drafted the follow-ups from yesterday's session.", tag: "Session follow-ups drafted" },
  { t: "12:00 PM", icon: Workflow, line: "I ran the check-in sequence for your Tier 2 cohort.", tag: "Tier 2 · check-ins sent" },
  { t: "2:15 PM", icon: Flag, line: "I flagged two clients who need attention this week.", tag: "2 clients flagged" },
  { t: "4:00 PM", icon: Receipt, line: "I sent this month's invoices and queued the reminders.", tag: "Retainer invoices sent" },
  { t: "8:00 PM", icon: CalendarClock, line: "I prepared tomorrow's calendar with your talking points.", tag: "Tomorrow prepped" },
];

function DayInLife() {
  return (
    <section id="day" className="relative overflow-hidden py-28">
      {/* Sun arc — dawn-gold (top) → dusk-violet (bottom) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(212,167,82,0.10) 0%, rgba(168,85,247,0.05) 48%, rgba(42,27,78,0.14) 100%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-72 max-w-4xl blur-3xl"
        style={{ background: "radial-gradient(ellipse at 12% 0%, rgba(240,216,120,0.18), transparent 55%), radial-gradient(ellipse at 88% 100%, rgba(168,85,247,0.16), transparent 55%)" }}
      />

      <div className="relative mx-auto max-w-3xl px-6">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="mb-16 text-center">
          <motion.div variants={rise} className="font-mono-label mb-4 text-[#e8c66a]">A day with Paige</motion.div>
          <motion.h2 variants={rise} className="text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            One day. <span className="bg-gradient-to-r from-[#e8c66a] to-[#a855f7] bg-clip-text text-transparent">Fully handled.</span>
          </motion.h2>
          <motion.p variants={rise} className="mx-auto mt-4 max-w-xl text-white/60">
            From your first coffee to lights-out, Paige runs the operation in the background — you show up for the work only you can do.
          </motion.p>
        </motion.div>

        <div className="relative">
          {/* Timeline spine */}
          <div aria-hidden className="absolute bottom-2 top-2 left-[76px] w-px bg-gradient-to-b from-[#d4af37]/50 via-white/15 to-[#a855f7]/50 sm:left-[92px]" />
          <div className="space-y-7">
            {DAY.map((d) => (
              <motion.div
                key={d.t}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5 }}
                className="relative flex items-start gap-5"
              >
                <div className="w-[52px] shrink-0 pt-1.5 text-right font-mono-label text-[11px] text-[#e8c66a] sm:w-[68px]">{d.t}</div>
                <div className="relative mt-2 shrink-0">
                  <span className="block h-3 w-3 rounded-full bg-[#e8c66a] shadow-[0_0_14px_3px_rgba(240,216,120,0.7)]" />
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#e8c66a]/60" style={{ animationDuration: "2.4s" }} />
                </div>
                <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                  <p className="text-lg font-medium text-white/90" style={{ fontFamily: HEAD }}>“{d.line}”</p>
                  <div className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-[#a855f7]/25 bg-[#a855f7]/10 px-3 py-1 text-[11px] text-[#c084fc]">
                    <d.icon className="h-3.5 w-3.5" /> {d.tag}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * PaigeRings — crisp gold orbital rings over Paige (the orb). They spin gently
 * and, more importantly, tilt toward the cursor so you can "move the rings" with
 * the mouse. Pure CSS 3D (vector-crisp, unlike the soft particle field); runs on
 * a single rAF writing transforms directly (no per-frame React renders).
 */
function PaigeRings() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let spin = 0;
    let curX = 60;
    let curY = 0;
    let tgtX = 60;
    let tgtY = 0;
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      tgtY = nx * 32;
      tgtX = 60 + ny * -18;
    };
    const loop = () => {
      spin += 0.12;
      curX += (tgtX - curX) * 0.05;
      curY += (tgtY - curY) * 0.05;
      if (ref.current) ref.current.style.transform = `rotateX(${curX}deg) rotateY(${curY}deg) rotateZ(${spin}deg)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const ring = (size: number, tilt: string, opacity: number) => (
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: "50%",
        border: `1.5px solid rgba(212,175,55,${opacity})`,
        boxShadow: "0 0 16px rgba(212,175,55,0.18)",
        transform: tilt,
      }}
    />
  );

  return (
    <div className="pointer-events-none absolute left-1/2 top-[40%] hidden -translate-x-1/2 -translate-y-1/2 lg:block" style={{ perspective: 1100 }}>
      <div ref={ref} style={{ transformStyle: "preserve-3d", width: 1, height: 1 }}>
        {ring(380, "rotateX(0deg)", 0.78)}
        {ring(310, "rotateY(64deg)", 0.6)}
        {ring(460, "rotateX(58deg) rotateY(22deg)", 0.5)}
      </div>
    </div>
  );
}

function FloatingPanels() {
  return (
    <>
      {PANELS.map((p, i) => {
        const scale = 1 - p.depth * 0.28;
        const opacity = 1 - p.depth * 0.5;
        const gold = p.tone === "gold";
        return (
          <motion.div
            key={i}
            aria-hidden
            className={`absolute hidden w-[15rem] rounded-2xl border p-3.5 backdrop-blur-md lg:block ${p.pos} ${
              gold ? "border-[#d4af37]/25 bg-[#d4af37]/[0.06]" : "border-white/12 bg-white/[0.05]"
            }`}
            style={{ scale, opacity, boxShadow: "0 18px 50px rgba(0,0,0,0.45)" }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity, y: [0, -12, 0] }}
            transition={{
              opacity: { delay: 0.6 + i * 0.15, duration: 0.8 },
              y: { duration: p.dur, repeat: Infinity, ease: "easeInOut", delay: i * 0.4 },
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-md ${gold ? "bg-[#d4af37]/20 text-[#e8c66a]" : "bg-[#a855f7]/20 text-[#c084fc]"}`}>
                <p.icon className="h-3.5 w-3.5" />
              </span>
              <span className={`text-[11px] font-semibold ${gold ? "text-[#e8c66a]" : "text-[#c084fc]"}`}>{p.eyebrow}</span>
            </div>
            <p className="text-[12px] leading-snug text-white/75">{p.body}</p>
          </motion.div>
        );
      })}
    </>
  );
}

const FEATURES = [
  { icon: Users, title: "Client Management", body: "Every client, conversation, and task in one place — Paige surfaces what needs attention today." },
  { icon: Workflow, title: "Workflow Automation", body: "Onboarding, follow-ups, reminders — the repetitive work runs itself in the background." },
  { icon: Brain, title: "AI Advisor", body: "Real guidance grounded in your business context, plus ready-to-send drafts and next steps." },
  { icon: BarChart3, title: "Analytics & Signals", body: "Live dashboards and predictive signals so you always know what's working." },
  { icon: CalendarClock, title: "Scheduling", body: "Meetings, reminders, and the whole client journey, tracked and handled." },
  { icon: MessageSquare, title: "Voice & Chat", body: "Talk to Paige or type — she drafts outreach, answers questions, and keeps you moving." },
];

const STEPS = [
  { n: "01", title: "Connect", body: "Bring in your clients, tools, and playbook. Paige learns your operation." },
  { n: "02", title: "Automate", body: "Turn on the workflows and sub-agents that run your day-to-day." },
  { n: "03", title: "Scale", body: "Run your entire roster from one engine — from solo to scaled." },
];

const PLANS = [
  { name: "Solo", price: "$58", tagline: "Just you, fully covered.", features: ["Paige runs your CRM & pipeline", "Auto-drafted follow-ups & recaps", "Client welcome sequences", "Cohort check-ins & at-risk flags"], highlight: false },
  { name: "Practice", price: "$149", tagline: "Most coaches land here.", features: ["Everything in Solo", "Custom playbooks per coach", "Advanced analytics & signals", "Priority support"], highlight: true },
  { name: "Studio", price: "$349", tagline: "For the coach running the whole show.", features: ["Everything in Practice", "Multi-coach roster & routing", "White-label workspace", "Dedicated success partner"], highlight: false },
];

const QUOTES = [
  { q: "Paige runs the parts of my practice I used to dread. I got my evenings back — and my clients have never felt more looked-after.", a: "Business coach · Chicago" },
  { q: "It's like hiring an ops team overnight. The follow-through happens whether I remember it or not.", a: "Executive coach · Austin" },
  { q: "Every client gets the follow-up I could never keep up with. Retention's up and I'm doing a fraction of the admin.", a: "Fitness coach · Los Angeles" },
];

const FAQS = [
  { q: "Who is Paige for?", a: "Coaches running a real practice — business, executive, fitness, life — who want the operations handled so they can focus on the work only they can do." },
  { q: "Do I need technical skills?", a: "No. Paige is conversational — you tell her what you want and she handles the workflows behind the scenes." },
  { q: "How fast can she start?", a: "Day one. Every plan comes with a 14-day pilot and no contract — Paige is running your operation the moment you connect her." },
];

export default function PremiumHero() {
  const navigate = useNavigate();
  const { canvasRef, engineRef } = useParticleEngine();
  const heroRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const content = contentRef.current;
    if (!hero || !content) return;

    const ctx = gsap.context(() => {
      // Entrance — stagger the hero copy up on load.
      gsap.fromTo(
        content.children,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: "power3.out", delay: 0.3 },
      );

      // Pin the hero and scrub the orb power-up → split → constellation.
      // Pause the particle engine once scrolled past the hero (it sits behind
      // frosted content anyway) and resume on the way back up — saves CPU.
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "+=300%",
        pin: true,
        scrub: 1,
        onUpdate: (self) => engineRef.current?.updateScrollProgress(self.progress),
        onLeave: () => engineRef.current?.setRenderingEnabled(false),
        onEnterBack: () => engineRef.current?.setRenderingEnabled(true),
      });

      // Fade the copy out as the orb splits.
      gsap.to(content, {
        opacity: 0,
        y: -60,
        ease: "power2.in",
        scrollTrigger: { trigger: hero, start: "top top", end: "+=200%", scrub: 1 },
      });

      // Drift the workspace panels away a touch faster than the copy.
      if (panelsRef.current) {
        gsap.to(panelsRef.current, {
          opacity: 0,
          scale: 0.9,
          ease: "power2.in",
          scrollTrigger: { trigger: hero, start: "top top", end: "+=140%", scrub: 1 },
        });
      }
    });

    return () => ctx.revert();
  }, [engineRef]);

  // Cursor parallax — feed the pointer (normalized from viewport center) to the
  // orb so the constellation drifts under the mouse.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      engineRef.current?.setPointer(nx, ny);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [engineRef]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07040d] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Fixed particle constellation */}
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-screen w-screen" />
      {/* Vignette — fades the field into the copy + edges */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1]"
        style={{ background: "radial-gradient(circle at 50% 42%, transparent 12%, rgba(7,4,13,0.55) 52%, #07040d 80%)" }}
      />

      {/* Nav */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#a855f7] to-[#7c3aed] font-black">P</div>
          <span className="text-lg font-semibold" style={{ fontFamily: HEAD }}>Paige</span>
        </div>
        <nav className="hidden items-center gap-8 md:flex">
          {["Features", "How it Works", "Pricing"].map((l) => (
            <a key={l} href={`#${l.toLowerCase().replace(/\s+/g, "-")}`} className="text-sm font-medium text-white/70 transition-colors hover:text-white">
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/auth?mode=login")} className="text-sm font-medium text-white/80 transition-colors hover:text-white">
            Sign In
          </button>
          <button onClick={() => navigate("/auth?mode=signup")} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#07040d] transition-transform hover:scale-105">
            Get Started
          </button>
        </div>
      </header>

      {/* Hero — pinned; Paige (the orb) powers up + splits as you scroll, with
          her workspace drifting around her */}
      <section ref={heroRef} className="relative z-10 h-screen w-full">
        {/* Midground: crisp gold rings + floating workspace panels around Paige */}
        <div ref={panelsRef} className="pointer-events-none absolute inset-0">
          <PaigeRings />
          <FloatingPanels />
        </div>

        <div
          ref={contentRef}
          className="absolute left-6 top-[54%] w-[min(90%,640px)] -translate-y-1/2 sm:left-[8%]"
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="font-mono-label text-[#e8c66a]">Operations · Follow-ups · Follow-through</span>
            <span aria-hidden className="h-px w-10 bg-gradient-to-r from-[#d4af37]/70 to-transparent" />
          </div>
          <h1
            className="font-bold tracking-tight"
            style={{
              fontFamily: HEAD,
              fontSize: "clamp(44px, 7.5vw, 100px)",
              letterSpacing: "-0.03em",
              lineHeight: 0.98,
              textShadow: "0 2px 40px rgba(0,0,0,0.85)",
            }}
          >
            <span className="text-white">Meet </span>
            <span className="bg-gradient-to-br from-[#f4e2a8] via-[#e8c66a] to-[#d4af37] bg-clip-text text-transparent">Paige.</span>
          </h1>
          <p className="mt-4 text-2xl font-semibold text-white/90 md:text-3xl" style={{ fontFamily: HEAD }}>
            She runs your coaching business.
          </p>
          <p className="mt-1 text-2xl font-semibold md:text-3xl" style={{ fontFamily: HEAD }}>
            <span className="bg-gradient-to-r from-[#e8c66a] to-[#d4af37] bg-clip-text text-transparent">
              You run the transformation.
            </span>
          </p>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70 [text-shadow:0_2px_20px_rgba(0,0,0,0.7)]">
            The operations, follow-ups, workflows, and follow-through — Paige handles it all, so you deliver the outcomes only you can.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] px-8 py-3.5 text-sm font-bold shadow-[0_10px_40px_rgba(124,58,237,0.5)] ring-1 ring-[#d4af37]/30 transition-transform hover:scale-105"
            >
              Start with Paige
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={() => scrollTo("day")}
              className="rounded-full border border-white/15 bg-white/[0.06] px-8 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-md transition-colors hover:border-[#d4af37]/40 hover:bg-white/10"
            >
              See a day with Paige
            </button>
          </div>
        </div>
        {/* Scroll cue */}
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
          Scroll
        </div>
      </section>

      {/* Content — frosted over the living constellation. Kept more opaque with
          a lighter blur: backdrop-blur over an animating canvas is costly, so
          this trims per-frame compositing while scrolling. */}
      <div className="relative z-10 bg-[#07040d]/90 backdrop-blur-md">
        {/* Day in the Life — the narrative that sells Paige as a character */}
        <DayInLife />

        <GoldRule />

        {/* Features */}
        <Section id="features" className="py-24">
          <motion.h2 variants={rise} className="mb-3 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            One ecosystem. <span className="text-[#c084fc]">Every lever.</span>
          </motion.h2>
          <motion.p variants={rise} className="mx-auto mb-14 max-w-xl text-center text-white/60">
            Trained across client management, automation, operations, and client psychology — the answer is always inside the system.
          </motion.p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <motion.div
                key={f.title}
                variants={rise}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm transition-all hover:border-[#a855f7]/40 hover:bg-white/[0.06]"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#a855f7]/30 to-[#7c3aed]/20 text-[#c084fc]">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold" style={{ fontFamily: HEAD }}>{f.title}</h3>
                <p className="text-sm leading-relaxed text-white/60">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* How it works */}
        <Section id="how-it-works" className="py-24">
          <motion.h2 variants={rise} className="mb-14 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            From solo to scaled in three moves
          </motion.h2>
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <motion.div key={s.n} variants={rise} className="rounded-2xl border border-white/10 bg-white/[0.03] p-7">
                <div className="mb-4 text-4xl font-black text-transparent [-webkit-text-stroke:1px_rgba(168,85,247,0.6)]" style={{ fontFamily: HEAD }}>{s.n}</div>
                <h3 className="mb-2 text-xl font-semibold" style={{ fontFamily: HEAD }}>{s.title}</h3>
                <p className="text-sm leading-relaxed text-white/60">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        <GoldRule />

        {/* Pricing */}
        <Section id="pricing" className="py-24">
          <motion.h2 variants={rise} className="mb-3 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            Ready to <span className="bg-gradient-to-r from-[#e8c66a] to-[#d4af37] bg-clip-text text-transparent">hire me?</span>
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
                className={`relative flex flex-col rounded-2xl border p-7 ${
                  p.highlight ? "border-[#d4af37]/45 bg-gradient-to-b from-[#a855f7]/[0.12] to-transparent shadow-[0_0_50px_rgba(124,58,237,0.25)]" : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#f0d878] to-[#d4af37] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#3a2a05]">
                    Most Popular
                  </span>
                )}
                <div className="text-sm text-white/60">{p.tagline}</div>
                <div className="mb-1 mt-2 text-lg font-semibold" style={{ fontFamily: HEAD }}>{p.name}</div>
                <div className="mb-6 text-4xl font-black" style={{ fontFamily: HEAD }}>
                  {p.price}
                  {p.price !== "Custom" && <span className="text-base font-medium text-white/50">/mo</span>}
                </div>
                <ul className="mb-8 flex-1 space-y-3">
                  {p.features.map((ft) => (
                    <li key={ft} className="flex items-start gap-2 text-sm text-white/75">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.highlight ? "text-[#e8c66a]" : "text-[#c084fc]"}`} />
                      {ft}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate("/auth?mode=signup")}
                  className={`rounded-full px-6 py-3 text-sm font-bold transition-transform hover:scale-105 ${
                    p.highlight ? "bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-white" : "border border-white/20 bg-white/5 text-white"
                  }`}
                >
                  Hire Paige
                </button>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Testimonials */}
        <Section className="py-24">
          <motion.h2 variants={rise} className="mb-12 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            Coaches who <span className="bg-gradient-to-r from-[#e8c66a] to-[#a855f7] bg-clip-text text-transparent">hired Paige.</span>
          </motion.h2>
          <div className="grid gap-5 md:grid-cols-3">
            {QUOTES.map((t) => (
              <motion.blockquote key={t.a} variants={rise} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <p className="mb-4 text-white/85">“{t.q}”</p>
                <footer className="text-sm text-[#c084fc]">— {t.a}</footer>
              </motion.blockquote>
            ))}
          </div>
        </Section>

        {/* FAQ */}
        <Section className="py-24">
          <motion.h2 variants={rise} className="mb-10 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
            Questions, answered
          </motion.h2>
          <div className="mx-auto max-w-2xl space-y-4">
            {FAQS.map((f) => (
              <motion.details key={f.q} variants={rise} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 [&_summary]:cursor-pointer">
                <summary className="flex items-center justify-between font-medium marker:content-none">
                  {f.q}
                  <span className="text-[#c084fc] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{f.a}</p>
              </motion.details>
            ))}
          </div>
        </Section>

        {/* CTA */}
        <Section id="final-cta" className="py-24">
          <motion.div variants={rise} className="relative overflow-hidden rounded-3xl border border-[#a855f7]/30 bg-gradient-to-br from-[#a855f7]/[0.15] to-[#7c3aed]/[0.05] px-8 py-16 text-center">
            {/* Gold trim along the top edge of the CTA card */}
            <div aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
            <h2 className="mx-auto max-w-2xl text-4xl font-black md:text-5xl" style={{ fontFamily: HEAD }}>Run your entire operation from one engine.</h2>
            <p className="mx-auto mt-4 max-w-lg text-white/70">Start free. No card required to begin. Cancel anytime.</p>
            <button onClick={() => navigate("/auth?mode=signup")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 font-bold text-[#07040d] transition-transform hover:scale-105">
              Launch Your Agent <ArrowRight className="h-4 w-4" />
            </button>
          </motion.div>
        </Section>

        {/* Footer */}
        <footer className="mx-auto w-full max-w-6xl px-6 py-12 text-sm text-white/40">
          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <div className="flex items-center gap-2 text-white/70">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-xs font-black">P</div>
              Paige
            </div>
            <div>© 2026 Paige · The AI Operating System</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
