import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Sparkles, ChevronDown, ChevronUp, ArrowRight, ExternalLink, TrendingUp } from "lucide-react";
import { writeClientMemory } from "@/lib/clientMemory";
import {
  Bureau,
  BUREAU_LABELS,
  BureauScores,
  parseBureauSource,
  projectPaydown,
  projectNegativeRemoval,
  projectTradeline,
  TradelineType,
  TradelineProfile,
  bureauBadgeClass,
  strongestBureau,
  ScoreImpact,
} from "@/lib/creditSimulator";

interface Props {
  userId: string;
  onNavigate: (section: string) => void;
}

interface RevolvingAccount {
  id: string;
  creditor: string;
  current_balance: number | null;
  credit_limit: number | null;
  bureau_source: string | null;
}

interface NegativeItem {
  id: string;
  creditor_name: string;
  item_type: string | null;
  amount: number | null;
  bureau: string | null;
  date_of_occurrence: string | null;
}

const DISCLAIMER =
  "Score projections are estimates based on general FICO scoring factors and your current credit profile. Actual results may vary. These are educational estimates only.";

// Affiliate CTAs for missing tradeline types
const TRADELINE_CTAS: Partial<Record<TradelineType, { label: string; url: string }>> = {
  rent_reporting: {
    label: "Set up CreditRentBoost",
    url: "https://affiliates.creditrentboost.com/?affi=00498",
  },
  personal_loan: {
    label: "Open a Credit Strong account",
    url: "https://creditstrong.referralrock.com/l/3ANTONIO94/",
  },
  mortgage: {
    label: "Book a Strategy Session",
    url: "https://www.mogulmakeracademy.com/booking-screening.html",
  },
};

