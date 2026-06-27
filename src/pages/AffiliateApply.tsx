// src/pages/AffiliateApply.tsx
// Public affiliate landing + application page at /affiliates.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import AffiliateApplyForm from "@/components/affiliates/AffiliateApplyForm";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  Repeat,
  LineChart,
  Check,
  Crown,
  Sparkles,
  FileSignature,
  Link2,
  Megaphone,
  Wallet,
  GraduationCap,
  Briefcase,
  Building2,
  Users,
  Video,
  Rocket,
  Star,
} from "lucide-react";

const NAVY = "#1a2840";
const GOLD = "#d4a574";

export default function AffiliateApply() {
  const [userId, setUserId] = useState<string | null>(null);
  const [defaultName, setDefaultName] = useState("");
  const [defaultEmail, setDefaultEmail] = useState("");

  const formRef = useRef<HTMLDivElement>(null);
  const howRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Become a Partner · PaigeAgent";
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        setUserId(u.id);
        setDefaultEmail(u.email ?? "");
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", u.id)
          .maybeSingle();
        if (p?.full_name) setDefaultName(p.full_name);
      }
    })();
  }, []);

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div
      className="min-h-screen text-white"
      style={{ backgroundColor: NAVY }}
    >
      <PageHead
        title="Affiliate Program — PaigeAgent.ai"
        description="Apply to the PaigeAgent.ai affiliate program. Refer entrepreneurs to the platform and earn recurring commissions on every subscription."
        path="/affiliates"
      />

      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          PaigeAgent
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/" className="text-white/70 hover:text-white">
            Home
          </Link>
          <Link to="/auth" className="text-white/70 hover:text-white">
            Sign in
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `radial-gradient(60% 80% at 70% 0%, ${GOLD}33 0%, transparent 60%), linear-gradient(180deg, ${NAVY} 0%, #0f1828 100%)`,
        }}
      >
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-10 md:pt-16">
          <Badge
            className="mb-5 border-0"
            style={{ backgroundColor: `${GOLD}26`, color: GOLD }}
          >
            PaigeAgent Partner Program
          </Badge>
          <h1 className="font-serif text-4xl font-semibold leading-tight md:text-6xl">
            Earn While You Help People
            <br />
            <span style={{ color: GOLD }}>Build Wealth</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/75 md:text-xl">
            Join the PaigeAgent Partner Program and earn recurring commissions
            every time someone you refer becomes a member.
          </p>

          {/* Stat pills */}
          <div className="mt-8 flex flex-wrap gap-3">
            <StatPill icon={TrendingUp} label="Up to 40% Commission" />
            <StatPill icon={Repeat} label="Lifetime Recurring" />
            <StatPill icon={LineChart} label="Real-Time Tracking" />
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => scrollTo(formRef)}
              className="font-semibold text-[#1a2840] hover:opacity-90"
              style={{ backgroundColor: GOLD }}
            >
              Become a Partner
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => scrollTo(howRef)}
              className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              See How It Works
            </Button>
          </div>
        </div>
      </section>

      {/* COMMISSION TIERS */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Commission Tiers"
          title="Pick the partnership that fits you"
          subtitle="Every tier earns recurring monthly commissions on every active referral."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <TierCard
            icon={Sparkles}
            name="Affiliate Partner"
            rate="25%"
            duration="First 12 months"
            cta="Instant approval"
            features={[
              "Unique referral link",
              "Real-time dashboard",
              "Monthly payouts",
              "Marketing assets",
            ]}
          />
          <TierCard
            icon={GraduationCap}
            name="Certified Coach Partner"
            rate="30%"
            duration="Lifetime recurring"
            cta="24-hour review"
            featured
            features={[
              "Everything in Affiliate",
              "Lifetime commissions",
              "Co-branded onboarding",
              "Listed in coach directory",
            ]}
          />
          <TierCard
            icon={Crown}
            name="PME Team / Admin"
            rate="40%"
            duration="Lifetime recurring"
            cta="By invitation only"
            features={[
              "Highest commission rate",
              "Lifetime recurring",
              "Internal tools access",
              "Priority support",
            ]}
          />
        </div>
      </section>

      {/* EARNINGS CALCULATOR */}
      <section
        className="border-y border-white/5"
        style={{ backgroundColor: "#0f1828" }}
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="Earnings Calculator"
            title="See what recurring income looks like"
            subtitle="Drag the slider to estimate your monthly, annual, and 3-year commissions."
          />
          <EarningsCalculator />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section ref={howRef} className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="How It Works"
          title="Four steps to your first commission"
        />
        <HowItWorks />
      </section>

      {/* WHO THIS IS FOR */}
      <section
        className="border-y border-white/5"
        style={{ backgroundColor: "#0f1828" }}
      >
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="Who This Is For"
            title="Built for people who already serve their audience"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <PersonaCard
              icon={GraduationCap}
              title="Credit Coaches"
              body="Layer PaigeAgent into your existing coaching practice."
            />
            <PersonaCard
              icon={Briefcase}
              title="Financial Advisors"
              body="Refer clients who need credit + funding readiness."
            />
            <PersonaCard
              icon={Building2}
              title="Real Estate Investors"
              body="Help your network qualify for better financing."
            />
            <PersonaCard
              icon={Users}
              title="Business Consultants"
              body="Add a recurring revenue stream to your services."
            />
            <PersonaCard
              icon={Video}
              title="Content Creators"
              body="Monetize your audience with a product they actually need."
            />
            <PersonaCard
              icon={Rocket}
              title="Entrepreneurs"
              body="Refer other founders building their funding stack."
            />
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Partner Stories"
          title="What partners are saying"
          subtitle="Sample testimonials — real partner stories will appear here as the program grows."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Testimonial
            quote="PaigeAgent slotted right into my coaching workflow. The recurring commissions are a game changer."
            name="Coach (Sample)"
            role="Credit Coaching Practice"
          />
          <Testimonial
            quote="My audience was already asking about funding. Now I can recommend something I trust and earn from it."
            name="Creator (Sample)"
            role="Personal Finance Channel"
          />
          <Testimonial
            quote="The dashboard makes it easy to see exactly what I'm earning. Payouts have been on time, every time."
            name="Partner (Sample)"
            role="Business Consultant"
          />
        </div>
      </section>

      {/* APPLICATION FORM */}
      <section
        ref={formRef}
        className="border-t border-white/5"
        style={{ backgroundColor: "#0f1828" }}
      >
        <div className="mx-auto max-w-3xl px-6 py-20">
          <SectionHeading
            eyebrow="Apply Now"
            title="Become a partner today"
            subtitle="Affiliate Partners are approved instantly. Coach Partners are reviewed within 24 hours."
          />
          <Card className="mt-10 border-white/10 bg-white text-[#1a2840]">
            <CardHeader>
              <CardTitle className="text-2xl text-[#1a2840]">
                Partner Application
              </CardTitle>
              <p className="text-sm text-[#1a2840]/60">
                Tell us a bit about you and we'll get you set up.
              </p>
            </CardHeader>
            <CardContent>
              <AffiliateApplyForm
                userId={userId}
                defaultName={defaultName}
                defaultEmail={defaultEmail}
                showTierAndPersona
              />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer mini */}
      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-white/50">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} PaigeAgent · Project Mogul Enterprise Inc.</p>
          <div className="flex gap-5">
            <Link to="/" className="hover:text-white">Home</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- Subcomponents ---------------- */

