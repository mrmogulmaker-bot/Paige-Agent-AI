import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, AlertCircle, CheckCircle2, TrendingUp, Shield } from "lucide-react";
import { CreditReportWizard } from "./CreditReportWizard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const creditReports = [
  {
    bureau: "Experian",
    score: 720,
    lastUpdated: "2024-10-08",
    accounts: 12,
    negativeItems: 2,
    inquiries: 3,
  },
  {
    bureau: "Equifax",
    score: 715,
    lastUpdated: "2024-10-07",
    accounts: 12,
    negativeItems: 3,
    inquiries: 2,
  },
  {
    bureau: "TransUnion",
    score: 725,
    lastUpdated: "2024-10-09",
    accounts: 11,
    negativeItems: 2,
    inquiries: 3,
  },
];

const reportItems = [
  {
    id: "1",
    type: "Collection",
    creditor: "Medical Corp",
    amount: 450,
    status: "disputing",
    reportedDate: "2023-05-15",
  },
  {
    id: "2",
    type: "Late Payment",
    creditor: "Capital One",
    amount: null,
    status: "verified",
    reportedDate: "2023-08-22",
  },
  {
    id: "3",
    type: "Charge-off",
    creditor: "Best Buy",
    amount: 1200,
    status: "removed",
    reportedDate: "2022-12-01",
  },
];

interface VerificationStatus {
  isVerified: boolean;
  experian: boolean;
  equifax: boolean;
  transunion: boolean;
  expiresAt?: string;
}

export function ReportsView() {
  const [showWizard, setShowWizard] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    isVerified: false,
    experian: false,
    equifax: false,
    transunion: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVerificationStatus();
  }, []);

  const fetchVerificationStatus = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("credit_report_verifications")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching verification:", error);
        return;
      }

      if (data) {
        const isVerified = data.experian_verified && data.equifax_verified && data.transunion_verified;
        setVerificationStatus({
          isVerified,
          experian: data.experian_verified || false,
          equifax: data.equifax_verified || false,
          transunion: data.transunion_verified || false,
          expiresAt: data.experian_expires_at || undefined,
        });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleWizardComplete = () => {
    fetchVerificationStatus();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Credit Reports
          </h1>
          <p className="text-muted-foreground mt-2">Monitor your credit reports from all three bureaus</p>
        </div>

        <div className="flex items-center gap-3">
          {!loading && verificationStatus.isVerified ? (
            <>
              <Badge className="bg-success text-success-foreground">
                <Shield className="w-3 h-3 mr-1" />
                Verified
              </Badge>
              <Button className="bg-gradient-gold hover:opacity-90">
                <Download className="w-4 h-4 mr-2" />
                Download All Reports
              </Button>
            </>
          ) : !loading ? (
            <Button onClick={() => setShowWizard(true)} className="bg-gradient-gold hover:opacity-90">
              <Download className="w-4 h-4 mr-2" />
              Import Credit Reports
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {creditReports.map((report) => (
          <Card key={report.bureau} className="shadow-card hover:shadow-glow transition-shadow">
            <CardHeader>
              <CardTitle>{report.bureau}</CardTitle>
              <CardDescription>Updated {new Date(report.lastUpdated).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-1">{report.score}</div>
                <div className="flex items-center justify-center gap-2 text-sm text-success">
                  <TrendingUp className="w-4 h-4" />
                  <span>Good</span>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Accounts</span>
                  <span className="font-medium">{report.accounts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Negative Items</span>
                  <span className="font-medium text-destructive">{report.negativeItems}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Inquiries</span>
                  <span className="font-medium">{report.inquiries}</span>
                </div>
              </div>

              <Button variant="outline" className="w-full" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                View Full Report
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Only the Negative Items tab has real data today. "All Accounts" and
          "Inquiries" tabs are hidden until those views are implemented. */}
      <Tabs defaultValue="negative" className="space-y-4">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="negative">Negative Items</TabsTrigger>
        </TabsList>

        <TabsContent value="negative" className="space-y-4">
          {reportItems.map((item) => {
            const statusConfig = {
              disputing: { label: "Disputing", color: "bg-warning", icon: AlertCircle },
              verified: { label: "Verified", color: "bg-destructive", icon: AlertCircle },
              removed: { label: "Removed", color: "bg-success", icon: CheckCircle2 },
            };
            const status = statusConfig[item.status as keyof typeof statusConfig];
            const StatusIcon = status.icon;

            return (
              <Card key={item.id} className="shadow-card">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{item.creditor}</CardTitle>
                      <CardDescription>{item.type}</CardDescription>
                    </div>
                    <Badge className={status.color}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {item.amount && (
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-medium">${item.amount.toLocaleString()}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground">Reported Date</p>
                      <p className="font-medium">{new Date(item.reportedDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {item.status === "verified" && (
                    <Button variant="outline" size="sm" className="mt-4">
                      File Dispute
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <CreditReportWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onComplete={handleWizardComplete}
      />
    </div>
  );
}
