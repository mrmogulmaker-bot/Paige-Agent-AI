import { useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, Crown, Sparkles } from "lucide-react";

interface PlanGateProps {
  feature: "business_credit" | "unlimited_disputes" | "advanced_analytics" | "funding_tools";
  children: ReactNode;
  onUpgradeClick: () => void;
}

export function PlanGate({ feature, children, onUpgradeClick }: PlanGateProps) {
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAccess();
  }, [feature]);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    // Check if user is admin - admins get full access
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (adminRole) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    const { data: subscription } = await supabase
      .from("user_subscriptions")
      .select("plan_slug")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!subscription) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("slug", subscription.plan_slug)
      .maybeSingle();

    if (!plan) {
      setHasAccess(false);
      setLoading(false);
      return;
    }

    // Check feature access based on plan
    let access = false;
    switch (feature) {
      case "business_credit":
      case "funding_tools":
        access = plan.has_business_credit || plan.has_funding_tools;
        break;
      case "unlimited_disputes":
        access = plan.dispute_limit === null;
        break;
      case "advanced_analytics":
        access = plan.slug === "premium" || plan.slug === "enterprise";
        break;
      default:
        access = false;
    }

    setHasAccess(access);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  const featureMessages = {
    business_credit: {
      title: "Business Credit Building",
      description: "Access the B.U.I.L.D. Framework and start building business credit",
      icon: Crown,
    },
    unlimited_disputes: {
      title: "Unlimited Disputes",
      description: "Remove dispute limits and file as many disputes as you need",
      icon: Sparkles,
    },
    advanced_analytics: {
      title: "Advanced Analytics",
      description: "Get detailed insights and custom funding strategies",
      icon: Sparkles,
    },
    funding_tools: {
      title: "Funding Tools",
      description: "Access fundability assessments and funding offers",
      icon: Crown,
    },
  };

  const message = featureMessages[feature];
  const Icon = message.icon;

  return (
    <Card className="p-12 text-center bg-gradient-to-br from-background to-muted/20 border-2 border-dashed border-muted">
      <div className="max-w-md mx-auto space-y-6">
        <div className="w-20 h-20 rounded-full bg-gradient-gold/20 flex items-center justify-center mx-auto">
          <Lock className="w-10 h-10 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-2xl font-bold flex items-center justify-center gap-2">
            <Icon className="w-6 h-6 text-accent" />
            {message.title}
          </h3>
          <p className="text-muted-foreground">{message.description}</p>
        </div>

        <Button
          onClick={onUpgradeClick}
          className="bg-gradient-gold hover:opacity-90 shadow-glow gap-2"
          size="lg"
        >
          <Crown className="w-4 h-4" />
          Upgrade to Unlock
        </Button>

        <p className="text-xs text-muted-foreground">
          Start with 14-day free trial • No credit card required
        </p>
      </div>
    </Card>
  );
}