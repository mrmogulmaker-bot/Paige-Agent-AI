/**
 * Pure analysis engine for the Credit File Health Assessment.
 *
 * This module contains ZERO React. All scoring, bureau matching, and
 * suggestion content lives here so:
 *   1. The render component stays focused on UI.
 *   2. The analysis can be unit-tested without DOM/JSX.
 *   3. The chat hook (`useClientChatContext`) can call `buildBureauHealthContext`
 *      without dragging in the full UI subtree.
 */
import { differenceInMonths } from "date-fns";

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
  bureau_source: string | null;
}

export interface NegativeItem {
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

export interface LenderPref {
  institution_name: string;
  primary_bureau: string;
  secondary_bureau: string | null;
}

export interface BureauScores {
  experian: number | null;
  transunion: number | null;
  equifax: number | null;
}

export type BureauKey = "experian" | "transunion" | "equifax";

export interface SuggestionContent {
  whyItMatters: string;
  recommendation: string;
  whereToGetIt?: string;
  impact: string;
  ctas?: { label: string; href: string }[];
  disclaimer?: string;
}

export interface FileCategory {
  key: string;
  label: string;
  /** Icon name (rendered by the UI layer). Kept as string so this module stays JSX-free. */
  iconKey: "credit_card" | "user_check" | "home" | "zap" | "car" | "landmark" | "clock";
  target: string;
  status: "complete" | "warning" | "missing";
  current: string;
  detail: string;
  suggestion?: SuggestionContent;
  priority: "critical" | "important" | "enhancement";
}

export interface ComparableAccount {
  creditor: string;
  type: string;
  amount: number;
  projectedApproval: number;
  label: string;
  category: "active" | "historical";
  detail: string;
  bureauSource: string | null;
  amountEstimated: boolean;
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

export interface BureauNegativeAnalysis {
  total: number;
  /** Only present on this bureau */
  exclusive: number;
  /** Present on this bureau AND at least one other */
  shared: number;
  items: (NegativeItem & { bureauSpread: string })[];
}

/* ─── Bureau metadata ─── */
export const BUREAU_META: Record<BureauKey, { label: string; accent: string; dot: string }> = {
  experian: { label: "Experian", accent: "border-blue-500/40", dot: "bg-blue-500" },
  transunion: { label: "TransUnion", accent: "border-green-500/40", dot: "bg-green-500" },
  equifax: { label: "Equifax", accent: "border-red-500/40", dot: "bg-red-500" },
};

/* Default well-known lender mapping by primary bureau. */
export const DEFAULT_LENDERS: Record<BureauKey, string[]> = {
  experian: ["Chase", "American Express", "Wells Fargo", "SoFi", "OnDeck", "BlueVine"],
  transunion: ["Capital One", "Discover", "OpenSky", "Chime", "Upgrade", "Divvy"],
  equifax: ["Citi", "Bank of America", "LightStream", "Equipment lenders"],
};

/* ─── Bureau-source matching ─── */
export function accountMatchesBureau(bureauSource: string | null, bureau: BureauKey): boolean {
  if (!bureauSource) return true; // null = show on all tabs (unknown bureau)
  const bs = bureauSource.toLowerCase().replace(/[\s-]/g, "_");
  if (bs === "all_three" || bs === "all") return true;
  if (bureau === "experian") return bs.includes("experian");
  if (bureau === "transunion") return bs.includes("transunion");
  if (bureau === "equifax") return bs.includes("equifax");
  return true;
}

export function formatBureauSource(bs: string): string {
  const s = bs.toLowerCase().replace(/[\s-]/g, "_");
  if (s === "all_three" || s === "all") return "All 3 Bureaus";
  if (s === "experian_transunion") return "EX + TU";
  if (s === "experian_equifax") return "EX + EQ";
  if (s === "transunion_equifax") return "TU + EQ";
  if (s.includes("experian")) return "Experian";
  if (s.includes("transunion")) return "TransUnion";
  if (s.includes("equifax")) return "Equifax";
  return bs;
}

/* ─── Account helpers ─── */
export function effectiveLimit(a: CreditAccount): number {
  return a.credit_limit ?? a.limit_amount ?? 0;
}

export function effectiveOpenDate(a: CreditAccount): Date | null {
  const d = a.account_open_date ?? a.opened_on;
  return d ? new Date(d) : null;
}

export function isGoodStanding(a: CreditAccount): boolean {
  const s = (a.status ?? "").toLowerCase();
  if (s.includes("delinquent")) return false;
  if ((s.includes("charged") || s.includes("charge")) && !s.includes("paid")) return false;
  if (s.includes("collection") && !s.includes("paid")) return false;
  return true;
}

export function isClosedPositive(a: CreditAccount): boolean {
  if (a.is_open === true) return false;
  if (a.is_disputed_ownership) return false;
  if (a.duplicate_of_id) return false;
  const s = (a.status ?? "").toLowerCase();
  if ((s.includes("charged") || s.includes("charge")) && !s.includes("paid")) return false;
  if (s.includes("collection") && !s.includes("paid")) return false;
  if (s.includes("delinquent")) return false;
  const validStatus = s.includes("closed") || s.includes("paid") || s === "transferred" || s === "" ||
    s.includes("current") || s.includes("satisfied") || s.includes("discharged");
  if (!validStatus) return false;
  const bal = Number(a.balance ?? a.current_balance ?? 0);
  if (bal > 0 && !s.includes("paid") && !s.includes("current")) return false;
  return true;
}

export function getOriginalAmount(a: CreditAccount): number {
  return a.original_amount ?? effectiveLimit(a) ?? Number(a.balance ?? a.current_balance ?? 0);
}

export function getDisplayAmount(a: CreditAccount): { amount: number; estimated: boolean; label: string } {
  const t = (a.type ?? "").toLowerCase();
  const isRevolving = t.includes("revolv") || t.includes("credit_card") || t.includes("credit card") || t.includes("line_of_credit");
  const isAuto = t.includes("auto") || t.includes("car") || t.includes("vehicle");
  const isMortgage = t.includes("mortgage") || t.includes("home");
  const isInstallment = t.includes("install") || t.includes("loan") || t.includes("student") || isAuto || isMortgage;

  const oa = a.original_amount;
  if (oa && oa > 0) return { amount: oa, estimated: false, label: "Original amount" };

  if (isRevolving) {
    const lim = effectiveLimit(a);
    if (lim > 0) return { amount: lim, estimated: false, label: "Credit limit" };
    const bal = Number(a.balance ?? a.current_balance ?? 0);
    if (bal > 0) return { amount: bal, estimated: true, label: "Est. credit limit" };
    return { amount: 0, estimated: true, label: "Credit limit not reported" };
  }

  if (isInstallment) {
    const lim = effectiveLimit(a);
    if (lim > 0) return { amount: lim, estimated: true, label: "Est. original amount" };
    const bal = Number(a.balance ?? a.current_balance ?? 0);
    if (bal > 0) return { amount: bal, estimated: true, label: "Est. original amount" };
    const notReportedLabel = isMortgage
      ? "Original mortgage amount not reported"
      : isAuto
        ? "Original loan amount not reported by bureau"
        : "Original amount not reported by bureau";
    return { amount: 0, estimated: true, label: notReportedLabel };
  }

  const lim = effectiveLimit(a);
  if (lim > 0) return { amount: lim, estimated: false, label: isRevolving ? "Credit limit" : "Est. original amount" };
  const bal = Number(a.balance ?? a.current_balance ?? 0);
  if (bal > 0) return { amount: bal, estimated: true, label: "Est. original amount" };
  return { amount: 0, estimated: true, label: "Amount not reported by bureau" };
}

export function accountAgeMonths(a: CreditAccount): number | null {
  const d = effectiveOpenDate(a);
  if (!d) return null;
  return differenceInMonths(new Date(), d);
}

/* ─── Score color helpers (kept here so they're shared between UI + chat context) ─── */
export function scoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 740) return "text-fundability-excellent";
  if (score >= 670) return "text-fundability-good";
  if (score >= 580) return "text-amber-500";
  return "text-red-500";
}

