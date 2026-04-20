import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, ArrowRight, Bell, CheckCircle2, Clock, CreditCard,
  FileText, Loader2, Upload, Zap, TrendingDown, ShieldAlert
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { CreditScoreSimulator } from "./CreditScoreSimulator";
import { SeparationAuditCard } from "./business-profile/SeparationAuditCard";
import { PredictionsPanel } from "./PredictionsPanel";
import { UnlockProgramsBanner } from "./UnlockProgramsBanner";
import { JourneyDashboardCard } from "@/components/funding-journey/JourneyDashboardCard";

// ── Helpers ──

function scoreColor(score: number) {
  if (score >= 700) return "text-green-500";
  if (score >= 620) return "text-amber-500";
  return "text-red-500";
}

function scoreBorder(score: number) {
  if (score >= 700) return "border-green-500/30";
  if (score >= 620) return "border-amber-500/30";
  return "border-red-500/30";
}

// ── Shared hook for current user id ──

function useUserId() {
  return useQuery({
    queryKey: ["current-user-id"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id ?? null;
    },
  });
}

// ── Widget 1: Credit Score Summary ──

function CreditScoreSummary({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data: userId } = useUserId();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["dashboard-scores"],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu")
        .eq("user_id", userId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: hasReport } = useQuery({
    queryKey: ["dashboard-has-report"],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from("credit_report_uploads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      return (count ?? 0) > 0;
    },
  });

  const bureaus = [
    { label: "Experian", score: profile?.estimated_fico_ex as number | null, tab: "experian" },
    { label: "Equifax", score: profile?.estimated_fico_eq as number | null, tab: "equifax" },
    { label: "TransUnion", score: profile?.estimated_fico_tu as number | null, tab: "transunion" },
  ];

  const hasScores = bureaus.some(b => b.score && b.score > 0);

  return (
    <Card className="shadow-card col-span-full lg:col-span-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-accent" /> Credit Scores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : hasScores ? (
          <div className="grid grid-cols-3 gap-4">
            {bureaus.map(b => (
              <button
                key={b.label}
                onClick={() => onNavigate("personal")}
                className={`rounded-xl border p-4 text-center transition hover:bg-accent/5 ${b.score ? scoreBorder(b.score) : "border-border"}`}
              >
                <p className="text-xs text-muted-foreground mb-1">{b.label}</p>
                {b.score ? (
                  <p className={`text-3xl font-bold ${scoreColor(b.score)}`}>{b.score}</p>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground/40">—</p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Upload className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No credit report uploaded yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => onNavigate("report-upload")}>
              Upload Report
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Widget 2: Active Alerts ──

function ActiveAlerts({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data: userId } = useUserId();

  const { data: alerts } = useQuery({
    queryKey: ["dashboard-alerts"],
    enabled: !!userId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_alerts")
        .select("id, alert_severity, is_read")
        .eq("client_id", userId!)
        .eq("is_dismissed", false);
      const items = data || [];
      const critical = items.filter(a => a.alert_severity === "critical" && !a.is_read).length;
      const warning = items.filter(a => a.alert_severity === "warning" && !a.is_read).length;
      const total = items.filter(a => !a.is_read).length;
      return { critical, warning, total };
    },
  });

  const c = alerts?.critical ?? 0;
  const w = alerts?.warning ?? 0;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" /> Active Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {c > 0 && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-2xl font-bold text-red-500">{c}</span>
              <span className="text-xs text-muted-foreground">Critical</span>
            </div>
          )}
          {w > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-2xl font-bold text-amber-500">{w}</span>
              <span className="text-xs text-muted-foreground">Warning</span>
            </div>
          )}
          {c === 0 && w === 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm text-muted-foreground">No active alerts</span>
            </div>
          )}
        </div>
        {(alerts?.total ?? 0) > 0 && (
          <Button variant="link" size="sm" className="mt-2 px-0 h-auto text-accent" onClick={() => onNavigate("personal")}>
            View All <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Widget 3: Dispute Status ──

function DisputeStatus({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data: userId } = useUserId();

  const { data: counts } = useQuery({
    queryKey: ["dashboard-dispute-counts"],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("disputes")
        .select("status")
        .eq("user_id", userId!);
      const items = data || [];
      return {
        draft: items.filter(d => d.status === "draft").length,
        inProgress: items.filter(d => ["submitted", "in_progress", "under_review", "round_1_submitted", "round_2_submitted"].includes(d.status)).length,
        resolved: items.filter(d => d.status === "resolved").length,
      };
    },
  });

  const tiles = [
    { label: "Draft", count: counts?.draft ?? 0, icon: FileText, color: "text-muted-foreground" },
    { label: "In Progress", count: counts?.inProgress ?? 0, icon: Clock, color: "text-amber-500" },
    { label: "Resolved", count: counts?.resolved ?? 0, icon: CheckCircle2, color: "text-green-500" },
  ];

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" /> Disputes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {tiles.map(t => (
            <button
              key={t.label}
              onClick={() => onNavigate("personal")}
              className="rounded-lg border border-border p-3 text-center transition hover:bg-accent/5"
            >
              <t.icon className={`w-4 h-4 mx-auto mb-1 ${t.color}`} />
              <p className="text-xl font-bold">{t.count}</p>
              <p className="text-[10px] text-muted-foreground">{t.label}</p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Widget 4: Credit File Completion ──

function CreditFileCompletion({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data: userId } = useUserId();

  const { data: completion } = useQuery({
    queryKey: ["dashboard-file-completion"],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_accounts")
        .select("type, bureau_source, is_open")
        .eq("user_id", userId!);
      const accounts = data || [];
      const openAccounts = accounts.filter((a: any) => a.is_open !== false);

      // Optimal structure: 3 revolving, 2 installment, 1 mortgage, 1 auto, 3 other = 10
      const types = openAccounts.map((a: any) => (a.type || "").toLowerCase());
      const revolving = Math.min(types.filter(t => t === "credit_card").length, 3);
      const installment = Math.min(types.filter(t => ["personal_loan", "student_loan"].includes(t)).length, 2);
      const mortgage = Math.min(types.filter(t => t === "mortgage").length, 1);
      const auto = Math.min(types.filter(t => t === "auto_loan").length, 1);
      const other = Math.min(types.filter(t => !["credit_card", "personal_loan", "student_loan", "mortgage", "auto_loan"].includes(t)).length, 3);

      const filled = revolving + installment + mortgage + auto + other;
      return { filled, total: 10, pct: Math.round((filled / 10) * 100) };
    },
  });

  const pct = completion?.pct ?? 0;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-accent" /> File Completion
        </CardTitle>
      </CardHeader>
      <CardContent>
        <button onClick={() => onNavigate("personal")} className="w-full text-center">
          <div className="relative w-24 h-24 mx-auto">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-border" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" className="text-accent" strokeWidth="8"
                strokeDasharray={`${pct * 2.64} ${264 - pct * 2.64}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-bold">{pct}%</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{completion?.filled ?? 0} / 10 optimal accounts</p>
        </button>
      </CardContent>
    </Card>
  );
}

// ── Widget 5: Next Best Action ──

function NextBestAction({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data: userId } = useUserId();

  const { data: action } = useQuery({
    queryKey: ["dashboard-next-action"],
    enabled: !!userId,
    queryFn: async () => {
      // Priority 1: Critical alerts
      const { count: criticalCount } = await supabase
        .from("credit_alerts")
        .select("id", { count: "exact", head: true })
        .eq("client_id", userId!)
        .eq("alert_severity", "critical")
        .eq("is_dismissed", false)
        .eq("is_read", false);

      if ((criticalCount ?? 0) > 0) {
        return {
          title: "Review Critical Alert",
          description: `You have ${criticalCount} critical alert${criticalCount! > 1 ? "s" : ""} requiring immediate attention.`,
          icon: "alert",
          target: "personal",
        };
      }

      // Priority 2: High utilization
      const { data: factors } = await supabase
        .from("credit_factor_scores")
        .select("aggregate_utilization")
        .eq("user_id", userId!)
        .order("calculated_at", { ascending: false })
        .limit(1);

      const util = (factors as any)?.[0]?.aggregate_utilization;
      if (util != null && util > 30) {
        return {
          title: "Reduce Credit Utilization",
          description: `Your utilization is ${Math.round(util)}%. Pay down balances to below 30% for a score boost.`,
          icon: "paydown",
          target: "personal",
        };
      }

      // Priority 3: Draft disputes waiting
      const { count: draftCount } = await supabase
        .from("disputes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("status", "draft");

      if ((draftCount ?? 0) > 0) {
        return {
          title: "Submit Draft Disputes",
          description: `You have ${draftCount} dispute draft${draftCount! > 1 ? "s" : ""} ready to send.`,
          icon: "disputes",
          target: "personal",
        };
      }

      // Priority 4: Missing account types
      const { data: accounts } = await supabase
        .from("credit_accounts")
        .select("type, is_open")
        .eq("user_id", userId!);

      const open = (accounts || []).filter((a: any) => a.is_open !== false);
      const types = new Set(open.map((a: any) => a.type));
      const missing = ["credit_card", "auto_loan", "mortgage", "personal_loan"].find(t => !types.has(t));
      if (missing) {
        const labels: Record<string, string> = {
          credit_card: "Revolving Credit Card",
          auto_loan: "Auto Loan",
          mortgage: "Mortgage",
          personal_loan: "Installment Loan",
        };
        return {
          title: `Add a ${labels[missing] || missing}`,
          description: "A diverse credit mix strengthens your file and improves fundability.",
          icon: "gap",
          target: "personal",
        };
      }

      // Fallback
      return {
        title: "You're in Great Shape!",
        description: "Keep monitoring your credit and stay on top of payments.",
        icon: "ok",
        target: "personal",
      };
    },
  });

  const iconMap: Record<string, React.ElementType> = {
    alert: ShieldAlert,
    paydown: TrendingDown,
    disputes: FileText,
    gap: CreditCard,
    ok: CheckCircle2,
  };

  const Icon = action ? iconMap[action.icon] || Zap : Zap;

  return (
    <Card className="shadow-card border-accent/30 bg-gradient-to-br from-accent/10 to-transparent col-span-full lg:col-span-2">
      <CardContent className="py-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-1">Next Best Action</p>
          <p className="font-semibold text-foreground">{action?.title ?? "Loading..."}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{action?.description ?? ""}</p>
        </div>
        {action && action.icon !== "ok" && (
          <Button size="sm" variant="outline" className="shrink-0 mt-1" onClick={() => onNavigate(action.target)}>
            Go <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Widget 7: Quick Upload ──

function QuickUpload({ onNavigate }: { onNavigate: (section: string) => void }) {
  const { data: userId } = useUserId();

  const { data: hasReport } = useQuery({
    queryKey: ["dashboard-has-report"],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from("credit_report_uploads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!);
      return (count ?? 0) > 0;
    },
  });

  if (hasReport) return null;

  return (
    <Card className="shadow-card border-accent/40 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent col-span-full">
      <CardContent className="py-6 flex flex-col sm:flex-row items-center gap-4">
        <Upload className="w-10 h-10 text-accent shrink-0" />
        <div className="flex-1 text-center sm:text-left">
          <p className="font-semibold text-lg">Upload Your First Credit Report</p>
          <p className="text-sm text-muted-foreground">Get AI-powered analysis, dispute drafts, and a personalized action plan in minutes.</p>
        </div>
        <Button className="bg-gradient-gold hover:opacity-90 h-11 px-6 shrink-0" onClick={() => onNavigate("report-upload")}>
          <Upload className="w-4 h-4 mr-2" /> Upload Now
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Widget 6: Onboarding (reuses existing component) ──

// ── Main Command Center ──

interface DashboardCommandCenterProps {
  userId: string;
  onNavigate: (section: string) => void;
}

export function DashboardCommandCenter({ userId, onNavigate }: DashboardCommandCenterProps) {
  return (
    <div className="space-y-6">
      {/* Quick Upload - prominent for new users */}
      <QuickUpload onNavigate={onNavigate} />

      {/* Unlock Programs Built For You — banner shown only when demographics missing */}
      {userId && <UnlockProgramsBanner userId={userId} />}

      {/* Paige's Predictions — proactive intelligence */}
      <PredictionsPanel userId={userId} variant="compact" onNavigate={onNavigate} />

      {/* Top row: Scores + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CreditScoreSummary onNavigate={onNavigate} />
        <ActiveAlerts onNavigate={onNavigate} />
      </div>

      {/* Personal/Business Separation warning (only shows when there are issues) */}
      {userId && <SeparationAuditCard userId={userId} variant="compact" onFix={() => onNavigate("build-steps")} />}

      {/* Next Best Action */}
      <NextBestAction onNavigate={onNavigate} />

      {/* Credit Score Simulator */}
      {userId && <CreditScoreSimulator userId={userId} onNavigate={onNavigate} />}

      {/* Middle row: Disputes + File Completion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DisputeStatus onNavigate={onNavigate} />
        <CreditFileCompletion onNavigate={onNavigate} />
      </div>

      {/* Funding Journey summary */}
      <JourneyDashboardCard />

      {/* Onboarding Checklist */}
      <OnboardingChecklist userId={userId} />
    </div>
  );
}
