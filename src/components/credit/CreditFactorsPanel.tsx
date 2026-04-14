import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown, ChevronRight, Shield, CreditCard, AlertTriangle,
  Clock, Layers, TrendingUp, CheckCircle, XCircle, Info,
} from "lucide-react";
import { differenceInMonths, differenceInYears, format } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
type BureauKey = "experian" | "transunion" | "equifax";

interface AccountRow {
  id: string;
  creditor: string;
  type: string;
  is_open: boolean | null;
  credit_limit: number | null;
  limit_amount: number | null;
  balance: number | null;
  current_balance: number | null;
  account_open_date: string | null;
  opened_on: string | null;
  account_close_date: string | null;
  status: string | null;
  original_amount: number | null;
  payment_history_json: any | null;
  bureau_source: string | null;
  duplicate_of_id: string | null;
  is_disputed_ownership: boolean | null;
  is_authorized_user: boolean | null;
}

interface NegRow {
  id: string;
  creditor_name: string | null;
  account_number_masked: string | null;
  amount: number | null;
  bureau: string;
  item_type: string;
  status: string | null;
  date_of_occurrence: string | null;
  date_reported: string | null;
  duplicate_of_id: string | null;
  is_disputed_ownership: boolean | null;
}

/* ─── Bureau matching (mirrors CreditFileHealthAssessment) ─── */
function matchesBureau(bs: string | null, bureau: BureauKey): boolean {
  if (!bs) return true;
  const s = bs.toLowerCase().replace(/[\s-]/g, "_");
  if (s === "all_three" || s === "all") return true;
  if (bureau === "experian") return s.includes("experian");
  if (bureau === "transunion") return s.includes("transunion");
  if (bureau === "equifax") return s.includes("equifax");
  return true;
}

function negMatchesBureau(negBureau: string, bureau: BureauKey): boolean {
  const b = negBureau.toLowerCase();
  if (b === "all" || b === "all_three") return true;
  if (bureau === "experian") return b.includes("experian") || b.includes("ex");
  if (bureau === "transunion") return b.includes("transunion") || b.includes("tu");
  if (bureau === "equifax") return b.includes("equifax") || b.includes("eq");
  return true;
}

const BUREAU_LABELS: Record<BureauKey | "all", string> = {
  experian: "Experian",
  transunion: "TransUnion",
  equifax: "Equifax",
  all: "All Bureaus",
};

/* ─── Status helpers ─── */
type FactorStatus = "excellent" | "good" | "fair" | "poor";

function statusColor(s: FactorStatus) {
  return {
    excellent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    good: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    fair: "bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] border-[hsl(var(--accent))]/30",
    poor: "bg-red-500/15 text-red-400 border-red-500/30",
  }[s];
}

function statusLabel(s: FactorStatus) {
  return { excellent: "Excellent", good: "Good", fair: "Fair", poor: "Poor" }[s];
}

function statusBarColor(s: FactorStatus) {
  return {
    excellent: "bg-emerald-500",
    good: "bg-teal-500",
    fair: "bg-[hsl(var(--accent))]",
    poor: "bg-red-500",
  }[s];
}

/* ─── Helpers ─── */
function effLimit(a: AccountRow) { return a.credit_limit ?? a.limit_amount ?? 0; }
function effBal(a: AccountRow) { return Number(a.current_balance ?? a.balance ?? 0); }
function openDate(a: AccountRow): Date | null {
  const d = a.account_open_date ?? a.opened_on;
  return d ? new Date(d) : null;
}

function isRevolving(t: string) {
  return ["revolving", "credit_card", "line_of_credit"].includes(t?.toLowerCase() ?? "");
}

function ageMonths(a: AccountRow): number | null {
  const d = openDate(a);
  if (!d) return null;
  return differenceInMonths(new Date(), d);
}

