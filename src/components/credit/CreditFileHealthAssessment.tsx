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
  ChevronRight, Target, Shield, TrendingUp, BarChart3,
} from "lucide-react";
import { differenceInMonths } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

/* ─── Types ─── */
export interface CreditAccount {
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
  original_amount: number | null;
  duplicate_of_id: string | null;
  is_disputed_ownership: boolean | null;
  payment_history_json: any | null;
}

interface NegativeItem {
  id: string;
  creditor_name: string | null;
  account_number_masked: string | null;
  amount: number | null;
  bureau: string;
  item_type: string;
  status: string | null;
  duplicate_of_id: string | null;
  is_disputed_ownership: boolean | null;
}

interface LenderPref {
  institution_name: string;
  primary_bureau: string;
  secondary_bureau: string | null;
}

interface BureauScores {
  experian: number | null;
  transunion: number | null;
  equifax: number | null;
}

export interface FileCategory {
  key: string;
  label: string;
  icon: React.ReactNode;
  target: string;
  status: "complete" | "warning" | "missing";
  current: string;
  detail: string;
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
  category: "active" | "historical";
  detail: string;
}

type BureauKey = "experian" | "transunion" | "equifax";

const BUREAU_META: Record<BureauKey, { label: string; accent: string; dot: string }> = {
  experian: { label: "Experian", accent: "border-blue-500/40", dot: "bg-blue-500" },
  transunion: { label: "TransUnion", accent: "border-green-500/40", dot: "bg-green-500" },
  equifax: { label: "Equifax", accent: "border-red-500/40", dot: "bg-red-500" },
};

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
  if (s.includes("delinquent")) return false;
  // Unpaid charge-offs and unpaid collections are NOT good standing
  if ((s.includes("charged") || s.includes("charge")) && !s.includes("paid")) return false;
  if (s.includes("collection") && !s.includes("paid")) return false;
  return true;
}

function isClosedPositive(a: CreditAccount): boolean {
  if (a.is_open === true) return false;
  if (a.is_open == null) return false; // unknown = skip
  if (a.is_disputed_ownership) return false;
  if (a.duplicate_of_id) return false;
  const s = (a.status ?? "").toLowerCase();
  // Check if closed/paid in good standing
  const isClosedStatus = s.includes("closed") || s.includes("paid") || s === "transferred" || s === "";
  if (!isClosedStatus && !isGoodStanding(a)) return false;
  // Balance should be zero or null (paid off)
  const bal = Number(a.balance ?? a.current_balance ?? 0);
  if (bal > 0 && !s.includes("paid")) return false;
  return true;
}

function getOriginalAmount(a: CreditAccount): number {
  return a.original_amount ?? effectiveLimit(a) ?? Number(a.balance ?? a.current_balance ?? 0);
}

/* ─── Suggestion content ─── */
function getSuggestion(key: string, auCount: number): SuggestionContent | undefined {
  const map: Record<string, () => SuggestionContent> = {
    primary_cards: () => ({
      whyItMatters: "Primary credit cards with limits above $3,000 are the foundation of your revolving credit profile. Lenders look for 2 to 4 primary cards to confirm you can manage revolving debt responsibly.",
      recommendation: "Apply for a primary credit card where you are the account holder — not an authorized user. Target cards with no annual fee and a starting limit above $3,000. Credit unions and community banks often have more flexible approval criteria than major banks.",
      whereToGetIt: "If your score is below 640 start with a secured card that reports to all three bureaus and graduates to unsecured. Navy Federal Credit Union, Local First Credit Union, and DCU are strong options for members.",
      impact: "Each primary card above $3,000 improves your available revolving credit, reduces your overall utilization percentage, and strengthens your comparable credit for future applications.",
    }),
    authorized_user: () => ({
      whyItMatters: "Having more than 2 authorized user accounts signals credit padding to lenders and underwriters. While AU accounts help with utilization and credit age, too many suggest you are relying on someone else's credit history rather than your own.",
      recommendation: `Remove yourself from ${Math.max(auCount - 2, 1)} authorized user account(s). Keep the 2 that have the highest limits and longest history since those provide the most benefit to your utilization ratio and average credit age.`,
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
      recommendation: "If you are planning a vehicle purchase in the next 12 months, now is the time to structure it strategically. If you are not planning a vehicle purchase a credit builder loan serves a similar purpose without requiring a large purchase.",
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
      recommendation: "If homeownership is part of your financial plan, prioritizing a mortgage — even a modest one — is one of the highest-leverage moves you can make for your credit file.",
      impact: "A mortgage in good standing is the single most impactful tradeline you can add to a consumer credit file. It improves your credit mix, demonstrates asset ownership to lenders, and signals long-term financial stability to every capital source you approach.",
      ctas: [{ label: "Book a Strategy Session", href: "https://www.mogulmakeracademy.com/booking-screening.html" }],
    }),
    credit_age: () => ({
      whyItMatters: "Credit age accounts for approximately 15 percent of your FICO score. Lenders also use average credit age as an indicator of financial maturity. The target average is 5 years or more.",
      recommendation: "Protect your existing credit age by avoiding unnecessary new account applications. Every new account reduces your average age. Focus on keeping your oldest accounts open and in good standing.",
      impact: "Credit age improves naturally over time. Avoid closing old accounts even if you do not use them regularly — an old account with zero balance still contributes positively to your average age.",
      ctas: [{ label: "Start Rent Reporting — CreditRentBoost", href: "https://affiliates.creditrentboost.com/?affi=00498" }],
    }),
  };
  const fn = map[key];
  return fn ? fn() : undefined;
}

