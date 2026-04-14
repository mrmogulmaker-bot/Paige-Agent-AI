import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle, AlertTriangle, Circle, CreditCard, Car, Home,
  Landmark, Zap, UserCheck, Clock, ExternalLink, Loader2,
} from "lucide-react";
import { differenceInMonths } from "date-fns";

/* ─── Types ─── */
interface CreditAccount {
  id: string;
  creditor: string;
  type: string;
  is_open: boolean | null;
  is_authorized_user: boolean | null;
  credit_limit: number | null;
  limit_amount: number | null;
  balance: number | null;
  current_balance: number | null;
  account_open_date: string | null;
  account_close_date: string | null;
  opened_on: string | null;
  status: string | null;
}

interface FileCategory {
  key: string;
  label: string;
  icon: React.ReactNode;
  target: string;
  status: "complete" | "warning" | "missing";
  current: string;
  detail: string;
  action?: { label: string; href: string };
}

interface ComparableAccount {
  creditor: string;
  type: string;
  amount: number;
  projectedApproval: number;
  label: string;
}

/* ─── Helpers ─── */
function effectiveLimit(a: CreditAccount) {
  return a.credit_limit ?? a.limit_amount ?? 0;
}

function effectiveOpenDate(a: CreditAccount): Date | null {
  const d = a.account_open_date ?? a.opened_on;
  return d ? new Date(d) : null;
}

function isGoodStanding(a: CreditAccount) {
  const s = (a.status ?? "").toLowerCase();
  return !s.includes("collection") && !s.includes("charged") && !s.includes("delinquent");
}

function accountAgeMonths(a: CreditAccount): number | null {
  const d = effectiveOpenDate(a);
  if (!d) return null;
  return differenceInMonths(new Date(), d);
}

