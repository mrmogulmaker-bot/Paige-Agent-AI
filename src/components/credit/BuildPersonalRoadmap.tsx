import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Building2,
  CreditCard,
  TrendingUp,
  Users,
  Trophy,
  Target,
} from "lucide-react";

/**
 * BuildPersonalRoadmap
 *
 * Tabbed walkthrough of the canonical 12-month BUILD Personal program
 * (B → U → I → L → D), pulled directly from pme-knowledge-base Section 12.
 *
 * Cross-references the client's actual credit_accounts to mark which
 * tradelines are present and which are missing per phase, so they can
 * see exactly what to add next and why.
 */

type CreditAccount = {
  type: string;
  creditor: string;
  current_balance: number | null;
  balance: number | null;
  credit_limit: number | null;
  limit_amount: number | null;
  is_open: boolean | null;
  is_authorized_user: boolean | null;
  account_open_date: string | null;
};

const PHASES = [
  {
    key: "B",
    name: "Base Setup",
    months: "Months 1–2",
    icon: Building2,
    target: "FICO 680 stable, all 3 bureaus identity-matched",
    summary:
      "Lock in identity consistency across Experian, Equifax, and TransUnion. Open the foundational banking + secured-card infrastructure that every later phase builds on.",
    cost: "$599.80 ($49.90/mo monitoring + $500 secured deposit)",
  },
  {
    key: "U",
    name: "Utilize Tradelines",
    months: "Months 3–4",
    icon: CreditCard,
    target: "FICO 720 across all 3 bureaus, 5 tradelines",
    summary:
      "Add 1 installment loan + 2–3 unsecured cards on a staggered cadence. Never apply for 2 cards in the same week — inquiries stack and look desperate to lenders.",
    cost: "+$35–$50/mo installment, $0 card fees",
  },
  {
    key: "I",
    name: "Integrate & Improve",
    months: "Months 5–6",
    icon: TrendingUp,
    target: "Sub-10% utilization per card, <5 inquiries",
    summary:
      "Master the 3–9% rule per card. Pay 5 days before statement close to control what reports. Request soft-pull CLIs every 90 days to grow available credit.",
    cost: "$0 new — optimization only",
  },
  {
    key: "L",
    name: "Leverage Growth",
    months: "Months 7–9",
    icon: Users,
    target: "3 banker relationships, 1 premium card, 1st PG business card",
    summary:
      "Banker meetings are non-negotiable. Discretion to override automated underwriting is worth more than 30 FICO points. Add Sapphire Preferred + first PG business card.",
    cost: "$95 AF (waived year 1)",
  },
  {
    key: "D",
    name: "Dominate with Fundability",
    months: "Months 10–12",
    icon: Trophy,
    target: "740+ FICO, 10+ accounts, <5% aggregate utilization, $50K+ credit",
    summary:
      "Deploy AZEO (All Zero Except One). Run the December CLI marathon. Pull final MyFICO 3B and transition into BUILD Business with $50K–$100K of unlocked capacity.",
    cost: "$0 new — pure optimization",
  },
] as const;

// Per-phase tradeline checklist that we cross-reference against the
// user's credit_accounts table. Each item maps to a detection function.
type ChecklistItem = {
  label: string;
  why: string;
  detect: (accts: CreditAccount[]) => boolean;
};