/* ─── Analysis engine ─── */
function accountAgeMonths(a: CreditAccount): number | null {
  const d = effectiveOpenDate(a);
  if (!d) return null;
  return differenceInMonths(new Date(), d);
}

export interface FileAnalysis {
  categories: FileCategory[];
  comparable: ComparableAccount[];
  avgAgeMonths: number;
  avgAgeYears: number;
  oldestAccounts: { creditor: string; months: number }[];
  newestAccounts: { creditor: string; months: number }[];
  completedCount: number;
  totalCategories: number;
  completionPct: number;
  totalOpen: number;
  primaryCardsAbove3k: number;
  auCount: number;
}

function analyzeFile(accounts: CreditAccount[]): FileAnalysis {
  const validAccounts = accounts.filter(a => !a.duplicate_of_id && !a.is_disputed_ownership);

  const primaryCards = validAccounts.filter(a => a.type === "credit_card" && !a.is_authorized_user && (a.is_open ?? true));
  const primaryCardsAbove3k = primaryCards.filter(a => effectiveLimit(a) >= 3000);
  const openAU = validAccounts.filter(a => a.is_authorized_user && (a.is_open ?? true));
  const rentAccounts = validAccounts.filter(a => /(rent|lease|housing|creditrentboost)/i.test(a.creditor));
  const utilityAccounts = validAccounts.filter(a => /(boost|utility|experian boost|self-reported)/i.test(a.creditor));

  const autoLoans = validAccounts.filter(a => a.type === "auto_loan" || /(auto|automobile|vehicle)/i.test(a.creditor));
  const autoOpen = autoLoans.filter(a => a.is_open ?? true);
  const autoClosed = autoLoans.filter(a => isClosedPositive(a));

  const personalLoans = validAccounts.filter(a => a.type === "personal_loan");
  const plOpen = personalLoans.filter(a => a.is_open ?? true);
  const plClosed = personalLoans.filter(a => isClosedPositive(a));

  const mortgages = validAccounts.filter(a => a.type === "mortgage");
  const mortOpen = mortgages.filter(a => a.is_open ?? true);
  const mortClosed = mortgages.filter(a => isClosedPositive(a));

  const ages = validAccounts.map(accountAgeMonths).filter((m): m is number => m !== null);
  const avgAgeMonths = ages.length ? Math.round(ages.reduce((s, v) => s + v, 0) / ages.length) : 0;
  const avgAgeYears = +(avgAgeMonths / 12).toFixed(1);

  const comparable: ComparableAccount[] = [];

  // Active comparable (open accounts in good standing)
  validAccounts.filter(a => (a.is_open ?? true) && isGoodStanding(a)).forEach(a => {
    const amt = effectiveLimit(a) || Number(a.balance ?? a.current_balance ?? 0);
    if (amt <= 0) return;
    if (a.type === "credit_card" && !a.is_authorized_user) {
      comparable.push({ creditor: a.creditor, type: "revolving", amount: amt, projectedApproval: Math.round(amt * 1.5), label: "Active Revolving — Comparable Credit", category: "active", detail: `Open credit card — limit $${amt.toLocaleString()}. Supports ~$${Math.round(amt * 1.5).toLocaleString()} for a new revolving account.` });
    } else if (a.type === "auto_loan") {
      comparable.push({ creditor: a.creditor, type: "auto", amount: amt, projectedApproval: amt * 3, label: "Active Auto — Comparable Credit", category: "active", detail: `Open auto loan — $${amt.toLocaleString()}.` });
    } else if (a.type === "mortgage") {
      comparable.push({ creditor: a.creditor, type: "mortgage", amount: amt, projectedApproval: amt, label: "Active Mortgage — Comparable Credit", category: "active", detail: `Open mortgage — $${amt.toLocaleString()}. Most valuable comparable tradeline.` });
    } else if (a.type === "personal_loan") {
      comparable.push({ creditor: a.creditor, type: "installment", amount: amt, projectedApproval: amt * 3, label: "Active Installment — Comparable Credit", category: "active", detail: `Open personal loan — $${amt.toLocaleString()}.` });
    }
  });

  // Historical comparable (closed accounts in good standing)
  validAccounts.filter(a => isClosedPositive(a)).forEach(a => {
    const amt = getOriginalAmount(a);
    if (amt <= 0) return;
    if (a.type === "credit_card") {
      comparable.push({ creditor: a.creditor, type: "revolving", amount: amt, projectedApproval: Math.round(amt * 1.5), label: "Historical Revolving — Comparable Credit", category: "historical", detail: `Closed revolving — highest limit $${amt.toLocaleString()}. Supports ~$${Math.round(amt * 1.5).toLocaleString()} for a new revolving account.` });
    } else if (a.type === "auto_loan" || /(auto|automobile|vehicle|ally financial)/i.test(a.creditor)) {
      comparable.push({ creditor: a.creditor, type: "auto", amount: amt, projectedApproval: amt * 3, label: "Historical Auto — Comparable Credit", category: "historical", detail: `Closed auto loan — $${amt.toLocaleString()}. Supports ~$${(amt * 3).toLocaleString()} for your next vehicle financing.` });
    } else if (a.type === "personal_loan") {
      comparable.push({ creditor: a.creditor, type: "installment", amount: amt, projectedApproval: amt * 3, label: "Historical Installment — Comparable Credit", category: "historical", detail: `Closed installment loan — $${amt.toLocaleString()}. Supports ~$${(amt * 3).toLocaleString()} for your next personal loan.` });
    } else if (a.type === "mortgage") {
      comparable.push({ creditor: a.creditor, type: "mortgage", amount: amt, projectedApproval: amt, label: "Historical Mortgage — Comparable Credit", category: "historical", detail: `Closed mortgage — $${amt.toLocaleString()}. Most valuable comparable tradeline.` });
    } else if (a.type === "student_loan") {
      comparable.push({ creditor: a.creditor, type: "student_loan", amount: amt, projectedApproval: amt, label: "Historical Student Loan — Comparable Credit", category: "historical", detail: `Paid student loan — $${amt.toLocaleString()}. Demonstrates long-term installment management.` });
    }
  });

  const withAge = validAccounts.map(a => ({ creditor: a.creditor, months: accountAgeMonths(a) })).filter((x): x is { creditor: string; months: number } => x.months !== null).sort((a, b) => b.months - a.months);
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

  const autoStatus = autoOpen.length > 0 ? "Open" : autoClosed.length > 0 ? "Complete — Historical" : "Missing";
  const autoDetail = autoOpen.length > 0 ? "Active auto loan." : autoClosed.length > 0 ? (() => { const best = autoClosed[0]; const amt = getOriginalAmount(best); return `Closed Auto Loan in Good Standing — Comparable Credit Available. Your ${best.creditor} auto loan is paid off. Estimated approval range: $${(amt * 3).toLocaleString()}.`; })() : "Missing auto loan tradeline.";
  const plStatus = plOpen.length > 0 ? "Open" : plClosed.length > 0 ? "Complete — Historical" : "Missing";
  const plDetail = plOpen.length > 0 ? "Active personal loan." : plClosed.length > 0 ? "Closed personal loan in good standing — comparable credit available." : "Missing personal loan tradeline.";
  const mortStatus = mortOpen.length > 0 ? "Open" : mortClosed.length > 0 ? "Complete — Historical" : "Missing";
  const mortDetail = mortOpen.length > 0 ? "Active mortgage — strongest tradeline type." : mortClosed.length > 0 ? "Closed mortgage in good standing — most valuable comparable tradeline." : "Missing mortgage — highest-value tradeline.";

  const categories: FileCategory[] = [
    { key: "primary_cards", label: "Primary Credit Cards", icon: <CreditCard className="w-5 h-5" />, target: "2–4 above $3,000", status: pcCount >= 2 ? "complete" : "missing", current: `${pcCount} of 2–4`, detail: pcCount >= 2 ? `You have ${pcCount} primary cards above $3,000.` : `You need ${2 - pcCount} more primary card(s) above $3,000.`, suggestion: pcCount < 2 ? getSuggestion("primary_cards", auCount) : undefined, priority: "critical" },
    { key: "authorized_user", label: "Authorized User Accounts", icon: <UserCheck className="w-5 h-5" />, target: "Maximum 2", status: auCount <= 2 ? "complete" : "warning", current: `${auCount} of 2 max`, detail: auCount <= 2 ? `${auCount} AU account(s) — within limit.` : `${auCount} AU accounts — remove ${auCount - 2} to avoid credit padding flag.`, suggestion: auCount > 2 ? getSuggestion("authorized_user", auCount) : undefined, priority: "critical" },
    { key: "rent_reporting", label: "Rent Reporting", icon: <Home className="w-5 h-5" />, target: "1 tradeline", status: hasRent ? "complete" : "missing", current: hasRent ? "Active" : "Not reporting", detail: hasRent ? "Rent payments are being reported." : "Add rent reporting for a free positive tradeline.", suggestion: !hasRent ? getSuggestion("rent_reporting", auCount) : undefined, priority: "enhancement" },
    { key: "utility_reporting", label: "Utility / Streaming Reporting", icon: <Zap className="w-5 h-5" />, target: "1 account", status: hasUtility ? "complete" : "missing", current: hasUtility ? "Active" : "Not reporting", detail: hasUtility ? "Utility payments are being reported." : "Add utility reporting at no cost.", suggestion: !hasUtility ? getSuggestion("utility_reporting", auCount) : undefined, priority: "enhancement" },
    { key: "auto_loan", label: "Auto Loan", icon: <Car className="w-5 h-5" />, target: "1 (open or closed)", status: hasAuto ? "complete" : "missing", current: autoStatus, detail: autoDetail, suggestion: !hasAuto ? getSuggestion("auto_loan", auCount) : undefined, priority: "important" },
    { key: "personal_loan", label: "Personal Loan", icon: <Landmark className="w-5 h-5" />, target: "1 (open or closed)", status: hasPL ? "complete" : "missing", current: plStatus, detail: plDetail, suggestion: !hasPL ? getSuggestion("personal_loan", auCount) : undefined, priority: "important" },
    { key: "mortgage", label: "Mortgage", icon: <Home className="w-5 h-5" />, target: "1 (open or closed)", status: hasMort ? "complete" : "missing", current: mortStatus, detail: mortDetail, suggestion: !hasMort ? getSuggestion("mortgage", auCount) : undefined, priority: "critical" },
    { key: "credit_age", label: "Credit Age", icon: <Clock className="w-5 h-5" />, target: "5+ years average", status: creditAgeOk ? "complete" : "missing", current: `${avgAgeYears} years`, detail: creditAgeOk ? `Average ${avgAgeYears} years — strong.` : `Average ${avgAgeYears} years — below 5-year target.`, suggestion: !creditAgeOk ? getSuggestion("credit_age", auCount) : undefined, priority: "enhancement" },
  ];

  const completedCount = categories.filter(c => c.status === "complete").length;
  return {
    categories, comparable, avgAgeMonths, avgAgeYears, oldestAccounts, newestAccounts,
    completedCount, totalCategories: categories.length, completionPct: Math.round((completedCount / categories.length) * 100),
    totalOpen: validAccounts.filter(a => a.is_open ?? true).length, primaryCardsAbove3k: pcCount, auCount,
  };
}

