import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Sparkles, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Footer } from "@/components/landing/Footer";
import { PageHead } from "@/components/seo/PageHead";

/**
 * /pricing — Tenant subscription tiers only.
 *
 * Consumer offers are invite-only (delivered via tokenized email/SMS links),
 * not a discoverable public path. This page sells the Layer 1 (Tenant → Paige)
 * subscription to prospective coaching businesses, brokerages, and academies.
 *
 * CTAs are currently disabled / waitlist until the Stripe account swap
 * completes and new tenant-tier products are wired.
 */

type TenantTier = {
  slug: "starter" | "growth" | "scale" | "enterprise";
  name: string;
  price: string;
  period: string;
  tagline: string;
  inclusions: {
    agents: string;
    creditInquiries: string;
    storage: string;
  };
  features: string[];
  popular?: boolean;
  cta: string;
  ctaHref?: string;
  disabled?: boolean;
};

const tenantTiers: TenantTier[] = [
  {
    slug: "starter",
    name: "Starter",
    price: "$197",
    period: "/mo",
    tagline: "For solo coaches launching a Paige-powered practice.",
    inclusions: {
      agents: "25 agents included",
      creditInquiries: "1,000 AI actions / mo",
      storage: "10 GB storage",
    },
    features: [
      "Full CRM + client pipeline",
      "Paige AI (unlimited chat)",
      "Client portal + intake",
      "Stripe Connect payouts",
      "Basic automations",
    ],
    cta: "Join Waitlist",
    disabled: true,
  },
  {
    slug: "growth",
    name: "Growth",
    price: "$497",
    period: "/mo",
    tagline: "For coaching academies and broker shops scaling client volume.",
    inclusions: {
      agents: "100 agents included",
      creditInquiries: "5,000 AI actions / mo",
      storage: "50 GB storage",
    },
    features: [
      "Everything in Starter, plus:",
      "White-label domain + branding",
      "Sub-agent factory (Paige Skills)",
      "MCP tools + n8n workflows",
      "Reseller economics (analytics, automation)",
      "Priority support",
    ],
    popular: true,
    cta: "Join Waitlist",
    disabled: true,
  },
  {
    slug: "scale",
    name: "Scale",
    price: "$1,497",
    period: "/mo",
    tagline: "For established firms running multi-brand or high-volume operations.",
    inclusions: {
      agents: "500 agents included",
      creditInquiries: "25,000 AI actions / mo",
      storage: "500 GB storage",
    },
    features: [
      "Everything in Growth, plus:",
      "Multi-tenant orchestration",
      "Dedicated Paige sub-agents",
      "Advanced compliance workflows",
      "Custom onboarding + migration",
      "Named account manager",
    ],
    cta: "Join Waitlist",
    disabled: true,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    tagline: "For multi-brand portfolios with bespoke infrastructure requirements.",
    inclusions: {
      agents: "Unlimited agents",
      creditInquiries: "Volume-negotiated",
      storage: "Volume-negotiated",
    },
    features: [
      "Everything in Scale, plus:",
      "Dedicated infrastructure",
      "SOC 2 / custom DPA",
      "White-glove migration",
      "SLA-backed uptime",
      "Executive sponsor",
    ],
    cta: "Contact Sales",
    ctaHref: "mailto:sales@paigeagent.ai?subject=Enterprise%20Inquiry",
  },
];

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <>
      <PageHead
        title="Pricing — Paige Agent AI"
        description="Tenant subscription tiers for coaching businesses, broker shops, and academies running on Paige Agent AI. Starter, Growth, Scale, and Enterprise."
        path="/pricing"
      />
      <div className="min-h-screen bg-background">
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-14">
              <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
                <Sparkles className="w-3 h-3 mr-1.5" />
                Platform subscription
              </Badge>
              <h1 className="text-4xl lg:text-5xl font-bold mb-4">
                Run your business on{" "}
                <span className="text-accent font-extrabold">Paige.</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                Transparent tenant pricing for coaching businesses, brokerages, and academies. Bring
                your own clients, your own offers, your own pricing — we provide the infrastructure.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {tenantTiers.map((tier) => (
                <Card
                  key={tier.slug}
                  className={`p-7 bg-card relative flex flex-col transition-all duration-300 hover:shadow-glow hover:-translate-y-1 ${
                    tier.popular
                      ? "border-2 border-gold shadow-glow-lg lg:scale-[1.03]"
                      : "border-border"
                  }`}
                >
                  {tier.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-gold text-primary border-0 font-bold px-4">
                      MOST POPULAR
                    </Badge>
                  )}
                  <div className="mb-6">
                    <h2 className="text-xl font-bold mb-1 text-foreground">{tier.name}</h2>
                    <p className="text-xs text-muted-foreground mb-4 min-h-[2.5rem]">
                      {tier.tagline}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-extrabold tabular-nums">{tier.price}</span>
                      <span className="text-muted-foreground text-sm">{tier.period}</span>
                    </div>
                  </div>

                  <div className="mb-6 pb-6 border-b border-border">
                    <p className="text-xs uppercase tracking-wider text-gold-dark font-bold mb-2">
                      Included
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      <li className="flex items-start gap-2">
                        <Building2 className="w-3.5 h-3.5 text-fundability-excellent flex-shrink-0 mt-0.5" />
                        <span>{tier.inclusions.agents}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Building2 className="w-3.5 h-3.5 text-fundability-excellent flex-shrink-0 mt-0.5" />
                        <span>{tier.inclusions.creditInquiries}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Building2 className="w-3.5 h-3.5 text-fundability-excellent flex-shrink-0 mt-0.5" />
                        <span>{tier.inclusions.storage}</span>
                      </li>
                    </ul>
                  </div>

                  <ul className="space-y-2.5 mb-7 flex-grow">
                    {tier.features.map((f, i) => (
                      <li
                        key={i}
                        className={`flex items-start gap-2.5 ${
                          f.endsWith("plus:") ? "font-semibold text-foreground" : ""
                        }`}
                      >
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
                    disabled={tier.disabled}
                    className={`w-full font-bold transition-all duration-300 ${
                      tier.popular
                        ? "bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105"
                        : "border-2 border-gold text-gold-dark hover:bg-gold hover:text-primary bg-transparent"
                    } ${tier.disabled ? "opacity-70 cursor-not-allowed" : ""}`}
                    onClick={() => {
                      if (tier.disabled) return;
                      if (tier.ctaHref) {
                        window.location.href = tier.ctaHref;
                      } else {
                        navigate("/auth?mode=signup");
                      }
                    }}
                  >
                    {tier.cta}
                  </Button>
                </Card>
              ))}
            </div>

            <Card className="mt-12 max-w-4xl mx-auto p-6 bg-primary/5 border-primary/20">
              <h3 className="text-base font-bold mb-3 text-foreground">
                Transparent overage pricing
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                If you exceed your tier's included volume, overage is billed at the same
                pass-through rate across every tier — no surprise multipliers, no hidden markup.
              </p>
              <ul className="text-sm space-y-1.5">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>$5 per additional agent</strong> per month beyond your tier's included seats
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>$5 per additional 1,000 AI actions</strong> beyond your tier's monthly cap
                  </span>
                </li>
              </ul>
            </Card>

            <p className="text-center text-xs text-muted-foreground max-w-3xl mx-auto leading-relaxed mt-10">
              Paige provides AI-powered business operations, client management, and coaching workflow
              infrastructure for client-based businesses. Service provided by{" "}
              <strong>PaigeAgent AI LLC</strong>.
            </p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
