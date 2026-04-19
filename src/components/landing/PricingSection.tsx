import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "See where you stand",
    features: [
      "Weekly 3-bureau personal snapshot",
      "Readiness Score preview",
      "5 Paige messages/day",
      "Funding education library",
    ],
    cta: "Start Free",
    popular: false,
    highlight: false,
  },
  {
    name: "Starter",
    price: "$49",
    period: "/month",
    description: "Get fundable",
    features: [
      "Daily personal + business credit monitoring",
      "Full Readiness Score (live)",
      "500+ lender match engine",
      "Credit → capital translator",
      "Personal/business separation audit",
      "Paige AI — text + voice",
      "Email support",
    ],
    cta: "Get Fundable",
    popular: false,
    highlight: false,
  },
  {
    name: "Growth",
    price: "$149",
    period: "/month",
    description: "Close your first round",
    features: [
      "Everything in Starter",
      "Bank connection (Plaid) for cash-flow underwriting",
      "SBA 7(a) / 504 evaluator",
      "Lender-ready doc packet builder",
      "Direct lender intro requests",
      "Priority Paige (faster + agent mode)",
      "Priority support",
    ],
    cta: "Close Capital",
    popular: true,
    highlight: true,
  },
  {
    name: "Scale",
    price: "$397",
    period: "/month",
    description: "Stack capital, repeatedly",
    features: [
      "Everything in Growth",
      "Priority lender placement queue",
      "Dedicated funding advisor",
      "Monthly capital strategy session",
      "Advanced funding analytics & forecasting",
    ],
    cta: "Scale Capital",
    popular: false,
    highlight: false,
  },
  {
    name: "Broker",
    price: "$497",
    period: "/month",
    description: "Run a funding desk",
    features: [
      "Everything in Growth",
      "Multi-client command center",
      "Unlimited active client seats",
      "White-label client portal",
      "Affiliate + commission tracking",
      "GHL / n8n pipeline integration",
    ],
    cta: "Open Your Desk",
    popular: false,
    highlight: false,
  },
];

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            Plans That Pay For Themselves
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            One Funded Deal Covers{" "}
            <span className="text-accent font-extrabold">a Year of Paige</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade when you're ready to close. No contracts, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={`p-7 bg-card relative ${
                tier.popular
                  ? "border-accent shadow-glow-lg scale-[1.03]"
                  : "border-border"
              } transition-all duration-300 hover:shadow-glow hover:-translate-y-1`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-accent text-accent-foreground border-0">
                  Most Popular
                </Badge>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {tier.description}
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground text-sm">
                    {tier.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-2.5 mb-6">
                {tier.features.map((feature, fi) => (
                  <li key={fi} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  tier.popular
                    ? "bg-gradient-accent text-accent-foreground shadow-glow hover:shadow-glow-lg hover:scale-105"
                    : tier.name === "Broker"
                    ? "bg-gradient-gold text-primary hover:shadow-glow hover:scale-105"
                    : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground hover:scale-105"
                } transition-all duration-300`}
                size="lg"
                onClick={() => navigate("/auth?mode=signup")}
              >
                {tier.cta}
              </Button>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8 max-w-2xl mx-auto">
          Paige is an AI funding intelligence platform. We educate, organize, and match — we do not furnish data, repair credit, or guarantee approvals.{" "}
          <span className="font-bold text-accent">FCRA, CROA & GLBA compliant.</span>
        </p>

        <div className="mt-10 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-3 rounded-lg border border-accent/30 bg-card/50 px-6 py-4">
            <span className="text-sm text-muted-foreground">
              Love what we're building?
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-accent text-accent hover:bg-accent hover:text-accent-foreground font-bold"
              onClick={() => navigate("/affiliates")}
            >
              Earn commissions — become an affiliate
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
