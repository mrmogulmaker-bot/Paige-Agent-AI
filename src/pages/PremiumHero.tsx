import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Users,
  Workflow,
  Brain,
  BarChart3,
  CalendarClock,
  MessageSquare,
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
  const { canvasRef, engineRef } = useParticleEngine();
  const heroRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

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
      ScrollTrigger.create({
        trigger: hero,
        start: "top top",
        end: "+=300%",
        pin: true,
        scrub: 1,
        onUpdate: (self) => engineRef.current?.updateScrollProgress(self.progress),
      });

      // Fade the copy out as the orb splits.
      gsap.to(content, {
        opacity: 0,
        y: -60,
        ease: "power2.in",
        scrollTrigger: { trigger: hero, start: "top top", end: "+=200%", scrub: 1 },
      });
    });

    return () => ctx.revert();
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

      {/* Hero — pinned; the orb powers up + splits as you scroll */}
      <section ref={heroRef} className="relative z-10 h-screen w-full">
        <div
          ref={contentRef}
          className="absolute left-6 top-[58%] w-[min(88%,620px)] -translate-y-1/2 sm:left-[8%]"
        >
          <div className="font-mono-label mb-5 text-[#22d3ee]">AI OPERATING SYSTEM</div>
          <h1
            className="font-bold tracking-tight"
            style={{
              fontFamily: HEAD,
              fontSize: "clamp(42px, 7vw, 92px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.04,
              textShadow: "0 2px 40px rgba(0,0,0,0.85)",
            }}
          >
            <span className="block">Your Business.</span>
            <span className="block">Your Brand.</span>
            <span className="block text-shimmer-purple">Your AI Agent.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70 [text-shadow:0_2px_20px_rgba(0,0,0,0.7)]">
            Paige gives coaches, consultants, and agencies their own branded AI operating system — trained on your business, running your clients and workflows around the clock.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <button
              onClick={() => scrollTo("final-cta")}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#a855f7] to-[#7c3aed] px-8 py-3.5 text-sm font-bold shadow-[0_10px_40px_rgba(124,58,237,0.5)] transition-transform hover:scale-105"
            >
              Launch Your Agent
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="rounded-full border border-white/15 bg-white/[0.06] px-8 py-3.5 text-sm font-semibold text-white/90 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-white/10"
            >
              See How It Works
            </button>
          </div>
        </div>
        {/* Scroll cue */}
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.3em] text-white/40">
          Scroll
        </div>
      </section>

      {/* Content — frosted over the living constellation */}
      <div className="relative z-10 bg-[#07040d]/80 backdrop-blur-xl">
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

        {/* Pricing */}
        <Section id="pricing" className="py-24">
          <motion.h2 variants={rise} className="mb-14 text-center text-4xl font-bold md:text-5xl" style={{ fontFamily: HEAD }}>
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
                <div className="mb-1 mt-2 text-lg font-semibold" style={{ fontFamily: HEAD }}>{p.name}</div>
                <div className="mb-6 text-4xl font-black" style={{ fontFamily: HEAD }}>
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
        <Section className="py-24">
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
