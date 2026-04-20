import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EliteWaitlistDialog } from "./EliteWaitlistDialog";

const tiers = [
  {
    name: "Paige Starter",
    description: "For entrepreneurs building their credit and business foundation.",
    price: "$27",
    strikethrough: "$47",
    period: "/month",
    badge: "Founding Beta Rate",
    subtext: "Lock in this rate forever",
    features: [
      "Paige AI advisor with goal discovery",
      "Three-bureau credit intelligence",
      "Credit score simulator",
      "Business profile builder",
      "BRRRR and real estate education",
      "SBA and CDFI lender search in chat",
      "Expense optimization coaching",
      "Daily predictive credit monitoring",
      "Push notifications for score changes",
      "Document upload and extraction",
    ],
    cta: "Start Starter — $27/mo",
    ctaStyle: "outline-gold",
    popular: false,
    elite: false,
  },
  {
    name: "Paige Pro",
    description: "For established entrepreneurs ready to access capital and scale.",
    price: "$67",
    strikethrough: "$97",
    period: "/month",
    badge: "Founding Beta Rate",
    subtext: "Lock in this rate forever",
    features: [
      "Everything in Starter, plus:",
      "Full funding journey tracking",
      "58 categorized lenders with bureau matching",
      "Demographic program unlocking — 8(a), WOSB, HUBZone, Veteran",
      "Live interest rate intelligence",
      "Entity structure and HoldCo strategy",
      "Capital multiplication coaching",
      "Hormozi business fundamentals — CAC, LTV, margins",
      "Working capital and payroll strategy",
      "Bank statement loan guidance",
      "Voice sessions with full context",
      "Conversational profile capture",
    ],
    cta: "Start Pro — $67/mo",
    ctaStyle: "solid-gold",
    popular: true,
    elite: false,
  },
  {
    name: "Paige Elite",
    description: "For serious wealth builders who want done-with-you PME support.",
    price: "$297",
    strikethrough: "",
    period: "/month",
    badge: "Waitlist Open",
    subtext: "Limited spots — apply for access",
    features: [
      "Everything in Pro, plus:",
      "Assigned PME consultant",
      "Mogul Credit AI coordination for disputes",
      "Monthly strategy session with your coach",
      "Priority funding application review",
      "Certifications guidance — 8(a), WOSB, HUBZone",
      "Advanced entity architecture review",
      "PME preferred lender relationships",
      "White-glove onboarding",
    ],
    cta: "Join the Waitlist",
    ctaStyle: "outline-navy",
    popular: false,
    elite: true,
  },
];

export function PricingSection() {
  const navigate = useNavigate();
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const handleCta = (tier: (typeof tiers)[number]) => {
    if (tier.elite) {
      setWaitlistOpen(true);
    } else {
      navigate("/auth?mode=signup");
    }
  };

  const ctaClass = (style: string, popular: boolean) => {
    if (popular || style === "solid-gold") {
      return "bg-gradient-gold text-primary font-bold hover:shadow-glow-lg hover:scale-105";
    }
    if (style === "outline-gold") {
      return "border-2 border-gold text-gold-dark hover:bg-gold hover:text-primary font-bold hover:scale-105";
    }
    return "border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground font-bold hover:scale-105";
  };

  return (
    <section id="pricing" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Founding Beta Pricing
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Start Building.{" "}
            <span className="text-accent font-extrabold">No Guesswork.</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Join as a founding Beta member and lock in your rate for life.
            Paige keeps getting smarter — your price stays the same.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={`p-7 bg-card relative flex flex-col ${
                tier.popular
                  ? "border-2 border-gold shadow-glow-lg md:scale-[1.04]"
                  : "border-border"
              } transition-all duration-300 hover:shadow-glow hover:-translate-y-1`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-gold text-primary border-0 font-bold px-4">
                  MOST POPULAR
                </Badge>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold mb-1.5 text-foreground">
                  {tier.name}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4 min-h-[2.5rem]">
                  {tier.description}
                </p>

                <Badge
                  variant="outline"
                  className="mb-3 bg-gold/5 text-gold-dark border-gold/30 text-[10px] font-bold uppercase tracking-wider"
                >
                  {tier.badge}
                </Badge>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-5xl font-extrabold text-foreground tabular-nums">
                    {tier.price}
                  </span>
                  {tier.strikethrough && (
                    <span className="text-lg text-muted-foreground line-through tabular-nums">
                      {tier.strikethrough}
                    </span>
                  )}
                  <span className="text-muted-foreground text-sm">
                    {tier.period}
                  </span>
                </div>
                <p className="text-xs text-gold-dark font-semibold">
                  {tier.subtext}
                </p>
              </div>

              <ul className="space-y-2.5 mb-7 flex-grow">
                {tier.features.map((feature, fi) => (
                  <li
                    key={fi}
                    className={`flex items-start gap-2.5 ${
                      feature.endsWith("plus:") ? "font-semibold text-foreground" : ""
                    }`}
                  >
                    {feature.endsWith("plus:") ? (
                      <span className="w-4 h-0.5 mt-2.5 bg-gold flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className={`w-full transition-all duration-300 ${ctaClass(tier.ctaStyle, tier.popular)}`}
                onClick={() => handleCta(tier)}
              >
                {tier.cta}
              </Button>
            </Card>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-2xl mx-auto">
          All plans include a <span className="font-bold text-foreground">7-day free trial</span>.
          Cancel anytime. Founding Beta rates are locked for life as long as
          your subscription remains active.
        </p>

        <p className="text-center text-xs text-muted-foreground mt-6 max-w-3xl mx-auto leading-relaxed">
          PaigeAgent AI provides financial education and credit intelligence
          tools. It is not a licensed financial advisor, credit repair
          organization, or lender. Credit score projections are estimates based
          on general FICO scoring factors. Actual results may vary. Rate
          information is sourced from public Federal Reserve data and is
          subject to change.
        </p>
      </div>

      <EliteWaitlistDialog open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </section>
  );
}
