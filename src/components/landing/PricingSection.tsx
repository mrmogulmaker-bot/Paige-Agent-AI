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
    description: "Perfect for personal credit repair",
    features: [
      "ACCEL Personal Credit Repair",
      "Personal credit monitoring",
      "Basic dispute tools",
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
    description: "Personal credit building and funding",
    features: [
      "Everything in Starter",
      "BUILD Personal Program",
      "Personal funding strategies",
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
    description: "Business credit building and funding",
    features: [
      "Everything in Professional",
      "BUILD Business Program",
      "Business credit building",
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
    price: "Let's Talk",
    period: "",
    description: "Customized yearly plans for your organization",
    features: [
      "Everything in Premium",
      "3M Framework (Make, Manage, Multiply)",
      "Dedicated success manager",
      "White-glove service",
      "Custom integration support",
      "Team collaboration tools",
      "Personalized training sessions",
      "Fractional CFO & CPA services",
      "Bookkeeping & full implementation",
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
        <div className="text-center mb-16 animate-fade-in">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            Simple Pricing
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 animate-fade-in" style={{ animationDelay: "0.1s" }}>
            Choose Your{" "}
            <span className="text-success font-extrabold">
              Success Path
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto animate-fade-in" style={{ animationDelay: "0.2s" }}>
            Transparent pricing with no hidden fees. Start with a 14-day free trial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {tiers.map((tier, index) => (
            <Card
              key={index}
              className={`p-8 bg-card relative ${
                tier.popular
                  ? "border-accent shadow-glow-lg scale-105 animate-fade-in"
                  : "border-border shadow-md animate-fade-in"
              } transition-all duration-300 hover:shadow-glow hover:-translate-y-2`}
              style={{ animationDelay: `${index * 0.1}s` }}
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
                {tier.features.map((feature, featureIndex) => {
                  const isHighlight = feature.includes("ACCEL") || 
                                    feature.includes("BUILD") || 
                                    feature.includes("PaigeAgent.ai");
                  return (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                      <span className={`text-sm ${isHighlight ? "font-bold text-accent" : ""}`}>
                        {feature}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <Button
                className={`w-full ${
                  tier.popular
                    ? "bg-gradient-primary text-primary-foreground shadow-glow hover:shadow-glow-lg hover:scale-110 hover:brightness-125"
                    : tier.name === "Enterprise"
                    ? "bg-gradient-accent text-accent-foreground shadow-glow hover:shadow-glow-lg hover:scale-110 hover:brightness-125"
                    : "bg-muted text-foreground hover:bg-accent hover:text-accent-foreground hover:scale-105"
                } transition-all duration-300`}
                size="lg"
                onClick={() => {
                  if (tier.name === "Enterprise") {
                    // Navigate to contact page for Enterprise
                    navigate("/auth?mode=signup&plan=enterprise");
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

        <div className="mt-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Start your <span className="font-semibold text-foreground">14-day free trial</span> • Payment authorization required upfront
          </p>
          <p className="text-xs text-muted-foreground">
            You won't be charged during your trial • Auto-charges after 14 days • Cancel anytime before trial ends
          </p>
        </div>
      </div>
    </section>
  );
}
