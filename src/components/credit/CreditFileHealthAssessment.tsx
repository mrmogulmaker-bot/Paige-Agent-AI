import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle, AlertTriangle, Circle, CreditCard, Car, Home,
  Landmark, Zap, UserCheck, Clock, ExternalLink, Loader2, ChevronDown,
  ChevronRight, Target,
} from "lucide-react";
import { differenceInMonths } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

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
  suggestion?: SuggestionContent;
  priority: "critical" | "important" | "enhancement";
}

interface SuggestionContent {
  whyItMatters: string;
  recommendation: string;
  whereToGetIt?: string;
  impact: string;
  ctas?: { label: string; href: string }[];
  disclaimer?: string;
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

/* ─── Suggestion content for each gap ─── */
function getSuggestion(key: string, analysis: ReturnType<typeof analyzeFile>): SuggestionContent | undefined {
  const map: Record<string, () => SuggestionContent> = {
    primary_cards: () => ({
      whyItMatters: "Primary credit cards with limits above $3,000 are the foundation of your revolving credit profile. Lenders look for 2 to 4 primary cards to confirm you can manage revolving debt responsibly.",
      recommendation: "Apply for a primary credit card where you are the account holder — not an authorized user. Target cards with no annual fee and a starting limit above $3,000. Credit unions and community banks often have more flexible approval criteria than major banks.",
      whereToGetIt: "If your score is below 640 start with a secured card that reports to all three bureaus and graduates to unsecured. Navy Federal Credit Union, Local First Credit Union, and DCU are strong options for members.",
      impact: "Each primary card above $3,000 improves your available revolving credit, reduces your overall utilization percentage, and strengthens your comparable credit for future applications.",
    }),
    authorized_user: () => ({
      whyItMatters: "Having more than 2 authorized user accounts signals credit padding to lenders and underwriters. While AU accounts help with utilization and credit age, too many suggest you are relying on someone else's credit history rather than your own.",
      recommendation: `Remove yourself from ${analysis.auCount - 2} authorized user account(s). Keep the 2 that have the highest limits and longest history since those provide the most benefit to your utilization ratio and average credit age.`,
      whereToGetIt: "Contact the primary cardholder on each account you want to be removed from and ask them to call their card issuer to remove you as an authorized user. This is a simple phone call and takes effect within 30 to 60 days.",
      impact: "Reducing to 2 or fewer AU accounts strengthens your primary tradeline profile and removes a flag that sophisticated lenders use to discount your apparent credit strength.",
    }),
    rent_reporting: () => ({
      whyItMatters: "Rent is your largest monthly payment and most credit files do not reflect it at all. Adding rent reporting creates a positive payment history tradeline that improves your credit age and demonstrates consistent payment behavior.",
      recommendation: "Sign up for rent reporting through CreditRentBoost. Your rent payments will be reported to the credit bureaus as a positive tradeline. This is one of the easiest ways to add a tradeline with zero new debt.",
      impact: "Rent reporting adds a positive installment-style tradeline to your file and can improve credit age if you have been renting for several years. Most clients see measurable score improvement within 60 to 90 days of adding rent reporting.",
      ctas: [{ label: "Start Rent Reporting — CreditRentBoost", href: "https://affiliates.creditrentboost.com/?affi=00498" }],
    }),
    utility_reporting: () => ({
      whyItMatters: "Utility payments like electricity, water, gas, and streaming services are regular monthly obligations that most credit files do not capture. Adding them strengthens your payment history and can improve your score at no cost.",
      recommendation: "Use Experian Boost to add utility and streaming payments to your Experian credit report. This is free, takes about 5 minutes to set up, and only adds positive information — it never hurts your score.",
      impact: "Experian Boost only applies to your Experian score but since many lenders pull Experian this can directly improve your approval odds. Clients with thin files often see the largest score increases from this addition.",
      ctas: [{ label: "Add Utilities with Experian Boost", href: "https://www.experian.com/consumer-products/score-boost.html" }],
    }),
    auto_loan: () => ({
      whyItMatters: "An auto loan is a key installment tradeline that demonstrates your ability to manage large recurring payments over time. Lenders view auto loan history as strong evidence of financial responsibility.",
      recommendation: "If you are planning a vehicle purchase in the next 12 months, now is the time to structure it strategically. Use your existing comparable credit history to determine the right loan amount to target. If you are not planning a vehicle purchase a credit builder loan serves a similar purpose without requiring a large purchase.",
      impact: "An installment loan in good standing improves your credit mix, adds to your payment history, and creates comparable credit for future financing. On the personal side lenders typically approve up to 3x your highest comparable auto tradeline for your next vehicle.",
      ctas: [{ label: "Build Credit with Credit Strong", href: "https://creditstrong.referralrock.com/l/3ANTONIO94/" }],
    }),
    personal_loan: () => ({
      whyItMatters: "A personal loan completes your installment credit mix. Lenders want to see that you can manage both revolving credit (cards) and installment credit (loans) responsibly. A file with only credit cards is considered less balanced than one with both.",
      recommendation: "A credit builder loan is the lowest-risk way to establish a personal loan tradeline if you do not need to borrow for a specific purpose. These products are designed specifically to build credit history and report to all three bureaus.",
      impact: "Adding a personal loan tradeline improves your credit mix score factor, adds positive payment history, and creates installment comparable credit for future loan applications.",
      ctas: [
        { label: "Credit Strong Credit Builder", href: "https://creditstrong.referralrock.com/l/3ANTONIO94/" },
        { label: "Navy Federal Pledge Loan", href: "https://www.navyfederal.org" },
      ],
      disclaimer: "We never recommend taking on debt you do not need. A credit builder loan is structured so the funds are held in a savings account while you make payments — you build credit and savings at the same time with minimal financial risk.",
    }),
    mortgage: () => ({
      whyItMatters: "A mortgage is the most valuable primary tradeline on a consumer credit report. It demonstrates asset ownership, long-term financial commitment, and the ability to manage the largest installment obligation most consumers carry. Even a mortgage as low as $50,000 to $75,000 has a significant positive impact on your fundability profile.",
      recommendation: "If homeownership is part of your financial plan, prioritizing a mortgage — even a modest one — is one of the highest-leverage moves you can make for your credit file. Work with a VA-approved lender if you are a veteran, an FHA lender if your score is between 580 and 620, or a conventional lender if your score is 620 or above.",
      impact: "A mortgage in good standing is the single most impactful tradeline you can add to a consumer credit file. It improves your credit mix, demonstrates asset ownership to lenders, and signals long-term financial stability to every capital source you approach.",
      ctas: [{ label: "Book a Strategy Session", href: "https://www.mogulmakeracademy.com/booking-screening.html" }],
    }),
    credit_age: () => ({
      whyItMatters: "Credit age accounts for approximately 15 percent of your FICO score. Lenders also use average credit age as an indicator of financial maturity. The target average is 5 years or more.",
      recommendation: "Protect your existing credit age by avoiding unnecessary new account applications. Every new account reduces your average age. Focus on keeping your oldest accounts open and in good standing. Adding rent reporting through CreditRentBoost can add years of rental payment history to your file which improves your effective credit age.",
      impact: "Credit age improves naturally over time. Avoid closing old accounts even if you do not use them regularly — an old account with zero balance still contributes positively to your average age.",
      ctas: [{ label: "Start Rent Reporting — CreditRentBoost", href: "https://affiliates.creditrentboost.com/?affi=00498" }],
    }),
  };
  const fn = map[key];
  return fn ? fn() : undefined;
}

/* ─── Analysis engine ─── */
function analyzeFile(accounts: CreditAccount[]) {
  const primaryCards = accounts.filter(
    (a) => a.type === "credit_card" && !a.is_authorized_user && (a.is_open ?? true)
  );
  const primaryCardsAbove3k = primaryCards.filter((a) => effectiveLimit(a) >= 3000);
  const auAccounts = accounts.filter((a) => a.is_authorized_user);
  const openAU = auAccounts.filter((a) => a.is_open ?? true);

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

  const ages = accounts.map(accountAgeMonths).filter((m): m is number => m !== null);
  const avgAgeMonths = ages.length ? Math.round(ages.reduce((s, v) => s + v, 0) / ages.length) : 0;
  const avgAgeYears = +(avgAgeMonths / 12).toFixed(1);

  const comparable: ComparableAccount[] = [];
  accounts
    .filter((a) => !(a.is_open ?? true) && isGoodStanding(a))
    .forEach((a) => {
      const amt = effectiveLimit(a) || Number(a.balance ?? a.current_balance ?? 0);
      if (amt <= 0) return;
      const multiplier = 3;
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

  const withAge = accounts
    .map((a) => ({ creditor: a.creditor, months: accountAgeMonths(a) }))
    .filter((x): x is { creditor: string; months: number } => x.months !== null)
    .sort((a, b) => b.months - a.months);

  const oldestAccounts = withAge.slice(0, 3);
  const newestAccounts = [...withAge].sort((a, b) => a.months - b.months).slice(0, 3);

  const pcCount = primaryCardsAbove3k.length;
  const auCount = openAU.length;
  const hasRent = rentAccounts.length > 0;
  const hasUtility = utilityAccounts.length > 0;
  const hasAuto = autoOpen.length > 0 || autoClosed.length > 0;
  const hasPL = plOpen.length > 0 || plClosed.length > 0;
  const hasMort = mortOpen.length > 0 || mortClosed.length > 0;
  const creditAgeOk = avgAgeYears >= 5;

  // We'll build categories after we have auCount to pass to getSuggestion
  const partialAnalysis = { auCount, primaryCardsAbove3k: pcCount, avgAgeYears, avgAgeMonths, comparable, oldestAccounts, newestAccounts, totalOpen: 0, completedCount: 0, totalCategories: 0, completionPct: 0, categories: [] as FileCategory[] };

  const categories: FileCategory[] = [];

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
    suggestion: pcCount < 2 ? getSuggestion("primary_cards", partialAnalysis as any) : undefined,
    priority: "critical",
  });

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
    suggestion: auCount > 2 ? getSuggestion("authorized_user", partialAnalysis as any) : undefined,
    priority: "critical",
  });

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
    suggestion: !hasRent ? getSuggestion("rent_reporting", partialAnalysis as any) : undefined,
    priority: "enhancement",
  });

  categories.push({
    key: "utility_reporting",
    label: "Utility / Streaming Reporting",
    icon: <Zap className="w-5 h-5" />,
    target: "1 account",
    status: hasUtility ? "complete" : "missing",
    current: hasUtility ? "Active" : "Not reporting",
    detail: hasUtility
      ? "Utility or streaming payments are being reported to your credit file."
      : "Adding utility payments to your credit file improves credit age and payment history at no cost.",
    suggestion: !hasUtility ? getSuggestion("utility_reporting", partialAnalysis as any) : undefined,
    priority: "enhancement",
  });

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
    suggestion: !hasAuto ? getSuggestion("auto_loan", partialAnalysis as any) : undefined,
    priority: "important",
  });

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
      : "A personal loan completes your credit mix and improves your installment credit history.",
    suggestion: !hasPL ? getSuggestion("personal_loan", partialAnalysis as any) : undefined,
    priority: "important",
  });

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
    suggestion: !hasMort ? getSuggestion("mortgage", partialAnalysis as any) : undefined,
    priority: "critical",
  });

  // Credit age as a category
  categories.push({
    key: "credit_age",
    label: "Credit Age",
    icon: <Clock className="w-5 h-5" />,
    target: "5+ years average",
    status: creditAgeOk ? "complete" : "missing",
    current: `${avgAgeYears} years`,
    detail: creditAgeOk
      ? `Your average credit age of ${avgAgeYears} years is strong. Protect this by limiting unnecessary new account applications.`
      : `Your average credit age is ${avgAgeYears} years, below the 5-year target. Avoid opening new accounts unnecessarily.`,
    suggestion: !creditAgeOk ? getSuggestion("credit_age", partialAnalysis as any) : undefined,
    priority: "enhancement",
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

/* ─── Exported helper for chat context ─── */
export function buildHealthAssessmentContext(analysis: ReturnType<typeof analyzeFile>): string {
  const parts: string[] = [];
  parts.push(`Credit File Health Assessment:`);
  parts.push(`File Completion: ${analysis.completedCount} of ${analysis.totalCategories} account types present`);

  const missing = analysis.categories.filter(c => c.status !== "complete").map(c => c.label);
  if (missing.length) parts.push(`Missing Items: ${missing.join(", ")}`);

  const warnings = analysis.categories.filter(c => c.status === "warning").map(c => `${c.label}: ${c.current}`);
  if (warnings.length) parts.push(`Warnings: ${warnings.join("; ")}`);

  if (analysis.comparable.length > 0) {
    const compLines = analysis.comparable.map(c => `${c.creditor} (${c.type}) $${c.amount.toLocaleString()} → projected $${c.projectedApproval.toLocaleString()}`);
    parts.push(`Comparable Credit Available: ${compLines.join("; ")}`);
  }

  parts.push(`Average Credit Age: ${analysis.avgAgeYears} years — ${analysis.avgAgeYears >= 5 ? "above" : "below"} 5-year target`);

  // Priority action
  const priorityOrder: Record<string, number> = { critical: 0, important: 1, enhancement: 2 };
  const topGap = analysis.categories
    .filter(c => c.status !== "complete")
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9))[0];
  if (topGap) parts.push(`Priority Action: ${topGap.label} — ${topGap.detail}`);

  return parts.join("\n");
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

      {/* Component 4 — Priority Action List */}
      <PriorityActionList analysis={analysis} />
    </div>
  );
}

