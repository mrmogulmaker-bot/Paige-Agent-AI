import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Building2, Upload, TrendingUp, AlertCircle, CheckCircle2, Info } from "lucide-react";

export const BusinessCreditReport = () => {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Business Credit Monitoring</h1>
          <p className="text-muted-foreground">Track your business credit across all major bureaus</p>
        </div>
        <Button className="gap-2 bg-gradient-gold">
          <Upload className="w-4 h-4" />
          Import Business Credit Report
        </Button>
      </div>

      {/* Overall Business Credit Summary */}
      <Card className="p-6 bg-gradient-to-br from-card to-card/50 border-border shadow-glow">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-primary" />
            <p className="text-sm text-muted-foreground mb-1">Business Name</p>
            <p className="font-semibold">Not Available</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">DUNS Number</p>
            <p className="font-semibold">--</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Years in Business</p>
            <p className="font-semibold">--</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Industry</p>
            <p className="font-semibold">--</p>
          </div>
        </div>
      </Card>

      {/* Dun & Bradstreet */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold">Dun & Bradstreet</h2>
          <Badge variant="outline" className="ml-auto">Not Available</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* PAYDEX Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">PAYDEX Score</h3>
                <p className="text-xs text-muted-foreground">Payment Performance (1-100)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">80+ is Good</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>100: Early payment</span>
                <span className="text-success">Excellent</span>
              </div>
              <div className="flex justify-between">
                <span>80: On time</span>
                <span className="text-success">Good</span>
              </div>
              <div className="flex justify-between">
                <span>50: 15 days late</span>
                <span className="text-warning">Fair</span>
              </div>
              <div className="flex justify-between">
                <span>&lt;50: 30+ days late</span>
                <span className="text-destructive">Poor</span>
              </div>
            </div>
          </div>

          {/* Delinquency Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Delinquency Score</h3>
                <p className="text-xs text-muted-foreground">Delinquency Prediction (1-5)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Lower is Better</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Class 1</span>
                <span className="text-success">Low Risk (0.8%)</span>
              </div>
              <div className="flex justify-between">
                <span>Class 2</span>
                <span className="text-success">Minimal Risk (1.5%)</span>
              </div>
              <div className="flex justify-between">
                <span>Class 3</span>
                <span className="text-warning">Moderate (3.5%)</span>
              </div>
              <div className="flex justify-between">
                <span>Class 4-5</span>
                <span className="text-destructive">High Risk (6%+)</span>
              </div>
            </div>
          </div>

          {/* Failure Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Failure Score</h3>
                <p className="text-xs text-muted-foreground">Business Failure Risk (1-5)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Lower is Better</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Class 1</span>
                <span className="text-success">Very Low (0.3%)</span>
              </div>
              <div className="flex justify-between">
                <span>Class 2</span>
                <span className="text-success">Low (1.2%)</span>
              </div>
              <div className="flex justify-between">
                <span>Class 3</span>
                <span className="text-warning">Moderate (3.5%)</span>
              </div>
              <div className="flex justify-between">
                <span>Class 4-5</span>
                <span className="text-destructive">High (8%+)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            Import your Dun & Bradstreet report to see detailed scores and payment history
          </p>
        </div>
      </Card>

      {/* Experian Business */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold">Experian Business</h2>
          <Badge variant="outline" className="ml-auto">Not Available</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Intelliscore Plus */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Intelliscore Plus</h3>
                <p className="text-xs text-muted-foreground">Credit Risk Score (1-100)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">76+ is Good</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>76-100</span>
                <span className="text-success">Low Risk</span>
              </div>
              <div className="flex justify-between">
                <span>51-75</span>
                <span className="text-warning">Medium Risk</span>
              </div>
              <div className="flex justify-between">
                <span>26-50</span>
                <span className="text-warning">Medium-High Risk</span>
              </div>
              <div className="flex justify-between">
                <span>11-25</span>
                <span className="text-destructive">High Risk</span>
              </div>
              <div className="flex justify-between">
                <span>1-10</span>
                <span className="text-destructive">Very High Risk</span>
              </div>
            </div>
          </div>

          {/* Financial Stability Risk */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Financial Stability</h3>
                <p className="text-xs text-muted-foreground">Stability Risk (1-5)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Class Rating</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Class 1</span>
                <span className="text-success">Very Stable</span>
              </div>
              <div className="flex justify-between">
                <span>Class 2</span>
                <span className="text-success">Stable</span>
              </div>
              <div className="flex justify-between">
                <span>Class 3</span>
                <span className="text-warning">Moderate</span>
              </div>
              <div className="flex justify-between">
                <span>Class 4-5</span>
                <span className="text-destructive">Unstable</span>
              </div>
            </div>
          </div>

          {/* Payment Index */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Payment Index</h3>
                <p className="text-xs text-muted-foreground">Payment Behavior (0-100)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Higher is Better</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>90-100</span>
                <span className="text-success">Excellent</span>
              </div>
              <div className="flex justify-between">
                <span>75-89</span>
                <span className="text-success">Good</span>
              </div>
              <div className="flex justify-between">
                <span>50-74</span>
                <span className="text-warning">Fair</span>
              </div>
              <div className="flex justify-between">
                <span>&lt;50</span>
                <span className="text-destructive">Poor</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            Import your Experian Business report to see detailed scores and credit utilization
          </p>
        </div>
      </Card>

      {/* Equifax Business */}
      <Card className="p-6 bg-card border-border shadow-card">
        <div className="flex items-center gap-2 mb-6">
          <AlertCircle className="w-5 h-5 text-primary" />
          <h2 className="text-2xl font-bold">Equifax Business</h2>
          <Badge variant="outline" className="ml-auto">Not Available</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Business Credit Risk Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Credit Risk Score</h3>
                <p className="text-xs text-muted-foreground">Risk Assessment (101-992)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Higher is Better</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>900-992</span>
                <span className="text-success">Excellent</span>
              </div>
              <div className="flex justify-between">
                <span>700-899</span>
                <span className="text-success">Good</span>
              </div>
              <div className="flex justify-between">
                <span>500-699</span>
                <span className="text-warning">Fair</span>
              </div>
              <div className="flex justify-between">
                <span>300-499</span>
                <span className="text-destructive">Poor</span>
              </div>
              <div className="flex justify-between">
                <span>101-299</span>
                <span className="text-destructive">Very Poor</span>
              </div>
            </div>
          </div>

          {/* Payment Index */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Payment Index</h3>
                <p className="text-xs text-muted-foreground">Payment Timeliness (1-100)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Higher is Better</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>90-100</span>
                <span className="text-success">Prompt Payment</span>
              </div>
              <div className="flex justify-between">
                <span>75-89</span>
                <span className="text-success">Good</span>
              </div>
              <div className="flex justify-between">
                <span>50-74</span>
                <span className="text-warning">Acceptable</span>
              </div>
              <div className="flex justify-between">
                <span>&lt;50</span>
                <span className="text-destructive">Needs Improvement</span>
              </div>
            </div>
          </div>

          {/* Business Failure Score */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">Failure Risk Score</h3>
                <p className="text-xs text-muted-foreground">Failure Probability (1-5000)</p>
              </div>
              <Info className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-center py-4 bg-muted rounded-lg">
              <p className="text-4xl font-bold text-muted-foreground">--</p>
              <p className="text-xs text-muted-foreground mt-2">Lower is Better</p>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>1-1000</span>
                <span className="text-success">Very Low Risk</span>
              </div>
              <div className="flex justify-between">
                <span>1001-2000</span>
                <span className="text-success">Low Risk</span>
              </div>
              <div className="flex justify-between">
                <span>2001-3500</span>
                <span className="text-warning">Moderate Risk</span>
              </div>
              <div className="flex justify-between">
                <span>3501-5000</span>
                <span className="text-destructive">High Risk</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground text-center">
            Import your Equifax Business report to see detailed scores and trade references
          </p>
        </div>
      </Card>

      {/* Getting Started Guide */}
      <Card className="p-6 bg-gradient-gold/10 border-primary/20">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-lg mb-2">How to Get Started</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Obtain your business credit reports from Dun & Bradstreet, Experian Business, and Equifax Business</li>
              <li>• Click "Import Business Credit Report" to upload your reports</li>
              <li>• We'll analyze your scores and provide actionable recommendations</li>
              <li>• Track your progress over time with automated monitoring</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};
