import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, Building2, User, Filter, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FundingOffer {
  id: string;
  name: string;
  product_type: string;
  funding_category: string;
  lender_type: string;
  limits_range: string;
  apr_range: string;
  requirements: string;
  apply_url: string;
  min_credit_score: number | null;
  max_credit_score: number | null;
  min_business_age_months: number | null;
  industry_specialization: string[] | null;
  approval_timeframe: string | null;
  funding_speed: string | null;
}

export const FundingMarketplace = () => {
  const [activeTab, setActiveTab] = useState<"personal" | "business">("personal");
  const [offers, setOffers] = useState<FundingOffer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadOffers();
  }, [activeTab]);

  const loadOffers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("funding_offers")
        .select("*")
        .or(`funding_category.eq.${activeTab},funding_category.eq.both`)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setOffers(data || []);
    } catch (error) {
      console.error("Error loading offers:", error);
      toast({
        title: "Error",
        description: "Failed to load funding offers",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getLenderTypeColor = (lenderType: string) => {
    const colors: Record<string, string> = {
      bank: "bg-blue-500/10 text-blue-500",
      credit_union: "bg-green-500/10 text-green-500",
      online_lender: "bg-purple-500/10 text-purple-500",
      sba: "bg-orange-500/10 text-orange-500",
      private_lender: "bg-pink-500/10 text-pink-500",
      industry_specific: "bg-amber-500/10 text-amber-500",
      label: "bg-red-500/10 text-red-500",
      publisher: "bg-indigo-500/10 text-indigo-500",
      investor: "bg-teal-500/10 text-teal-500",
    };
    return colors[lenderType] || "bg-gray-500/10 text-gray-500";
  };

  const formatLenderType = (lenderType: string) => {
    return lenderType.split("_").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(" ");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Funding Marketplace
        </h2>
        <p className="text-muted-foreground mt-2">
          Discover funding opportunities tailored to your profile and business needs
        </p>
      </div>

      <Card className="border-primary/20 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Smart Funding Matches
          </CardTitle>
          <CardDescription>
            Our AI analyzes your credit history, business age, and industry to recommend the best funding options
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border bg-muted/30">
              <User className="w-8 h-8 text-primary mb-2" />
              <h4 className="font-semibold mb-1">Personal Profile</h4>
              <p className="text-sm text-muted-foreground">
                Credit score, income, and financial history
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <Building2 className="w-8 h-8 text-primary mb-2" />
              <h4 className="font-semibold mb-1">Business Maturity</h4>
              <p className="text-sm text-muted-foreground">
                Age, credit report history, NAICS risk category
              </p>
            </div>
            <div className="p-4 rounded-lg border bg-muted/30">
              <DollarSign className="w-8 h-8 text-primary mb-2" />
              <h4 className="font-semibold mb-1">Lender Matching</h4>
              <p className="text-sm text-muted-foreground">
                Banks, SBA, industry-specific, and alternative lenders
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "personal" | "business")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal">Personal Funding</TabsTrigger>
          <TabsTrigger value="business">Business Funding</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4 mt-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading offers...</p>
            </div>
          ) : offers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No personal funding offers available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {offers.map((offer) => (
                <Card key={offer.id} className="hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{offer.name}</CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className={getLenderTypeColor(offer.lender_type)}>
                            {formatLenderType(offer.lender_type)}
                          </Badge>
                          <Badge variant="outline">{offer.product_type}</Badge>
                        </div>
                      </div>
                      <Button size="sm" className="ml-4" asChild>
                        <a href={offer.apply_url} target="_blank" rel="noopener noreferrer">
                          Apply <ExternalLink className="w-4 h-4 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Limits</p>
                        <p className="text-sm">{offer.limits_range || "Varies"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">APR Range</p>
                        <p className="text-sm">{offer.apr_range || "Contact lender"}</p>
                      </div>
                      {offer.approval_timeframe && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Approval Time</p>
                          <p className="text-sm">{offer.approval_timeframe}</p>
                        </div>
                      )}
                      {offer.funding_speed && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Funding Speed</p>
                          <p className="text-sm">{offer.funding_speed}</p>
                        </div>
                      )}
                    </div>
                    {offer.requirements && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Requirements</p>
                        <p className="text-sm">{offer.requirements}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="business" className="space-y-4 mt-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading offers...</p>
            </div>
          ) : offers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No business funding offers available at this time.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {offers.map((offer) => (
                <Card key={offer.id} className="hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{offer.name}</CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="outline" className={getLenderTypeColor(offer.lender_type)}>
                            {formatLenderType(offer.lender_type)}
                          </Badge>
                          <Badge variant="outline">{offer.product_type}</Badge>
                          {offer.industry_specialization && offer.industry_specialization.length > 0 && (
                            <Badge variant="secondary">
                              Industry: {offer.industry_specialization.join(", ")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button size="sm" className="ml-4" asChild>
                        <a href={offer.apply_url} target="_blank" rel="noopener noreferrer">
                          Apply <ExternalLink className="w-4 h-4 ml-1" />
                        </a>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Limits</p>
                        <p className="text-sm">{offer.limits_range || "Varies"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">APR Range</p>
                        <p className="text-sm">{offer.apr_range || "Contact lender"}</p>
                      </div>
                      {offer.min_business_age_months !== null && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Min. Business Age</p>
                          <p className="text-sm">{offer.min_business_age_months} months</p>
                        </div>
                      )}
                      {offer.approval_timeframe && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Approval Time</p>
                          <p className="text-sm">{offer.approval_timeframe}</p>
                        </div>
                      )}
                      {offer.funding_speed && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-1">Funding Speed</p>
                          <p className="text-sm">{offer.funding_speed}</p>
                        </div>
                      )}
                    </div>
                    {offer.requirements && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Requirements</p>
                        <p className="text-sm">{offer.requirements}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};