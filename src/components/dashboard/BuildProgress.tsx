import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface BuildProgressProps {
  onToggle?: () => void;
}

export const BuildProgress = ({ onToggle }: BuildProgressProps) => {
  const navigate = useNavigate();
  const [creditMix, setCreditMix] = useState({
    secured_card: false,
    credit_builder_loan: false,
    authorized_user: false,
    unsecured_card: false,
    auto_loan: false,
    personal_loan: false,
    retail_card: false,
    mortgage: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCreditAccounts();
  }, []);

  const fetchCreditAccounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: accounts } = await supabase
        .from("credit_accounts")
        .select("type")
        .eq("user_id", user.id);

      if (accounts && accounts.length > 0) {
        const newCreditMix = { ...creditMix };
        accounts.forEach((account: any) => {
          if (account.type in newCreditMix) {
            newCreditMix[account.type as keyof typeof newCreditMix] = true;
          }
        });
        setCreditMix(newCreditMix);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching credit accounts:", error);
      setLoading(false);
    }
  };

  // Calculate progress for each phase
  const foundationAccounts = ['secured_card', 'credit_builder_loan', 'authorized_user'];
  const foundationProgress = Math.round(
    (foundationAccounts.filter(key => creditMix[key as keyof typeof creditMix]).length / foundationAccounts.length) * 100
  );

  const utilizationAccounts = ['unsecured_card', 'retail_card'];
  const utilizationProgress = Math.round(
    (utilizationAccounts.filter(key => creditMix[key as keyof typeof creditMix]).length / utilizationAccounts.length) * 100
  );

  const depthAccounts = ['auto_loan', 'personal_loan'];
  const depthProgress = Math.round(
    (depthAccounts.filter(key => creditMix[key as keyof typeof creditMix]).length / depthAccounts.length) * 100
  );

  const leverageProgress = foundationProgress >= 67 ? 80 : 0;
  const deployProgress = foundationProgress === 100 && utilizationProgress >= 50 ? 60 : 0;

  const overallProgress = Math.round((foundationProgress + utilizationProgress + depthProgress + leverageProgress + deployProgress) / 5);

  const steps = [
    { label: "Base Setup", progress: foundationProgress, complete: foundationProgress === 100 },
    { label: "Utilize Tradelines", progress: utilizationProgress, complete: utilizationProgress === 100 },
    { label: "Increase Depth", progress: depthProgress, complete: depthProgress === 100 },
    { label: "Leverage Reports", progress: leverageProgress, complete: leverageProgress >= 80 },
    { label: "Deploy Funding", progress: deployProgress, complete: deployProgress >= 60 },
  ];

  const totalAccounts = Object.values(creditMix).filter(Boolean).length;

  return (
    <Card className="p-6 bg-card border-border shadow-card relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/dashboard?section=personal-build')}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">B.U.I.L.D.</h2>
            <p className="text-sm text-muted-foreground mt-1">Credit Building Path</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">{totalAccounts} Accounts</span>
            </div>
            {onToggle && (
              <Button variant="ghost" size="icon" onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {step.complete ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground" />
                  )}
                  <span className="font-medium text-sm">{step.label}</span>
                </div>
                <span className="text-sm text-muted-foreground">{step.progress}%</span>
              </div>
              <Progress value={step.progress} className="h-2" />
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-gradient-gold/10 rounded-lg border border-primary/20 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium mb-1 text-primary">Overall Progress</p>
            <p className="text-xs text-muted-foreground">
              {overallProgress}% Complete
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-primary" />
        </div>
      </div>
    </Card>
  );
};