const PHASE_CHECKLIST: Record<string, ChecklistItem[]> = {
  B: [
    {
      label: "Secured credit card (DCU or Navy Federal — $500 deposit)",
      why: "Reports to all 3 bureaus, graduates to unsecured at 12 months. This is the entry tradeline — without it, nothing else in BUILD Personal works.",
      detect: (accts) =>
        accts.some(
          (a) =>
            a.type === "credit_card" &&
            /secured|dcu|navy/i.test(a.creditor || "")
        ),
    },
    {
      label: "MyFICO 3B subscription ($29.95/mo)",
      why: "Mandatory. Credit Karma shows VantageScore — lenders pull FICO. If you can't see what they see, you can't engineer the score they want.",
      detect: () => false, // not detectable from credit_accounts
    },
    {
      label: "2 personal checking accounts (1 major bank + 1 credit union)",
      why: "Major bank seeds the future PLOC; credit union builds the relationship banker that overrides automated underwriting later.",
      detect: () => false, // tracked separately in connected_bank_accounts
    },
  ],
  U: [
    {
      label: "Credit-builder installment loan (Self or Credit Strong)",
      why: "Adds installment diversity to a revolving-only file — credit mix is 10% of FICO. Reports to all 3 bureaus.",
      detect: (accts) =>
        accts.some(
          (a) =>
            /self|credit ?strong|moneylion/i.test(a.creditor || "")
        ),
    },
    {
      label: "Store card (Kohl's, Macy's, Amazon)",
      why: "Easy approval at 620+. Adds account #2 with minimal hard-inquiry risk. Apply Week 1 of Month 4.",
      detect: (accts) =>
        accts.some((a) =>
          /kohl|macy|amazon|target|best buy|nordstrom/i.test(a.creditor || "")
        ),
    },
    {
      label: "Cash-back card (Chase Freedom Flex or similar)",
      why: "Real unsecured tradeline at 720+ FICO. $200 sign-up bonus + 0% APR for 15 months funds the U→I transition. Apply Week 5.",
      detect: (accts) =>
        accts.some((a) =>
          /freedom|cash ?back|discover it|capital one quicksilver/i.test(
            a.creditor || ""
          )
        ),
    },
    {
      label: "Credit union card (DCU Visa Platinum or Navy Fed)",
      why: "Relationship-based, $2K–$5K starting limit. The CU becomes your soft-pull CLI engine for the rest of BUILD. Apply Week 9.",
      detect: (accts) =>
        accts.some((a) =>
          /dcu|navy ?fed|penfed|alliant/i.test(a.creditor || "")
        ),
    },
  ],
  I: [
    {
      label: "All revolving cards under 10% utilization",
      why: "30%+ utilization costs ~50 FICO points. The 3–9% sweet spot per card maximizes the score impact of every dollar of available credit.",
      detect: (accts) => {
        const cards = accts.filter(
          (a) => a.type === "credit_card" && a.is_open !== false
        );
        if (cards.length === 0) return false;
        return cards.every((a) => {
          const bal = a.current_balance ?? a.balance ?? 0;
          const limit = a.credit_limit ?? a.limit_amount ?? 0;
          if (limit === 0) return true;
          return bal / limit < 0.1;
        });
      },
    },
    {
      label: "Statement-date tracking calendar built",
      why: "Pay 5 days BEFORE statement close — that's what controls reported balance. Paying after close is too late; the high balance already hit the bureaus.",
      detect: () => false,
    },
    {
      label: "Experian Boost activated (free)",
      why: "Links utility/phone/streaming bills for an instant +5–15 FICO point lift. Zero cost, zero risk — there is no reason not to have this on.",
      detect: () => false,
    },
  ],
  L: [
    {
      label: "3 banker relationships documented",
      why: "Banker discretion overrides automated underwriting. A relationship banker can approve what a fintech algorithm rejects. Worth more than 30 FICO points.",
      detect: () => false,
    },
    {
      label: "Premium travel card (Chase Sapphire Preferred)",
      why: "Signals lender-tier creditworthiness. 60K-point bonus pays for the program. Requires 720+ FICO + $50K income.",
      detect: (accts) =>
        accts.some((a) =>
          /sapphire|venture x|amex platinum|gold/i.test(a.creditor || "")
        ),
    },
    {
      label: "First PG business card (Amex Blue Business Plus or Chase Ink)",
      why: "Bridge between BUILD Personal and BUILD Business. Amex BBP doesn't report to personal credit if paid on time — pure business-credit fuel.",
      detect: (accts) =>
        accts.some((a) =>
          /blue business|chase ink|amex business|capital one spark/i.test(
            a.creditor || ""
          )
        ),
    },
  ],
  D: [
    {
      label: "10+ open tradelines across mixed types",
      why: "10 accounts is the threshold where credit depth becomes a competitive advantage. Lenders see proven multi-account management, not a thin file.",
      detect: (accts) => accts.filter((a) => a.is_open !== false).length >= 10,
    },
    {
      label: "AZEO deployed (5 cards $0, $10 on highest limit)",
      why: "FICO calculates utilization on number of cards reporting balances. Showing 1 card at <1% util = +3–5 FICO points vs. 6 cards at 5% each.",
      detect: () => false,
    },
    {
      label: "Aggregate utilization under 5%",
      why: "Private banking threshold. Below 5% across the entire file unlocks tier-1 funding products and the 740+ FICO bracket.",
      detect: (accts) => {
        const cards = accts.filter(
          (a) => a.type === "credit_card" && a.is_open !== false
        );
        if (cards.length === 0) return false;
        const totalBal = cards.reduce(
          (sum, a) => sum + (a.current_balance ?? a.balance ?? 0),
          0
        );
        const totalLim = cards.reduce(
          (sum, a) => sum + (a.credit_limit ?? a.limit_amount ?? 0),
          0
        );
        if (totalLim === 0) return false;
        return totalBal / totalLim < 0.05;
      },
    },
    {
      label: "$50K+ total available credit",
      why: "The capacity threshold that unlocks $50K–$100K of EIN-only or low-PG business funding when you transition to BUILD Business.",
      detect: (accts) => {
        const totalLim = accts
          .filter((a) => a.type === "credit_card" && a.is_open !== false)
          .reduce(
            (sum, a) => sum + (a.credit_limit ?? a.limit_amount ?? 0),
            0
          );
        return totalLim >= 50000;
      },
    },
  ],
};