export function scoreBg(score: number | null): string {
  if (score == null) return "bg-muted/30";
  if (score >= 740) return "bg-fundability-excellent/10";
  if (score >= 670) return "bg-fundability-good/10";
  if (score >= 580) return "bg-amber-500/10";
  return "bg-red-500/10";
}

/* ─── Suggestion content library ─── */
export function getSuggestion(key: string, auCount: number): SuggestionContent | undefined {
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

/* ─── Comparable-credit builder (helper used by analyzeFile) ─── */
function pushActiveComparable(a: CreditAccount, comparable: ComparableAccount[]): boolean {
  const { amount: amt, estimated, label: amtLabelType } = getDisplayAmount(a);
  const amtLabel = amt > 0 ? `$${amt.toLocaleString()}${estimated ? " (est.)" : ""}` : amtLabelType;
  const displayAmt = amt > 0 ? amt : 0;
  const bs = a.bureau_source ?? null;
  if (a.type === "credit_card" && !a.is_authorized_user && displayAmt > 0) {
    comparable.push({ creditor: a.creditor, type: "revolving", amount: displayAmt, projectedApproval: Math.round(displayAmt * 1.5), label: "Active Revolving — Comparable Credit", category: "active", detail: `Open credit card — limit ${amtLabel}. Supports ~$${Math.round(displayAmt * 1.5).toLocaleString()} for a new revolving account.`, bureauSource: bs, amountEstimated: estimated });
    return true;
  }
  if (a.type === "auto_loan") {
    comparable.push({ creditor: a.creditor, type: "auto", amount: displayAmt, projectedApproval: displayAmt * 3, label: "Active Auto — Comparable Credit", category: "active", detail: `Open auto loan — ${amtLabel}.`, bureauSource: bs, amountEstimated: estimated });
    return true;
  }
  if (a.type === "mortgage") {
    comparable.push({ creditor: a.creditor, type: "mortgage", amount: displayAmt, projectedApproval: displayAmt, label: "Active Mortgage — Comparable Credit", category: "active", detail: `Open mortgage — ${amtLabel}. Most valuable comparable tradeline.`, bureauSource: bs, amountEstimated: estimated });
    return true;
  }
  if (a.type === "personal_loan") {
    comparable.push({ creditor: a.creditor, type: "installment", amount: displayAmt, projectedApproval: displayAmt * 3, label: "Active Installment — Comparable Credit", category: "active", detail: `Open personal loan — ${amtLabel}.`, bureauSource: bs, amountEstimated: estimated });
    return true;
  }
  return false;
}

function pushHistoricalComparable(a: CreditAccount, comparable: ComparableAccount[]): void {
  const { amount: amt, estimated, label: amtLabelType } = getDisplayAmount(a);
  const amtLabel = amt > 0 ? `$${amt.toLocaleString()}${estimated ? " (est.)" : ""}` : amtLabelType;
  const displayAmt = Math.max(amt, 0);
  const bs = a.bureau_source ?? null;

  if (a.type === "credit_card") {
    comparable.push({ creditor: a.creditor, type: "revolving", amount: displayAmt, projectedApproval: Math.round(displayAmt * 1.5), label: "Historical Revolving — Comparable Credit", category: "historical", detail: `Closed revolving — highest limit ${amtLabel}. ${displayAmt > 0 ? `Supports ~$${Math.round(displayAmt * 1.5).toLocaleString()} for a new revolving account.` : "Original amount needed for projection."}`, bureauSource: bs, amountEstimated: estimated });
  } else if (a.type === "auto_loan" || /(auto|automobile|vehicle|ally fin)/i.test(a.creditor)) {
    comparable.push({ creditor: a.creditor, type: "auto", amount: displayAmt, projectedApproval: displayAmt * 3, label: "Historical Auto — Comparable Credit", category: "historical", detail: `Closed auto loan — ${amtLabel}. ${displayAmt > 0 ? `Supports ~$${(displayAmt * 3).toLocaleString()} for your next vehicle financing.` : "Original loan amount needed for projection."}`, bureauSource: bs, amountEstimated: estimated });
  } else if (a.type === "personal_loan" || a.type === "installment") {
    comparable.push({ creditor: a.creditor, type: "installment", amount: displayAmt, projectedApproval: displayAmt * 3, label: "Historical Installment — Comparable Credit", category: "historical", detail: `Closed installment loan — ${amtLabel}. ${displayAmt > 0 ? `Supports ~$${(displayAmt * 3).toLocaleString()} for your next personal loan.` : "Original amount needed for projection."}`, bureauSource: bs, amountEstimated: estimated });
  } else if (a.type === "mortgage") {
    comparable.push({ creditor: a.creditor, type: "mortgage", amount: displayAmt, projectedApproval: displayAmt, label: "Historical Mortgage — Comparable Credit", category: "historical", detail: `Closed mortgage — ${amtLabel}. Most valuable comparable tradeline.`, bureauSource: bs, amountEstimated: estimated });
  } else if (a.type === "student_loan") {
    comparable.push({ creditor: a.creditor, type: "student_loan", amount: displayAmt, projectedApproval: displayAmt, label: "Historical Student Loan — Comparable Credit", category: "historical", detail: `Paid student loan — ${amtLabel}. Demonstrates long-term installment management.`, bureauSource: bs, amountEstimated: estimated });
  } else {
    comparable.push({ creditor: a.creditor, type: a.type || "other", amount: displayAmt, projectedApproval: displayAmt, label: "Historical — Comparable Credit", category: "historical", detail: `Closed ${(a.type || "account").replace(/_/g, " ")} — ${amtLabel}. Closed in good standing.`, bureauSource: bs, amountEstimated: estimated });
  }
}

/* ─── Main analysis engine ─── */
export function analyzeFile(accounts: CreditAccount[]): FileAnalysis {
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
  validAccounts.filter(a => (a.is_open ?? true) && isGoodStanding(a))
    .forEach(a => pushActiveComparable(a, comparable));

  // Historical comparable (closed accounts in good standing)
  validAccounts.filter(a => isClosedPositive(a))
    .forEach(a => pushHistoricalComparable(a, comparable));

  const withAge = validAccounts.map(a => ({ creditor: a.creditor, months: accountAgeMonths(a) }))
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

  const autoStatus = autoOpen.length > 0 ? "Open" : autoClosed.length > 0 ? "Complete — Historical" : "Missing";
  const autoDetail = autoOpen.length > 0
    ? "Active auto loan."
    : autoClosed.length > 0
      ? (() => {
          const best = autoClosed[0];
          const amt = getOriginalAmount(best);
          return `Closed Auto Loan in Good Standing — Comparable Credit Available. Your ${best.creditor} auto loan is paid off. Estimated approval range: $${(amt * 3).toLocaleString()}.`;
        })()
      : "Missing auto loan tradeline.";
  const plStatus = plOpen.length > 0 ? "Open" : plClosed.length > 0 ? "Complete — Historical" : "Missing";
  const plDetail = plOpen.length > 0 ? "Active personal loan." : plClosed.length > 0 ? "Closed personal loan in good standing — comparable credit available." : "Missing personal loan tradeline.";
  const mortStatus = mortOpen.length > 0 ? "Open" : mortClosed.length > 0 ? "Complete — Historical" : "Missing";
  const mortDetail = mortOpen.length > 0 ? "Active mortgage — strongest tradeline type." : mortClosed.length > 0 ? "Closed mortgage in good standing — most valuable comparable tradeline." : "Missing mortgage — highest-value tradeline.";

  const categories: FileCategory[] = [
    { key: "primary_cards", label: "Primary Credit Cards", iconKey: "credit_card", target: "2–4 above $3,000", status: pcCount >= 2 ? "complete" : "missing", current: `${pcCount} of 2–4`, detail: pcCount >= 2 ? `You have ${pcCount} primary cards above $3,000.` : `You need ${2 - pcCount} more primary card(s) above $3,000.`, suggestion: pcCount < 2 ? getSuggestion("primary_cards", auCount) : undefined, priority: "critical" },
    { key: "authorized_user", label: "Authorized User Accounts", iconKey: "user_check", target: "Maximum 2", status: auCount <= 2 ? "complete" : "warning", current: `${auCount} of 2 max`, detail: auCount <= 2 ? `${auCount} AU account(s) — within limit.` : `${auCount} AU accounts — remove ${auCount - 2} to avoid credit padding flag.`, suggestion: auCount > 2 ? getSuggestion("authorized_user", auCount) : undefined, priority: "critical" },
    { key: "rent_reporting", label: "Rent Reporting", iconKey: "home", target: "1 tradeline", status: hasRent ? "complete" : "missing", current: hasRent ? "Active" : "Not reporting", detail: hasRent ? "Rent payments are being reported." : "Add rent reporting for a free positive tradeline.", suggestion: !hasRent ? getSuggestion("rent_reporting", auCount) : undefined, priority: "enhancement" },
    { key: "utility_reporting", label: "Utility / Streaming Reporting", iconKey: "zap", target: "1 account", status: hasUtility ? "complete" : "missing", current: hasUtility ? "Active" : "Not reporting", detail: hasUtility ? "Utility payments are being reported." : "Add utility reporting at no cost.", suggestion: !hasUtility ? getSuggestion("utility_reporting", auCount) : undefined, priority: "enhancement" },
    { key: "auto_loan", label: "Auto Loan", iconKey: "car", target: "1 (open or closed)", status: hasAuto ? "complete" : "missing", current: autoStatus, detail: autoDetail, suggestion: !hasAuto ? getSuggestion("auto_loan", auCount) : undefined, priority: "important" },
    { key: "personal_loan", label: "Personal Loan", iconKey: "landmark", target: "1 (open or closed)", status: hasPL ? "complete" : "missing", current: plStatus, detail: plDetail, suggestion: !hasPL ? getSuggestion("personal_loan", auCount) : undefined, priority: "important" },
    { key: "mortgage", label: "Mortgage", iconKey: "home", target: "1 (open or closed)", status: hasMort ? "complete" : "missing", current: mortStatus, detail: mortDetail, suggestion: !hasMort ? getSuggestion("mortgage", auCount) : undefined, priority: "critical" },
    { key: "credit_age", label: "Credit Age", iconKey: "clock", target: "5+ years average", status: creditAgeOk ? "complete" : "missing", current: `${avgAgeYears} years`, detail: creditAgeOk ? `Average ${avgAgeYears} years — strong.` : `Average ${avgAgeYears} years — below 5-year target.`, suggestion: !creditAgeOk ? getSuggestion("credit_age", auCount) : undefined, priority: "enhancement" },
  ];

  const completedCount = categories.filter(c => c.status === "complete").length;
  return {
    categories, comparable, avgAgeMonths, avgAgeYears, oldestAccounts, newestAccounts,
    completedCount, totalCategories: categories.length, completionPct: Math.round((completedCount / categories.length) * 100),
    totalOpen: validAccounts.filter(a => a.is_open ?? true).length, primaryCardsAbove3k: pcCount, auCount,
  };
}

/* ─── Bureau-specific negative analysis ─── */
export function analyzeNegativesForBureau(bureau: BureauKey, allNegatives: NegativeItem[]): BureauNegativeAnalysis {
  const bureauLabel = BUREAU_META[bureau].label.toLowerCase();
  const thisItems = allNegatives.filter(n => n.bureau.toLowerCase().includes(bureauLabel) || n.bureau.toLowerCase() === bureau);

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
    const bureauSpread = count >= 3
      ? "Reported by all 3 bureaus"
      : count === 2
        ? "Reported by 2 of 3 bureaus"
        : `${BUREAU_META[bureau].label} only`;
    return { ...n, bureauSpread };
  });

  return { total: thisItems.length, exclusive, shared, items };
}

