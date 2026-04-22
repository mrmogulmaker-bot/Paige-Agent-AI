import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Target, Clock, DollarSign, Settings2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trackEvent } from "@/hooks/useAnalytics";

export interface FundingGoals {
  objective: string;
  objectiveOther?: string;
  targetAmount: string;
  timeline: string;
}

const OBJECTIVES = [
  { value: "build_credit", label: "Build Credit Infrastructure" },
  { value: "working_capital", label: "Business Working Capital" },
  { value: "equipment_vehicle", label: "Equipment or Vehicle Purchase" },
  { value: "real_estate", label: "Real Estate Purchase or Investment" },
  { value: "business_acquisition", label: "Business Acquisition" },
  { value: "other", label: "Other" },
];

const AMOUNTS = [
  { value: "under_50k", label: "Under $50K" },
  { value: "50k_250k", label: "$50K – $250K" },
  { value: "250k_1m", label: "$250K – $1M" },
  { value: "over_1m", label: "Over $1M" },
];

const TIMELINES = [
  { value: "90_days", label: "Within 90 Days", sublabel: "Urgent" },
  { value: "6_months", label: "Within 6 Months", sublabel: "" },
  { value: "12_months", label: "Within 12 Months", sublabel: "" },
  { value: "long_term", label: "Building Long Term", sublabel: "12+ months" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingGoals?: FundingGoals | null;
  onSaved: () => void;
}

export function FundingGoalIntake({ open, onOpenChange, existingGoals, onSaved }: Props) {
  const [objective, setObjective] = useState(existingGoals?.objective || "");
  const [objectiveOther, setObjectiveOther] = useState(existingGoals?.objectiveOther || "");
  const [targetAmount, setTargetAmount] = useState(existingGoals?.targetAmount || "");
  const [timeline, setTimeline] = useState(existingGoals?.timeline || "");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const canSave = objective && targetAmount && timeline && (objective !== "other" || objectiveOther.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const goals: FundingGoals = { objective, objectiveOther: objective === "other" ? objectiveOther.trim() : undefined, targetAmount, timeline };

      const { error } = await supabase
        .from("profiles")
        .update({ funding_goals: goals as any })
        .eq("user_id", user.id);

      if (error) throw error;

      void trackEvent("goal_set", "activation", {
        goal_type: objective,
        target_amount: targetAmount,
        timeline,
      });

      queryClient.invalidateQueries({ queryKey: ["funding-profile-complete"] });
      toast.success("Funding goals saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Failed to save: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-32px)] max-w-[600px] max-h-[90vh] overflow-y-auto p-6 sm:p-8">
        <DialogHeader>
          <DialogTitle className="text-xl">Set Your Funding Goal</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This helps us show only the products relevant to your objective and prioritize the right pathway.
          </p>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Objective */}
          <div>
            <Label className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-accent" /> Primary Funding Objective
            </Label>
            <div className="grid grid-cols-1 gap-2">
              {OBJECTIVES.map(o => (
                <button
                  key={o.value}
                  onClick={() => setObjective(o.value)}
                  className={`text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                    objective === o.value
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {o.label}
                    {objective === o.value && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </div>
                </button>
              ))}
              {objective === "other" && (
                <Input
                  placeholder="Describe your funding objective..."
                  value={objectiveOther}
                  onChange={e => setObjectiveOther(e.target.value)}
                  className="mt-1"
                  maxLength={200}
                />
              )}
            </div>
          </div>

          {/* Target Amount */}
          <div>
            <Label className="text-sm font-semibold flex items-center gap-2 mb-3">
              <DollarSign className="w-4 h-4 text-gold" /> Target Funding Amount
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {AMOUNTS.map(a => (
                <button
                  key={a.value}
                  onClick={() => setTargetAmount(a.value)}
                  className={`px-4 py-3 rounded-lg border text-sm transition-all ${
                    targetAmount === a.value
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <Label className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-fundability-fair" /> Target Timeline
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {TIMELINES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setTimeline(t.value)}
                  className={`px-4 py-3 rounded-lg border text-sm transition-all text-left ${
                    timeline === t.value
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  {t.label}
                  {t.sublabel && <span className="block text-xs text-muted-foreground">{t.sublabel}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={!canSave || saving} className="w-full mt-4 bg-gradient-gold hover:opacity-90">
          {saving ? "Saving..." : existingGoals ? "Update Funding Goals" : "Set Funding Goals"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* Header banner showing current goal */
export function FundingGoalBanner({ goals, onEdit }: { goals: FundingGoals; onEdit: () => void }) {
  const objLabel = OBJECTIVES.find(o => o.value === goals.objective)?.label || goals.objectiveOther || goals.objective;
  const amtLabel = AMOUNTS.find(a => a.value === goals.targetAmount)?.label || goals.targetAmount;
  const tlLabel = TIMELINES.find(t => t.value === goals.timeline)?.label || goals.timeline;

  return (
    <Card className="p-4 bg-accent/5 border-accent/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <Target className="w-5 h-5 text-accent shrink-0" />
          <span className="text-sm font-medium text-foreground">Optimized for:</span>
          <Badge variant="outline" className="border-accent/30 text-accent">{objLabel}</Badge>
          <Badge variant="outline" className="border-gold/30 text-gold">{amtLabel}</Badge>
          <Badge variant="outline" className="border-fundability-fair/30 text-fundability-fair">{tlLabel}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit} className="shrink-0">
          <Settings2 className="w-4 h-4 mr-1" /> Edit
        </Button>
      </div>
    </Card>
  );
}

/* Goal-aware helpers for filtering and prioritization */
export function getGoalRelevanceBoost(productType: string, goals: FundingGoals): number {
  const t = productType?.toLowerCase().replace(/\s+/g, "_") || "";
  const obj = goals.objective;

  // Primary match = +20, secondary = +10, prerequisite = 0 (shown in separate section)
  if (obj === "build_credit") {
    if (t.includes("credit_builder") || t.includes("secured")) return 20;
    if (t.includes("personal_credit_card")) return 10;
    return 0;
  }
  if (obj === "working_capital") {
    if (t.includes("line_of_credit") || t.includes("loc")) return 20;
    if (t.includes("revenue") || t.includes("merchant") || t.includes("factoring")) return 15;
    if (t.includes("term_loan") || t.includes("business_loan")) return 10;
    return 0;
  }
  if (obj === "equipment_vehicle") {
    if (t.includes("equipment")) return 20;
    if (t.includes("term") || t.includes("sba")) return 10;
    return 0;
  }
  if (obj === "real_estate") {
    if (t.includes("sba_504") || t.includes("real_estate") || t.includes("commercial")) return 20;
    if (t.includes("sba") || t.includes("term")) return 10;
    return 0;
  }
  if (obj === "business_acquisition") {
    if (t.includes("sba_7a") || t.includes("sba")) return 20;
    if (t.includes("term")) return 10;
    return 0;
  }
  return 5; // "other" — no preference
}

export function isPrerequisiteProduct(productType: string, goals: FundingGoals): boolean {
  const t = productType?.toLowerCase().replace(/\s+/g, "_") || "";
  const obj = goals.objective;

  // Credit builders are prerequisites for everything except "build_credit"
  if (obj !== "build_credit" && (t.includes("credit_builder") || t.includes("secured_card"))) {
    return true;
  }
  return false;
}

export function getTimelineUrgencySort(productType: string, goals: FundingGoals): number {
  if (goals.timeline !== "90_days") return 0;
  const t = productType?.toLowerCase().replace(/\s+/g, "_") || "";
  // Fast products get priority for urgent timelines
  if (t.includes("merchant") || t.includes("revenue_based") || t.includes("factoring")) return 2;
  if (t.includes("line_of_credit") || t.includes("loc")) return 1;
  return 0;
}
