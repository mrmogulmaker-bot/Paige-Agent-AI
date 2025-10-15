import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, TrendingUp, CreditCard, Home, Car, DollarSign, Users, Zap, Building } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useCreditVerification } from "@/hooks/useCreditVerification";

interface AccountType {
  type: string;
  icon: any;
  label: string;
  description: string;
  importance: string;
  hasAccount: boolean;
  recommendation?: string;
}

interface CreditMix {
  mortgage: boolean;
  creditCards: boolean;
  lineOfCredit: boolean;
  autoLoan: boolean;
  personalLoan: boolean;
  authorizedUser: boolean;
  subscriptionAccounts: boolean;
  rentalPayments: boolean;
}

export function PersonalBuildProgramOutline() {
  const { verificationStatus, loading: verificationLoading } = useCreditVerification();
  const [creditMix, setCreditMix] = useState<CreditMix>({
    mortgage: false,
    creditCards: false,
    lineOfCredit: false,
    autoLoan: false,
    personalLoan: false,
    authorizedUser: false,
    subscriptionAccounts: false,
    rentalPayments: false,
  });
  const [loading, setLoading] = useState(true);
  const [fundingGoal, setFundingGoal] = useState<string | null>(null);

  useEffect(() => {
    const analyzeCreditAccounts = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch credit accounts from database
        const { data: accounts } = await supabase
          .from("credit_accounts")
          .select("*")
          .eq("user_id", user.id);

        if (accounts) {
          const mix: CreditMix = {
            mortgage: false,
            creditCards: false,
            lineOfCredit: false,
            autoLoan: false,
            personalLoan: false,
            authorizedUser: false,
            subscriptionAccounts: false,
            rentalPayments: false,
          };

          accounts.forEach((account) => {
            const creditor = account.creditor?.toLowerCase() || "";
            const type = account.type?.toLowerCase() || "";

            if (creditor.includes("mortgage") || type.includes("mortgage")) {
              mix.mortgage = true;
            }
            if (type === "revolving" || creditor.includes("card")) {
              mix.creditCards = true;
            }
            if (creditor.includes("line of credit") || creditor.includes("loc")) {
              mix.lineOfCredit = true;
            }
            if (creditor.includes("auto") || creditor.includes("car")) {
              mix.autoLoan = true;
            }
            if (type === "installment" && !creditor.includes("auto") && !creditor.includes("mortgage")) {
              mix.personalLoan = true;
            }
            // Additional logic for authorized user, subscriptions, and rental payments
          });

          setCreditMix(mix);
        }
      } catch (error) {
        console.error("Error analyzing credit accounts:", error);
      } finally {
        setLoading(false);
      }
    };

    if (!verificationLoading && verificationStatus.isVerified) {
      analyzeCreditAccounts();
    } else {
      setLoading(false);
    }
  }, [verificationStatus, verificationLoading]);

  const accountTypes: AccountType[] = [
    {
      type: "mortgage",
      icon: Home,
      label: "Mortgage",
      description: "Primary or secondary home loan",
      importance: "Critical for demonstrating long-term creditworthiness and low DTI ratio",
      hasAccount: creditMix.mortgage,
      recommendation: !creditMix.mortgage ? "Consider building credit profile before applying for a mortgage. Start with secured accounts." : undefined,
    },
    {
      type: "creditCards",
      icon: CreditCard,
      label: "Credit Cards",
      description: "Revolving credit accounts",
      importance: "Essential for building credit history and maintaining low utilization",
      hasAccount: creditMix.creditCards,
      recommendation: !creditMix.creditCards ? "Start with a secured credit card to establish revolving credit. Aim for 3-5 cards for optimal credit mix." : undefined,
    },
    {
      type: "lineOfCredit",
      icon: TrendingUp,
      label: "Line of Credit",
      description: "Personal or home equity line",
      importance: "Shows lenders you can manage flexible credit responsibly",
      hasAccount: creditMix.lineOfCredit,
      recommendation: !creditMix.lineOfCredit ? "Once you have 12+ months of credit card history, apply for a personal line of credit to diversify." : undefined,
    },
    {
      type: "autoLoan",
      icon: Car,
      label: "Auto Loan",
      description: "Vehicle financing",
      importance: "Installment loan that demonstrates payment reliability",
      hasAccount: creditMix.autoLoan,
      recommendation: !creditMix.autoLoan ? "If you need a vehicle, an auto loan can help build installment credit history." : undefined,
    },
    {
      type: "personalLoan",
      icon: DollarSign,
      label: "Personal Loan",
      description: "Installment loan for various purposes",
      importance: "Critical for credit mix - shows ability to handle installment debt",
      hasAccount: creditMix.personalLoan,
      recommendation: !creditMix.personalLoan ? "Add a credit builder loan or personal installment loan to diversify your credit mix. This is essential for major purchases." : undefined,
    },
    {
      type: "authorizedUser",
      icon: Users,
      label: "Authorized User Accounts",
      description: "Credit cards where you're an authorized user",
      importance: "Quick way to boost credit history and score",
      hasAccount: creditMix.authorizedUser,
      recommendation: !creditMix.authorizedUser ? "Ask a trusted family member with excellent credit to add you as an authorized user on their oldest card." : undefined,
    },
    {
      type: "subscriptionAccounts",
      icon: Zap,
      label: "Subscription Reporting",
      description: "Streaming, phone, utilities reported to bureaus",
      importance: "Adds positive payment history without new debt",
      hasAccount: creditMix.subscriptionAccounts,
      recommendation: !creditMix.subscriptionAccounts ? "Use services like Experian Boost to report your subscription and utility payments." : undefined,
    },
    {
      type: "rentalPayments",
      icon: Building,
      label: "Rental Payment Reporting",
      description: "Monthly rent reported to credit bureaus",
      importance: "Leverages existing payments to build credit",
      hasAccount: creditMix.rentalPayments,
      recommendation: !creditMix.rentalPayments ? "Report your rent payments through services like RentTrack or CreditBoost to add positive tradelines." : undefined,
    },
  ];

  const missingAccounts = accountTypes.filter(acc => !acc.hasAccount);
  const completionRate = Math.round(((accountTypes.length - missingAccounts.length) / accountTypes.length) * 100);

  if (!verificationStatus.isVerified) {
    return (
      <Card className="shadow-glow border-warning/20">
        <CardHeader>
          <CardTitle className="text-2xl">Import Your Credit Report First</CardTitle>
          <CardDescription>
            The BUILD Program analyzes your credit report to provide personalized recommendations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg border border-warning/20">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
            <p className="text-sm">
              Navigate to the <strong>Credit Reports</strong> tab to import your 3-bureau credit report and unlock personalized BUILD recommendations.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                Personal BUILD Program
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                Personalized credit building roadmap based on your current profile
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              {completionRate}% Complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Credit Mix Completion</span>
              <span className="font-semibold">{accountTypes.length - missingAccounts.length} of {accountTypes.length} account types</span>
            </div>
            <Progress value={completionRate} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Missing Accounts - Priority Recommendations */}
      {missingAccounts.length > 0 && (
        <Card className="shadow-card border-warning/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-warning" />
              Missing Account Types ({missingAccounts.length})
            </CardTitle>
            <CardDescription>
              These account types are missing from your credit profile. Adding them will improve your credit mix and buying power.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {missingAccounts.map((account) => {
              const Icon = account.icon;
              return (
                <div key={account.type} className="p-4 border border-border rounded-lg bg-card hover:bg-accent/5 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-warning/10 rounded-lg">
                      <Icon className="w-6 h-6 text-warning" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-lg">{account.label}</h4>
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                          Missing
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{account.description}</p>
                      <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                        <TrendingUp className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Why It Matters</p>
                          <p className="text-sm text-muted-foreground">{account.importance}</p>
                        </div>
                      </div>
                      {account.recommendation && (
                        <div className="flex items-start gap-2 p-3 bg-success/5 rounded-lg border border-success/10">
                          <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-success">Recommended Action</p>
                            <p className="text-sm text-muted-foreground">{account.recommendation}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Active Accounts */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-success" />
            Active Account Types ({accountTypes.length - missingAccounts.length})
          </CardTitle>
          <CardDescription>
            These account types are already in your credit profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accountTypes.filter(acc => acc.hasAccount).map((account) => {
              const Icon = account.icon;
              return (
                <div key={account.type} className="flex items-center gap-3 p-4 border border-border rounded-lg bg-success/5">
                  <div className="p-2 bg-success/10 rounded-lg">
                    <Icon className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{account.label}</h4>
                    <p className="text-xs text-muted-foreground">{account.description}</p>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-success ml-auto" />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <CardTitle>Your BUILD Action Plan</CardTitle>
          <CardDescription>
            Follow these steps in order to maximize your credit profile and buying power
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {missingAccounts.slice(0, 3).map((account, index) => (
              <div key={account.type} className="flex items-start gap-3 p-3 border border-border rounded-lg">
                <Badge className="bg-primary mt-0.5">Step {index + 1}</Badge>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">Add {account.label}</h4>
                  <p className="text-sm text-muted-foreground">{account.recommendation}</p>
                </div>
              </div>
            ))}
            {missingAccounts.length === 0 && (
              <div className="text-center py-6">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
                <h3 className="text-xl font-semibold mb-2">Excellent Credit Mix!</h3>
                <p className="text-muted-foreground">
                  You have all major account types. Focus on maintaining low utilization and on-time payments.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
