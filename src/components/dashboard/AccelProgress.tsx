import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AccelProgressProps {
  onToggle?: () => void;
  onNavigate?: () => void;
}

export const AccelProgress = ({ onToggle, onNavigate }: AccelProgressProps) => {
  const steps = [
    { label: "Audit Reports", progress: 100, complete: true },
    { label: "Correct Inaccuracies", progress: 60, complete: false },
    { label: "Consolidate Accounts", progress: 40, complete: false },
    { label: "Expand Positive Credit", progress: 20, complete: false },
    { label: "Leverage Approvals", progress: 0, complete: false },
  ];

  return (
    <Card className="p-6 bg-card border-border shadow-card cursor-pointer hover:shadow-lg transition-shadow" onClick={() => onNavigate?.()}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">A.C.C.E.L.</h2>
          <p className="text-sm text-muted-foreground mt-1">Credit Repair Journey</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">44%</p>
            <p className="text-xs text-muted-foreground">Overall Progress</p>
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

      <div className="mt-6 p-5 bg-gradient-gold/20 rounded-lg border-2 border-primary shadow-glow animate-fade-in">
        <p className="text-base font-bold mb-2 text-foreground">Next Action</p>
        <p className="text-sm text-foreground">
          Review and submit 2 pending dispute letters for inaccurate items
        </p>
      </div>
    </Card>
  );
};
