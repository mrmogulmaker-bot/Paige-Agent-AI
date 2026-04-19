import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFundingProfile } from "@/hooks/useFundingProfile";
import { scoreProduct, generateFundingSequence } from "@/lib/fundingMatchScoring";
import { ProfileCompletenessPanel } from "@/components/funding/ProfileCompletenessPanel";
import { FundingTrack } from "@/components/funding/FundingTrack";
import { FundingSequence } from "@/components/funding/FundingSequence";
import { RegionalLenderSearch } from "@/components/funding/RegionalLenderSearch";
import {
  FundingGoalIntake,
  FundingGoalBanner,
  getGoalRelevanceBoost,
  isPrerequisiteProduct,
  getTimelineUrgencySort,
  type FundingGoals,
} from "@/components/funding/FundingGoalIntake";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Target } from "lucide-react";
import type { ProductMatch } from "@/lib/fundingMatchScoring";
import { SeparationAuditCard } from "@/components/dashboard/business-profile/SeparationAuditCard";
import { FundingWalkthrough } from "@/components/funding/FundingWalkthrough";
import { useNavigate } from "react-router-dom";

function SeparationAuditFundingBanner({ onFix }: { onFix: () => void }) {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  if (!uid) return null;
  return <SeparationAuditCard userId={uid} variant="compact" onFix={onFix} />;
}