/* ─── Bureau-specific negative analysis ─── */
interface BureauNegativeAnalysis {
  total: number;
  exclusive: number; // only on this bureau
  shared: number; // on 2+ bureaus
  items: (NegativeItem & { bureauSpread: string })[];
}

function analyzeNegativesForBureau(bureau: BureauKey, allNegatives: NegativeItem[]): BureauNegativeAnalysis {
  const bureauLabel = BUREAU_META[bureau].label.toLowerCase();
  const thisItems = allNegatives.filter(n => n.bureau.toLowerCase().includes(bureauLabel) || n.bureau.toLowerCase() === bureau);

  // Group by creditor+account to check cross-bureau
  const creditorMap = new Map<string, Set<string>>();
  allNegatives.forEach(n => {
    const key = `${(n.creditor_name || "").toLowerCase()}|${n.account_number_masked || ""}`;
    if (!creditorMap.has(key)) creditorMap.set(key, new Set());
    creditorMap.get(key)!.add(n.bureau.toLowerCase());
  });

  let exclusive = 0;
  let shared = 0;
  const items = thisItems.map(n => {
    const key = `${(n.creditor_name || "").toLowerCase()}|${n.account_number_masked || ""}`;
    const bureaus = creditorMap.get(key);
    const count = bureaus?.size ?? 1;
    if (count === 1) { exclusive++; } else { shared++; }
    const bureauSpread = count >= 3 ? "Reported by all 3 bureaus" : count === 2 ? "Reported by 2 of 3 bureaus" : `${BUREAU_META[bureau].label} only`;
    return { ...n, bureauSpread };
  });

  return { total: thisItems.length, exclusive, shared, items };
}

