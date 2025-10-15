import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, CheckCircle2, FileText, Building2, TrendingUp, BarChart3, Shield, DollarSign, Upload, AlertTriangle, Info, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocumentUpload } from "./DocumentUpload";
import { useToast } from "@/hooks/use-toast";

const buildModules = [
  {
    id: 1,
    title: "BASE - Foundation of Fundability",
    letter: "B",
    description: "Create a clean, compliant, credible footprint for both personal and business credit",
    objective: "Create a clean, compliant, credible footprint for both personal and business credit",
    lessons: [
      "What Lenders Look For – The 3Cs: Character, Capacity, Capital",
      "Credit Assessment: Pull and Analyze Reports (Experian, Equifax, TransUnion, SBFE)",
      "Business Identity Setup: Address, Phone, Domain, Website, Email",
      "Business Credentials: EIN, DUNS, Secretary of State Validation",
      "Compliance Foundation: Licenses, Bank Account, Operating Agreement, Site Inspection Readiness"
    ],
    deliverables: [
      "Compliance Checklist PDF",
      "Lender Credibility Test worksheet",
      "Business Setup Tracker"
    ],
    icon: Building2,
    color: "from-blue-500 to-blue-600"
  },
  {
    id: 2,
    title: "UTILIZE - Strategic Tradeline Building",
    letter: "U",
    description: "Add starter accounts that report correctly and establish early credit activity",
    objective: "Add starter accounts that report correctly and establish early credit activity",
    lessons: [
      "Tradeline Sequencing Strategy",
      "Personal Tradelines: AU & Secured Accounts",
      "Business Tradelines: Net 30 Vendors (Experian, Equifax, SBFE)",
      "Credit Builder Accounts: Nav, CreditStrong, eCredable, etc.",
      "Monitoring & Reporting Verification"
    ],
    deliverables: [
      "Starter Vendor Directory",
      "Tradeline Tracker Template",
      "Reporting Verification Log"
    ],
    icon: TrendingUp,
    color: "from-green-500 to-green-600"
  },
  {
    id: 3,
    title: "INCREASE - Depth, Diversification & Credit Limits",
    letter: "I",
    description: "Expand from starter lines to revolving and installment credit to demonstrate capacity",
    objective: "Expand from starter lines to revolving and installment credit to demonstrate capacity",
    lessons: [
      "Graduating to Business Credit Cards",
      "Secured Lines and Term Loans",
      "Vendor Tier 2 Applications",
      "Utilization & Payment Optimization",
      "Building Long-Term Account Age and Mix"
    ],
    deliverables: [
      "Tier 2 Vendor List",
      "Credit Limit Increase Strategy Sheet",
      "Payment Reporting Calendar"
    ],
    icon: BarChart3,
    color: "from-purple-500 to-purple-600"
  },
  {
    id: 4,
    title: "LEVERAGE - Managing & Monitoring Credit",
    letter: "L",
    description: "Master ongoing credit optimization and prepare for funding stages",
    objective: "Master ongoing credit optimization and prepare for funding stages",
    lessons: [
      "Monitoring Systems (Personal + Business)",
      "Managing Utilization and Score Impact",
      "Dispute Protocols for Business Credit Reports",
      "Setting Up Alerts and Automated Tracking",
      "Preparing for Lender Review"
    ],
    deliverables: [
      "Credit Monitoring Comparison Chart",
      "Utilization Worksheet",
      "Lender-Ready Profile Audit Checklist"
    ],
    icon: Shield,
    color: "from-orange-500 to-orange-600"
  },
  {
    id: 5,
    title: "DEVELOP - Access to Capital",
    letter: "D",
    description: "Position your profiles for funding programs, credit stacking, and partnerships",
    objective: "Position your profiles for funding programs, credit stacking, and partnerships",
    lessons: [
      "The FUND-Ready Profile Explained",
      "Soft Pull vs. Hard Pull Applications",
      "Strategic Credit Stacking (0% Cards, Lines, Loans)",
      "Business Bank Relationship Management",
      "Preparing for the FUND Program or Capital Raise"
    ],
    deliverables: [
      "Funding Readiness Scorecard",
      "Lender Matching Guide",
      "Capital Stacking Planner"
    ],
    icon: DollarSign,
    color: "from-emerald-500 to-emerald-600"
  },
];

