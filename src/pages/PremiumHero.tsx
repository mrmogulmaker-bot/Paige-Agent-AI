import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  Users,
  Workflow,
  Brain,
  BarChart3,
  CalendarClock,
  MessageSquare,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Suspense, lazy } from "react";

// Native Spline embed (self-hosted .splinecode) — transparent canvas that
// composites over the premium layout, controllable from code.
const Spline = lazy(() => import("@splinetool/react-spline"));

/**
 * PremiumHero — the full premium Paige landing (route /premium).
 * One page, one style: dark violet, purple accents, Framer-Motion reveals.
 * Nav → hero → features → how-it-works → pricing → testimonials → FAQ → CTA →
 * footer. A premium Paige character drops into the hero once it's a
 * premium-grade asset (Spline / textured 3D).
 */

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
  { name: "Starter", price: "$49", tagline: "For solo operators", features: ["Client CRM", "Core automations", "AI advisor", "Email support"], highlight: false },
  { name: "Growth", price: "$149", tagline: "For growing teams", features: ["Everything in Starter", "Team collaboration", "Advanced analytics", "18 sub-agents", "Priority support"], highlight: true },
  { name: "Scale", price: "Custom", tagline: "For agencies", features: ["Everything in Growth", "White-label workspace", "Custom sub-agents", "Dedicated success"], highlight: false },
];

const QUOTES = [
  { q: "Paige runs the parts of my business I used to dread. I got my evenings back.", a: "Fitness coach" },
  { q: "It's like hiring an ops team overnight. Everything just… happens now.", a: "Business consultant" },
  { q: "We white-labeled it for our whole agency. Clients think we built it.", a: "Agency owner" },
];

const FAQS = [
  { q: "Who is Paige for?", a: "Coaches, consultants, and agencies who want to run their entire client operation from one place — from solo to scaled." },
  { q: "Do I need technical skills?", a: "No. Paige is conversational — you tell her what you want and she handles the workflows behind the scenes." },
  { q: "Can I white-label it?", a: "Yes. On the Scale plan you get a fully white-labeled workspace with your own branding and sending domain." },
];

