import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle, Sparkles, Building2, Users, User, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Three-section pricing per Doctrine §197 (Billing Layer Taxonomy):
 *  §1 FOR BUSINESSES   → LAYER 1 (Tenant → Paige) platform tiers
 *  §2 FOR YOUR CLIENTS → LAYER 2 (End Customer → Tenant) sovereignty examples
 *  §3 FOR INDIVIDUALS  → LAYER 4 (Consumer → Paige) 2027 waitlist capture
 */

const businessTiers = [
  {
    name: "Operator",
    layer: "For solo coaches & small teams",
    price: "$149",
    period: "/mo",
    seats: "3 seats included",
    features: [
      "Full CRM + pipeline",
      "Paige AI (unlimited chat)",
      "Client portal + intake",
      "Stripe Connect payouts",
      "Basic automations",
    ],
    cta: "Start Operator",
    popular: false,
  },
  {
    name: "Academy",
    layer: "For coaching academies & brokers",
    price: "$397",
    period: "/mo",
    seats: "10 seats included",
    features: [
      "Everything in Operator, plus:",
      "White-label domain + branding",
      "Sub-agent factory (Paige Skills)",
      "MCP tools + n8n workflows",
      "Reseller economics (credit monitoring, funding)",
      "Priority support",
    ],
    cta: "Start Academy",
    popular: true,
  },
  {
    name: "Enterprise",
    layer: "For multi-brand operators",
    price: "Custom",
    period: "",
    seats: "Unlimited seats",
    features: [
      "Everything in Academy, plus:",
      "Multi-tenant orchestration",
      "Dedicated infrastructure",
      "SOC 2 / custom DPA",
      "White-glove migration",
    ],
    cta: "Talk to Sales",
    popular: false,
  },
];

const tenantExamples = [
  {
    tenant: "Mogul Maker Academy",
    program: "BUILD-to-FUND",
    price: "$4,997",
    what: "12-month funding readiness cohort",
  },
  {
    tenant: "LaunchPad Coaching",
    program: "Monthly Membership",
    price: "$199/mo",
    what: "Small-business credit accelerator",
  },
  {
    tenant: "Your Academy",
    program: "Your Offer",
    price: "You set the price",
    what: "Full sovereignty over your retail pricing",
  },
];

