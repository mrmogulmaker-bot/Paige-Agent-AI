import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Lock, CheckCircle2, Circle } from "lucide-react";

export const BuildProgress = () => {
  const steps = [
    { label: "Base Setup", progress: 0, complete: false, locked: true },
    { label: "Utilize Tradelines", progress: 0, complete: false, locked: true },
    { label: "Increase Depth", progress: 0, complete: false, locked: true },
    { label: "Leverage Reports", progress: 0, complete: false, locked: true },
    { label: "Deploy Funding", progress: 0, complete: false, locked: true },
  ];

  return (
    <Card className="p-6 bg-card border-border shadow-card relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">B.U.I.L.D. Framework</h2>
            <p className="text-sm text-muted-foreground mt-1">Credit Building Path</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full">
            <Lock className="w-4 h-4 text-warning" />
            <span className="text-xs font-medium">Locked</span>
          </div>
        </div>

        <div className="space-y-4 opacity-60">
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

        <div className="mt-6 p-4 bg-gradient-gold/10 rounded-lg border border-primary/20">
          <p className="text-sm font-medium mb-1 text-primary">Unlock Requirement</p>
          <p className="text-xs text-muted-foreground">
            Complete A.C.C.E.L. framework and achieve 80% fundability score to unlock BUILD
          </p>
        </div>
      </div>
    </Card>
  );
};
