import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Crown } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [currentPlanSlug, setCurrentPlanSlug] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchPlans();
      fetchCurrentPlan();
    }
  }, [open]);

  const fetchPlans = async () => {
    const { data } = await supabase
      .from("subscription_plans")
      .select("*")
      .neq("slug", "free")
      .order("price", { ascending: true });
    
    if (data) setPlans(data);
  };

  const fetchCurrentPlan = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_subscriptions")
      .select("plan_slug")
      .eq("user_id", user.id)
      .single();
    
    if (data) setCurrentPlanSlug(data.plan_slug);
  };

  const handleSelectPlan = async (planSlug: string) => {
    setLoading(planSlug);
    
    // TODO: Integrate with Stripe when API key is available
    toast.info("Payment processing coming soon!", {
      description: "We're setting up Stripe. For now, contact support to upgrade."
    });
    
    setLoading(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold text-center">
            Choose Your{" "}
            <span className="bg-gradient-gold bg-clip-text text-transparent">
              Success Path
            </span>
          </DialogTitle>
          <p className="text-center text-muted-foreground mt-2">
            Unlock the full power of the ACCEL & BUILD frameworks
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {plans.map((plan) => {
            const features = Array.isArray(plan.features) ? plan.features : [];
            const isPopular = plan.slug === "professional";
            const isCurrent = plan.slug === currentPlanSlug;

            return (
              <Card
                key={plan.id}
                className={`p-6 relative ${
                  isPopular
                    ? "border-accent shadow-glow-lg scale-105"
                    : "border-border shadow-md"
                } transition-all duration-300 hover:shadow-glow`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-accent text-accent-foreground border-0">
                    Most Popular
                  </Badge>
                )}

                {isCurrent && (
                  <Badge className="absolute -top-3 right-4 bg-success text-success-foreground">
                    Current Plan
                  </Badge>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-6 min-h-[200px]">
                  {features.map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full ${
                    isPopular
                      ? "bg-gradient-gold hover:opacity-90 shadow-glow"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  size="lg"
                  onClick={() => handleSelectPlan(plan.slug)}
                  disabled={isCurrent || loading === plan.slug}
                >
                  {isCurrent ? "Current Plan" : loading === plan.slug ? "Processing..." : "Select Plan"}
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>All plans include 14-day free trial • Cancel anytime</p>
          <p className="mt-2">
            Questions? <button className="text-accent hover:underline">Contact support</button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}