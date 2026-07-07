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
import { Suspense, lazy, useEffect, useRef, useState } from "react";

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

export default function PaigeHome() {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{ background: `radial-gradient(120% 90% at 70% 15%, #241645 0%, ${INK} 55%, #0c0718 100%)`, color: OFFWHITE, fontFamily: "'Inter', sans-serif" }}
    >
      {!reduced && <IdleNudge />}

      {/* Nav */}
      <header className="relative z-30 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <a href="#hero" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] text-sm font-black text-[#241645]">P</span>
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: HEAD }}>
            Paige <span className="text-white/40">Agent</span>
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

      {/* HERO */}
      <section id="hero" className="relative z-10 min-h-[92vh] w-full">
        <div className="absolute inset-0">
          <Suspense fallback={<div className="absolute inset-0" />}>
            <PaigeScene />
          </Suspense>
        </div>
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
              Operations · Follow-ups · Follow-through
            </span>
            <span aria-hidden className="h-px w-10 bg-gradient-to-r from-[#D4A752]/70 to-transparent" />
          </motion.div>
          <motion.h1
            variants={rise}
            className="font-bold tracking-tight"
            style={{ fontFamily: HEAD, fontSize: "clamp(44px, 7.5vw, 100px)", letterSpacing: "-0.03em", lineHeight: 0.97, textShadow: "0 2px 40px rgba(0,0,0,0.6)" }}
          >
            <span className="text-white">Meet </span>
            <span className="bg-gradient-to-br from-[#f6e6b8] via-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">Paige.</span>
          </motion.h1>
          <motion.p variants={rise} className="mt-4 text-2xl font-semibold text-white/90 md:text-3xl" style={{ fontFamily: HEAD }}>
            She runs your coaching business.
          </motion.p>
          <motion.p variants={rise} className="mt-1 text-2xl font-semibold md:text-3xl" style={{ fontFamily: HEAD }}>
            <span className="bg-gradient-to-r from-[#F0C86A] to-[#D4A752] bg-clip-text text-transparent">You run the transformation.</span>
          </motion.p>
          <motion.p variants={rise} className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">
            The operations, follow-ups, workflows, and follow-through — Paige handles it all, so you deliver the outcomes only you can.
          </motion.p>
          <motion.div variants={rise} className="mt-9 flex flex-wrap items-center gap-4">
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#F0C86A] to-[#D4A752] px-8 py-3.5 text-sm font-bold text-[#241645] shadow-[0_10px_40px_rgba(212,167,82,0.4)] transition-transform hover:scale-105"
            >
              Start with Paige
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <a href="#day" className="rounded-full border border-white/15 bg-white/[0.05] px-8 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-md transition-colors hover:border-[#D4A752]/40 hover:bg-white/10">
              See a day with Paige
            </a>
          </motion.div>
        </motion.div>

        <div className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
          Scroll into Paige
        </div>
      </section>

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
    </div>
  );
}