type AccountCategory = "vendor" | "financial" | "retail" | "subscription";

interface BusinessAccount {
  id: string;
  creditor: string;
  type: string;
}

interface AccountAnalysis {
  hasVendor: boolean;
  hasFinancial: boolean;
  hasRetail: boolean;
  hasSubscription: boolean;
  missingCategories: AccountCategory[];
  totalAccounts: number;
}

const categorizeAccount = (creditor: string, type: string): AccountCategory | null => {
  const creditorLower = creditor.toLowerCase();
  
  // Vendor accounts (Net 30, Net 60 terms)
  if (creditorLower.includes("vendor") || creditorLower.includes("supply") || 
      creditorLower.includes("wholesale") || type === "net_terms") {
    return "vendor";
  }
  
  // Financial accounts (Business credit cards, lines of credit, loans)
  if (type === "credit_card" || type === "line_of_credit" || type === "loan" ||
      creditorLower.includes("bank") || creditorLower.includes("capital") ||
      creditorLower.includes("american express") || creditorLower.includes("chase business")) {
    return "financial";
  }
  
  // Retail accounts (Store cards, retail credit)
  if (creditorLower.includes("home depot") || creditorLower.includes("lowes") ||
      creditorLower.includes("staples") || creditorLower.includes("office depot") ||
      creditorLower.includes("walmart") || creditorLower.includes("amazon business")) {
    return "retail";
  }
  
  // Subscription accounts (SaaS, utilities, recurring services)
  if (creditorLower.includes("utility") || creditorLower.includes("telecom") ||
      creditorLower.includes("internet") || creditorLower.includes("phone") ||
      creditorLower.includes("subscription") || type === "utility") {
    return "subscription";
  }
  
  return null;
};