// ── Bureau impact row ───────────────────────────────────────────────────────
function ImpactRow({ impact }: { impact: ScoreImpact }) {
  const noChange = impact.low === 0 && impact.high === 0;
  const projection =
    impact.baseline === null
      ? "—"
      : noChange
      ? `${impact.baseline}`
      : impact.projectedLow === impact.projectedHigh
      ? `${impact.projectedLow}`
      : `${impact.projectedLow} – ${impact.projectedHigh}`;
  const delta = noChange ? "No projected change" : `+${impact.low} to +${impact.high}`;
  const deltaColor = noChange ? "text-amber-500" : "text-primary";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {BUREAU_LABELS[impact.bureau]}
        </p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded ${bureauBadgeClass(impact.baseline)}`}>
            {impact.baseline ?? "—"}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-base font-semibold text-foreground truncate">{projection}</span>
        </div>
      </div>
      <span className={`text-sm font-semibold ${deltaColor} shrink-0`}>{delta}</span>
    </div>
  );
}

// ── Tab 1: Pay down a card ─────────────────────────────────────────────────
function PayDownTab({ accounts, scores }: { accounts: RevolvingAccount[]; scores: BureauScores }) {
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const account = useMemo(() => accounts.find((a) => a.id === accountId), [accounts, accountId]);

  const limit = account?.credit_limit ?? 0;
  const balance = account?.current_balance ?? 0;
  const [target, setTarget] = useState<number>(0);

  useEffect(() => {
    // Default target: drop to 9% of limit (or 0 if no limit known)
    const def = limit > 0 ? Math.round(limit * 0.09) : 0;
    setTarget(def);
  }, [accountId, limit]);

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No open revolving accounts found in your credit file yet.
      </p>
    );
  }

  if (!account) return null;

  const result = projectPaydown({
    currentBalance: balance,
    creditLimit: limit || 1,
    targetBalance: target,
    bureaus: parseBureauSource(account.bureau_source),
    scores,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Choose a card</label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.creditor} — ${(a.current_balance ?? 0).toLocaleString()} / $
                {(a.credit_limit ?? 0).toLocaleString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Balance</p>
          <p className="text-sm font-semibold">${balance.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Limit</p>
          <p className="text-sm font-semibold">${limit.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-[11px] uppercase text-muted-foreground">Utilization</p>
          <p className="text-sm font-semibold">{result.currentUtil.toFixed(0)}%</p>
        </div>
      </div>

      {limit > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Target balance</span>
            <span className="font-semibold text-foreground">
              ${target.toLocaleString()} ({result.targetUtil.toFixed(0)}%)
            </span>
          </div>
          <Slider
            value={[target]}
            onValueChange={(v) => setTarget(v[0])}
            min={0}
            max={Math.max(balance, limit)}
            step={Math.max(10, Math.round(limit / 100))}
          />
        </div>
      )}

      <div className="space-y-2">
        {result.impacts.map((i) => (
          <ImpactRow key={i.bureau} impact={i} />
        ))}
      </div>
    </div>
  );
}

// ── Tab 2: Remove a negative ───────────────────────────────────────────────
function RemoveNegativeTab({
  items,
  scores,
  onNavigate,
}: {
  items: NegativeItem[];
  scores: BureauScores;
  onNavigate: (section: string) => void;
}) {
  const [itemId, setItemId] = useState<string>(items[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No removable negative items detected on your file. Great news.
      </p>
    );
  }

  if (!item) return null;

  const bureaus = parseBureauSource(item.bureau);
  const impacts = projectNegativeRemoval({
    itemType: item.item_type,
    dateOfOccurrence: item.date_of_occurrence,
    bureaus,
    scores,
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Choose a negative item</label>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.creditor_name} — {i.item_type ?? "negative"}{" "}
                {i.amount ? `($${Number(i.amount).toLocaleString()})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="uppercase text-muted-foreground">Type</p>
          <p className="text-sm font-semibold capitalize">{item.item_type ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="uppercase text-muted-foreground">Amount</p>
          <p className="text-sm font-semibold">
            {item.amount ? `$${Number(item.amount).toLocaleString()}` : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="uppercase text-muted-foreground">Reports to</p>
          <p className="text-sm font-semibold">{bureaus.map((b) => BUREAU_LABELS[b][0]).join("/")}</p>
        </div>
      </div>

      <div className="space-y-2">
        {impacts.map((i) => (
          <ImpactRow key={i.bureau} impact={i} />
        ))}
      </div>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => onNavigate("personal")}
      >
        Start Dispute for This Item
      </Button>
    </div>
  );
}

// ── Tab 3: Add a tradeline ─────────────────────────────────────────────────
const TRADELINE_CARDS: Array<{ type: TradelineType; label: string; sub: string }> = [
  { type: "primary_card", label: "Primary Credit Card", sub: "$3,000+ limit" },
  { type: "auto_loan", label: "Auto Loan", sub: "Installment loan" },
  { type: "personal_loan", label: "Personal Loan", sub: "Credit Strong, etc." },
  { type: "mortgage", label: "Mortgage", sub: "Highest impact" },
  { type: "rent_reporting", label: "Rent Reporting", sub: "CreditRentBoost" },
  { type: "utility_reporting", label: "Utility Reporting", sub: "Alternative data" },
];