function StatPill({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
      style={{
        borderColor: `${GOLD}66`,
        backgroundColor: `${GOLD}1a`,
        color: GOLD,
      }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: GOLD }}
      >
        {eyebrow}
      </p>
      <h2 className="font-serif text-3xl font-semibold leading-tight md:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-base text-white/70 md:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

function TierCard({
  icon: Icon,
  name,
  rate,
  duration,
  cta,
  features,
  featured = false,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  name: string;
  rate: string;
  duration: string;
  cta: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-6 backdrop-blur transition ${
        featured ? "scale-[1.02]" : ""
      }`}
      style={{
        borderColor: featured ? GOLD : "rgba(255,255,255,0.1)",
        backgroundColor: featured ? `${GOLD}0d` : "rgba(255,255,255,0.04)",
        boxShadow: featured ? `0 0 40px ${GOLD}33` : undefined,
      }}
    >
      {featured && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#1a2840]"
          style={{ backgroundColor: GOLD }}
        >
          Most Popular
        </div>
      )}
      <Icon className="mb-4 h-8 w-8" style={{ color: GOLD }} />
      <h3 className="text-xl font-semibold">{name}</h3>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-bold" style={{ color: GOLD }}>
          {rate}
        </span>
        <span className="text-sm text-white/60">commission</span>
      </div>
      <p className="mt-1 text-sm text-white/70">{duration}</p>
      <ul className="mt-6 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
            <span className="text-white/85">{f}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs font-medium uppercase tracking-wider text-white/60">
        {cta}
      </p>
    </div>
  );
}

function EarningsCalculator() {
  const [referrals, setReferrals] = useState(5);
  const [plan, setPlan] = useState<"starter" | "pro">("pro");
  const [tier, setTier] = useState<"affiliate" | "coach">("affiliate");

  const planPrice = plan === "starter" ? 27 : 67;
  const tierRate = tier === "affiliate" ? 0.25 : 0.3;

  const monthly = useMemo(
    () => referrals * planPrice * tierRate,
    [referrals, planPrice, tierRate],
  );
  const annual = monthly * 12;
  // 3-year total assumes referrals accumulate at the same monthly rate
  // (avg lifetime per active referral simplifying assumption).
  const threeYear = annual * 3;

  const fmt = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-2">
      {/* Controls */}
      <div className="space-y-8 rounded-2xl border border-white/10 bg-white/5 p-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">
              Referrals per month
            </label>
            <span
              className="rounded-md px-2 py-0.5 text-sm font-bold"
              style={{ backgroundColor: `${GOLD}26`, color: GOLD }}
            >
              {referrals}
            </span>
          </div>
          <Slider
            value={[referrals]}
            onValueChange={(v) => setReferrals(v[0])}
            min={1}
            max={50}
            step={1}
          />
          <div className="mt-1 flex justify-between text-xs text-white/40">
            <span>1</span>
            <span>50</span>
          </div>
        </div>

        <ToggleRow
          label="Plan"
          options={[
            { value: "starter", label: "Starter $27" },
            { value: "pro", label: "Pro $67" },
          ]}
          value={plan}
          onChange={(v) => setPlan(v as "starter" | "pro")}
        />

        <ToggleRow
          label="Partner tier"
          options={[
            { value: "affiliate", label: "Affiliate 25%" },
            { value: "coach", label: "Coach 30%" },
          ]}
          value={tier}
          onChange={(v) => setTier(v as "affiliate" | "coach")}
        />
      </div>

      {/* Results */}
      <div
        className="flex flex-col justify-between rounded-2xl border p-6"
        style={{
          borderColor: `${GOLD}66`,
          backgroundColor: `${GOLD}0d`,
        }}
      >
        <div className="space-y-5">
          <ResultRow label="Monthly commission" value={fmt(monthly)} large />
          <ResultRow label="Annual commission" value={fmt(annual)} />
          <ResultRow label="3-year total" value={fmt(threeYear)} />
        </div>
        <div
          className="mt-6 flex items-start gap-3 rounded-xl border p-4 text-sm"
          style={{
            borderColor: `${GOLD}40`,
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <Wallet className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
          <p className="text-white/80">
            This is recurring income — commissions renew every month as long as
            your referrals stay subscribed.
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium text-white/80">{label}</p>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/30 p-1">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="rounded-md px-3 py-2 text-sm font-medium transition"
              style={{
                backgroundColor: active ? GOLD : "transparent",
                color: active ? NAVY : "rgba(255,255,255,0.7)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-white/70">{label}</span>
      <span
        className={`font-bold tabular-nums ${large ? "text-4xl md:text-5xl" : "text-2xl"}`}
        style={{ color: large ? GOLD : "white" }}
      >
        {value}
      </span>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: FileSignature,
      title: "Apply",
      body: "Fill out the form below — Affiliates approve instantly.",
    },
    {
      icon: Link2,
      title: "Get Your Link",
      body: "We email your unique referral link and dashboard access.",
    },
    {
      icon: Megaphone,
      title: "Share",
      body: "Promote PaigeAgent to your audience with assets we provide.",
    },
    {
      icon: Wallet,
      title: "Earn",
      body: "Get paid monthly for as long as your referrals stay subscribed.",
    },
  ];
  return (
    <div className="mt-10 grid gap-6 md:grid-cols-4">
      {steps.map((s, i) => (
        <div
          key={s.title}
          className="relative rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <div
            className="mb-4 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-[#1a2840]"
            style={{ backgroundColor: GOLD }}
          >
            {i + 1}
          </div>
          <s.icon className="mb-3 h-6 w-6" style={{ color: GOLD }} />
          <h3 className="text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm text-white/70">{s.body}</p>
        </div>
      ))}
    </div>
  );
}

function PersonaCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <Icon className="mb-3 h-6 w-6" style={{ color: GOLD }} />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-white/70">{body}</p>
    </div>
  );
}

function Testimonial({
  quote,
  name,
  role,
}: {
  quote: string;
  name: string;
  role: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-3 flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-4 w-4" style={{ color: GOLD, fill: GOLD }} />
        ))}
      </div>
      <p className="flex-1 text-sm italic text-white/85">"{quote}"</p>
      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-white/60">{role}</p>
      </div>
      <Badge
        className="mt-3 self-start border-0 text-[10px]"
        style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
      >
        Sample
      </Badge>
    </div>
  );
}