export function BuildPersonalRoadmap() {
  const [activePhase, setActivePhase] = useState<string>("B");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["build-personal-accounts"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return [];
      const { data } = await supabase
        .from("credit_accounts")
        .select(
          "type, creditor, current_balance, balance, credit_limit, limit_amount, is_open, is_authorized_user, account_open_date"
        )
        .eq("user_id", session.user.id);
      return (data || []) as CreditAccount[];
    },
  });

  const accts = accounts || [];

  // Compute per-phase completion to drive tab badges + overall progress
  const phaseCompletion = PHASES.map((p) => {
    const items = PHASE_CHECKLIST[p.key];
    const done = items.filter((i) => i.detect(accts)).length;
    return { key: p.key, done, total: items.length };
  });
  const totalDone = phaseCompletion.reduce((s, p) => s + p.done, 0);
  const totalItems = phaseCompletion.reduce((s, p) => s + p.total, 0);
  const overallPct = totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Overall progress header */}
      <div className="p-4 rounded-lg bg-gradient-to-r from-accent/10 to-primary/5 border border-accent/30">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-accent" />
            <h4 className="font-semibold text-sm text-foreground">
              BUILD Personal — your 12-month roadmap
            </h4>
          </div>
          <Badge variant="outline" className="border-accent/40 text-accent text-xs">
            {totalDone} of {totalItems} milestones
          </Badge>
        </div>
        <Progress value={overallPct} className="h-2 mb-2" />
        <p className="text-xs text-muted-foreground">
          Goal: 720+ FICO, 10+ tradelines, $50K+ available credit, 3 banker relationships —
          unlocks $50K–$100K in EIN-only business funding capacity.
        </p>
      </div>

      <Tabs value={activePhase} onValueChange={setActivePhase}>
        <TabsList className="grid grid-cols-5 w-full h-auto">
          {PHASES.map((p) => {
            const comp = phaseCompletion.find((c) => c.key === p.key)!;
            const isComplete = comp.done === comp.total && comp.total > 0;
            return (
              <TabsTrigger
                key={p.key}
                value={p.key}
                className="flex flex-col items-center gap-1 py-2 px-1 data-[state=active]:bg-accent/20 data-[state=active]:text-accent"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold">{p.key}</span>
                  {isComplete && <CheckCircle2 className="w-3 h-3 text-fundability-excellent" />}
                </div>
                <span className="text-[10px] hidden sm:block opacity-70">
                  {comp.done}/{comp.total}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {PHASES.map((phase) => {
          const Icon = phase.icon;
          const items = PHASE_CHECKLIST[phase.key];
          return (
            <TabsContent key={phase.key} value={phase.key} className="mt-4 space-y-4">
              {/* Phase header */}
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-bold text-foreground">
                        Phase {phase.key} — {phase.name}
                      </h5>
                      <Badge variant="outline" className="text-[10px]">
                        {phase.months}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                      {phase.summary}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Target: </span>
                        <span className="text-foreground font-medium">{phase.target}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Cost: </span>
                        <span className="text-foreground font-medium">{phase.cost}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Checklist with what's missing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h6 className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    What you need in Phase {phase.key}
                  </h6>
                  {!isLoading && accts.length === 0 && (
                    <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                      Import a credit report to track
                    </Badge>
                  )}
                </div>
                {items.map((item, idx) => {
                  const detected = item.detect(accts);
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-sm ${
                        detected
                          ? "bg-fundability-excellent/5 border-fundability-excellent/30"
                          : "bg-card border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {detected ? (
                          <CheckCircle2 className="w-4 h-4 text-fundability-excellent shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-medium ${
                                detected
                                  ? "text-fundability-excellent"
                                  : "text-foreground"
                              }`}
                            >
                              {item.label}
                            </span>
                            {detected && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-fundability-excellent/40 text-fundability-excellent"
                              >
                                Done
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            <span className="font-medium text-foreground">Why: </span>
                            {item.why}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Risk callout for phase B */}
              {phase.key === "B" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/30">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Below 680 FICO?</span> Extend Phase B to 3
                    months and prioritize ACCEL disputes first. Don't apply for any new card until your
                    secured card has reported one full statement cycle.
                  </p>
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