/* ─── Suggestion Card ─── */
function SuggestionCard({ suggestion, isMobile }: { suggestion: SuggestionContent; isMobile: boolean }) {
  const [open, setOpen] = useState(!isMobile);

  const content = (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-accent mb-1">Why it matters</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.whyItMatters}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-accent mb-1">Recommendation</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.recommendation}</p>
      </div>
      {suggestion.whereToGetIt && (
        <div>
          <p className="text-xs font-medium text-accent mb-1">Where to get it</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.whereToGetIt}</p>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-accent mb-1">Impact on your file</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{suggestion.impact}</p>
      </div>
      {suggestion.ctas && suggestion.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {suggestion.ctas.map((cta, i) => (
            <Button
              key={i}
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 border-accent/40 text-accent hover:bg-accent/10"
              asChild
            >
              <a href={cta.href} target="_blank" rel="noopener noreferrer">
                {cta.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          ))}
        </div>
      )}
      {suggestion.disclaimer && (
        <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed pt-1">{suggestion.disclaimer}</p>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="mt-2 rounded-md border-l-4 border-accent/60 bg-muted/40 p-3">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-accent font-medium w-full text-left">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {open ? "Hide Recommendation" : "See Recommendation"}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">{content}</CollapsibleContent>
        </div>
      </Collapsible>
    );
  }

  return (
    <div className="mt-2 rounded-md border-l-4 border-accent/60 bg-muted/40 p-4">
      {content}
    </div>
  );
}

/* ─── Component 1: File Completion Scorecard ─── */
function FileCompletionScorecard({ analysis }: { analysis: ReturnType<typeof analyzeFile> }) {
  const isMobile = useIsMobile();

  return (
    <Card className="p-6 bg-card border-border">
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

      {analysis.totalOpen > 10 && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 mb-4">
          <p className="text-xs text-amber-300">
            You have {analysis.totalOpen} open accounts. Quality matters more than quantity — review
            for redundant accounts that may signal credit-seeking behavior.
          </p>
        </div>
      )}

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

                {/* Suggestion card for gaps */}
                {cat.suggestion && <SuggestionCard suggestion={cat.suggestion} isMobile={!!isMobile} />}
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

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="relative h-4 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isHealthy ? "bg-fundability-excellent" : "bg-amber-500"
              }`}
              style={{ width: `${pct}%` }}
            />
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

/* ─── Component 4: Priority Action List ─── */
function PriorityActionList({ analysis }: { analysis: ReturnType<typeof analyzeFile> }) {
  const priorityOrder: Record<string, number> = { critical: 0, important: 1, enhancement: 2 };
  const gaps = analysis.categories
    .filter((c) => c.status !== "complete")
    .sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  if (gaps.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-5 h-5 text-fundability-excellent" />
          <h3 className="font-semibold text-foreground">Your Credit File Action Plan</h3>
        </div>
        <p className="text-sm text-fundability-excellent">
          ✓ Your credit file meets all 10-account structure targets. Continue maintaining your accounts in good standing.
        </p>
      </Card>
    );
  }

  const priorityLabel = (p: string) => {
    if (p === "critical") return <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border-red-500/30">Critical</Badge>;
    if (p === "important") return <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30">Important</Badge>;
    return <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-400 border-blue-500/30">Enhancement</Badge>;
  };

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-2 mb-1">
        <Target className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-foreground">Your Credit File Action Plan</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Complete these items in order to build an optimal credit file. Focus on one at a time rather than applying for multiple new accounts simultaneously.
      </p>

      <div className="space-y-4">
        {gaps.map((gap, i) => (
          <div key={gap.key} className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-medium text-foreground">{gap.label}</span>
                {priorityLabel(gap.priority)}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{gap.suggestion?.recommendation || gap.detail}</p>
              {gap.suggestion?.ctas && gap.suggestion.ctas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {gap.suggestion.ctas.map((cta, j) => (
                    <Button
                      key={j}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5 border-accent/40 text-accent hover:bg-accent/10"
                      asChild
                    >
                      <a href={cta.href} target="_blank" rel="noopener noreferrer">
                        {cta.label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground/60 mt-6 leading-relaxed italic">
        These suggestions are educational recommendations based on your current credit file. PME does not guarantee specific credit outcomes. Never take on debt solely to build your credit profile — only add tradelines that make sense for your financial situation.
      </p>
    </Card>
  );
}
