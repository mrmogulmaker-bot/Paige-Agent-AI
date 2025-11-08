import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Shield, 
  CreditCard,
  Users,
  Building2,
  Target,
  Upload,
  RefreshCw,
  Info,
  Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCreditVerification } from "@/hooks/useCreditVerification";
import { useToast } from "@/hooks/use-toast";

interface CreditMix {
  secured_card: boolean;
  credit_builder_loan: boolean;
  authorized_user: boolean;
  unsecured_card: boolean;
  auto_loan: boolean;
  personal_loan: boolean;
  retail_card: boolean;
  mortgage: boolean;
  [key: string]: boolean;
}

interface AccountType {
  key: keyof CreditMix;
  label: string;
  description: string;
  icon: any;
  importance: "foundation" | "growth" | "advanced";
  buildPhase: string;
  recommendations: string[];
  targetMetrics?: {
    optimalAge?: string;
    creditLimit?: string;
    utilization?: string;
  };
}

interface AISuggestion {
  title: string;
  accountType: string;
  priority: "high" | "medium" | "low";
  phase: string;
  approvalStrategy: string;
  fundabilityImpact: string;
  timeline: string;
  specificProviders?: string[];
}

export const PersonalBuildProgram = () => {
  const [creditMix, setCreditMix] = useState<CreditMix>({
    secured_card: false,
    credit_builder_loan: false,
    authorized_user: false,
    unsecured_card: false,
    auto_loan: false,
    personal_loan: false,
    retail_card: false,
    mortgage: false,
  });
  const [loading, setLoading] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const { verificationStatus } = useCreditVerification();
  const { toast } = useToast();

  useEffect(() => {
    if (verificationStatus.isVerified) {
      fetchCreditAccounts();
    } else {
      setLoading(false);
    }
  }, [verificationStatus.isVerified]);

  const fetchCreditAccounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: accounts, error } = await supabase
        .from("credit_accounts")
        .select("type")
        .eq("user_id", user.id);

      if (error) throw error;

      const newCreditMix = { ...creditMix };
      accounts?.forEach((account) => {
        const accountType = account.type as keyof CreditMix;
        if (accountType in newCreditMix) {
          newCreditMix[accountType] = true;
        }
      });

      setCreditMix(newCreditMix);
    } catch (error) {
      console.error("Error fetching credit accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getAISuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke('personal-build-suggestions', {
        body: { 
          creditMix,
          currentScore: 0 // Can be enhanced with actual score later
        }
      });

      if (error) throw error;

      console.log('AI Suggestions:', data);
      setAiSuggestions(data.recommendations || []);
      
      toast({
        title: "AI Recommendations Ready",
        description: `Paige analyzed your profile and found ${data.recommendations?.length || 0} personalized recommendations.`,
      });
    } catch (error) {
      console.error('Error getting AI suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to get AI recommendations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const accountTypes: AccountType[] = [
    {
      key: "secured_card",
      label: "Secured Credit Card",
      description: "Foundation builder with guaranteed approval",
      icon: Shield,
      importance: "foundation",
      buildPhase: "Phase 1: Secured Foundation",
      recommendations: [
        "Start with $200-$500 deposit for your secured card",
        "Choose cards that graduate to unsecured (Discover, Capital One)",
        "Report to all 3 bureaus (Experian, Equifax, TransUnion)",
        "Target: Keep utilization under 10% for optimal scoring"
      ],
      targetMetrics: {
        optimalAge: "6-12 months before graduation",
        creditLimit: "$500-$2,000",
        utilization: "Under 10%"
      }
    },
    {
      key: "credit_builder_loan",
      label: "Credit Builder Loan",
      description: "Installment tradeline that builds payment history",
      icon: TrendingUp,
      importance: "foundation",
      buildPhase: "Phase 2: Add Secured Loans",
      recommendations: [
        "Open 2-3 credit builder loans (Self, CreditStrong, MoneyLion)",
        "Mix of 12-month and 24-month terms for diversity",
        "Auto-pay to ensure perfect payment history",
        "These report as installment loans, not secured cards"
      ],
      targetMetrics: {
        optimalAge: "12-24 months",
        creditLimit: "$500-$1,000 per loan"
      }
    },
    {
      key: "authorized_user",
      label: "Authorized User Tradeline",
      description: "Inherit age and payment history from primary cardholder",
      icon: Users,
      importance: "foundation",
      buildPhase: "Phase 3: Authorized User Strategy",
      recommendations: [
        "Add AU tradelines with 5+ years of age from family/friends",
        "Ensure primary account has low utilization (under 30%)",
        "Verify the card reports to all 3 bureaus as an AU",
        "Instant boost to average account age and payment history"
      ],
      targetMetrics: {
        optimalAge: "5+ years inherited",
        utilization: "Primary keeps under 30%"
      }
    },
    {
      key: "unsecured_card",
      label: "Unsecured Credit Card",
      description: "Graduate to real revolving credit",
      icon: CreditCard,
      importance: "growth",
      buildPhase: "Phase 4: Unsecured Graduation",
      recommendations: [
        "Wait until scores stabilize (620+ FICO 8)",
        "Start with entry-level unsecured: Discover, Capital One, Credit One",
        "Add 2-3 cards over 6-12 months (space out applications)",
        "Focus on no annual fee cards with reporting to all bureaus"
      ],
      targetMetrics: {
        optimalAge: "6+ months",
        creditLimit: "$500-$3,000 initially",
        utilization: "Under 30%, ideally under 10%"
      }
    },
    {
      key: "auto_loan",
      label: "Auto Loan",
      description: "Major installment tradeline with larger balance",
      icon: Building2,
      importance: "growth",
      buildPhase: "Phase 5: Diversify Portfolio",
      recommendations: [
        "Consider after 12+ months of credit history",
        "Credit unions (DCU, Navy Federal) have better approval odds",
        "Auto loan adds account diversity and higher credit mix",
        "Lease buy-back programs can work if traditional loan difficult"
      ],
      targetMetrics: {
        optimalAge: "12+ months open",
        creditLimit: "$10,000-$25,000"
      }
    },
    {
      key: "personal_loan",
      label: "Personal Line of Credit",
      description: "Flexible revolving or installment credit from credit union",
      icon: Target,
      importance: "advanced",
      buildPhase: "Phase 5: Diversify Portfolio",
      recommendations: [
        "Apply through credit unions for better terms",
        "Can be revolving (like credit card) or installment (fixed term)",
        "Strengthens credit mix and increases total available credit",
        "Use for credit utilization management and funding flexibility"
      ],
      targetMetrics: {
        optimalAge: "12+ months",
        creditLimit: "$2,000-$10,000"
      }
    },
    {
      key: "retail_card",
      label: "Retail Store Card",
      description: "Store-specific card for additional credit mix",
      icon: CreditCard,
      importance: "advanced",
      buildPhase: "Phase 6: Advanced Optimization",
      recommendations: [
        "Add 1-2 retail cards for increased account count",
        "Target: Amazon Store Card, Target RedCard, Best Buy",
        "Lower approval thresholds than major credit cards",
        "Use sparingly and pay in full monthly"
      ],
      targetMetrics: {
        creditLimit: "$500-$2,000",
        utilization: "Keep under 10%"
      }
    },
    {
      key: "mortgage",
      label: "Mortgage",
      description: "Major installment loan - demonstrates maximum creditworthiness and fundability",
      icon: Building2,
      importance: "advanced",
      buildPhase: "Phase 7: Maximum Fundability",
      recommendations: [
        "CRITICAL for max funding opportunity - shows you can handle large debt",
        "Requires strong credit (typically 620+ FICO, 700+ for best rates)",
        "Demonstrates long-term financial stability to lenders",
        "Significantly increases total credit mix and average account balance",
        "Consider after establishing 2+ years of solid credit history",
        "FHA loans available with 580+ credit score and 3.5% down payment"
      ],
      targetMetrics: {
        optimalAge: "2+ years for maximum impact",
        creditLimit: "$100,000-$500,000+",
        utilization: "N/A - installment loan"
      }
    }
  ];

  const missingAccounts = accountTypes.filter(
    (account) => !creditMix[account.key]
  );

  const completionRate = Math.round(
    ((accountTypes.length - missingAccounts.length) / accountTypes.length) * 100
  );

  const foundationAccounts = accountTypes.filter(a => a.importance === "foundation");
  const foundationComplete = foundationAccounts.every(a => creditMix[a.key]);
  const growthAccounts = accountTypes.filter(a => a.importance === "growth");
  const growthComplete = growthAccounts.every(a => creditMix[a.key]);


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">
          Personal BUILD Program
        </h2>
        <p className="text-muted-foreground mt-2">
          Build fundable personal credit with strategic account placement
        </p>
      </div>

      {!verificationStatus.isVerified && (
        <Alert className="border-warning/50 bg-warning/10">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Import your personal credit report to unlock personalized recommendations. You can still review the BUILD roadmap below.
          </AlertDescription>
        </Alert>
      )}

      {/* AI Suggestions Section */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
        <CardHeader className="px-0 pt-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              <CardTitle>Paige's AI Recommendations</CardTitle>
            </div>
            <Button 
              onClick={getAISuggestions}
              disabled={loadingSuggestions}
              className="gap-2"
            >
              {loadingSuggestions ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Get AI Suggestions
                </>
              )}
            </Button>
          </div>
          <CardDescription>
            Get personalized, step-by-step recommendations for building fundable credit
          </CardDescription>
        </CardHeader>
        
        {aiSuggestions.length > 0 && (
          <CardContent className="px-0">
            <div className="space-y-4">
              {aiSuggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg bg-card border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      suggestion.priority === 'high' ? 'bg-destructive/10' :
                      suggestion.priority === 'medium' ? 'bg-warning/10' :
                      'bg-muted'
                    }`}>
                      <Target className={`w-5 h-5 ${
                        suggestion.priority === 'high' ? 'text-destructive' :
                        suggestion.priority === 'medium' ? 'text-warning' :
                        'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold">{suggestion.title}</h4>
                        <Badge variant={
                          suggestion.priority === 'high' ? 'destructive' :
                          suggestion.priority === 'medium' ? 'default' :
                          'outline'
                        } className="text-xs">
                          {suggestion.priority} priority
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {suggestion.phase}
                        </Badge>
                      </div>
                      
                      <p className="text-sm font-medium text-primary">
                        Account Type: {suggestion.accountType}
                      </p>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="font-medium">Approval Strategy:</span>
                          <p className="text-muted-foreground mt-1">{suggestion.approvalStrategy}</p>
                        </div>
                        
                        <div>
                          <span className="font-medium">Fundability Impact:</span>
                          <p className="text-muted-foreground mt-1">{suggestion.fundabilityImpact}</p>
                        </div>
                        
                        <div className="flex items-center gap-4 flex-wrap">
                          <div>
                            <span className="font-medium">Timeline:</span>
                            <span className="text-muted-foreground ml-2">{suggestion.timeline}</span>
                          </div>
                        </div>
                        
                        {suggestion.specificProviders && suggestion.specificProviders.length > 0 && (
                          <div>
                            <span className="font-medium">Recommended Providers:</span>
                            <div className="flex gap-2 flex-wrap mt-1">
                              {suggestion.specificProviders.map((provider, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {provider}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>


      {/* Overall Progress Card */}
      <Card className="p-6 border-primary/20 shadow-glow">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Credit Profile Completion</CardTitle>
          <CardDescription>
            Your progress toward a 10+ account, diversified fundable profile
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-2xl font-bold text-primary">{completionRate}%</span>
            </div>
            <Progress value={completionRate} className="h-3" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border ${foundationComplete ? 'bg-success/10 border-success/30' : 'bg-muted border-border'}`}>
              <div className="flex items-center gap-2 mb-2">
                {foundationComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-warning" />
                )}
                <h4 className="font-semibold text-sm">Foundation</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {foundationAccounts.filter(a => creditMix[a.key]).length} of {foundationAccounts.length} accounts
              </p>
            </div>

            <div className={`p-4 rounded-lg border ${growthComplete ? 'bg-success/10 border-success/30' : 'bg-muted border-border'}`}>
              <div className="flex items-center gap-2 mb-2">
                {growthComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-warning" />
                )}
                <h4 className="font-semibold text-sm">Growth</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                {growthAccounts.filter(a => creditMix[a.key]).length} of {growthAccounts.length} accounts
              </p>
            </div>

            <div className="p-4 rounded-lg border bg-gradient-gold/10 border-primary/30">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-primary" />
                <h4 className="font-semibold text-sm">Target: 10+ Accounts</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {accountTypes.filter(a => creditMix[a.key]).length} accounts
              </p>
            </div>
          </div>

          <Alert className="bg-gradient-gold/5 border-primary/20">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>The Golden Formula:</strong> 10+ open accounts with 5+ years average age. 
              Strategic diversification across secured, unsecured, installment, and revolving credit.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Missing Accounts - Priority Recommendations */}
      {missingAccounts.length > 0 && (
        <Card className="p-6 border-warning/30">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Missing Account Types ({missingAccounts.length})
            </CardTitle>
            <CardDescription>
              Strategic recommendations to complete your fundable profile
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="space-y-4">
              {missingAccounts.map((account) => {
                const Icon = account.icon;
                return (
                  <div
                    key={account.key}
                    className="p-4 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{account.label}</h4>
                          <Badge variant="outline" className="text-xs">
                            {account.importance}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {account.description}
                        </p>
                        <div className="bg-muted/50 rounded-lg p-3 mb-3">
                          <p className="text-xs font-medium text-primary mb-2">
                            {account.buildPhase}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-medium">Recommendations:</p>
                          <ul className="space-y-1">
                            {account.recommendations.map((rec, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                                <span className="text-primary mt-1">•</span>
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {account.targetMetrics && (
                          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                            {account.targetMetrics.optimalAge && (
                              <div className="text-xs">
                                <span className="font-medium">Age:</span>{" "}
                                <span className="text-muted-foreground">{account.targetMetrics.optimalAge}</span>
                              </div>
                            )}
                            {account.targetMetrics.creditLimit && (
                              <div className="text-xs">
                                <span className="font-medium">Limit:</span>{" "}
                                <span className="text-muted-foreground">{account.targetMetrics.creditLimit}</span>
                              </div>
                            )}
                            {account.targetMetrics.utilization && (
                              <div className="text-xs">
                                <span className="font-medium">Utilization:</span>{" "}
                                <span className="text-muted-foreground">{account.targetMetrics.utilization}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Accounts */}
      {accountTypes.some((a) => creditMix[a.key]) && (
        <Card className="p-6 border-success/30">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              Active Account Types ({accountTypes.filter(a => creditMix[a.key]).length})
            </CardTitle>
            <CardDescription>
              Keep these accounts active and in good standing
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accountTypes
                .filter((account) => creditMix[account.key])
                .map((account) => {
                  const Icon = account.icon;
                  return (
                    <div
                      key={account.key}
                      className="p-4 rounded-lg border border-success/30 bg-success/5"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-success/10">
                          <Icon className="w-4 h-4 text-success" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{account.label}</h4>
                          <p className="text-xs text-muted-foreground">
                            {account.importance}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Plan */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Your Prioritized Action Plan</CardTitle>
          <CardDescription>
            Follow this sequence for optimal credit profile development
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="space-y-3">
            {!foundationComplete && (
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="destructive">Priority 1</Badge>
                  <h4 className="font-semibold">Complete Foundation Layer</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Establish secured cards, credit builder loans, and authorized user tradelines first
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  {foundationAccounts.filter(a => !creditMix[a.key]).map(a => (
                    <li key={a.key}>• Add {a.label}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {foundationComplete && !growthComplete && (
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-warning text-warning-foreground">Priority 2</Badge>
                  <h4 className="font-semibold">Build Growth Layer</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Graduate to unsecured credit and add major installment loans
                </p>
                <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                  {growthAccounts.filter(a => !creditMix[a.key]).map(a => (
                    <li key={a.key}>• Add {a.label}</li>
                  ))}
                </ul>
              </div>
            )}

            {foundationComplete && growthComplete && (
              <div className="p-4 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">Priority 3</Badge>
                  <h4 className="font-semibold">Optimize & Maintain</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Monitor utilization, maintain on-time payments, and prepare for funding applications
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