function formatAge(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}mo`;
  if (m === 0) return `${y}yr`;
  return `${y}yr ${m}mo`;
}

/* ═══════════════════ MAIN COMPONENT ═══════════════════ */
interface CreditFactorsPanelProps {
  selectedBureau: BureauKey | "all";
}

export function CreditFactorsPanel({ selectedBureau }: CreditFactorsPanelProps) {
  const isMobile = useIsMobile();

  // Fetch accounts
  const { data: allAccounts = [] } = useQuery({
    queryKey: ["credit-factors-accounts"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data } = await supabase
        .from("credit_accounts")
        .select("*")
        .eq("user_id", session.user.id)
        .is("duplicate_of_id", null)
        .or("is_disputed_ownership.is.null,is_disputed_ownership.eq.false");
      return (data || []) as AccountRow[];
    },
  });

  // Fetch negatives
  const { data: allNegatives = [] } = useQuery({
    queryKey: ["credit-factors-negatives"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data } = await supabase
        .from("credit_negative_items")
        .select("id, creditor_name, account_number_masked, amount, bureau, item_type, status, date_of_occurrence, date_reported, duplicate_of_id, is_disputed_ownership")
        .eq("user_id", session.user.id)
        .is("duplicate_of_id", null)
        .or("is_disputed_ownership.is.null,is_disputed_ownership.eq.false")
        .neq("status", "removed");
      return (data || []) as NegRow[];
    },
  });

  // Filter by bureau
  const accounts = useMemo(() => {
    if (selectedBureau === "all") return allAccounts;
    return allAccounts.filter(a => matchesBureau(a.bureau_source, selectedBureau));
  }, [allAccounts, selectedBureau]);

  const negatives = useMemo(() => {
    if (selectedBureau === "all") return allNegatives;
    return allNegatives.filter(n => negMatchesBureau(n.bureau, selectedBureau));
  }, [allNegatives, selectedBureau]);

  if (allAccounts.length === 0 && allNegatives.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Credit Factors</h2>
        <span className="text-xs text-muted-foreground">
          Showing data for: <span className="font-medium text-foreground">{BUREAU_LABELS[selectedBureau]}</span>
        </span>
      </div>

      <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2")}>
        <PaymentHistoryCard accounts={accounts} negatives={negatives} bureau={selectedBureau} />
        <UtilizationCard accounts={accounts} bureau={selectedBureau} />
        <DerogatoryMarksCard negatives={negatives} bureau={selectedBureau} />
        <CreditAgeCard accounts={accounts} bureau={selectedBureau} />
        <TotalAccountsCard accounts={accounts} bureau={selectedBureau} />
      </div>
    </div>
  );
}

/* ─── Expandable Factor Card wrapper ─── */
function FactorCard({
  icon, label, status, summary, weight, children,
}: {
  icon: React.ReactNode;
  label: string;
  status: FactorStatus;
  summary: React.ReactNode;
  weight: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="bg-card border-border overflow-hidden">
      <button
        className="w-full text-left p-5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-semibold text-sm">{label}</span>
            <span className="text-[10px] text-muted-foreground">({weight})</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-[10px] border", statusColor(status))}>{statusLabel(status)}</Badge>
            {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">{summary}</div>
      </button>

      {expanded && (
        <div className="border-t border-border p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </Card>
  );
}

/* ═══ CARD 1: Payment History ═══ */
function PaymentHistoryCard({ accounts, negatives, bureau }: { accounts: AccountRow[]; negatives: NegRow[]; bureau: BureauKey | "all" }) {
  const totalAccounts = accounts.length;
  // Rough payment history: accounts with good status / total
  const goodAccounts = accounts.filter(a => {
    const s = (a.status ?? "").toLowerCase();
    return !s.includes("late") && !s.includes("delinquent") && !s.includes("charge") && !s.includes("collection");
  });
  const pct = totalAccounts > 0 ? Math.round((goodAccounts.length / totalAccounts) * 100) : 100;

  // Late payment counts from negatives
  const lates = negatives.filter(n => n.item_type?.toLowerCase().includes("late"));
  const collections = negatives.filter(n => n.item_type?.toLowerCase().includes("collection"));
  const chargeOffs = negatives.filter(n => {
    const t = n.item_type?.toLowerCase() ?? "";
    return t.includes("charge") || t === "charge_off";
  });

  const status: FactorStatus = pct >= 98 ? "excellent" : pct >= 90 ? "good" : pct >= 80 ? "fair" : "poor";

  const perfect = accounts.filter(a => {
    const s = (a.status ?? "").toLowerCase();
    return !s.includes("late") && !s.includes("delinquent") && !s.includes("charge") && !s.includes("collection");
  });
  const withIssues = accounts.filter(a => !perfect.includes(a));

  return (
    <FactorCard
      icon={<Shield className="w-5 h-5 text-emerald-400" />}
      label="Payment History"
      status={status}
      weight="35%"
      summary={
        <span>{pct}% on-time payment rate across {totalAccounts} accounts on {BUREAU_LABELS[bureau]}</span>
      }
    >
      <p className="text-xs text-muted-foreground italic">
        Payment history is the single most important factor — approximately 35% of your FICO score.
      </p>

      {perfect.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Accounts with Perfect History ({perfect.length})
          </h4>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {perfect.slice(0, 20).map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20">
                <span className="font-medium truncate max-w-[60%]">{a.creditor}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                  <span className="text-emerald-400">100%</span>
                </div>
              </div>
            ))}
            {perfect.length > 20 && <p className="text-[10px] text-muted-foreground">+{perfect.length - 20} more</p>}
          </div>
        </div>
      )}

      {withIssues.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Accounts with Late Payments ({withIssues.length})
          </h4>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {withIssues.map(a => (
              <div key={a.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-red-500/5">
                <span className="font-medium truncate max-w-[60%]">{a.creditor}</span>
                <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">{(a.status ?? "").toLowerCase()}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {(lates.length > 0 || collections.length > 0 || chargeOffs.length > 0) && (
        <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t border-border">
          {lates.length > 0 && <p>Late Payments: {lates.length}</p>}
          {collections.length > 0 && <p>Collections: {collections.length}</p>}
          {chargeOffs.length > 0 && <p>Charge-offs: {chargeOffs.length}</p>}
        </div>
      )}
    </FactorCard>
  );
}

/* ═══ CARD 2: Credit Card Usage (Utilization) ═══ */
function UtilizationCard({ accounts, bureau }: { accounts: AccountRow[]; bureau: BureauKey | "all" }) {
  const revolving = accounts.filter(a => isRevolving(a.type) && a.is_open !== false);
  const totalLimit = revolving.reduce((s, a) => s + effLimit(a), 0);
  const totalBal = revolving.reduce((s, a) => s + effBal(a), 0);
  const pct = totalLimit > 0 ? Math.round((totalBal / totalLimit) * 100) : 0;

  const status: FactorStatus = pct < 10 ? "excellent" : pct <= 20 ? "good" : pct <= 30 ? "fair" : "poor";

  const target10 = Math.round(totalLimit * 0.1);
  const paydownNeeded = Math.max(0, totalBal - target10);

  return (
    <FactorCard
      icon={<CreditCard className="w-5 h-5 text-teal-400" />}
      label="Credit Card Usage"
      status={status}
      weight="30%"
      summary={
        <span>Using ${totalBal.toLocaleString()} of ${totalLimit.toLocaleString()} available ({pct}% utilization) on {BUREAU_LABELS[bureau]}</span>
      }
    >
      <p className="text-xs text-muted-foreground italic">
        Target below 10% for maximum score impact. Above 30% starts hurting your score significantly.
      </p>

      {revolving.length > 0 ? (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {revolving.map(a => {
            const lim = effLimit(a);
            const bal = effBal(a);
            const u = lim > 0 ? Math.round((bal / lim) * 100) : 0;
            const isHigh = u > 30;
            const isCritical = u > 90;
            return (
              <div key={a.id} className={cn("p-2 rounded text-xs", isCritical ? "bg-red-500/10" : isHigh ? "bg-amber-500/5" : "bg-muted/20")}>
                <div className="flex justify-between mb-1">
                  <span className="font-medium truncate max-w-[50%]">{a.creditor}</span>
                  <span className={cn("font-semibold", isCritical ? "text-red-400" : isHigh ? "text-amber-400" : "text-emerald-400")}>{u}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", isCritical ? "bg-red-500" : isHigh ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${Math.min(u, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    ${bal.toLocaleString()} / ${lim.toLocaleString()}
                  </span>
                </div>
                {isHigh && lim > 0 && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    💡 Pay down to ${Math.round(lim * 0.3).toLocaleString()} to reach 30% utilization
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No open revolving accounts found on {BUREAU_LABELS[bureau]}.</p>
      )}

      {paydownNeeded > 0 && (
        <div className="p-3 rounded bg-muted/20 border border-border text-xs">
          <p className="font-medium text-foreground">💡 Utilization Optimizer</p>
          <p className="text-muted-foreground mt-1">
            Pay down ${paydownNeeded.toLocaleString()} to reach 10% utilization on {BUREAU_LABELS[bureau]} — potentially adding significant points to your score.
          </p>
        </div>
      )}
    </FactorCard>
  );
}

/* ═══ CARD 3: Derogatory Marks ═══ */
function DerogatoryMarksCard({ negatives, bureau }: { negatives: NegRow[]; bureau: BureauKey | "all" }) {
  const total = negatives.length;
  const collections = negatives.filter(n => n.item_type?.toLowerCase().includes("collection"));
  const chargeOffs = negatives.filter(n => { const t = n.item_type?.toLowerCase() ?? ""; return t.includes("charge") || t === "charge_off"; });
  const lates = negatives.filter(n => n.item_type?.toLowerCase().includes("late"));
  const other = negatives.filter(n => !collections.includes(n) && !chargeOffs.includes(n) && !lates.includes(n));

  const status: FactorStatus = total === 0 ? "excellent" : total <= 2 ? "fair" : "poor";

  const breakdownText = [
    collections.length > 0 ? `${collections.length} collections` : null,
    chargeOffs.length > 0 ? `${chargeOffs.length} charge-offs` : null,
    lates.length > 0 ? `${lates.length} late payments` : null,
    other.length > 0 ? `${other.length} other` : null,
  ].filter(Boolean).join(", ");

  return (
    <FactorCard
      icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
      label="Derogatory Marks"
      status={status}
      weight="High Impact"
      summary={
        <div className="flex items-center gap-3">
          <span className={cn("text-2xl font-bold", total === 0 ? "text-emerald-400" : "text-red-400")}>{total}</span>
          <span>derogatory marks on {BUREAU_LABELS[bureau]}{breakdownText ? ` — ${breakdownText}` : ""}</span>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground italic">
        Each derogatory mark significantly damages your score. Removing or resolving these is the fastest path to score improvement.
      </p>

      {negatives.length > 0 ? (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {negatives.map(n => {
            const removalDate = n.date_of_occurrence
              ? new Date(new Date(n.date_of_occurrence).getTime() + 7 * 365.25 * 24 * 60 * 60 * 1000)
              : null;
            return (
              <div key={n.id} className="p-2 rounded bg-red-500/5 text-xs">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium">{n.creditor_name || "Unknown"}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                        {(n.item_type || "").replace(/_/g, " ")}
                      </Badge>
                      <span className="text-muted-foreground">{n.bureau}</span>
                    </div>
                  </div>
                  {n.amount != null && n.amount > 0 && (
                    <span className="font-semibold text-red-400">${n.amount.toLocaleString()}</span>
                  )}
                </div>
                {removalDate && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Est. removal: {format(removalDate, "MMM yyyy")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle className="w-4 h-4" />
          <span>No derogatory marks found — excellent!</span>
        </div>
      )}
    </FactorCard>
  );
}

/* ═══ CARD 4: Credit Age ═══ */
function CreditAgeCard({ accounts, bureau }: { accounts: AccountRow[]; bureau: BureauKey | "all" }) {
  const ages = accounts.map(a => ({ ...a, months: ageMonths(a) })).filter(a => a.months !== null) as (AccountRow & { months: number })[];
  const avg = ages.length > 0 ? Math.round(ages.reduce((s, a) => s + a.months, 0) / ages.length) : 0;
  const oldest = ages.length > 0 ? ages.reduce((o, a) => a.months > o.months ? a : o) : null;
  const newest = ages.length > 0 ? ages.reduce((n, a) => a.months < n.months ? a : n) : null;

  const avgYears = avg / 12;
  const status: FactorStatus = avgYears >= 7 ? "excellent" : avgYears >= 5 ? "good" : avgYears >= 3 ? "fair" : "poor";

  const sorted = [...ages].sort((a, b) => b.months - a.months);
  const anchors = sorted.slice(0, 3);
  const newAccounts = sorted.filter(a => a.months < 12);

  return (
    <FactorCard
      icon={<Clock className="w-5 h-5 text-blue-400" />}
      label="Credit Age"
      status={status}
      weight="15%"
      summary={
        <div>
          <span>{formatAge(avg)} average</span>
          {oldest && <span className="block text-[11px]">Oldest account: {oldest.creditor} ({formatAge(oldest.months)})</span>}
        </div>
      }
    >
      <p className="text-xs text-muted-foreground italic">
        Credit age is ~15% of your FICO score. Avoid closing old accounts and avoid opening unnecessary new accounts.
      </p>

      {sorted.length > 0 ? (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sorted.slice(0, 25).map((a, i) => {
            const isAnchor = anchors.includes(a);
            const isNew = a.months < 12;
            return (
              <div key={a.id} className={cn("flex items-center justify-between text-xs py-1.5 px-2 rounded", isAnchor ? "bg-[hsl(var(--accent))]/10 border border-[hsl(var(--accent))]/20" : "bg-muted/20")}>
                <div className="flex items-center gap-2 truncate max-w-[60%]">
                  {isAnchor && <span className="text-[10px]">⚓</span>}
                  <span className={cn("font-medium", isAnchor && "text-[hsl(var(--accent))]")}>{a.creditor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatAge(a.months)}</span>
                  {a.is_open === false && <Badge variant="outline" className="text-[9px]">Closed</Badge>}
                  {isNew && <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">New</Badge>}
                </div>
              </div>
            );
          })}
          {sorted.length > 25 && <p className="text-[10px] text-muted-foreground">+{sorted.length - 25} more</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No account age data available on {BUREAU_LABELS[bureau]}.</p>
      )}

      {anchors.length > 0 && (
        <div className="p-2 rounded bg-[hsl(var(--accent))]/5 border border-[hsl(var(--accent))]/20 text-[10px] text-[hsl(var(--accent))]">
          ⚓ Anchor Accounts — Do Not Close: {anchors.map(a => a.creditor).join(", ")}
        </div>
      )}
    </FactorCard>
  );
}

/* ═══ CARD 5: Total Accounts ═══ */
function TotalAccountsCard({ accounts, bureau }: { accounts: AccountRow[]; bureau: BureauKey | "all" }) {
  const openAccts = accounts.filter(a => a.is_open !== false);
  const closedAccts = accounts.filter(a => a.is_open === false);

  const openRevolving = openAccts.filter(a => isRevolving(a.type)).length;
  const openInstallment = openAccts.filter(a => ["installment", "personal_loan", "auto_loan", "student_loan", "automobile"].includes(a.type?.toLowerCase() ?? "")).length;
  const openMortgage = openAccts.filter(a => a.type?.toLowerCase() === "mortgage").length;
  const openOther = openAccts.length - openRevolving - openInstallment - openMortgage;

  const closedGood = closedAccts.filter(a => {
    const s = (a.status ?? "").toLowerCase();
    return !s.includes("charge") && !s.includes("collection") && !s.includes("delinquent");
  });
  const closedBad = closedAccts.filter(a => !closedGood.includes(a));

  const status: FactorStatus = openAccts.length >= 10 ? "excellent" : openAccts.length >= 6 ? "good" : openAccts.length >= 3 ? "fair" : "poor";

  return (
    <FactorCard
      icon={<Layers className="w-5 h-5 text-purple-400" />}
      label="Total Accounts"
      status={status}
      weight="10%"
      summary={
        <div className="flex gap-4">
          <div>
            <span className="text-lg font-bold text-foreground">{openAccts.length}</span>
            <span className="text-[11px] ml-1">Open</span>
          </div>
          <div>
            <span className="text-lg font-bold text-foreground">{closedAccts.length}</span>
            <span className="text-[11px] ml-1">Closed</span>
          </div>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground italic">
        Lenders want to see a healthy mix of account types. Both open and closed accounts tell the story of your credit history.
      </p>

      {/* Open accounts breakdown */}
      <div>
        <h4 className="text-xs font-semibold mb-2">Open Accounts ({openAccts.length})</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-muted/20">Revolving: <span className="font-semibold">{openRevolving}</span></div>
          <div className="p-2 rounded bg-muted/20">Installment: <span className="font-semibold">{openInstallment}</span></div>
          <div className="p-2 rounded bg-muted/20">Mortgage: <span className="font-semibold">{openMortgage}</span></div>
          <div className="p-2 rounded bg-muted/20">Other: <span className="font-semibold">{openOther}</span></div>
        </div>
      </div>

      {/* Closed accounts breakdown */}
      <div>
        <h4 className="text-xs font-semibold mb-2">Closed Accounts ({closedAccts.length})</h4>
        <div className="flex gap-3 text-xs">
          <div className="p-2 rounded bg-emerald-500/10 flex-1">
            <span className="text-emerald-400 font-semibold">{closedGood.length}</span>
            <span className="text-muted-foreground ml-1">Good Standing</span>
          </div>
          <div className="p-2 rounded bg-red-500/10 flex-1">
            <span className="text-red-400 font-semibold">{closedBad.length}</span>
            <span className="text-muted-foreground ml-1">With Issues</span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Closed in good standing accounts contribute to comparable credit and credit age.</p>
      </div>

      {/* Account lists */}
      {openAccts.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {openAccts.slice(0, 15).map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20">
              <span className="font-medium truncate max-w-[50%]">{a.creditor}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px]">{a.type}</Badge>
                {effLimit(a) > 0 && <span className="text-muted-foreground">${effLimit(a).toLocaleString()}</span>}
              </div>
            </div>
          ))}
          {openAccts.length > 15 && <p className="text-[10px] text-muted-foreground">+{openAccts.length - 15} more</p>}
        </div>
      )}
    </FactorCard>
  );
}
