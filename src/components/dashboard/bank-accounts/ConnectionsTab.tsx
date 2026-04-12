import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectionsTab() {
  return (
    <div className="space-y-6">
      {/* Phase 2 Notice */}
      <Card className="border-accent/30 bg-gradient-to-br from-accent/5 to-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-accent mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Open Banking Connection</h3>
              <p className="text-sm text-muted-foreground">
                Bank account connection via open banking is planned for Phase 2. When available, you'll be able to connect your bank accounts for automatic transaction syncing, real-time balance monitoring, and cashflow analysis.
              </p>
              <Badge variant="outline" className="text-xs border-accent/30 text-accent">Phase 2 — Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Method */}
      <Card className="border-border/50 shadow-card">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">Current Method: PDF Statement Uploads</h3>
              <p className="text-sm text-muted-foreground">
                Upload your bank statements as PDFs in the Financial Docs tab of your Business Profile. Our AI extracts revenue, balances, NSF counts, and cash flow metrics automatically.
              </p>
              <Button variant="outline" size="sm" className="mt-2">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Go to Financial Docs
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}