/* ─── Lender helpers ─── */
function getLendersForBureau(bureau: BureauKey, lenders: LenderPref[]): string[] {
  const b = BUREAU_META[bureau].label.toLowerCase();
  return lenders
    .filter(l => l.primary_bureau.toLowerCase().includes(b) || l.secondary_bureau?.toLowerCase().includes(b))
    .map(l => l.institution_name)
    .slice(0, 8);
}

/* Default well-known lender mapping */
const DEFAULT_LENDERS: Record<BureauKey, string[]> = {
  experian: ["Chase", "American Express", "Wells Fargo", "SoFi", "OnDeck", "BlueVine"],
  transunion: ["Capital One", "Discover", "OpenSky", "Chime", "Upgrade", "Divvy"],
  equifax: ["Citi", "Bank of America", "LightStream", "Equipment lenders"],
};

/* ─── Score color helper ─── */
function scoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 740) return "text-fundability-excellent";
  if (score >= 670) return "text-fundability-good";
  if (score >= 580) return "text-amber-500";
  return "text-red-500";
}

function scoreBg(score: number | null): string {
  if (score == null) return "bg-muted/30";
  if (score >= 740) return "bg-fundability-excellent/10";
  if (score >= 670) return "bg-fundability-good/10";
  if (score >= 580) return "bg-amber-500/10";
  return "bg-red-500/10";
}

/* ─── Exported context builder ─── */
export function buildBureauHealthContext(
  scores: BureauScores,
  accounts: CreditAccount[],
  negatives: NegativeItem[],
  lenders: LenderPref[]
): string {
  const bureaus: BureauKey[] = ["experian", "transunion", "equifax"];
  const analysis = analyzeFile(accounts);
  const parts: string[] = ["Bureau-Specific Credit File Assessment:"];

  const scoreMap: Record<BureauKey, number | null> = {
    experian: scores.experian,
    transunion: scores.transunion,
    equifax: scores.equifax,
  };

  bureaus.forEach(b => {
    const score = scoreMap[b];
    const negAnalysis = analyzeNegativesForBureau(b, negatives);
    const bLenders = getLendersForBureau(b, lenders);
    const lenderList = bLenders.length > 0 ? bLenders.join(", ") : DEFAULT_LENDERS[b].join(", ");
    const highestComp = analysis.comparable.length > 0 ? Math.max(...analysis.comparable.map(c => c.amount)) : 0;

    parts.push(`\n${BUREAU_META[b].label} (score: ${score ?? "N/A"}):`);
    parts.push(`- File completion: ${analysis.completedCount} of ${analysis.totalCategories} account types`);
    parts.push(`- Negative items on ${BUREAU_META[b].label} only: ${negAnalysis.exclusive}`);
    parts.push(`- Negative items shared with other bureaus: ${negAnalysis.shared}`);
    parts.push(`- Comparable credit: highest closed $${highestComp.toLocaleString()}, 3x projection $${(highestComp * 3).toLocaleString()}`);
    parts.push(`- Credit age: ${analysis.avgAgeYears} years`);
    const topGap = analysis.categories.filter(c => c.status !== "complete")[0];
    parts.push(`- Priority gap: ${topGap?.label ?? "None"}`);
    parts.push(`- Lenders pulling ${BUREAU_META[b].label}: ${lenderList}`);
  });

  // Strategy summary
  const valid = bureaus.filter(b => scoreMap[b] != null).sort((a, b2) => (scoreMap[b2] ?? 0) - (scoreMap[a] ?? 0));
  if (valid.length >= 2) {
    const strongest = valid[0];
    const weakest = valid[valid.length - 1];
    const negCounts = Object.fromEntries(bureaus.map(b => [b, analyzeNegativesForBureau(b, negatives).total]));
    const mostNegs = bureaus.reduce((a, b2) => (negCounts[b2] > negCounts[a] ? b2 : a));
    const spread = (scoreMap[strongest] ?? 0) - (scoreMap[weakest] ?? 0);

    parts.push(`\nBureau Strategy:`);
    parts.push(`- Strongest bureau: ${BUREAU_META[strongest].label} at ${scoreMap[strongest]}`);
    parts.push(`- Most improvement needed: ${BUREAU_META[mostNegs].label} with ${negCounts[mostNegs]} negatives`);
    parts.push(`- Score spread: ${scoreMap[strongest]} to ${scoreMap[weakest]} (${spread} point difference)`);
  }

  return parts.join("\n");
}

