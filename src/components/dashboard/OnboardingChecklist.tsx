import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Upload, Search, FileText, Building2, X, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  route: string;
  check: () => Promise<boolean>;
}

export const OnboardingChecklist = ({ userId }: { userId: string }) => {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const items: ChecklistItem[] = [
    {
      id: "upload_report",
      label: "Upload a Credit Report",
      description: "Upload your first credit report to unlock AI-powered insights",
      icon: Upload,
      route: "/app/credit",
      check: async () => {
        const { count } = await supabase
          .from("credit_report_uploads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        return (count ?? 0) > 0;
      },
    },
    {
      id: "review_accounts",
      label: "Review Your Accounts",
      description: "Check your tradelines and account details across all bureaus",
      icon: Search,
      route: "/app/credit",
      check: async () => {
        const { count } = await supabase
          .from("credit_accounts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        return (count ?? 0) > 0;
      },
    },
    {
      id: "start_dispute",
      label: "Start Your First Dispute",
      description: "Challenge inaccurate items on your credit report",
      icon: FileText,
      route: "/app/disputes",
      check: async () => {
        const { count } = await supabase
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        return (count ?? 0) > 0;
      },
    },
    {
      id: "add_business",
      label: "Set Up Your Business Profile",
      description: "Add your business to start building business credit",
      icon: Building2,
      route: "/app/business",
      check: async () => {
        const { count } = await supabase
          .from("businesses")
          .select("id", { count: "exact", head: true })
          .eq("owner_user_id", userId);
        return (count ?? 0) > 0;
      },
    },
  ];

  useEffect(() => {
    const dismissKey = `onboarding_dismissed_${userId}`;
    if (localStorage.getItem(dismissKey) === "true") {
      setDismissed(true);
      setLoading(false);
      return;
    }

    const checkAll = async () => {
      const results: Record<string, boolean> = {};
      await Promise.all(
        items.map(async (item) => {
          try {
            results[item.id] = await item.check();
          } catch {
            results[item.id] = false;
          }
        })
      );
      setCompleted(results);
      setLoading(false);

      // Auto-dismiss if all complete
      if (Object.values(results).every(Boolean)) {
        localStorage.setItem(dismissKey, "true");
        setDismissed(true);
      }
    };
    checkAll();
  }, [userId]);

  if (dismissed || loading) return null;

  const completedCount = Object.values(completed).filter(Boolean).length;
  const progress = (completedCount / items.length) * 100;

  return (
    <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <CardTitle className="text-base">Getting Started</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              localStorage.setItem(`onboarding_dismissed_${userId}`, "true");
              setDismissed(true);
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <Progress value={progress} className="h-1.5 flex-1" />
          <span className="text-xs text-muted-foreground font-medium">{completedCount}/{items.length}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {items.map((item) => {
          const done = completed[item.id];
          return (
            <button
              key={item.id}
              onClick={() => !done && navigate(item.route)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                done
                  ? "opacity-60"
                  : "hover:bg-accent/5 cursor-pointer"
              }`}
              disabled={done}
            >
              {done ? (
                <CheckCircle2 className="w-5 h-5 text-accent mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">{item.description}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};
