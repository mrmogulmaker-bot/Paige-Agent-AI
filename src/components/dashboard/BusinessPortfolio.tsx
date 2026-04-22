import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Crown,
  Plus,
  Lock,
  Upload,
  Check,
  CornerDownRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  useBusinessContext,
  entityRoleLabel,
  type BusinessSummary,
} from "@/contexts/BusinessContext";
import { AddBusinessFlow } from "./AddBusinessFlow";
import {
  computeAllFundabilityScores,
  type FundabilityScoreResult,
} from "@/lib/fundabilityScores";
import { useCreditFactors } from "@/hooks/useCreditFactors";
import { cn } from "@/lib/utils";

interface BusinessPortfolioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PortfolioBusinessRow extends BusinessSummary {
  has_bank_account: boolean | null;
  bank_account_opened_date: string | null;
  dnb_paydex: number | null;
  experian_intelliscore: number | null;
  equifax_payment_index: number | null;
}

/**
 * BusinessPortfolio — slide-in modal showing every entity in the user's
 * portfolio with their three fundability scores side by side. Surfaces
 * HoldCo first and visually indents subsidiaries to convey hierarchy.
 */
export function BusinessPortfolio({ open, onOpenChange }: BusinessPortfolioProps) {
  const navigate = useNavigate();
  const { businesses, activeBusinessId, setActiveBusinessId } = useBusinessContext();
  const { factors } = useCreditFactors();
  const [addOpen, setAddOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["portfolio-profile-fico"],
    enabled: open,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("estimated_fico_eq, estimated_fico_ex, estimated_fico_tu")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: personalReportCount = 0 } = useQuery({
    queryKey: ["portfolio-personal-report-count"],
    enabled: open,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      const { count } = await supabase
        .from("credit_report_personal_info")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      return count ?? 0;
    },
  });

  const businessIds = businesses.map((b) => b.id);

  const { data: portfolioRows = [] } = useQuery({
    queryKey: ["portfolio-businesses-detail", businessIds.join(",")],
    enabled: open && businessIds.length > 0,
    queryFn: async (): Promise<PortfolioBusinessRow[]> => {
      const { data } = await supabase
        .from("businesses")
        .select(
          "id, legal_name, dba, entity_type, entity_role, business_type, parent_business_id, organizational_level, display_order, is_primary, is_active, ein, state_of_formation, formation_date, website, estimated_annual_revenue, has_bank_account, bank_account_opened_date, dnb_paydex, experian_intelliscore, equifax_payment_index"
        )
        .in("id", businessIds);
      return (data ?? []) as unknown as PortfolioBusinessRow[];
    },
  });

  // Compute scores per business
  const scoredEntities = useMemo(() => {
    return portfolioRows.map((biz) => {
      const scores = computeAllFundabilityScores({
        ficoEq: profile?.estimated_fico_eq ?? null,
        ficoEx: profile?.estimated_fico_ex ?? null,
        ficoTu: profile?.estimated_fico_tu ?? null,
        paymentHistoryScore: factors?.payment_history_score ?? null,
        utilizationScore: factors?.utilization_score ?? null,
        inquiryScore: factors?.inquiry_score ?? null,
        creditMixScore: factors?.credit_mix_score ?? null,
        activeNegatives: factors?.active_negatives ?? null,
        oldestAccountAgeMonths: factors?.oldest_account_age_months ?? null,
        hasPersonalCreditFile: personalReportCount > 0,
        hasBusiness: true,
        entityType: biz.entity_type,
        formationDate: biz.formation_date,
        ein: biz.ein,
        hasBusinessBankAccount: biz.has_bank_account,
        bankAccountOpenedDate: biz.bank_account_opened_date,
        estimatedAnnualRevenue: biz.estimated_annual_revenue,
        paydex: biz.dnb_paydex,
        intelliscore: biz.experian_intelliscore,
        hasBusinessCreditDataPoint: Boolean(
          (biz.dnb_paydex && biz.dnb_paydex > 0) ||
            (biz.experian_intelliscore && biz.experian_intelliscore > 0) ||
            (biz.equifax_payment_index && biz.equifax_payment_index > 0)
        ),
      });
      return { biz, scores };
    });
  }, [portfolioRows, profile, factors, personalReportCount]);

  // Sort: HoldCo / parents first, subsidiaries grouped under them
  const orderedEntities = useMemo(() => {
    const parents = scoredEntities.filter((e) => !e.biz.parent_business_id);
    const childMap = new Map<string, typeof scoredEntities>();
    scoredEntities.forEach((e) => {
      if (e.biz.parent_business_id) {
        const list = childMap.get(e.biz.parent_business_id) ?? [];
        list.push(e);
        childMap.set(e.biz.parent_business_id, list);
      }
    });

    const sortByPrimary = (a: typeof scoredEntities[number], b: typeof scoredEntities[number]) => {
      if (a.biz.is_primary !== b.biz.is_primary) return a.biz.is_primary ? -1 : 1;
      return (a.biz.display_order ?? 0) - (b.biz.display_order ?? 0);
    };

    const result: Array<{ entity: typeof scoredEntities[number]; depth: number }> = [];
    parents.sort(sortByPrimary).forEach((parent) => {
      result.push({ entity: parent, depth: 0 });
      const children = childMap.get(parent.biz.id) ?? [];
      children.sort(sortByPrimary).forEach((child) => {
        result.push({ entity: child, depth: 1 });
      });
    });

    // Orphans (parent missing from portfolio) — append at end
    const placedIds = new Set(result.map((r) => r.entity.biz.id));
    scoredEntities
      .filter((e) => !placedIds.has(e.biz.id))
      .forEach((e) => result.push({ entity: e, depth: 0 }));

    return result;
  }, [scoredEntities]);

  const handleSetActive = (id: string) => {
    setActiveBusinessId(id);
  };

  const handleUpload = (id: string) => {
    setActiveBusinessId(id);
    onOpenChange(false);
    navigate("/app/credit#bureau-dnb");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Business Portfolio
            </DialogTitle>
            <DialogDescription>
              All entities under your organizational structure. Each business has its own
              fundability scores and credit profile.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {orderedEntities.map(({ entity, depth }) => (
              <PortfolioCard
                key={entity.biz.id}
                biz={entity.biz}
                scores={entity.scores}
                depth={depth}
                isActive={entity.biz.id === activeBusinessId}
                onSetActive={() => handleSetActive(entity.biz.id)}
                onUpload={() => handleUpload(entity.biz.id)}
              />
            ))}

            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-card/30 p-8 text-muted-foreground transition hover:border-primary hover:text-primary min-h-[260px]"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-6 w-6" />
              </div>
              <span className="font-medium">Add Business</span>
              <span className="text-xs text-center max-w-[180px]">
                Each entity can independently access no-doc funding
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <AddBusinessFlow open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

interface PortfolioCardProps {
  biz: PortfolioBusinessRow;
  scores: {
    personal: FundabilityScoreResult;
    small_business: FundabilityScoreResult;
    commercial: FundabilityScoreResult;
  };
  depth: number;
  isActive: boolean;
  onSetActive: () => void;
  onUpload: () => void;
}

function PortfolioCard({
  biz,
  scores,
  depth,
  isActive,
  onSetActive,
  onUpload,
}: PortfolioCardProps) {
  const isHoldCo = biz.entity_role === "holdco";
  const Icon = isHoldCo ? Crown : Building2;

  return (
    <div
      className={cn(
        "relative",
        depth > 0 && "ml-4 md:ml-6"
      )}
    >
      {depth > 0 && (
        <CornerDownRight className="absolute -left-4 top-6 h-4 w-4 text-muted-foreground/50" />
      )}
      <Card
        className={cn(
          "p-5 h-full flex flex-col gap-3 transition",
          isActive ? "ring-2 ring-primary" : "",
          isHoldCo && "border-accent/40"
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
              isHoldCo ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground truncate">{biz.legal_name}</h3>
              {isActive && (
                <Badge className="shrink-0 text-[10px]" variant="default">
                  <Check className="h-3 w-3 mr-1" /> Active
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {biz.entity_role && (
                <Badge variant="outline" className="text-[10px]">
                  {entityRoleLabel(biz.entity_role)}
                </Badge>
              )}
              {biz.entity_type && (
                <span className="text-[11px] text-muted-foreground uppercase">
                  {biz.entity_type}
                </span>
              )}
              {biz.is_primary && (
                <Badge variant="secondary" className="text-[10px]">
                  Primary
                </Badge>
              )}
            </div>
            {biz.formation_date && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Formed {new Date(biz.formation_date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Three scores compact */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          <ScoreChip label="Personal" result={scores.personal} />
          <ScoreChip label="Small Biz" result={scores.small_business} />
          <ScoreChip label="Commercial" result={scores.commercial} />
        </div>

        {/* Bureau scores */}
        <div className="grid grid-cols-2 gap-2">
          <BureauChip
            label="Paydex"
            value={biz.dnb_paydex && biz.dnb_paydex > 0 ? biz.dnb_paydex : null}
          />
          <BureauChip
            label="Intelliscore"
            value={
              biz.experian_intelliscore && biz.experian_intelliscore > 0
                ? biz.experian_intelliscore
                : null
            }
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-auto pt-2">
          {!isActive && (
            <Button size="sm" variant="outline" onClick={onSetActive} className="flex-1">
              Set as Active
            </Button>
          )}
          <Button size="sm" onClick={onUpload} className="flex-1 gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Upload Report
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ScoreChip({ label, result }: { label: string; result: FundabilityScoreResult }) {
  if (result.locked) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md bg-muted/40 py-2 px-1">
        <Lock className="h-3.5 w-3.5 text-muted-foreground mb-1" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-muted/40 py-2 px-1">
      <span className="text-lg font-bold text-foreground leading-none">
        {result.score ?? "—"}
      </span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
        {label}
      </span>
    </div>
  );
}

function BureauChip({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold",
          value == null ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value ?? "Not uploaded"}
      </span>
    </div>
  );
}