/* ═══════════════════ COMPONENT ═══════════════════ */
export function CreditFileHealthAssessment() {
  const isMobile = useIsMobile();

  // Fetch credit accounts
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ["credit-accounts-health"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase.from("credit_accounts").select("*").eq("user_id", session.user.id).order("creditor");
      if (error) throw error;
      return (data || []) as CreditAccount[];
    },
  });

  // Fetch negative items
  const { data: negatives } = useQuery({
    queryKey: ["credit-negatives-health"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data, error } = await supabase.from("credit_negative_items").select("id, creditor_name, account_number_masked, amount, bureau, item_type, status").eq("user_id", session.user.id).neq("status", "removed");
      if (error) throw error;
      return (data || []) as NegativeItem[];
    },
  });

  // Fetch bureau scores
  const { data: scores } = useQuery({
    queryKey: ["bureau-scores-health"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { experian: null, transunion: null, equifax: null } as BureauScores;
      const { data } = await supabase.from("profiles").select("estimated_fico_ex, estimated_fico_tu, estimated_fico_eq").eq("user_id", session.user.id).maybeSingle();
      return { experian: data?.estimated_fico_ex ?? null, transunion: data?.estimated_fico_tu ?? null, equifax: data?.estimated_fico_eq ?? null } as BureauScores;
    },
  });

  // Fetch lender bureau preferences
  const { data: lenders } = useQuery({
    queryKey: ["lender-prefs-health"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lender_bureau_preferences" as any).select("institution_name, primary_bureau, secondary_bureau").limit(100);
      if (error) return [] as LenderPref[];
      return ((data as unknown) || []) as LenderPref[];
    },
  });

  const analysis = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    return analyzeFile(accounts);
  }, [accounts]);

  // Determine strongest bureau for default tab
  const defaultTab = useMemo<BureauKey | "all">(() => {
    if (!scores) return "all";
    const s: [BureauKey, number | null][] = [["experian", scores.experian], ["transunion", scores.transunion], ["equifax", scores.equifax]];
    const valid = s.filter(([, v]) => v != null).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
    return valid.length > 0 ? valid[0][0] : "all";
  }, [scores]);

  const [activeTab, setActiveTab] = useState<BureauKey | "all">(defaultTab);

  // Sync default tab when scores load
  useMemo(() => { if (defaultTab !== "all" && activeTab === "all") setActiveTab(defaultTab); }, [defaultTab]);

  if (loadingAccounts) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (!analysis) {
    return (
      <Card className="p-6 text-center">
        <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-semibold text-lg">Upload a credit report to see your file health assessment</h3>
        <p className="text-muted-foreground text-sm mt-2">Once Paige analyzes your credit report, your file structure, comparable credit, and credit age will appear here.</p>
      </Card>
    );
  }

  const safeScores = scores ?? { experian: null, transunion: null, equifax: null };
  const safeNegatives = negatives ?? [];
  const safeLenders = lenders ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Credit File Health Assessment</h2>
        <p className="text-sm text-muted-foreground mt-1">Your credit file evaluated per bureau against the optimal 10-account structure.</p>
      </div>

      {/* Bureau Strategy Overview — always visible */}
      <BureauStrategyOverview scores={safeScores} negatives={safeNegatives} lenders={safeLenders} />

      {/* Bureau Tabs */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2 pt-1 -mx-1 px-1">
        <div className={`flex gap-2 ${isMobile ? "overflow-x-auto scrollbar-none" : ""}`}>
          {(["experian", "transunion", "equifax"] as BureauKey[]).map(b => {
            const s = safeScores[b];
            return (
              <button
                key={b}
                onClick={() => setActiveTab(b)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${
                  activeTab === b
                    ? `bg-card ${BUREAU_META[b].accent} border-2 shadow-sm`
                    : "bg-muted/30 border-border hover:bg-muted/60"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${BUREAU_META[b].dot}`} />
                <span>{BUREAU_META[b].label}</span>
                {s != null && (
                  <span className={`font-bold ${scoreColor(s)}`}>{s}</span>
                )}
                {s == null && <span className="text-muted-foreground text-xs">N/A</span>}
              </button>
            );
          })}
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border ${
              activeTab === "all" ? "bg-card border-accent/40 border-2 shadow-sm" : "bg-muted/30 border-border hover:bg-muted/60"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>All Bureaus</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "all" ? (
        <AllBureausView analysis={analysis} isMobile={!!isMobile} />
      ) : (
        <BureauTabContent
          bureau={activeTab}
          score={safeScores[activeTab]}
          analysis={analysis}
          negatives={safeNegatives}
          lenders={safeLenders}
          isMobile={!!isMobile}
        />
      )}
    </div>
  );
}

/* ─── Bureau Strategy Overview ─── */
function BureauStrategyOverview({ scores, negatives, lenders }: { scores: BureauScores; negatives: NegativeItem[]; lenders: LenderPref[] }) {
  const bureaus: BureauKey[] = ["experian", "transunion", "equifax"];
  const valid = bureaus.filter(b => scores[b] != null).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));

  if (valid.length < 2) return null;

  const strongest = valid[0];
  const weakest = valid[valid.length - 1];
  const spread = (scores[strongest] ?? 0) - (scores[weakest] ?? 0);

  const negCounts = Object.fromEntries(bureaus.map(b => [b, analyzeNegativesForBureau(b, negatives).total])) as Record<BureauKey, number>;
  const mostNegsB = bureaus.reduce((a, b) => (negCounts[b] > negCounts[a] ? b : a));

  const strongLenders = getLendersForBureau(strongest, lenders);
  const strongLenderStr = strongLenders.length > 0 ? strongLenders.join(", ") : DEFAULT_LENDERS[strongest].join(", ");

  return (
    <Card className="p-5 bg-card border-border">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-accent" />
        <h3 className="font-semibold text-foreground">Bureau Strategy Overview</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Strongest */}
        <div className={`rounded-lg p-4 ${scoreBg(scores[strongest])}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-fundability-excellent" />
            <span className="text-xs font-medium text-muted-foreground">Strongest Bureau</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${BUREAU_META[strongest].dot}`} />
            <span className="font-semibold text-foreground">{BUREAU_META[strongest].label}</span>
            <span className={`font-bold ${scoreColor(scores[strongest])}`}>{scores[strongest]}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Lenders who pull {BUREAU_META[strongest].label}: {strongLenderStr}. Prioritize applications to these lenders.
          </p>
        </div>

        {/* Biggest Gap */}
        <div className={`rounded-lg p-4 ${scoreBg(scores[mostNegsB])}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-muted-foreground">Most Improvement Needed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${BUREAU_META[mostNegsB].dot}`} />
            <span className="font-semibold text-foreground">{BUREAU_META[mostNegsB].label}</span>
            <span className={`font-bold ${scoreColor(scores[mostNegsB])}`}>{scores[mostNegsB] ?? "N/A"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {negCounts[mostNegsB]} negative items. Focus dispute efforts here first if your target lenders pull this bureau.
          </p>
        </div>

        {/* Score Spread */}
        <div className="rounded-lg p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-accent" />
            <span className="text-xs font-medium text-muted-foreground">Score Spread</span>
          </div>
          <div className="flex items-center gap-3">
            {bureaus.map(b => (
              <div key={b} className="text-center">
                <span className={`w-2 h-2 rounded-full inline-block ${BUREAU_META[b].dot} mb-1`} />
                <div className={`text-lg font-bold ${scoreColor(scores[b])}`}>{scores[b] ?? "—"}</div>
                <div className="text-[10px] text-muted-foreground">{BUREAU_META[b].label.slice(0, 2).toUpperCase()}</div>
              </div>
            ))}
          </div>
          {spread > 40 && (
            <p className="text-xs text-amber-400 mt-2">
              ⚠ Your scores vary by {spread} points. Different lenders see very different credit profiles. Closing this gap should be a priority.
            </p>
          )}
          {spread <= 40 && spread > 0 && (
            <p className="text-xs text-muted-foreground mt-2">{spread} point spread — relatively consistent across bureaus.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ─── Bureau Tab Content ─── */
function BureauTabContent({
  bureau, score, analysis, negatives, lenders, isMobile,
}: {
  bureau: BureauKey; score: number | null; analysis: FileAnalysis; negatives: NegativeItem[]; lenders: LenderPref[]; isMobile: boolean;
}) {
  const negAnalysis = useMemo(() => analyzeNegativesForBureau(bureau, negatives), [bureau, negatives]);
  const bLenders = useMemo(() => {
    const fromDb = getLendersForBureau(bureau, lenders);
    return fromDb.length > 0 ? fromDb : DEFAULT_LENDERS[bureau];
  }, [bureau, lenders]);

  return (
    <div className="space-y-6">
      {/* Section 1 — Score + Lender Intel */}
      <Card className={`p-6 bg-card border-2 ${BUREAU_META[bureau].accent}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <span className={`w-4 h-4 rounded-full ${BUREAU_META[bureau].dot}`} />
            <h3 className="text-lg font-bold text-foreground">{BUREAU_META[bureau].label} Score</h3>
          </div>
          <span className={`text-4xl font-bold ${scoreColor(score)}`}>{score ?? "N/A"}</span>
        </div>
        <div className="mt-4 rounded-md bg-muted/30 p-3">
          <p className="text-xs font-medium text-foreground mb-1">Lenders who pull {BUREAU_META[bureau].label}:</p>
          <p className="text-xs text-muted-foreground">{bLenders.join(", ")}</p>
          {score != null && (
            <p className="text-xs text-accent mt-2">
              {score >= 700
                ? `Your ${BUREAU_META[bureau].label} score of ${score} meets the threshold for most lenders pulling this bureau.`
                : score >= 620
                ? `Your ${BUREAU_META[bureau].label} score of ${score} meets minimum thresholds for some lenders but may limit premium product access.`
                : `Your ${BUREAU_META[bureau].label} score of ${score} is below most lender minimums. Focus on dispute and credit building for this bureau.`}
            </p>
          )}
        </div>
      </Card>

      {/* Section 2 — Bureau-Specific Negatives */}
      {negAnalysis.total > 0 && (
        <Card className="p-6 bg-card border-border">
          <h3 className="font-semibold text-foreground mb-1">Negative Items on {BUREAU_META[bureau].label}</h3>
          <p className="text-xs text-muted-foreground mb-4">
            {negAnalysis.total} items — {negAnalysis.exclusive} exclusive to {BUREAU_META[bureau].label}, {negAnalysis.shared} shared with other bureaus
          </p>
          <div className="space-y-2">
            {negAnalysis.items.slice(0, 10).map((item, i) => (
              <div key={item.id || i} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-3 gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.creditor_name || "Unknown"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.item_type}</Badge>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${item.bureauSpread.includes("only") ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : ""}`}>
                      {item.bureauSpread}
                    </Badge>
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {item.amount ? `$${item.amount.toLocaleString()}` : "N/A"}
                </span>
              </div>
            ))}
            {negAnalysis.total > 10 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Showing 10 of {negAnalysis.total} items. View full list in Disputes Manager.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Section 3-6 — File Scorecard (same accounts, bureau context) */}
      <FileCompletionScorecard analysis={analysis} isMobile={isMobile} bureauLabel={BUREAU_META[bureau].label} />

      {/* Section 4 — Comparable Credit */}
      {analysis.comparable.length > 0 && <ComparableCreditPanel comparable={analysis.comparable} bureauLabel={BUREAU_META[bureau].label} />}

      {/* Section 5 — Credit Age */}
      <CreditAgeGauge analysis={analysis} bureauLabel={BUREAU_META[bureau].label} />

      {/* Section 7 — Bureau-Specific Priority Action List */}
      <PriorityActionList analysis={analysis} bureauLabel={BUREAU_META[bureau].label} />
    </div>
  );
}

/* ─── All Bureaus View ─── */
function AllBureausView({ analysis, isMobile }: { analysis: FileAnalysis; isMobile: boolean }) {
  return (
    <div className="space-y-6">
      <FileCompletionScorecard analysis={analysis} isMobile={isMobile} />
      {analysis.comparable.length > 0 && <ComparableCreditPanel comparable={analysis.comparable} />}
      <CreditAgeGauge analysis={analysis} />
      <PriorityActionList analysis={analysis} />
    </div>
  );
}

/* ─── Suggestion Card ─── */
function SuggestionCard({ suggestion, isMobile }: { suggestion: SuggestionContent; isMobile: boolean }) {
  const [open, setOpen] = useState(!isMobile);

  const content = (
    <div className="space-y-3">
      <div><p className="text-xs font-medium text-accent mb-1">Why it matters</p><p className="text-xs text-muted-foreground leading-relaxed">{suggestion.whyItMatters}</p></div>
      <div><p className="text-xs font-medium text-accent mb-1">Recommendation</p><p className="text-xs text-muted-foreground leading-relaxed">{suggestion.recommendation}</p></div>
      {suggestion.whereToGetIt && <div><p className="text-xs font-medium text-accent mb-1">Where to get it</p><p className="text-xs text-muted-foreground leading-relaxed">{suggestion.whereToGetIt}</p></div>}
      <div><p className="text-xs font-medium text-accent mb-1">Impact on your file</p><p className="text-xs text-muted-foreground leading-relaxed">{suggestion.impact}</p></div>
      {suggestion.ctas && suggestion.ctas.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {suggestion.ctas.map((cta, i) => (
            <Button key={i} variant="outline" size="sm" className="h-8 text-xs gap-1.5 border-accent/40 text-accent hover:bg-accent/10" asChild>
              <a href={cta.href} target="_blank" rel="noopener noreferrer">{cta.label}<ExternalLink className="w-3 h-3" /></a>
            </Button>
          ))}
        </div>
      )}
      {suggestion.disclaimer && <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed pt-1">{suggestion.disclaimer}</p>}
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

  return <div className="mt-2 rounded-md border-l-4 border-accent/60 bg-muted/40 p-4">{content}</div>;
}

/* ─── File Completion Scorecard ─── */
function FileCompletionScorecard({ analysis, isMobile, bureauLabel }: { analysis: FileAnalysis; isMobile?: boolean; bureauLabel?: string }) {
  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="font-semibold text-foreground">
            File Structure Scorecard{bureauLabel ? ` — ${bureauLabel}` : ""}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {analysis.completedCount} of {analysis.totalCategories} account types met · {analysis.totalOpen} open accounts of 10 target
          </p>
        </div>
        <div className="flex items-center gap-3 min-w-[160px]">
          <Progress value={analysis.completionPct} className="h-2.5 flex-1" />
          <span className="text-sm font-bold text-foreground whitespace-nowrap">{analysis.completionPct}%</span>
        </div>
      </div>

      {analysis.totalOpen > 10 && (
        <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 mb-4">
          <p className="text-xs text-amber-300">You have {analysis.totalOpen} open accounts. Quality matters more than quantity.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {analysis.categories.map(cat => (
          <div key={cat.key} className={`rounded-lg border p-4 transition-colors ${cat.status === "complete" ? "border-fundability-excellent/30 bg-fundability-excellent/5" : cat.status === "warning" ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-muted/30"}`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {cat.status === "complete" ? <CheckCircle className="w-5 h-5 text-fundability-excellent" /> : cat.status === "warning" ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {cat.icon}
                  <span className="font-medium text-sm text-foreground">{cat.label}</span>
                  <Badge variant={cat.status === "complete" ? "default" : cat.status === "warning" ? "secondary" : "outline"} className={`text-[10px] px-1.5 py-0 ${cat.status === "complete" ? "bg-fundability-excellent/20 text-fundability-excellent border-fundability-excellent/30" : cat.status === "warning" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : ""}`}>
                    {cat.current}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{cat.detail}</p>
                {cat.suggestion && <SuggestionCard suggestion={cat.suggestion} isMobile={!!isMobile} />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Comparable Credit Panel ─── */
function ComparableCreditPanel({ comparable, bureauLabel }: { comparable: ComparableAccount[]; bureauLabel?: string }) {
  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="font-semibold text-foreground mb-1">
        Comparable Credit History{bureauLabel ? ` — ${bureauLabel}` : ""}
      </h3>
      <p className="text-xs text-muted-foreground mb-4">Closed accounts in good standing. Personal credit uses a 3× multiplier.</p>
      <div className="space-y-3">
        {comparable.map((c, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border p-3 gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">{c.creditor}</p>
              <p className="text-xs text-accent">{c.label}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">${c.amount.toLocaleString()}</p>
              {c.type !== "revolving" && c.type !== "mortgage" && (
                <p className="text-xs text-muted-foreground">Projected approval: up to ${c.projectedApproval.toLocaleString()}</p>
              )}
              {c.type === "revolving" && <p className="text-xs text-muted-foreground">Comparable revolving limit: ${c.amount.toLocaleString()}</p>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Credit Age Gauge ─── */
function CreditAgeGauge({ analysis, bureauLabel }: { analysis: FileAnalysis; bureauLabel?: string }) {
  const pct = Math.min((analysis.avgAgeYears / 5) * 100, 100);
  const isHealthy = analysis.avgAgeYears >= 5;

  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="font-semibold text-foreground mb-1">Credit Age{bureauLabel ? ` — ${bureauLabel}` : ""}</h3>
      <p className="text-xs text-muted-foreground mb-4">Target: 5+ years average.</p>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="relative h-4 rounded-full bg-secondary overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${isHealthy ? "bg-fundability-excellent" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">0 yrs</span>
            <span className="text-[10px] text-muted-foreground">5 yrs target</span>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-2xl font-bold ${isHealthy ? "text-fundability-excellent" : "text-amber-500"}`}>{analysis.avgAgeYears}</span>
          <span className="text-xs text-muted-foreground ml-1">years</span>
        </div>
      </div>

      {isHealthy
        ? <p className="text-xs text-fundability-excellent">✓ Average of {analysis.avgAgeYears} years is strong. Protect by limiting new applications.</p>
        : <p className="text-xs text-amber-400">Below the 5-year target. Avoid unnecessary new accounts.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        {analysis.oldestAccounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground flex items-center gap-1 mb-2"><Clock className="w-3.5 h-3.5 text-fundability-excellent" /> Oldest</p>
            {analysis.oldestAccounts.map((a, i) => <p key={i} className="text-xs text-muted-foreground">{a.creditor} — {Math.round(a.months / 12 * 10) / 10} yrs</p>)}
          </div>
        )}
        {analysis.newestAccounts.length > 0 && (
          <div>
            <p className="text-xs font-medium text-foreground flex items-center gap-1 mb-2"><Clock className="w-3.5 h-3.5 text-amber-500" /> Newest</p>
            {analysis.newestAccounts.map((a, i) => <p key={i} className="text-xs text-muted-foreground">{a.creditor} — {Math.round(a.months / 12 * 10) / 10} yrs</p>)}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Priority Action List ─── */
function PriorityActionList({ analysis, bureauLabel }: { analysis: FileAnalysis; bureauLabel?: string }) {
  const priorityOrder: Record<string, number> = { critical: 0, important: 1, enhancement: 2 };
  const gaps = analysis.categories.filter(c => c.status !== "complete").sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  if (gaps.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-2 mb-2"><Target className="w-5 h-5 text-fundability-excellent" /><h3 className="font-semibold text-foreground">Credit File Action Plan{bureauLabel ? ` — ${bureauLabel}` : ""}</h3></div>
        <p className="text-sm text-fundability-excellent">✓ All account type targets met. Continue maintaining accounts in good standing.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-card border-border">
      <div className="flex items-center gap-2 mb-1"><Target className="w-5 h-5 text-accent" /><h3 className="font-semibold text-foreground">Credit File Action Plan{bureauLabel ? ` — ${bureauLabel}` : ""}</h3></div>
      <p className="text-xs text-muted-foreground mb-5">Complete these items in order. Focus on one at a time.</p>
      <div className="space-y-4">
        {gaps.map((gap, i) => (
          <div key={gap.key} className="flex gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold mt-0.5">{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-medium text-foreground">{gap.label}</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${gap.priority === "critical" ? "bg-red-500/20 text-red-400 border-red-500/30" : gap.priority === "important" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}`}>
                  {gap.priority === "critical" ? "Critical" : gap.priority === "important" ? "Important" : "Enhancement"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{gap.suggestion?.recommendation || gap.detail}</p>
              {gap.suggestion?.ctas && gap.suggestion.ctas.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {gap.suggestion.ctas.map((cta, j) => (
                    <Button key={j} variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-accent/40 text-accent hover:bg-accent/10" asChild>
                      <a href={cta.href} target="_blank" rel="noopener noreferrer">{cta.label}<ExternalLink className="w-3 h-3" /></a>
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
