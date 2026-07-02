import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { PageHead } from "@/components/seo/PageHead";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Sparkles, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Layer 4 Consumer signup page (§197 Layer 4).
 * Named Founder / Growth / Scale per Doctrine §201 (no "operator").
 * Signup flow: click tier → /auth?mode=signup&consumer_tier=<slug>
 *   → after email verify, calls create-consumer-checkout → Stripe (test mode).
 */

type Tier = {
  slug: "founder" | "growth" | "scale";
  name: string;
  price: string;
  tagline: string;
  features: string[];
  popular?: boolean;
  cta: string;
};

const TIERS: Tier[] = [
  {
    slug: "founder",
    name: "Founder",
    price: "$27",
    tagline: "For business owners just getting started with Paige.",
    features: [
      "1 business profile",
      "5 credit pulls per month",
      "Unlimited Paige chat",
      "Email Composer AI",
      "Monthly funding path recommendations",
      "Email support (48-hour response)",
    ],
    cta: "Start with Founder",
  },
  {
    slug: "growth",
    name: "Growth",
    price: "$67",
    tagline: "For owners scaling operations with Paige as their co-pilot.",
    features: [
      "3 business profiles",
      "20 credit pulls per month",
      "Unlimited Paige chat",
      "All AI sub-agents",
      "Read-only tool access (MCP)",
      "Weekly funding recommendations",
      "1 fractional CFO coaching hour / month",
      "Email support (24-hour response)",
    ],
    popular: true,
    cta: "Choose Growth",
  },
  {
    slug: "scale",
    name: "Scale",
    price: "$297",
    tagline: "For serious business owners running multiple companies.",
    features: [
      "Unlimited business profiles",
      "100 credit pulls per month",
      "Priority Paige chat queue",
      "All AI sub-agents",
      "Full tool access (MCP)",
      "On-demand funding recommendations",
      "4 fractional CFO coaching hours / month",
      "Priority chat support",
    ],
    cta: "Scale with Paige",
  },
];

export default function ForOwners() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pendingTier, setPendingTier] = useState<string | null>(null);

  // If we came back from auth with `?post_signup_tier=founder`, kick off checkout.
  useEffect(() => {
    const tier = params.get("post_signup_tier");
    if (!tier) return;
    (async () => {
      setPendingTier(tier);
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate(`/auth?mode=signup&consumer_tier=${tier}&redirect=/for-owners?post_signup_tier=${tier}`);
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-consumer-checkout", {
        body: { plan_slug: tier },
      });
      setPendingTier(null);
      if (error || !data?.url) {
        toast({
          title: "Couldn't start checkout",
          description: error?.message ?? "Please try again in a moment.",
          variant: "destructive",
        });
        return;
      }
      window.location.href = data.url;
    })();
  }, [params, navigate]);

  const handleSelect = async (slug: Tier["slug"]) => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      navigate(`/auth?mode=signup&consumer_tier=${slug}&redirect=/for-owners?post_signup_tier=${slug}`);
      return;
    }
    setPendingTier(slug);
    const { data, error } = await supabase.functions.invoke("create-consumer-checkout", {
      body: { plan_slug: slug },
    });
    setPendingTier(null);
    if (error || !data?.url) {
      toast({
        title: "Couldn't start checkout",
        description: error?.message ?? "Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    window.location.href = data.url;
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title="Paige for Business Owners — Founder, Growth, Scale"
        description="Personal AI advisor for individual business owners. Credit intelligence, funding path recommendations, and CFO coaching from $27/month."
        path="/for-owners"
      />
      <SiteBackground />
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-16">
        <section className="text-center max-w-3xl mx-auto">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            <Sparkles className="w-3 h-3 mr-1.5" />
            Paige for individual business owners
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            A personal AI advisor for the business you actually run.
          </h1>
          <p className="text-lg text-muted-foreground">
            Whether you own a coffee shop, drive a truck, cut hair, run a salon, or sell online — Paige
            watches your credit, matches you to funding you can actually get, and helps you make
            smarter money moves every week.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {TIERS.map((tier) => (
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
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-gold-dark" />
                  <h3 className="text-xl font-bold text-foreground">{tier.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4 min-h-[2.5rem]">{tier.tagline}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold tabular-nums">{tier.price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                </div>
              </div>
              <ul className="space-y-2.5 mb-7 flex-grow">
                {tier.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-fundability-excellent flex-shrink-0 mt-0.5" />
                    <span className="text-sm leading-snug">{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                disabled={pendingTier === tier.slug}
                onClick={() => handleSelect(tier.slug)}
                className={`w-full font-bold transition-all duration-300 ${
                  tier.popular
                    ? "bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-105"
                    : "border-2 border-gold text-gold-dark hover:bg-gold hover:text-primary bg-transparent"
                }`}
              >
                {pendingTier === tier.slug ? "Starting checkout…" : tier.cta}
              </Button>
            </Card>
          ))}
        </section>

        <section className="max-w-3xl mx-auto text-center">
          <p className="text-sm text-muted-foreground">
            Cancel anytime. Prices in USD, billed monthly. Paige provides education, credit
            monitoring, and funding intelligence — it is not a lender, broker, or credit repair
            organization. Service provided by <strong>PaigeAgent AI LLC</strong> (Wyoming).
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
