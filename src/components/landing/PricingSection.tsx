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
      "Basic credit factor overview",
      "5 Paige messages/day",
      "View-only fundability score",
      "Credit education articles",
    ],
    cta: "Get Started Free",
    popular: false,
    highlight: false,
  },
  {
    name: "Starter",
    price: "$29",
    period: "/month",
    description: "Start repairing and building",
    features: [
      "Full Paige AI access",
      "5 dispute letters/month",
      "Basic funding matches",
      "Utilization alerts",
      "ACCEL framework access",
      "Email support",
    ],
    cta: "Start Building",
    popular: false,
    highlight: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/month",
    description: "Unlock your buying power",
    features: [
      "Everything in Starter",
      "Unlimited Paige AI",
      "Unlimited dispute letters",
      "Full funding match engine",
      '"What If" projections',
      "Inquiry tracking & alerts",
      "Voice chat with Paige",
      "Priority support",
    ],
    cta: "Go Pro",
    popular: true,
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/month",
    description: "Business credit + funding mastery",
    features: [
      "Everything in Pro",
      "BUILD Business program",
      "Business funding matches",
      "Monthly strategy session",
      "API access",
      "Team collaboration",
      "Dedicated account manager",
    ],
    cta: "Go Enterprise",
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
            Simple Pricing
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Invest in Your{" "}
            <span className="text-accent font-extrabold">Buying Power</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No hidden fees. No contracts. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    : tier.name === "Enterprise"
                    ? "bg-gradient-gold text-primary hover:shadow-glow hover:scale-105"
                    : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground hover:scale-105"
                } transition-all duration-300`}
                size="lg"
                onClick={() => navigate("/auth")}
              >
                {tier.cta}
              </Button>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          We don't have next. We got{" "}
          <span className="font-bold text-accent">NOW.</span> — See you on the
          other side.
        </p>
      </div>
    </section>
  );
}
