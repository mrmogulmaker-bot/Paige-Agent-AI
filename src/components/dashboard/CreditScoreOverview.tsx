import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, AlertCircle, CheckCircle } from "lucide-react";

export const CreditScoreOverview = () => {
  const currentScore = 650;
  const targetScore = 750;
  const scorePercentage = (currentScore / 850) * 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="col-span-1 md:col-span-2 p-6 bg-gradient-subtle border-border shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Credit Score Overview</h2>
          <TrendingUp className="w-5 h-5 text-success" />
        </div>
        
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-6xl font-bold bg-gradient-gold bg-clip-text text-transparent mb-2">
              {currentScore}
            </div>
            <p className="text-muted-foreground">Current Score</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress to Target ({targetScore})</span>
              <span className="font-medium">{Math.round((currentScore / targetScore) * 100)}%</span>
            </div>
            <Progress value={(currentScore / targetScore) * 100} className="h-3" />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Experian</p>
              <p className="text-lg font-bold">645</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Equifax</p>
              <p className="text-lg font-bold">652</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">TransUnion</p>
              <p className="text-lg font-bold">653</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border shadow-card">
        <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-success mt-0.5" />
            <div>
              <p className="font-medium text-sm">Active Disputes</p>
              <p className="text-2xl font-bold">3</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-sm">Derogatory Items</p>
              <p className="text-2xl font-bold">7</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Fundability Score</p>
              <p className="text-2xl font-bold">62%</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