export function PricingSection() {
  const navigate = useNavigate();
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistLoading(true);
    const { error } = await supabase
      .from("consumer_waitlist")
      .insert({ email: waitlistEmail.trim().toLowerCase(), source: "landing_pricing" });
    setWaitlistLoading(false);
    if (error && !error.message.includes("duplicate")) {
      toast({ title: "Couldn't save your spot", description: error.message, variant: "destructive" });
      return;
    }
    setWaitlistDone(true);
    toast({ title: "You're on the list", description: "We'll email you the moment consumer access opens." });
  };

  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">

        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Three ways to run on Paige
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            One platform.{" "}
            <span className="text-accent font-extrabold">Three audiences.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Paige is the operating system for coaching businesses, the workspace for the clients
            they serve, and — starting 2027 — the personal AI advisor for individual entrepreneurs.
          </p>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* SECTION 1 — FOR BUSINESSES (Layer 1)                       */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div>
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Section 1 · For Businesses
              </span>
            </div>
            <h3 className="text-3xl font-bold mb-3">Run your coaching business on Paige</h3>
            <p className="text-muted-foreground">
              Platform subscription — tenants pay Paige for the infrastructure. Bring your
              own clients, your own offers, your own pricing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {businessTiers.map((tier) => (
              <Card
                key={tier.name}
                className={`p-7 bg-card relative flex flex-col transition-all duration-300 hover:shadow-glow hover:-translate-y-1 ${
                  tier.popular ? "border-2 border-gold shadow-glow-lg md:scale-[1.04]" : "border-border"
                }`}
              >
                {tier.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-gold text-primary border-0 font-bold px-4">
                    MOST POPULAR
                  </Badge>
                )}
                <div className="mb-6">
                  <h4 className="text-xl font-bold mb-1 text-foreground">{tier.name}</h4>
                  <p className="text-xs text-muted-foreground mb-4 min-h-[2rem]">{tier.layer}</p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-5xl font-extrabold tabular-nums">{tier.price}</span>
                    <span className="text-muted-foreground text-sm">{tier.period}</span>
                  </div>
                  <p className="text-xs text-gold-dark font-semibold">{tier.seats}</p>
                </div>
                <ul className="space-y-2.5 mb-7 flex-grow">
                  {tier.features.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2.5 ${f.endsWith("plus:") ? "font-semibold text-foreground" : ""}`}>
                      {f.endsWith("plus:") ? (
                        <span className="w-4 h-0.5 mt-2.5 bg-gold flex-shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                      )}
                      <span className="text-sm leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  className={`w-full font-bold transition-all duration-300 ${
                    tier.popular
                      ? "bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105"
                      : "border-2 border-gold text-gold-dark hover:bg-gold hover:text-primary bg-transparent"
                  }`}
                  onClick={() => navigate(tier.price === "Custom" ? "/broker" : "/auth?mode=signup")}
                >
                  {tier.cta}
                </Button>
              </Card>
            ))}
          </div>

          <Card className="mt-10 max-w-4xl mx-auto p-6 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">
                <span className="font-bold">Credit Repair Cloud costs $179/mo</span> and locks you
                into dispute-letter territory. Paige gives you monitoring, prequalification,
                coaching workflows, and white-label reseller economics —
                <span className="font-bold"> with zero regulatory exposure.</span>
              </p>
            </div>
          </Card>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* SECTION 2 — FOR YOUR CLIENTS (Layer 2)                     */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div>
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-accent/10 border border-accent/20">
              <Users className="w-4 h-4 text-accent" />
              <span className="text-xs font-bold uppercase tracking-wider text-accent">
                Section 2 · For Your Clients
              </span>
            </div>
            <h3 className="text-3xl font-bold mb-3">Your offers. Your prices. Your brand.</h3>
            <p className="text-muted-foreground">
              End-customer pricing is <span className="font-semibold">100% tenant-sovereign</span>.
              Paige never sets or sees your retail rates. Here's what a few tenants offer today:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {tenantExamples.map((ex) => (
              <Card key={ex.tenant} className="p-6 border-border">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
                  {ex.tenant}
                </p>
                <h4 className="text-lg font-bold mb-1">{ex.program}</h4>
                <p className="text-3xl font-extrabold text-accent mb-2 tabular-nums">{ex.price}</p>
                <p className="text-sm text-muted-foreground">{ex.what}</p>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
            Payments flow directly into your Stripe Connect account. Paige takes only its
            platform fee — you keep the rest.
          </p>
        </div>

        {/* ─────────────────────────────────────────────────────────── */}
        {/* SECTION 3 — FOR INDIVIDUAL USERS (Layer 4 · 2027)          */}
        {/* ─────────────────────────────────────────────────────────── */}
        <div>
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-gold/10 border border-gold/20">
              <User className="w-4 h-4 text-gold-dark" />
              <span className="text-xs font-bold uppercase tracking-wider text-gold-dark">
                Section 3 · For Individual Users · 2027
              </span>
            </div>
            <h3 className="text-3xl font-bold mb-3">Personal Paige, coming 2027</h3>
            <p className="text-muted-foreground">
              A direct-to-consumer version of Paige for individual entrepreneurs — same AI
              advisor, no coaching business required. Join the waitlist to be first in line.
            </p>
          </div>

          <Card className="max-w-lg mx-auto p-8 border-2 border-gold/30 bg-gradient-to-br from-background to-gold/5">
            {waitlistDone ? (
              <div className="text-center py-4">
                <CheckCircle className="w-10 h-10 text-fundability-excellent mx-auto mb-3" />
                <p className="font-bold text-lg mb-1">You're on the list.</p>
                <p className="text-sm text-muted-foreground">
                  We'll email you the moment consumer access opens in 2027.
                </p>
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="space-y-4">
                <label className="block text-sm font-bold text-foreground">
                  Get early access — 2027 launch
                </label>
                <Input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  className="h-12"
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={waitlistLoading}
                  className="w-full bg-gradient-gold text-primary font-bold hover:shadow-glow-lg"
                >
                  {waitlistLoading ? "Saving..." : "Join the Waitlist"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  No spam. One email when we launch. Unsubscribe anytime.
                </p>
              </form>
            )}
          </Card>
        </div>

        {/* Footer disclaimer */}
        <p className="text-center text-xs text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          Paige Agent AI provides financial education, credit monitoring, and coaching workflow
          infrastructure. It is not a licensed financial advisor, credit repair organization, or
          lender. Rate information is sourced from public Federal Reserve data and is subject to change.
        </p>
      </div>
    </section>
  );
}
