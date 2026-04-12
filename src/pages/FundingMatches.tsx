import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFundingProfile } from "@/hooks/useFundingProfile";
import { scoreProduct, generateFundingSequence } from "@/lib/fundingMatchScoring";
import { ProfileCompletenessPanel } from "@/components/funding/ProfileCompletenessPanel";
import { FundingTrack } from "@/components/funding/FundingTrack";
import { FundingSequence } from "@/components/funding/FundingSequence";
import { RegionalLenderSearch } from "@/components/funding/RegionalLenderSearch";
import { ProductMatchCard } from "@/components/funding/ProductMatchCard";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function FundingMatches() {
  const profile = useFundingProfile();

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

  // Score all products client-side
  const scoredMatches = useMemo(() => {
    if (!products || profile.isLoading) return [];
    return products.map(p => scoreProduct(p, profile));
  }, [products, profile]);

  const personalMatches = scoredMatches.filter(m => m.track === "personal").sort((a, b) => b.score - a.score);
  const businessMatches = scoredMatches.filter(m => m.track === "business").sort((a, b) => b.score - a.score);

  const fundingSequence = useMemo(() => generateFundingSequence(profile), [profile]);

  // Summary stats
  const eligible = scoredMatches.filter(m => m.category === "eligible");
  const nearEligible = scoredMatches.filter(m => m.category === "near_eligible");
  const totalEstimated = eligible.reduce((s, m) => s + (m.estimatedAmount || 0), 0);

  const isLoading = profile.isLoading || productsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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

      {/* Change 1: Profile Completeness */}
      <ProfileCompletenessPanel profile={profile} />

      {/* Summary cards */}
      {scoredMatches.length > 0 && (
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

      {/* Change 2: Separate Personal and Business Tracks */}
      {personalMatches.length > 0 && (
        <FundingTrack title="Personal Credit Track" icon="personal" matches={personalMatches} />
      )}

      {businessMatches.length > 0 && (
        <FundingTrack title="Business Credit Track" icon="business" matches={businessMatches} />
      )}

      {scoredMatches.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            {profile.middleScore
              ? "No lender products are currently in the database. An admin can add products in the Lender Research section."
              : "Upload a credit report via Paige chat first to see matched funding products."}
          </p>
        </Card>
      )}

      {/* Change 5: Recommended Funding Sequence */}
      <FundingSequence steps={fundingSequence} />

      {/* Change 7: Regional Lender Search */}
      <RegionalLenderSearch
        userState={profile.businesses[0]?.state_of_formation || undefined}
        userCity={undefined}
      />
    </div>
  );
}
