import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Sparkles, Building2, Users, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Two-section public pricing per Doctrine §197 (Billing Layer Taxonomy):
 *   §1 FOR BUSINESSES     → LAYER 1 (Tenant → Paige) — Practice / Academy / Enterprise
 *   §2 FOR YOUR CLIENTS   → LAYER 2 (End Customer → Tenant) sovereignty archetypes
 *
 * LAYER 4 (Consumer → Paige) is invite-only via tokenized email/SMS delivery;
 * intentionally not surfaced on the public site. See Sprint C.I.F.
 *
 * §201 compliant: no "operator" copy anywhere.
 */

type BusinessTier = {
  slug: string;
  name: string;
  layer: string;
  price: string;
  period: string;
  seats: string;
  features: string[];
  cta: string;
  popular: boolean;
};

const businessTiers: BusinessTier[] = [
  {
    slug: "practice",
    name: "Practice",
    layer: "For solo coaches and small teams",
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
    cta: "Start Practice",
    popular: false,
  },
  {
    slug: "academy",
    name: "Academy",
    layer: "For coaching academies & broker shops",
    price: "$397",
    period: "/mo",
    seats: "10 seats included",
    features: [
      "Everything in Practice, plus:",
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
    slug: "enterprise",
    name: "Enterprise",
    layer: "For multi-brand portfolios",
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

// §116: no real customer names.
const tenantExamples = [
  {
    model: "Absorb Model",
    archetype: "A Fitness Business Coaching Academy",
    program: "Included in $497 six-week program",
    price: "Free to clients",
    what: "Bundles credit monitoring into the cohort price and uses it as a competitive weapon at enrollment.",
  },
  {
    model: "Markup Model",
    archetype: "A Business Funding Brokerage",
    program: "Standalone subscription",
    price: "$39/mo",
    what: "Resells monitoring as a recurring revenue rail alongside placement fees.",
  },
  {
    model: "Bundled Model",
    archetype: "A Credit Consultancy",
    program: "Monitoring + monthly strategy session",
    price: "$79/mo",
    what: "Uses Paige as the whole client experience — monitoring, coaching notes, and check-ins in one place.",
  },
];

type ConsumerTier = {
  slug: "founder" | "growth" | "scale";
  name: string;
  price: string;
  tagline: string;
  highlights: string[];
  popular?: boolean;
};

const consumerTiers: ConsumerTier[] = [
  {
    slug: "founder",
    name: "Founder",
    price: "$27",
    tagline: "For business owners just getting started with Paige.",
    highlights: ["1 business profile", "5 credit pulls / month", "Email Composer AI", "Monthly funding path"],
  },
  {
    slug: "growth",
    name: "Growth",
    price: "$67",
    tagline: "For owners scaling operations with Paige as their co-pilot.",
    highlights: [
      "3 business profiles",
      "20 credit pulls / month",
      "All AI sub-agents",
      "1 CFO coaching hour / month",
    ],
    popular: true,
  },
  {
    slug: "scale",
    name: "Scale",
    price: "$297",
    tagline: "For serious owners running multiple businesses.",
    highlights: [
      "Unlimited business profiles",
      "100 credit pulls / month",
      "Priority queue",
      "4 CFO coaching hours / month",
    ],
  },
];

export function PricingSection() {
  const navigate = useNavigate();
  const [platformName, setPlatformName] = useState("PaigeAgent AI LLC");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_legal_profile")
        .select("legal_entity_name")
        .eq("singleton", true)
        .maybeSingle();
      if (data?.legal_entity_name) setPlatformName(data.legal_entity_name);
    })();
  }, []);

  const goConsumer = (slug: string) => {
    navigate(`/for-owners?post_signup_tier=${slug}`);
  };

  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">

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
            Paige is the workspace for coaching businesses, the client experience for the people they
            serve, and the personal AI advisor for individual business owners.
          </p>
        </div>

        {/* SECTION 1 — FOR BUSINESSES (Layer 1) */}
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
              Platform subscription — you pay Paige for the infrastructure. Bring your own clients,
              your own offers, your own pricing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {businessTiers.map((tier) => (
              <Card
                key={tier.slug}
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
                Paige gives you monitoring, prequalification, coaching workflows, and white-label
                reseller economics —
                <span className="font-bold"> with zero regulatory exposure.</span>
              </p>
            </div>
          </Card>
        </div>

        {/* SECTION 2 — FOR YOUR CLIENTS (Layer 2) */}
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
              Paige never sets or sees your retail rates. Three illustrative sovereignty models:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {tenantExamples.map((ex) => (
              <Card key={ex.model} className="p-6 border-border">
                <p className="text-xs uppercase tracking-wider text-gold-dark font-bold mb-2">
                  {ex.model}
                </p>
                <h4 className="text-lg font-bold mb-1">{ex.archetype}</h4>
                <p className="text-xs text-muted-foreground mb-3">{ex.program}</p>
                <p className="text-3xl font-extrabold text-accent mb-2 tabular-nums">{ex.price}</p>
                <p className="text-sm text-muted-foreground">{ex.what}</p>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
            Payments flow directly into your Stripe Connect account. Paige takes only its platform
            fee — you keep the rest.
          </p>
        </div>

        {/* SECTION 3 — FOR BUSINESS OWNERS (Layer 4) — LIVE */}
        <div>
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-gold/10 border border-gold/20">
              <User className="w-4 h-4 text-gold-dark" />
              <span className="text-xs font-bold uppercase tracking-wider text-gold-dark">
                Section 3 · For Business Owners
              </span>
            </div>
            <h3 className="text-3xl font-bold mb-3">Paige for the business you run</h3>
            <p className="text-muted-foreground">
              A personal AI advisor for individual business owners — coffee shops, salons, trucking,
              barbering, credit pros, sales reps, educators. Same Paige, no coaching business required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {consumerTiers.map((tier) => (
              <Card
                key={tier.slug}
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
                  <p className="text-xs text-muted-foreground mb-4 min-h-[2.5rem]">{tier.tagline}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-extrabold tabular-nums">{tier.price}</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2.5 mb-7 flex-grow">
                  {tier.highlights.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                      <span className="text-sm leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  className={`w-full font-bold ${
                    tier.popular
                      ? "bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105"
                      : "border-2 border-gold text-gold-dark hover:bg-gold hover:text-primary bg-transparent"
                  }`}
                  onClick={() => goConsumer(tier.slug)}
                >
                  Start {tier.name}
                </Button>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
            See the full comparison on <button onClick={() => navigate("/for-owners")} className="underline hover:text-foreground">the Paige for Business Owners page</button>.
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground max-w-3xl mx-auto leading-relaxed">
          Paige provides financial education, credit monitoring, and coaching workflow
          infrastructure. It is not a licensed financial advisor, credit repair organization, or
          lender. Service provided by <strong>{platformName}</strong>.
        </p>
      </div>
    </section>
  );
}
