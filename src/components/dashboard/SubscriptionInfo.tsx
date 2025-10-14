import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Calendar, Settings } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { format } from "date-fns";

export function SubscriptionInfo({ onUpgradeClick }: { onUpgradeClick: () => void }) {
  const { subscribed, planSlug, subscriptionEnd, openCustomerPortal } = useSubscription();

  const planNames: Record<string, string> = {
    free: "Free Trial",
    starter: "Starter",
    professional: "Professional",
    premium: "Premium",
    enterprise: "Enterprise",
  };

  const planName = planNames[planSlug] || "Free Trial";
  const isPaidPlan = planSlug !== "free";

  return (
    <Card className="p-6 bg-gradient-to-br from-background to-muted/30 border-border">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-lg">
            <Crown className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Your Plan</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge 
                variant={isPaidPlan ? "default" : "outline"}
                className={isPaidPlan ? "bg-gradient-accent text-accent-foreground" : ""}
              >
                {planName}
              </Badge>
            </div>
          </div>
        </div>
        
        {isPaidPlan && (
          <Button
            variant="outline"
            size="sm"
            onClick={openCustomerPortal}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Manage
          </Button>
        )}
      </div>

      {subscriptionEnd && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Calendar className="w-4 h-4" />
          <span>
            {subscribed ? "Renews" : "Expires"} on{" "}
            {format(new Date(subscriptionEnd), "MMMM dd, yyyy")}
          </span>
        </div>
      )}

      {!isPaidPlan && (
        <div className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">
            Upgrade to unlock advanced features and accelerate your credit building journey.
          </p>
          <Button 
            onClick={onUpgradeClick}
            className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow"
          >
            Upgrade Now
          </Button>
        </div>
      )}
    </Card>
  );
}