/* ─── Analysis engine ─── */
function analyzeFile(accounts: CreditAccount[]) {
  const primaryCards = accounts.filter(
    (a) => a.type === "credit_card" && !a.is_authorized_user && (a.is_open ?? true)
  );
  const primaryCardsAbove3k = primaryCards.filter((a) => effectiveLimit(a) >= 3000);
  const auAccounts = accounts.filter((a) => a.is_authorized_user);
  const openAU = auAccounts.filter((a) => a.is_open ?? true);

  // Rent reporting & utility: not standard account_types — check by creditor keywords
  const rentAccounts = accounts.filter((a) =>
    /(rent|lease|housing|creditrentboost)/i.test(a.creditor)
  );
  const utilityAccounts = accounts.filter((a) =>
    /(boost|utility|experian boost|self-reported)/i.test(a.creditor)
  );

  const autoLoans = accounts.filter((a) => a.type === "auto_loan");
  const autoOpen = autoLoans.filter((a) => a.is_open ?? true);
  const autoClosed = autoLoans.filter((a) => !(a.is_open ?? true) && isGoodStanding(a));

  const personalLoans = accounts.filter((a) => a.type === "personal_loan");
  const plOpen = personalLoans.filter((a) => a.is_open ?? true);
  const plClosed = personalLoans.filter((a) => !(a.is_open ?? true) && isGoodStanding(a));

  const mortgages = accounts.filter((a) => a.type === "mortgage");
  const mortOpen = mortgages.filter((a) => a.is_open ?? true);
  const mortClosed = mortgages.filter((a) => !(a.is_open ?? true) && isGoodStanding(a));

  // Credit age
  const ages = accounts.map(accountAgeMonths).filter((m): m is number => m !== null);
  const avgAgeMonths = ages.length ? Math.round(ages.reduce((s, v) => s + v, 0) / ages.length) : 0;
  const avgAgeYears = +(avgAgeMonths / 12).toFixed(1);

  // Comparable credit: closed accounts in good standing
  const comparable: ComparableAccount[] = [];
  accounts
    .filter((a) => !(a.is_open ?? true) && isGoodStanding(a))
    .forEach((a) => {
      const amt = effectiveLimit(a) || Number(a.balance ?? a.current_balance ?? 0);
      if (amt <= 0) return;
      const multiplier = 3; // personal side
      if (a.type === "credit_card") {
        comparable.push({ creditor: a.creditor, type: "revolving", amount: amt, projectedApproval: amt, label: "Historical — Comparable Revolving Credit" });
      } else if (a.type === "auto_loan") {
        comparable.push({ creditor: a.creditor, type: "auto", amount: amt, projectedApproval: amt * multiplier, label: "Historical — Comparable Auto Credit" });
      } else if (a.type === "personal_loan") {
        comparable.push({ creditor: a.creditor, type: "installment", amount: amt, projectedApproval: amt * multiplier, label: "Historical — Comparable Installment Credit" });
      } else if (a.type === "mortgage") {
        comparable.push({ creditor: a.creditor, type: "mortgage", amount: amt, projectedApproval: amt, label: "Historical — Comparable Mortgage Credit" });
      }
    });

  // Accounts impacting credit age
  const withAge = accounts
    .map((a) => ({ creditor: a.creditor, months: accountAgeMonths(a) }))
    .filter((x): x is { creditor: string; months: number } => x.months !== null)
    .sort((a, b) => b.months - a.months);

  const oldestAccounts = withAge.slice(0, 3);
  const newestAccounts = [...withAge].sort((a, b) => a.months - b.months).slice(0, 3);

  // Build categories
  const categories: FileCategory[] = [];

  // 1. Primary Credit Cards
  const pcCount = primaryCardsAbove3k.length;
  categories.push({
    key: "primary_cards",
    label: "Primary Credit Cards",
    icon: <CreditCard className="w-5 h-5" />,
    target: "2–4 above $3,000",
    status: pcCount >= 2 ? "complete" : "missing",
    current: `${pcCount} of 2–4`,
    detail: pcCount >= 2
      ? `You have ${pcCount} primary cards above $3,000. Your revolving credit foundation is solid.`
      : `You need ${2 - pcCount} more primary card(s) with limits above $3,000 to establish revolving credit depth.`,
  });

  // 2. Authorized User
  const auCount = openAU.length;
  categories.push({
    key: "authorized_user",
    label: "Authorized User Accounts",
    icon: <UserCheck className="w-5 h-5" />,
    target: "Maximum 2",
    status: auCount <= 2 ? "complete" : "warning",
    current: `${auCount} of 2 max`,
    detail: auCount <= 2
      ? `${auCount} authorized user account(s) — within the recommended limit.`
      : `You have ${auCount} authorized user accounts. We recommend removing yourself from ${auCount - 2} account(s) to keep this at 2 or fewer. Lenders view excessive authorized user accounts as credit padding which can hurt your fundability score.`,
  });

  // 3. Rent Reporting
  const hasRent = rentAccounts.length > 0;
  categories.push({
    key: "rent_reporting",
    label: "Rent Reporting",
    icon: <Home className="w-5 h-5" />,
    target: "1 tradeline",
    status: hasRent ? "complete" : "missing",
    current: hasRent ? "Active" : "Not reporting",
    detail: hasRent
      ? "Your rent payments are being reported. This strengthens payment history and credit age."
      : "Reporting rent payments adds a positive tradeline that improves payment history and credit age at no cost.",
    action: hasRent ? undefined : { label: "Start Rent Reporting", href: "https://affiliates.creditrentboost.com/?affi=00498" },
  });

  // 4. Utility Reporting
  const hasUtility = utilityAccounts.length > 0;
  categories.push({
    key: "utility_reporting",
    label: "Utility / Streaming Reporting",
    icon: <Zap className="w-5 h-5" />,
    target: "1 account",
    status: hasUtility ? "complete" : "missing",
    current: hasUtility ? "Active" : "Not reporting",
    detail: hasUtility
      ? "Utility or streaming payments are being reported to your credit file."
      : "Adding utility payments to your credit file improves credit age and payment history at no cost. Use Experian Boost to add utility and streaming payments to your Experian report.",
  });

  // 5. Auto Loan
  const hasAuto = autoOpen.length > 0 || autoClosed.length > 0;
  const autoStatus = autoOpen.length > 0 ? "Open" : autoClosed.length > 0 ? "Historical — Comparable Credit Available" : "Missing";
  categories.push({
    key: "auto_loan",
    label: "Auto Loan",
    icon: <Car className="w-5 h-5" />,
    target: "1 (open or closed in good standing)",
    status: hasAuto ? "complete" : "missing",
    current: autoStatus,
    detail: hasAuto
      ? autoOpen.length > 0
        ? "You have an active auto loan contributing to your installment credit mix."
        : "Your closed auto loan in good standing serves as comparable credit for future auto financing."
      : "An auto loan tradeline completes your installment credit history and provides comparable credit for future vehicle financing.",
  });

  // 6. Personal Loan
  const hasPL = plOpen.length > 0 || plClosed.length > 0;
  const plStatus = plOpen.length > 0 ? "Open" : plClosed.length > 0 ? "Historical — Comparable Credit" : "Missing";
  categories.push({
    key: "personal_loan",
    label: "Personal Loan",
    icon: <Landmark className="w-5 h-5" />,
    target: "1 (open or closed in good standing)",
    status: hasPL ? "complete" : "missing",
    current: plStatus,
    detail: hasPL
      ? "Your personal loan history strengthens your installment credit mix."
      : "A personal loan completes your credit mix and improves your installment credit history. Consider a credit builder loan if you do not need to take on additional debt at this time.",
    action: hasPL ? undefined : { label: "Credit Builder Loan — Credit Strong", href: "https://creditstrong.referralrock.com/l/3ANTONIO94/" },
  });

  // 7. Mortgage
  const hasMort = mortOpen.length > 0 || mortClosed.length > 0;
  const mortStatus = mortOpen.length > 0 ? "Open" : mortClosed.length > 0 ? "Historical — Comparable Credit" : "Missing";
  categories.push({
    key: "mortgage",
    label: "Mortgage",
    icon: <Home className="w-5 h-5" />,
    target: "1 (open or closed in good standing)",
    status: hasMort ? "complete" : "missing",
    current: mortStatus,
    detail: hasMort
      ? "A mortgage is the most valuable primary tradeline on a consumer file. This significantly strengthens your fundability profile."
      : "A mortgage is the most valuable tradeline on a consumer file. Even a modest mortgage significantly improves your fundability profile with most lenders.",
  });

  const completedCount = categories.filter((c) => c.status === "complete").length;
  const totalCategories = categories.length;
  const completionPct = Math.round((completedCount / totalCategories) * 100);

  const totalOpen = accounts.filter((a) => a.is_open ?? true).length;

  return {
    categories,
    comparable,
    avgAgeMonths,
    avgAgeYears,
    oldestAccounts,
    newestAccounts,
    completedCount,
    totalCategories,
    completionPct,
    totalOpen,
    primaryCardsAbove3k: pcCount,
    auCount,
  };
}