export default function PremiumHero() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0510] text-white">
      {/* Hide the Spline watermark / viewer chrome for a clean hero */}
      <style>{`a[href*="spline.design"]{display:none!important;} .spline-watermark{display:none!important;}`}</style>
      {/* Ambient glow orbs (fixed, drift the whole page) */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-32 h-[38rem] w-[38rem] rounded-full bg-[#7c3aed]/25 blur-[130px]"
        animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed -bottom-48 -right-32 h-[42rem] w-[42rem] rounded-full bg-[#a855f7]/20 blur-[150px]"
        animate={{ x: [0, -50, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="pointer-events-none fixed inset-0 opacity-[0.04] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,#000_35%,transparent_80%)]" />

      {/* Nav */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#a855f7] to-[#7c3aed] font-black">P</div>
          <span className="text-lg font-semibold">Paige</span>
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
          <button onClick={() => navigate("/auth?mode=signup")} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-[#0a0510] transition-transform hover:scale-105">
            Get Started
          </button>
        </div>
      </header>

      {/* Hero — live Spline 3D scene (interactive parallax) */}
      <section className="relative z-10 h-screen w-full overflow-hidden">
        <Suspense fallback={<div className="absolute inset-0" />}>
          <Spline
            scene="/paige/paige-scene.splinecode"
            className="!absolute inset-0 h-full w-full"
          />
        </Suspense>
        {/* Legibility scrim — fades the scene into the copy + the page below */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0510] via-[#0a0510]/10 to-[#0a0510]/30" />

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl flex-col items-start gap-5 px-6 pb-16"
        >
          <motion.div variants={rise} className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[#c084fc]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">The AI Operating System</span>
          </motion.div>
          <motion.h1 variants={rise} className="text-6xl font-black leading-[0.9] tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.7)] md:text-8xl">
            Meet{" "}
            <span className="bg-gradient-to-br from-[#c084fc] via-[#a855f7] to-[#7c3aed] bg-clip-text text-transparent drop-shadow-[0_0_50px_rgba(168,85,247,0.5)]">
              Paige.
            </span>
          </motion.h1>
          <motion.p variants={rise} className="max-w-xl text-lg leading-relaxed text-white/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] md:text-xl">
            The autonomous operating system that runs your clients, your workflows, and your entire operation — so you can scale.
          </motion.p>
          <motion.div variants={rise} className="pointer-events-auto flex flex-wrap items-center gap-4 pt-2">
            <button onClick={() => navigate("/auth?mode=signup")} className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] px-7 py-3 font-bold shadow-[0_10px_40px_rgba(124,58,237,0.5)] transition-transform hover:scale-105">
              Start Your Workspace
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <a href="#how-it-works" className="rounded-full border border-white/20 bg-white/5 px-7 py-3 font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-white/10">
              See How It Works
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <Section id="features" className="py-20">
        <motion.h2 variants={rise} className="mb-3 text-center text-4xl font-bold md:text-5xl">
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
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/60">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section id="how-it-works" className="py-20">
        <motion.h2 variants={rise} className="mb-14 text-center text-4xl font-bold md:text-5xl">
          From solo to scaled in three moves
        </motion.h2>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <motion.div key={s.n} variants={rise} className="rounded-2xl border border-white/10 bg-white/[0.03] p-7">
              <div className="mb-4 text-4xl font-black text-transparent [-webkit-text-stroke:1px_rgba(168,85,247,0.6)]">{s.n}</div>
              <h3 className="mb-2 text-xl font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-white/60">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing" className="py-20">
        <motion.h2 variants={rise} className="mb-14 text-center text-4xl font-bold md:text-5xl">
          Simple, scale-ready pricing
        </motion.h2>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <motion.div
              key={p.name}
              variants={rise}
              className={`relative flex flex-col rounded-2xl border p-7 ${
                p.highlight ? "border-[#a855f7]/60 bg-gradient-to-b from-[#a855f7]/[0.12] to-transparent shadow-[0_0_50px_rgba(124,58,237,0.25)]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] px-3 py-1 text-[10px] font-bold uppercase tracking-wider">
                  Most Popular
                </span>
              )}
              <div className="text-sm text-white/60">{p.tagline}</div>
              <div className="mb-1 mt-2 text-lg font-semibold">{p.name}</div>
              <div className="mb-6 text-4xl font-black">
                {p.price}
                {p.price !== "Custom" && <span className="text-base font-medium text-white/50">/mo</span>}
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {p.features.map((ft) => (
                  <li key={ft} className="flex items-start gap-2 text-sm text-white/75">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c084fc]" />
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
                Get Started
              </button>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <Section className="py-20">
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
      <Section className="py-20">
        <motion.h2 variants={rise} className="mb-10 text-center text-4xl font-bold md:text-5xl">
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
      <Section className="py-20">
        <motion.div variants={rise} className="relative overflow-hidden rounded-3xl border border-[#a855f7]/30 bg-gradient-to-br from-[#a855f7]/[0.15] to-[#7c3aed]/[0.05] px-8 py-16 text-center">
          <h2 className="mx-auto max-w-2xl text-4xl font-black md:text-5xl">Run your entire operation from one engine.</h2>
          <p className="mx-auto mt-4 max-w-lg text-white/70">Start free. No card required to begin. Cancel anytime.</p>
          <button onClick={() => navigate("/auth?mode=signup")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3 font-bold text-[#0a0510] transition-transform hover:scale-105">
            Start Your Workspace <ArrowRight className="h-4 w-4" />
          </button>
        </motion.div>
      </Section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 py-12 text-sm text-white/40">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <div className="flex items-center gap-2 text-white/70">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-[#a855f7] to-[#7c3aed] text-xs font-black">P</div>
            Paige
          </div>
          <div>© 2026 Paige · The AI Operating System</div>
        </div>
      </footer>
    </div>
  );
}