/* ─── Lender helpers ─── */
export function getLendersForBureau(bureau: BureauKey, lenders: LenderPref[]): string[] {
  const b = BUREAU_META[bureau].label.toLowerCase();
  return lenders
    .filter(l => l.primary_bureau.toLowerCase().includes(b) || l.secondary_bureau?.toLowerCase().includes(b))
    .map(l => l.institution_name)
    .slice(0, 8);
}

/* ─── Exported context builder used by Paige's chat hook ─── */
export function buildBureauHealthContext(
  scores: BureauScores,
  accounts: CreditAccount[],
  negatives: NegativeItem[],
  lenders: LenderPref[],
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
    const activeComp = analysis.comparable.filter(c => c.category === "active");
    const histComp = analysis.comparable.filter(c => c.category === "historical");
    const highestComp = analysis.comparable.length > 0 ? Math.max(...analysis.comparable.map(c => c.amount)) : 0;

    parts.push(`\n${BUREAU_META[b].label} (score: ${score ?? "N/A"}):`);
    parts.push(`- File completion: ${analysis.completedCount} of ${analysis.totalCategories} account types`);
    parts.push(`- Negative items on ${BUREAU_META[b].label} only: ${negAnalysis.exclusive}`);
    parts.push(`- Negative items shared with other bureaus: ${negAnalysis.shared}`);
    parts.push(`- Comparable credit (active): ${activeComp.length} accounts, highest $${activeComp.length > 0 ? Math.max(...activeComp.map(c => c.amount)).toLocaleString() : '0'}`);
    parts.push(`- Comparable credit (historical/closed positive): ${histComp.length} accounts, highest $${histComp.length > 0 ? Math.max(...histComp.map(c => c.amount)).toLocaleString() : '0'}`);
    parts.push(`- Total comparable credit: highest $${highestComp.toLocaleString()}, 3x projection $${(highestComp * 3).toLocaleString()}`);
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