/* ─── Component ─── */
export function CreditFileHealthAssessment() {
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["credit-accounts-health"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase
        .from("credit_accounts")
        .select("*")
        .eq("user_id", session.user.id)
        .order("creditor");
      if (error) throw error;
      return (data || []) as CreditAccount[];
    },
  });

  const analysis = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    return analyzeFile(accounts);
  }, [accounts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <Card className="p-6 text-center">
        <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-semibold text-lg">Upload a credit report to see your file health assessment</h3>
        <p className="text-muted-foreground text-sm mt-2">
          Once Paige analyzes your credit report, your file structure, comparable credit, and credit age will appear here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Credit File Health Assessment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your credit file evaluated against the optimal 10-account structure.
        </p>
      </div>

      {/* Component 1 — File Completion Scorecard */}
      <FileCompletionScorecard analysis={analysis} />

      {/* Component 2 — Comparable Credit Panel */}
      {analysis.comparable.length > 0 && (
        <ComparableCreditPanel comparable={analysis.comparable} />
      )}

      {/* Component 3 — Credit Age Gauge */}
      <CreditAgeGauge analysis={analysis} />
    </div>
  );
}

/* ─── Component 1: File Completion Scorecard ─── */
function FileCompletionScorecard({ analysis }: { analysis: ReturnType<typeof analyzeFile> }) {
  return (
    <Card className="p-6 bg-card border-border">
      {/* Overview bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="font-semibold text-foreground">File Structure Scorecard</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {analysis.completedCount} of {analysis.totalCategories} account types met ·{" "}
            {analysis.totalOpen} open accounts of 10 target
          </p>
        </div>
        <div className="flex items-center gap-3 min-w-[160px]">
          <Progress value={analysis.completionPct} className="h-2.5 flex-1" />
          <span className="text-sm font-bold text-foreground whitespace-nowrap">
            {analysis.completionPct}%
          </span>
        </div>
      </div>

      {/* Account count note */}
      {analysis.totalOpen > 10 && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 mb-4">
          <p className="text-xs text-amber-300">
            You have {analysis.totalOpen} open accounts. Quality matters more than quantity — review
            for redundant accounts that may signal credit-seeking behavior.
          </p>
        </div>
      )}

      {/* Category cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {analysis.categories.map((cat) => (
          <div
            key={cat.key}
            className={`rounded-lg border p-4 transition-colors ${
              cat.status === "complete"
                ? "border-fundability-excellent/30 bg-fundability-excellent/5"
                : cat.status === "warning"
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {cat.status === "complete" ? (
                  <CheckCircle className="w-5 h-5 text-fundability-excellent" />
                ) : cat.status === "warning" ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {cat.icon}
                  <span className="font-medium text-sm text-foreground">{cat.label}</span>
                  <Badge
                    variant={
                      cat.status === "complete"
                        ? "default"
                        : cat.status === "warning"
                        ? "secondary"
                        : "outline"
                    }
                    className={`text-[10px] px-1.5 py-0 ${
                      cat.status === "complete"
                        ? "bg-fundability-excellent/20 text-fundability-excellent border-fundability-excellent/30"
                        : cat.status === "warning"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : ""
                    }`}
                  >
                    {cat.current}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {cat.detail}
                </p>

                {/* Navy Federal note for personal loans */}
                {cat.key === "personal_loan" && cat.status === "missing" && (
                  <p className="text-xs text-muted-foreground mt-1 italic">
                    Navy Federal members: consider a{" "}
                    <a
                      href="https://www.navyfederal.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline"
                    >
                      Pledge Loan
                    </a>{" "}
                    for low-risk installment credit.
                  </p>
                )}

                {cat.action && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs gap-1.5"
                    asChild
                  >
                    <a href={cat.action.href} target="_blank" rel="noopener noreferrer">
                      {cat.action.label}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Component 2: Comparable Credit Panel ─── */
function ComparableCreditPanel({ comparable }: { comparable: ComparableAccount[] }) {
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="font-semibold text-foreground mb-1">Comparable Credit History</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Closed accounts in good standing that lenders use to determine future approval amounts.
        Personal credit uses a 3× multiplier for installment tradelines.
      </p>
      <div className="space-y-3">
        {comparable.map((c, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-3 gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">{c.creditor}</p>
              <p className="text-xs text-accent">{c.label}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">
                ${c.amount.toLocaleString()}
              </p>
              {c.type !== "revolving" && c.type !== "mortgage" && (
                <p className="text-xs text-muted-foreground">
                  Projected approval: up to ${c.projectedApproval.toLocaleString()}
                </p>
              )}
              {c.type === "revolving" && (
                <p className="text-xs text-muted-foreground">
                  Comparable revolving limit: ${c.amount.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Component 3: Credit Age Gauge ─── */
function CreditAgeGauge({ analysis }: { analysis: ReturnType<typeof analyzeFile> }) {
  const targetYears = 5;
  const pct = Math.min((analysis.avgAgeYears / targetYears) * 100, 100);
  const isHealthy = analysis.avgAgeYears >= targetYears;

  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="font-semibold text-foreground mb-1">Credit Age</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Target: 5+ years average across all accounts.
      </p>

      {/* Gauge */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="relative h-4 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isHealthy ? "bg-fundability-excellent" : "bg-amber-500"
              }`}
              style={{ width: `${pct}%` }}
            />
            {/* 5-year marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
              style={{ left: "100%" }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">0 yrs</span>
            <span className="text-[10px] text-muted-foreground">5 yrs target</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-2xl font-bold ${isHealthy ? "text-fundability-excellent" : "text-amber-500"}`}>
            {analysis.avgAgeYears}
          </span>
          <span className="text-xs text-muted-foreground ml-1">years</span>
        </div>
      </div>

      {/* Status message */}
      {isHealthy ? (
        <p className="text-xs text-fundability-excellent">
          ✓ Your average credit age of {analysis.avgAgeYears} years is strong. Protect this by
          limiting unnecessary new account applications.
        </p>
      ) : (
        <p className="text-xs text-amber-400">
          Your average credit age is below the 5-year target. Avoid opening new accounts
          unnecessarily until your average age improves.
        </p>
      )}

      {/* Oldest / Newest accounts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {analysis.oldestAccounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground flex items-center gap-1 mb-2">
              <Clock className="w-3.5 h-3.5 text-fundability-excellent" /> Oldest Accounts
            </p>
            {analysis.oldestAccounts.map((a, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {a.creditor} — {Math.round(a.months / 12 * 10) / 10} yrs
              </p>
            ))}
          </div>
        )}
        {analysis.newestAccounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground flex items-center gap-1 mb-2">
              <Clock className="w-3.5 h-3.5 text-amber-500" /> Newest Accounts
            </p>
            {analysis.newestAccounts.map((a, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {a.creditor} — {Math.round(a.months / 12 * 10) / 10} yrs
              </p>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
