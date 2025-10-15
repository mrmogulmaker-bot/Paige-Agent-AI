import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  AlertCircle, 
  DollarSign, 
  CreditCard, 
  FileText, 
  TrendingDown,
  CheckCircle,
  Bell,
  Target,
  Percent
} from "lucide-react";

export function PersonalCreditDashboard() {
  const { toast } = useToast();

  const handleAction = (action: string) => {
    toast({
      title: "Action Started",
      description: `${action} workflow initiated.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Credit Score Overview */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Credit Score Overview
          </CardTitle>
          <CardDescription>
            Current score and progress toward your 750 target
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-primary">687</p>
              <p className="text-sm text-muted-foreground">Current Score</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-muted-foreground">750</p>
              <p className="text-sm text-muted-foreground">Target Score</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress to Target</span>
              <span className="text-primary font-medium">63 points to go</span>
            </div>
            <Progress value={84} className="h-2" />
          </div>
          <div className="grid grid-cols-3 gap-4 pt-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Experian</p>
              <p className="text-xl font-bold">692</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Equifax</p>
              <p className="text-xl font-bold">687</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">TransUnion</p>
              <p className="text-xl font-bold">683</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Disputes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">
              30-day clock started
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Derogatory Items</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5</div>
            <p className="text-xs text-muted-foreground">
              2 late pays, 3 collections
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Utilization</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">38%</div>
            <p className="text-xs text-destructive">
              Above 30% target
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-Time Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">96%</div>
            <p className="text-xs text-muted-foreground">
              Trailing 24 months
            </p>
          </CardContent>
        </Card>
      </div>

      {/* A.C.C.E.L. Progress */}
      <Card>
        <CardHeader>
          <CardTitle>A.C.C.E.L. Progress</CardTitle>
          <CardDescription>
            Audit → Correct → Consolidate → Expand → Leverage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Audit</span>
              <Badge variant="default">Completed</Badge>
            </div>
            <Progress value={100} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Correct</span>
              <Badge variant="secondary">In Progress</Badge>
            </div>
            <Progress value={60} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Consolidate</span>
              <Badge variant="outline">Not Started</Badge>
            </div>
            <Progress value={0} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Expand</span>
              <Badge variant="outline">Not Started</Badge>
            </div>
            <Progress value={0} className="h-2" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Leverage</span>
              <Badge variant="outline">Not Started</Badge>
            </div>
            <Progress value={0} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Utilization & Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Utilization & Limits
          </CardTitle>
          <CardDescription>
            Keep overall &lt;30%, target 10%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Overall Utilization</span>
            <span className="text-2xl font-bold text-destructive">38%</span>
          </div>
          <Progress value={38} className="h-3" />
          <div className="grid gap-3">
            <div className="flex justify-between items-center p-3 border rounded-lg">
              <div>
                <p className="font-medium">Chase Freedom</p>
                <p className="text-sm text-muted-foreground">$1,200 / $5,000</p>
              </div>
              <Badge variant="destructive">24%</Badge>
            </div>
            <div className="flex justify-between items-center p-3 border rounded-lg">
              <div>
                <p className="font-medium">Discover It</p>
                <p className="text-sm text-muted-foreground">$900 / $3,000</p>
              </div>
              <Badge variant="destructive">30%</Badge>
            </div>
            <div className="flex justify-between items-center p-3 border rounded-lg">
              <div>
                <p className="font-medium">Capital One Secured</p>
                <p className="text-sm text-muted-foreground">$50 / $500</p>
              </div>
              <Badge variant="default">10%</Badge>
            </div>
          </div>
          <Button 
            className="w-full" 
            onClick={() => handleAction("Optimize Utilization")}
          >
            Optimize Utilization
          </Button>
        </CardContent>
      </Card>

      {/* Budget & Savings */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Budget & Savings
            </CardTitle>
            <CardDescription>50/30/20 rule tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Needs (50%)</span>
                <span className="font-medium">$2,500 / $2,500</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Wants (30%)</span>
                <span className="font-medium">$1,200 / $1,500</span>
              </div>
              <Progress value={80} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Savings (20%)</span>
                <span className="font-medium text-green-500">$1,000 / $1,000</span>
              </div>
              <Progress value={100} className="h-2" />
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => handleAction("Update Budget")}
            >
              Update Budget
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Monitoring & Alerts
            </CardTitle>
            <CardDescription>Tri-bureau monitoring status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">Experian</span>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-medium">Equifax</span>
                </div>
                <Badge variant="default">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium">TransUnion</span>
                </div>
                <Badge variant="outline">Pending</Badge>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => handleAction("Enable Monitoring")}
            >
              Enable Full Monitoring
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Next Best Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Next Best Actions</CardTitle>
          <CardDescription>
            Recommended tasks to improve your credit profile
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <TrendingDown className="w-5 h-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Pay down high-utilization cards</p>
                <p className="text-sm text-muted-foreground">
                  Reduce utilization to &lt;30% before statement cut date
                </p>
              </div>
              <Button size="sm" onClick={() => handleAction("Start Paydown Plan")}>
                Start
              </Button>
            </div>
            
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <FileText className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Follow up on active disputes</p>
                <p className="text-sm text-muted-foreground">
                  3 disputes pending response (12 days remaining)
                </p>
              </div>
              <Button size="sm" onClick={() => handleAction("Check Dispute Status")}>
                Check
              </Button>
            </div>
            
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <CreditCard className="w-5 h-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Request credit limit increases</p>
                <p className="text-sm text-muted-foreground">
                  2 cards eligible for soft-pull CLI
                </p>
              </div>
              <Button size="sm" onClick={() => handleAction("Request CLIs")}>
                Request
              </Button>
            </div>

            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
              <TrendingUp className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Open credit-builder loan</p>
                <p className="text-sm text-muted-foreground">
                  Add installment mix to your credit profile
                </p>
              </div>
              <Button size="sm" onClick={() => handleAction("Open Builder Loan")}>
                Start
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tone Lines */}
      <div className="text-center space-y-2 py-6">
        <p className="text-lg font-semibold bg-gradient-gold bg-clip-text text-transparent">
          From borrower to banker.
        </p>
        <p className="text-sm text-muted-foreground">
          Clean the file. Build the score. Move like a mogul.
        </p>
      </div>
    </div>
  );
}