export default function FundingMatches() {
  const profile = useFundingProfile();
  const navigate = useNavigate();
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Parse funding goals from profile
  const fundingGoals: FundingGoals | null = useMemo(() => {
    const fg = profile.fundingGoals;
    if (fg && typeof fg === "object" && "objective" in (fg as any)) return fg as unknown as FundingGoals;
    return null;
  }, [profile.fundingGoals]);

  const needsIntake = !profile.isLoading && !fundingGoals;
  // Auto-open modal on first visit only if goals not set
  const [autoOpened, setAutoOpened] = useState(false);
  const shouldAutoOpen = needsIntake && !autoOpened && !bannerDismissed;

  // Fetch all active lender products
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["lender-products-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lender_products")
        .select("*")
        .eq("is_active", true)
        .order("lender_name");
      if (error) throw error;
      return data || [];
    },
  });

  // Score all products, then apply goal-based sorting/filtering — BUSINESS ONLY
  const { primaryMatches, prerequisiteMatches, businessMatches } = useMemo(() => {
    if (!products || profile.isLoading) {
      return { primaryMatches: [], prerequisiteMatches: [], businessMatches: [] };
    }

    let scored = products.map(p => scoreProduct(p, profile));

    // Filter to business track only — personal credit products moved to Credit Intelligence tab
    scored = scored.filter(m => m.track === "business");

    if (fundingGoals) {
      scored = scored.map(m => ({
        ...m,
        _relevance: getGoalRelevanceBoost(m.product.product_type, fundingGoals),
        _urgency: getTimelineUrgencySort(m.product.product_type, fundingGoals),
        _isPrereq: isPrerequisiteProduct(m.product.product_type, fundingGoals),
      }));

      scored.sort((a: any, b: any) => {
        if (a._isPrereq !== b._isPrereq) return a._isPrereq ? 1 : -1;
        if (a._relevance !== b._relevance) return b._relevance - a._relevance;
        if (a._urgency !== b._urgency) return b._urgency - a._urgency;
        return b.score - a.score;
      });
    }

    const prereqs = fundingGoals
      ? scored.filter((m: any) => m._isPrereq)
      : [];
    const primary = fundingGoals
      ? scored.filter((m: any) => !m._isPrereq)
      : scored;

    const business = primary.sort((a, b) => b.score - a.score);

    return {
      primaryMatches: primary,
      prerequisiteMatches: prereqs,
      businessMatches: business,
    };
  }, [products, profile, fundingGoals]);

  const fundingSequence = useMemo(() => generateFundingSequence(profile), [profile]);

  // Summary stats
  const allMatches = [...primaryMatches, ...prerequisiteMatches];
  const eligible = allMatches.filter(m => m.category === "eligible");
  const nearEligible = allMatches.filter(m => m.category === "near_eligible");
  const totalEstimated = eligible.reduce((s, m) => s + (m.estimatedAmount || 0), 0);

  const isLoading = profile.isLoading || productsLoading;

  // Urgent timeline warning
  const isUrgent = fundingGoals?.timeline === "90_days";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Goal Intake Modal — auto-open once, always dismissable */}
      <FundingGoalIntake
        open={shouldAutoOpen || goalModalOpen}
        onOpenChange={open => {
          if (!open && shouldAutoOpen) setAutoOpened(true);
          setGoalModalOpen(open);
        }}
        existingGoals={fundingGoals}
        onSaved={() => setGoalModalOpen(false)}
      />

      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Funding Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Business funding products matched to your real profile — every score explained by data, not thresholds.
        </p>
        {profile.middleScore && (
          <p className="text-xs text-muted-foreground mt-1">
            Matching against middle bureau score: {profile.middleScore}
          </p>
        )}
      </div>

      {/* Page Walkthrough */}
      <FundingWalkthrough />

      {/* Current Goal Banner — or CTA if no goal set */}
      {fundingGoals ? (
        <FundingGoalBanner goals={fundingGoals} onEdit={() => setGoalModalOpen(true)} />
      ) : !bannerDismissed ? (
        <Card className="p-4 bg-accent/5 border-accent/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-accent shrink-0" />
              <p className="text-sm text-foreground">
                <span className="font-medium">Add your funding goal to get personalized matches</span>
                <span className="text-muted-foreground"> — takes 60 seconds</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={() => setGoalModalOpen(true)} className="bg-gradient-gold hover:opacity-90 text-xs">
                Set Goal
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setBannerDismissed(true)} className="text-muted-foreground text-xs px-2">
                ✕
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Urgent Timeline Warning */}
      {isUrgent && (
        <Card className="p-4 bg-fundability-fair/5 border-fundability-fair/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-fundability-fair shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">90-Day Urgent Timeline Active</p>
              <p className="text-xs text-muted-foreground mt-1">
                Fast-access products are shown first. MCAs and revenue-based products provide speed but at higher cost — review factor rates carefully before applying.
                Traditional bank products typically require 30-90 day underwriting.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Personal/Business Separation warning */}
      <SeparationAuditFundingBanner onFix={() => navigate("/app/business")} />

      {/* Profile Completeness */}
      <ProfileCompletenessPanel profile={profile} />

      {/* Summary cards */}
      {allMatches.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5 bg-card border-border text-center">
            <div className="text-3xl font-bold text-fundability-excellent">{eligible.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Eligible Products</div>
          </Card>
          <Card className="p-5 bg-card border-border text-center">
            <div className="text-3xl font-bold text-fundability-fair">{nearEligible.length}</div>
            <div className="text-sm text-muted-foreground mt-1">Near Eligible</div>
          </Card>
          <Card className="p-5 bg-card border-border text-center">
            <div className="text-3xl font-bold text-accent">
              ${totalEstimated.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Est. Total Funding</div>
          </Card>
        </div>
      )}

      {/* Business Funding Track */}
      {businessMatches.length > 0 && (
        <FundingTrack title="Business Funding Products" icon="business" matches={businessMatches} />
      )}

      {/* Prerequisite Section */}
      {prerequisiteMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-muted-foreground">What Needs to Be Built First</h2>
            <Badge variant="outline" className="text-xs">{prerequisiteMatches.length} products</Badge>
          </div>
          <p className="text-sm text-muted-foreground -mt-1">
            These credit-building products establish the foundation needed for your primary funding goal.
          </p>
          <div className="space-y-3">
            {prerequisiteMatches.map(match => (
              <div key={match.product.id} className="opacity-80">
                <FundingTrack title="" icon="personal" matches={[match]} />
              </div>
            ))}
          </div>
        </div>
      )}

      {allMatches.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            {profile.middleScore
              ? "No lender products are currently in the database. An admin can add products in the Lender Research section."
              : "Upload a credit report via Paige chat first to see matched funding products."}
          </p>
        </Card>
      )}

      {/* Recommended Funding Sequence */}
      <FundingSequence steps={fundingSequence} />

      {/* Regional Lender Search */}
      <RegionalLenderSearch
        userState={profile.businesses[0]?.state_of_formation || undefined}
        userCity={undefined}
        bureauScores={profile.scores}
      />
    </div>
  );
}
