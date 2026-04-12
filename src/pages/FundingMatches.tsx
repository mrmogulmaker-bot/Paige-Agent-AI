import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import type { ProductMatch } from "@/lib/fundingMatchScoring";

export default function FundingMatches() {
  const profile = useFundingProfile();
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // Parse funding goals from profile
  const fundingGoals: FundingGoals | null = useMemo(() => {
    const fg = profile.fundingGoals;
    if (fg && typeof fg === "object" && "objective" in (fg as any)) return fg as unknown as FundingGoals;
    return null;
  }, [profile.fundingGoals]);

  // Show intake modal if no goals set (after loading)
  const needsIntake = !profile.isLoading && !fundingGoals;

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

  // Score all products, then apply goal-based sorting/filtering
  const { primaryMatches, prerequisiteMatches, personalMatches, businessMatches } = useMemo(() => {
    if (!products || profile.isLoading) {
      return { primaryMatches: [], prerequisiteMatches: [], personalMatches: [], businessMatches: [] };
    }

    let scored = products.map(p => scoreProduct(p, profile));

    if (fundingGoals) {
      // Sort by goal relevance + urgency + score
      scored = scored.map(m => ({
        ...m,
        _relevance: getGoalRelevanceBoost(m.product.product_type, fundingGoals),
        _urgency: getTimelineUrgencySort(m.product.product_type, fundingGoals),
        _isPrereq: isPrerequisiteProduct(m.product.product_type, fundingGoals),
      }));

      scored.sort((a: any, b: any) => {
        // Prerequisites go to a separate section
        if (a._isPrereq !== b._isPrereq) return a._isPrereq ? 1 : -1;
        // Higher relevance first
        if (a._relevance !== b._relevance) return b._relevance - a._relevance;
        // Urgency for 90-day timelines
        if (a._urgency !== b._urgency) return b._urgency - a._urgency;
        // Then by score
        return b.score - a.score;
      });
    }

    const prereqs = fundingGoals
      ? scored.filter((m: any) => m._isPrereq)
      : [];
    const primary = fundingGoals
      ? scored.filter((m: any) => !m._isPrereq)
      : scored;

    const personal = primary.filter(m => m.track === "personal").sort((a, b) => b.score - a.score);
    const business = primary.filter(m => m.track === "business").sort((a, b) => b.score - a.score);

    return {
      primaryMatches: primary,
      prerequisiteMatches: prereqs,
      personalMatches: personal,
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
      {/* Goal Intake Modal */}
      <FundingGoalIntake
        open={needsIntake || goalModalOpen}
        onOpenChange={open => {
          if (needsIntake && !open) return; // Can't dismiss first-time intake
          setGoalModalOpen(open);
        }}
        existingGoals={fundingGoals}
        onSaved={() => setGoalModalOpen(false)}
      />

      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Funding Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Products matched to your real profile — every score explained by data, not thresholds.
        </p>
        {profile.middleScore && (
          <p className="text-xs text-muted-foreground mt-1">
            Matching against middle bureau score: {profile.middleScore}
          </p>
        )}
      </div>

      {/* Current Goal Banner */}
      {fundingGoals && (
        <FundingGoalBanner goals={fundingGoals} onEdit={() => setGoalModalOpen(true)} />
      )}

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

      {/* Personal and Business Tracks */}
      {personalMatches.length > 0 && (
        <FundingTrack title="Personal Credit Track" icon="personal" matches={personalMatches} />
      )}

      {businessMatches.length > 0 && (
        <FundingTrack title="Business Credit Track" icon="business" matches={businessMatches} />
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
      />
    </div>
  );
}
