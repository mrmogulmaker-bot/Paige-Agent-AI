import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Crown, Sparkles, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradeBannerProps {
  onUpgradeClick: () => void;
}

export function UpgradeBanner({ onUpgradeClick }: UpgradeBannerProps) {
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [daysLeft, setDaysLeft] = useState<number>(0);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch subscription
    const { data: subData } = await supabase
      .from("user_subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (subData) {
      setSubscription(subData);
      
      // Calculate days left in trial
      if (subData.trial_ends_at) {
        const now = new Date();
        const trialEnd = new Date(subData.trial_ends_at);
        const diff = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        setDaysLeft(Math.max(0, diff));
      }

      // Fetch plan details
      const { data: planData } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("slug", subData.plan_slug)
        .single();
      
      setPlan(planData);
    }

    // Fetch usage
    const { data: usageData } = await supabase
      .from("user_usage")
      .select("*")
      .eq("user_id", user.id)
      .single();
    
    setUsage(usageData);
  };

  if (!subscription || !plan) return null;

  // Don't show for paid plans
  if (subscription.status === "active" && subscription.plan_slug !== "free") {
    return null;
  }

  const disputesUsed = usage?.disputes_used || 0;
  const disputesLimit = plan?.dispute_limit || 1;
  const disputesPercentage = (disputesUsed / disputesLimit) * 100;

  const aiChatsUsed = usage?.ai_chats_used || 0;
  const aiChatsLimit = plan?.ai_chat_limit || 10;
  const aiChatsPercentage = (aiChatsUsed / aiChatsLimit) * 100;

  return (
    <Card className="p-6 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border-primary/20 shadow-glow mb-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center shadow-glow">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold">
                {subscription.status === "trial" ? `${daysLeft} Days Left in Free Trial` : "Upgrade to Unlock Full Power"}
              </h3>
              <p className="text-sm text-muted-foreground">
                You're currently on the <span className="font-semibold text-foreground">{plan.name}</span> plan
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Disputes Used</span>
                <span className="font-semibold">{disputesUsed} / {disputesLimit}</span>
              </div>
              <Progress value={disputesPercentage} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AI Chats Used</span>
                <span className="font-semibold">{aiChatsUsed} / {aiChatsLimit}</span>
              </div>
              <Progress value={aiChatsPercentage} className="h-2" />
            </div>
          </div>

          {!plan.has_business_credit && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20">
              <TrendingUp className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-1">Unlock Business Credit Building</p>
                <p className="text-muted-foreground">Access the B.U.I.L.D. Framework and start building business credit today</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            onClick={onUpgradeClick}
            className="bg-gradient-gold hover:opacity-90 shadow-glow gap-2"
            size="lg"
          >
            <Sparkles className="w-4 h-4" />
            Upgrade Now
          </Button>
          {subscription.status === "trial" && (
            <p className="text-xs text-center text-muted-foreground">
              No credit card required
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}