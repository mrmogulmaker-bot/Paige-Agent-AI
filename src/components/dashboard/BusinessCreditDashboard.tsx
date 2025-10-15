import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Building2, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle,
  DollarSign,
  FileText,
  Target,
  Calendar,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Briefcase
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mock data for demonstration
const mockData = {
  fundabilityScore: 72,
  activeTrades: 12,
  onTimeRate: 98,
  paydex: 78,
  intelliscore: 76,
  monthsInBusiness: 24,
  avgBankBalance: 45000,
  dscr: 1.35,
  activeApps: 2,
  complianceIssues: 1,
  vendorTiers: {
    tier1: { completed: 3, total: 5 },
    tier2: { completed: 2, total: 4 },
    tier3: { completed: 0, total: 3 }
  }
};

const BusinessCreditDashboard = () => {
  const { toast } = useToast();

  const handleAction = (action: string) => {
    toast({
      title: "Action Started",
      description: `${action} initiated successfully.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Business Credit Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your business credit profile, fundability, and compliance
        </p>
      </div>

      {/* Fundability Snapshot */}
      <Card className="shadow-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Fundability Snapshot
          </CardTitle>
          <CardDescription>Your overall business credit health and funding readiness</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-primary">{mockData.fundabilityScore}/100</span>
                <Badge variant={mockData.fundabilityScore >= 70 ? "default" : "secondary"}>
                  {mockData.fundabilityScore >= 80 ? "Excellent" : mockData.fundabilityScore >= 70 ? "Good" : "Fair"}
                </Badge>
              </div>
              <Progress value={mockData.fundabilityScore} className="h-3" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{mockData.activeTrades}</div>
                <div className="text-xs text-muted-foreground">Active Trades</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{mockData.onTimeRate}%</div>
                <div className="text-xs text-muted-foreground">On-Time Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{mockData.monthsInBusiness}</div>
                <div className="text-xs text-muted-foreground">Months in Business</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{mockData.dscr.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">DSCR</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Paydex Score */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Paydex Score
            </CardDescription>
            <CardTitle className="text-3xl">{mockData.paydex}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={mockData.paydex} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">
              {mockData.paydex >= 80 ? "Excellent payment history" : "Good standing"}
            </p>
          </CardContent>
        </Card>

        {/* Intelliscore */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Intelliscore
            </CardDescription>
            <CardTitle className="text-3xl">{mockData.intelliscore}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={mockData.intelliscore} className="h-2 mb-2" />
            <p className="text-xs text-muted-foreground">
              Low credit risk profile
            </p>
          </CardContent>
        </Card>

        {/* Average Bank Balance */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Avg Bank Balance
            </CardDescription>
            <CardTitle className="text-3xl">${(mockData.avgBankBalance / 1000).toFixed(0)}K</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Strong cash position for funding
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Health & Vendor Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance Health */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Compliance Health
            </CardTitle>
            <CardDescription>Business formation and regulatory status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">SOS Good Standing</span>
              </div>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                Active
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">Business Licenses</span>
              </div>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                Current
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                <span className="text-sm">Registered Agent</span>
              </div>
              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                Renewal Due
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-sm">NAP Consistency</span>
              </div>
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                Verified
              </Badge>
            </div>
            <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={() => handleAction("Compliance Audit")}
            >
              <FileText className="w-4 h-4 mr-2" />
              Run Compliance Audit
            </Button>
          </CardContent>
        </Card>

        {/* Vendor Tier Progress */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              Vendor Tier Progress
            </CardTitle>
            <CardDescription>Trade reference development strategy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Tier 1 (Starter Vendors)</span>
                  <span className="text-xs text-muted-foreground">
                    {mockData.vendorTiers.tier1.completed}/{mockData.vendorTiers.tier1.total}
                  </span>
                </div>
                <Progress 
                  value={(mockData.vendorTiers.tier1.completed / mockData.vendorTiers.tier1.total) * 100} 
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Tier 2 (Store/Fleet Cards)</span>
                  <span className="text-xs text-muted-foreground">
                    {mockData.vendorTiers.tier2.completed}/{mockData.vendorTiers.tier2.total}
                  </span>
                </div>
                <Progress 
                  value={(mockData.vendorTiers.tier2.completed / mockData.vendorTiers.tier2.total) * 100} 
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Tier 3 (Corporate Cards)</span>
                  <span className="text-xs text-muted-foreground">
                    {mockData.vendorTiers.tier3.completed}/{mockData.vendorTiers.tier3.total}
                  </span>
                </div>
                <Progress 
                  value={(mockData.vendorTiers.tier3.completed / mockData.vendorTiers.tier3.total) * 100} 
                  className="h-2"
                />
              </div>
            </div>
            <Button 
              className="w-full mt-4 bg-gradient-gold hover:opacity-90"
              onClick={() => handleAction("Add Starter Vendors")}
            >
              <Building2 className="w-4 h-4 mr-2" />
              Add Starter Vendors
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Funding Pipeline & Bureau Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funding Pipeline */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Funding Pipeline
            </CardTitle>
            <CardDescription>{mockData.activeApps} active application{mockData.activeApps !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Business LOC - $50K</span>
                  <Badge>Underwriting</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>Decision due in 3 days</span>
                </div>
              </div>
              <div className="p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Equipment Financing</span>
                  <Badge variant="outline">Submitted</Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>Awaiting review</span>
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-4">
              <Button 
                className="w-full bg-gradient-gold hover:opacity-90"
                onClick={() => handleAction("Apply for Business LOC")}
              >
                <DollarSign className="w-4 h-4 mr-2" />
                Apply for Business LOC
              </Button>
              <Button 
                variant="outline"
                className="w-full"
                onClick={() => handleAction("Create Funding Plan")}
              >
                <Target className="w-4 h-4 mr-2" />
                Create Funding Plan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bureau Profiles */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Bureau Profiles
            </CardTitle>
            <CardDescription>Credit bureau monitoring status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium">Dun & Bradstreet</div>
                  <div className="text-xs text-muted-foreground">Paydex: {mockData.paydex}</div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium">Experian Business</div>
                  <div className="text-xs text-muted-foreground">Intelliscore: {mockData.intelliscore}</div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/20">
                <div>
                  <div className="font-medium">Equifax Business</div>
                  <div className="text-xs text-yellow-500">Profile not claimed</div>
                </div>
                <AlertCircle className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
            <Button 
              variant="outline"
              className="w-full mt-4"
              onClick={() => handleAction("Claim Bureau Profiles")}
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Claim Bureau Profiles
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Next Best Actions */}
      <Card className="shadow-card border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Next Best Actions
          </CardTitle>
          <CardDescription>Recommended actions to improve your business credit profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Renew Registered Agent</div>
                  <div className="text-sm text-muted-foreground">Due in 15 days - Priority: High</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleAction("Renew Registered Agent")}>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Request D-U-N-S Number</div>
                  <div className="text-sm text-muted-foreground">Establish business credit foundation</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleAction("Request D-U-N-S")}>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Upload Bank Statements</div>
                  <div className="text-sm text-muted-foreground">Required for funding applications</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleAction("Upload Bank Statements")}>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Request Credit Limit Increases</div>
                  <div className="text-sm text-muted-foreground">Improve utilization ratio</div>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleAction("Request CLIs")}>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessCreditDashboard;