export const BuildProgramOutline = () => {
  const [expandedModule, setExpandedModule] = useState<number | null>(1);
  const [businessAccounts, setBusinessAccounts] = useState<BusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsingSyncing, setParsingSyncing] = useState(false);
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<AccountAnalysis>({
    hasVendor: false,
    hasFinancial: false,
    hasRetail: false,
    hasSubscription: false,
    missingCategories: [],
    totalAccounts: 0
  });

  useEffect(() => {
    fetchBusinessAccounts();
  }, []);

  const fetchBusinessAccounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch business credit accounts
      const { data: accounts, error } = await supabase
        .from("credit_accounts")
        .select("id, creditor, type")
        .eq("user_id", user.id);

      if (error) throw error;

      setBusinessAccounts(accounts || []);
      analyzeAccounts(accounts || []);
    } catch (error) {
      console.error("Error fetching business accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeAccounts = (accounts: BusinessAccount[]) => {
    const categories = {
      vendor: false,
      financial: false,
      retail: false,
      subscription: false
    };

    accounts.forEach(account => {
      const category = categorizeAccount(account.creditor, account.type);
      if (category) {
        categories[category] = true;
      }
    });

    const missing: AccountCategory[] = [];
    (Object.keys(categories) as AccountCategory[]).forEach(key => {
      if (!categories[key]) {
        missing.push(key);
      }
    });

    setAnalysis({
      hasVendor: categories.vendor,
      hasFinancial: categories.financial,
      hasRetail: categories.retail,
      hasSubscription: categories.subscription,
      missingCategories: missing,
      totalAccounts: accounts.length
    });
  };

  const handleReportUpload = async () => {
    setParsingSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Call edge function to parse the uploaded PDF
      const { data, error } = await supabase.functions.invoke("parse-business-credit-report", {
        body: { userId: user.id }
      });

      if (error) throw error;

      toast({
        title: "Report parsed successfully",
        description: `Found ${data.accountsAdded} business accounts in your credit report.`,
      });

      // Refresh the accounts
      await fetchBusinessAccounts();
    } catch (error: any) {
      console.error("Error parsing report:", error);
      toast({
        title: "Parsing failed",
        description: error.message || "Failed to parse business credit report",
        variant: "destructive",
      });
    } finally {
      setParsingSyncing(false);
    }
  };

  const handleSyncBureaus = async () => {
    setParsingSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Call edge function to fetch from credit bureaus
      const { data, error } = await supabase.functions.invoke("sync-business-credit-bureaus", {
        body: { userId: user.id }
      });

      if (error) throw error;

      toast({
        title: "Credit bureaus synced",
        description: `Synced data from ${data.bureausSynced.join(", ")}`,
      });

      // Refresh the accounts
      await fetchBusinessAccounts();
    } catch (error: any) {
      console.error("Error syncing bureaus:", error);
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync with credit bureaus",
        variant: "destructive",
      });
    } finally {
      setParsingSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Business BUILD Program
        </h2>
        <p className="text-muted-foreground mt-2">
          Build fundable business credit with strategic account placement
        </p>
      </div>

      {/* Upload Section */}
      <Card className="p-6 border-primary/20">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Import Business Credit Report</CardTitle>
          <CardDescription>
            Upload your business credit report PDF or sync directly from credit bureaus
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <DocumentUpload
                documentType="business_credit_report"
                label="Business Credit Report"
                description="Upload PDF from Dun & Bradstreet, Experian, Equifax, or Nav"
                bucketName="business-documents"
                onUploadSuccess={() => {}}
              />
              <Button 
                onClick={handleReportUpload} 
                className="w-full mt-3"
                disabled={parsingSyncing}
              >
                {parsingSyncing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Parsing Report...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Parse Uploaded Report
                  </>
                )}
              </Button>
            </div>
            <div className="flex flex-col justify-center">
              <h4 className="font-semibold mb-2">Or Sync from Bureaus</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Connect directly to business credit bureaus for automatic updates
              </p>
              <Button 
                onClick={handleSyncBureaus} 
                variant="outline"
                disabled={parsingSyncing}
              >
                {parsingSyncing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync from Bureaus
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Report Analysis */}
      {!loading && analysis.totalAccounts === 0 ? (
        <Alert className="border-warning/50 bg-warning/10">
          <Upload className="h-4 w-4" />
          <AlertDescription>
            Upload and parse your business credit report above to receive personalized account recommendations.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="p-6 border-primary/20 shadow-glow">
          <CardHeader className="px-0 pt-0">
            <CardTitle>Your Business Credit Profile Analysis</CardTitle>
            <CardDescription>
              Based on your current business credit report
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-lg border ${analysis.hasVendor ? 'bg-success/10 border-success/30' : 'bg-muted border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {analysis.hasVendor ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  )}
                  <h4 className="font-semibold text-sm">Vendor</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {analysis.hasVendor ? "Established" : "Missing"}
                </p>
              </div>

              <div className={`p-4 rounded-lg border ${analysis.hasFinancial ? 'bg-success/10 border-success/30' : 'bg-muted border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {analysis.hasFinancial ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  )}
                  <h4 className="font-semibold text-sm">Financial</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {analysis.hasFinancial ? "Established" : "Missing"}
                </p>
              </div>

              <div className={`p-4 rounded-lg border ${analysis.hasRetail ? 'bg-success/10 border-success/30' : 'bg-muted border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {analysis.hasRetail ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  )}
                  <h4 className="font-semibold text-sm">Retail</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {analysis.hasRetail ? "Established" : "Missing"}
                </p>
              </div>

              <div className={`p-4 rounded-lg border ${analysis.hasSubscription ? 'bg-success/10 border-success/30' : 'bg-muted border-border'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {analysis.hasSubscription ? (
                    <CheckCircle2 className="w-5 h-5 text-success" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  )}
                  <h4 className="font-semibold text-sm">Subscription</h4>
                </div>
                <p className="text-xs text-muted-foreground">
                  {analysis.hasSubscription ? "Established" : "Missing"}
                </p>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

    </div>
  );
};