function AddTradelineTab({
  profile,
  scores,
}: {
  profile: TradelineProfile;
  scores: BureauScores;
}) {
  const [type, setType] = useState<TradelineType>("primary_card");
  const result = projectTradeline({ type, profile, scores });

  const isMissing = (t: TradelineType): boolean => {
    switch (t) {
      case "auto_loan": return !profile.hasAutoLoan;
      case "personal_loan": return !profile.hasInstallmentLoan;
      case "mortgage": return !profile.hasMortgage;
      case "rent_reporting": return !profile.hasRentReporting;
      case "utility_reporting": return !profile.hasUtilityReporting;
      default: return false;
    }
  };

  const cta = TRADELINE_CTAS[type];
  const showCta = cta && (type === "mortgage" || isMissing(type));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {TRADELINE_CARDS.map((c) => {
          const selected = type === c.type;
          const missing = isMissing(c.type);
          return (
            <button
              key={c.type}
              onClick={() => setType(c.type)}
              className={`text-left rounded-lg border p-3 transition-all ${
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/40 hover:border-primary/50"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{c.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</p>
              {missing && (
                <Badge variant="outline" className="mt-2 text-[10px] border-primary/40 text-primary">
                  Missing
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="uppercase text-muted-foreground">Credit mix</p>
          <p className="text-foreground font-medium mt-1">{result.mixDelta}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="uppercase text-muted-foreground">Utilization</p>
          <p className="text-foreground font-medium mt-1">{result.utilDelta}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="uppercase text-muted-foreground">Credit age</p>
          <p className="text-foreground font-medium mt-1">{result.ageDelta}</p>
        </div>
      </div>

      <div className="space-y-2">
        {result.impacts.map((i) => (
          <ImpactRow key={i.bureau} impact={i} />
        ))}
      </div>

      {showCta && cta && (
        <Button
          asChild
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <a href={cta.url} target="_blank" rel="noopener noreferrer">
            {cta.label} <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        </Button>
      )}
    </div>
  );
}

// ── Tab 4: Combined action plan ────────────────────────────────────────────
type RankedAction = {
  key: string;
  title: string;
  detail: string;
  low: number;
  high: number;
  bureau: Bureau;
};

function CombinedTab({
  accounts,
  negatives,
  profile,
  scores,
}: {
  accounts: RevolvingAccount[];
  negatives: NegativeItem[];
  profile: TradelineProfile;
  scores: BureauScores;
}) {
  const actions: RankedAction[] = [];

  // Best paydown candidate: highest-utilization card, project to 9%
  const utilAccts = accounts
    .filter((a) => (a.credit_limit ?? 0) > 0)
    .map((a) => ({
      ...a,
      util: ((a.current_balance ?? 0) / Math.max(a.credit_limit ?? 1, 1)) * 100,
    }))
    .sort((x, y) => y.util - x.util);
  const topCard = utilAccts[0];
  if (topCard && topCard.util > 10) {
    const bureaus = parseBureauSource(topCard.bureau_source);
    const r = projectPaydown({
      currentBalance: topCard.current_balance ?? 0,
      creditLimit: topCard.credit_limit ?? 1,
      targetBalance: Math.round((topCard.credit_limit ?? 0) * 0.09),
      bureaus,
      scores,
    });
    const top = r.impacts.sort((a, b) => b.high - a.high)[0];
    if (top && top.high > 0) {
      actions.push({
        key: `paydown-${topCard.id}`,
        title: `Pay down ${topCard.creditor} to under 10% utilization`,
        detail: `Reduces utilization from ${r.currentUtil.toFixed(0)}% to ~9%`,
        low: top.low,
        high: top.high,
        bureau: top.bureau,
      });
    }
  }

  // Best negative removal: highest projected impact
  for (const n of negatives) {
    const bureaus = parseBureauSource(n.bureau);
    const impacts = projectNegativeRemoval({
      itemType: n.item_type,
      dateOfOccurrence: n.date_of_occurrence,
      bureaus,
      scores,
    });
    const top = impacts.sort((a, b) => b.high - a.high)[0];
    if (top) {
      actions.push({
        key: `remove-${n.id}`,
        title: `Remove ${n.item_type ?? "negative"} from ${n.creditor_name}`,
        detail: `Dispute and remove this ${n.item_type ?? "item"}`,
        low: top.low,
        high: top.high,
        bureau: top.bureau,
      });
    }
  }

  // Best tradeline addition
  const tradelineCandidates: TradelineType[] = [];
  if (!profile.hasMortgage) tradelineCandidates.push("mortgage");
  if (!profile.hasInstallmentLoan) tradelineCandidates.push("personal_loan");
  if (profile.aggregateUtilization > 30) tradelineCandidates.push("primary_card");
  if (!profile.hasRentReporting) tradelineCandidates.push("rent_reporting");
  for (const t of tradelineCandidates) {
    const r = projectTradeline({ type: t, profile, scores });
    const top = r.impacts.sort((a, b) => b.high - a.high)[0];
    if (top && top.high > 0) {
      actions.push({
        key: `add-${t}`,
        title: `Add a ${t.replace(/_/g, " ")}`,
        detail: r.mixDelta,
        low: top.low,
        high: top.high,
        bureau: top.bureau,
      });
    }
  }

  const top3 = actions.sort((a, b) => b.high - a.high).slice(0, 3);
  const totalLow = top3.reduce((a, b) => a + b.low, 0);
  const totalHigh = top3.reduce((a, b) => a + b.high, 0);
  const strongest = strongestBureau(scores);

  if (top3.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Connect a credit report to unlock a personalized action plan.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {top3.map((a, idx) => (
        <div
          key={a.key}
          className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-bold">
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{a.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-primary">+{a.low}–{a.high}</p>
            <p className="text-[10px] text-muted-foreground uppercase">{BUREAU_LABELS[a.bureau]}</p>
          </div>
        </div>
      ))}

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 mt-2">
        <p className="text-sm">
          <TrendingUp className="w-4 h-4 inline-block mr-1 text-primary" />
          If you complete all {top3.length} action{top3.length > 1 ? "s" : ""}, your estimated score
          improvement across your strongest bureau{" "}
          {strongest ? <span className="font-semibold">({BUREAU_LABELS[strongest]})</span> : null} is{" "}
          <span className="font-bold text-primary">
            +{totalLow} to +{totalHigh} points
          </span>
          .
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function CreditScoreSimulator({ userId, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("paydown");

  // Profile / baseline scores
  const { data: profile } = useQuery({
    queryKey: ["simulator-profile", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("estimated_fico_ex, estimated_fico_tu, estimated_fico_eq")
        .eq("user_id", userId)
        .maybeSingle();
      return data as { estimated_fico_ex: number | null; estimated_fico_tu: number | null; estimated_fico_eq: number | null } | null;
    },
  });

  const scores: BureauScores = {
    experian: profile?.estimated_fico_ex ?? null,
    transunion: profile?.estimated_fico_tu ?? null,
    equifax: profile?.estimated_fico_eq ?? null,
  };

  // Open revolving accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["simulator-revolving", userId],
    enabled: expanded,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_accounts")
        .select("id, creditor, current_balance, credit_limit, bureau_source, type, is_open")
        .eq("user_id", userId)
        .eq("type", "revolving")
        .neq("is_open", false);
      return (data ?? []).map((a: any) => ({
        id: a.id,
        creditor: a.creditor,
        current_balance: a.current_balance ?? a.balance ?? 0,
        credit_limit: a.credit_limit ?? a.limit_amount ?? 0,
        bureau_source: a.bureau_source,
      })) as RevolvingAccount[];
    },
  });

  // All accounts (for tradeline profile)
  const { data: allAccounts = [] } = useQuery({
    queryKey: ["simulator-all-accounts", userId],
    enabled: expanded,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_accounts")
        .select("type, creditor, current_balance, credit_limit, is_open")
        .eq("user_id", userId);
      return data ?? [];
    },
  });

  // Negative items (eligible for removal)
  const { data: negatives = [] } = useQuery({
    queryKey: ["simulator-negatives", userId],
    enabled: expanded,
    queryFn: async () => {
      const { data } = await supabase
        .from("credit_negative_items")
        .select("id, creditor_name, item_type, amount, bureau, date_of_occurrence, is_disputed_ownership, duplicate_of_id, status")
        .eq("user_id", userId)
        .neq("status", "removed");
      return (data ?? []).filter(
        (n: any) => !n.is_disputed_ownership && !n.duplicate_of_id,
      ) as NegativeItem[];
    },
  });

  // Build tradeline profile
  const tradelineProfile: TradelineProfile = useMemo(() => {
    const types = (allAccounts as any[]).map((a) => (a.type || "").toLowerCase());
    const hasInstallmentLoan = types.some((t) => t.includes("install") || t.includes("personal") || t.includes("auto") || t.includes("student"));
    const hasMortgage = types.some((t) => t.includes("mortgage") || t.includes("real_estate"));
    const hasAutoLoan = types.some((t) => t.includes("auto"));
    let totalBal = 0, totalLim = 0;
    for (const a of allAccounts as any[]) {
      if (((a.type || "").toLowerCase()).includes("revolv")) {
        totalBal += a.current_balance ?? 0;
        totalLim += a.credit_limit ?? 0;
      }
    }
    const aggregateUtilization = totalLim > 0 ? (totalBal / totalLim) * 100 : 0;
    return {
      hasInstallmentLoan,
      hasMortgage,
      hasAutoLoan,
      hasRentReporting: false,
      hasUtilityReporting: false,
      aggregateUtilization,
    };
  }, [allAccounts]);

  // Track simulator runs to client_memory (debounced via tab switches)
  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => {
      const tabName =
        activeTab === "paydown" ? "Pay Down a Card"
          : activeTab === "remove" ? "Remove a Negative"
          : activeTab === "tradeline" ? "Add a Tradeline"
          : "Combined Action Plan";
      const strongest = strongestBureau(scores);
      const summary = strongest
        ? `Last simulation run: ${tabName} — strongest bureau ${BUREAU_LABELS[strongest]} baseline ${scores[strongest]}.`
        : `Last simulation run: ${tabName}.`;
      writeClientMemory(userId, "simulator_run" as any, summary);
    }, 4000);
    return () => clearTimeout(timer);
  }, [activeTab, expanded, userId, scores]);

  const baselineLine = (
    <span className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
      <span>EX <span className="font-semibold text-foreground">{scores.experian ?? "—"}</span></span>
      <span>TU <span className="font-semibold text-foreground">{scores.transunion ?? "—"}</span></span>
      <span>EQ <span className="font-semibold text-foreground">{scores.equifax ?? "—"}</span></span>
    </span>
  );

  return (
    <Card className="border-border bg-gradient-subtle shadow-card overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Credit Score Simulator
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              See how your actions could impact your scores.
            </p>
            <div className="mt-2">{baselineLine}</div>
          </div>
          <Button
            onClick={() => setExpanded((v) => !v)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
            size="sm"
          >
            {expanded ? (
              <>Hide <ChevronUp className="w-4 h-4 ml-1" /></>
            ) : (
              <>Run Simulation <ChevronDown className="w-4 h-4 ml-1" /></>
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 animate-fade-in">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto">
              <TabsTrigger value="paydown" className="text-xs sm:text-sm">Pay Down</TabsTrigger>
              <TabsTrigger value="remove" className="text-xs sm:text-sm">Remove Negative</TabsTrigger>
              <TabsTrigger value="tradeline" className="text-xs sm:text-sm">Add Tradeline</TabsTrigger>
              <TabsTrigger value="combined" className="text-xs sm:text-sm">Action Plan</TabsTrigger>
            </TabsList>

            <TabsContent value="paydown" className="mt-4">
              <PayDownTab accounts={accounts} scores={scores} />
            </TabsContent>
            <TabsContent value="remove" className="mt-4">
              <RemoveNegativeTab items={negatives} scores={scores} onNavigate={onNavigate} />
            </TabsContent>
            <TabsContent value="tradeline" className="mt-4">
              <AddTradelineTab profile={tradelineProfile} scores={scores} />
            </TabsContent>
            <TabsContent value="combined" className="mt-4">
              <CombinedTab
                accounts={accounts}
                negatives={negatives}
                profile={tradelineProfile}
                scores={scores}
              />
            </TabsContent>
          </Tabs>

          <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed border-t border-border pt-3">
            {DISCLAIMER}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
