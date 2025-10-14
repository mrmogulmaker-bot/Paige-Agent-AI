import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const tiers = [
  {
    name: "Starter",
    price: "$47",
    period: "/month",
    description: "Perfect for getting started with credit repair",
    features: [
      "Personal credit monitoring",
      "Basic dispute tools",
      "A.C.C.E.L. Framework access",
      "PaigeAgent.ai coaching",
      "Email support",
      "Credit score tracking",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Professional",
    price: "$97",
    period: "/month",
    description: "Complete credit and business building solution",
    features: [
      "Everything in Starter",
      "Business credit building",
      "B.U.I.L.D. Framework access",
      "Priority PaigeAgent.ai coaching",
      "Priority support",
      "Fundability assessment",
      "Dispute letter automation",
    ],
    cta: "Get Started",
    popular: true,
  },
  {
    name: "Premium",
    price: "$197",
    period: "/month",
    description: "Advanced tools for serious credit builders",
    features: [
      "Everything in Professional",
      "Advanced analytics dashboard",
      "Custom funding strategies",
      "Dedicated account manager",
      "Unlimited disputes",
      "Unlimited AI coaching",
      "Monthly strategy sessions",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Enterprise",
    price: "$497",
    period: "/month",
    description: "For serious entrepreneurs scaling fast",
    features: [
      "Everything in Premium",
      "3M Framework (Make, Manage, Multiply)",
      "Dedicated success manager",
      "White-glove service",
      "Custom integration support",
      "Team collaboration tools",
      "Personalized training sessions",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            Simple Pricing
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Choose Your{" "}
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              Success Path
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transparent pricing with no hidden fees. Start with a 14-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={`p-8 bg-card relative ${
                tier.popular
                  ? "border-accent shadow-glow-lg scale-105"
                  : "border-border shadow-md"
              } transition-all duration-300 hover:shadow-glow`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-accent text-accent-foreground border-0">
                  Most Popular
                </Badge>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{tier.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold">{tier.price}</span>
                  <span className="text-muted-foreground">{tier.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full ${
                  tier.popular
                    ? "bg-gradient-primary text-primary-foreground shadow-glow"
                    : "bg-muted text-foreground hover:bg-muted/80"
                }`}
                size="lg"
                onClick={() => navigate("/auth?mode=signup")}
              >
                {tier.cta}
              </Button>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            All plans include 14-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
