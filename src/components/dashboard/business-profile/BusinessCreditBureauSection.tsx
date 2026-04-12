import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, RefreshCcw, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBuildScore } from "@/hooks/useBuildScore";

interface BusinessCreditBureauSectionProps {
  businessId: string;
  userId: string;
  onCompletionChange: (pct: number) => void;
}

interface BureauInfo {
  name: string;
  scoreLabel: string;
  score: number | null;
  target: number;
  extra?: string;
  extraValue?: string;
}

export function BusinessCreditBureauSection({ businessId, userId, onCompletionChange }: BusinessCreditBureauSectionProps) {
  const { data: buildScore } = useBuildScore();
  const [uploading, setUploading] = useState<string | null>(null);

  const bureaus: BureauInfo[] = [
    {
      name: "Dun & Bradstreet",
      scoreLabel: "PAYDEX",
      score: buildScore?.paydex || null,
      target: 80,
      extra: "D-U-N-S Number",
      extraValue: buildScore?.duns_verified ? "Verified" : "Not Verified",
    },
    {
      name: "Experian Business",
      scoreLabel: "Intelliscore Plus",
      score: buildScore?.intelliscore || null,
      target: 75,
    },
    {
      name: "Equifax Business",
      scoreLabel: "Payment Index / Credit Risk",
      score: null,
      target: 75,
    },
    {
      name: "FICO SBSS",
      scoreLabel: "Composite Score",
      score: null,
      target: 160,
    },
  ];

  // Calc completion: how many bureaus have a score
  const completedBureaus = bureaus.filter(b => b.score !== null && b.score > 0).length;
  const pct = Math.round((completedBureaus / bureaus.length) * 100);
  // Update parent (use effect would cause loop, so just call synchronously in render is fine for static data)
  setTimeout(() => onCompletionChange(pct), 0);

  const getScoreColor = (score: number | null, target: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= target) return "text-emerald-500";
    if (score >= target * 0.85) return "text-amber-500";
    return "text-destructive";
  };

  const handleUploadReport = async (bureauName: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(bureauName);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `${user.id}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("credit-report-uploads")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("credit_report_uploads").insert({
          user_id: user.id,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          report_type: "business",
          analysis_status: "pending",
        });
        if (dbError) throw dbError;

        // Trigger analysis
        const { data: uploads } = await supabase
          .from("credit_report_uploads")
          .select("id")
          .eq("file_path", filePath)
          .maybeSingle();

        if (uploads?.id) {
          supabase.functions.invoke("analyze-credit-report", {
            body: { reportId: uploads.id },
          }).catch(console.error);
        }

        toast.success(`${bureauName} report uploaded — analysis starting`);
      } catch (err: any) {
        toast.error("Upload failed", { description: err.message });
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bureaus.map((bureau) => (
          <Card key={bureau.name} className="border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{bureau.name}</CardTitle>
                <Badge variant={bureau.score ? "default" : "secondary"} className={bureau.score ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30" : ""}>
                  {bureau.score ? "Active" : "No Data"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{bureau.scoreLabel}</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl font-bold ${getScoreColor(bureau.score, bureau.target)}`}>
                    {bureau.score || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">Target: {bureau.target}+</span>
                </div>
                {bureau.score !== null && bureau.score > 0 && (
                  <Progress value={Math.min(100, (bureau.score / bureau.target) * 100)} className="h-1.5 mt-2" />
                )}
              </div>

              {bureau.extra && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{bureau.extra}</span>
                  <Badge variant="outline" className="text-xs">{bureau.extraValue}</Badge>
                </div>
              )}

              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleUploadReport(bureau.name)} disabled={uploading === bureau.name}>
                  <Upload className="w-3 h-3 mr-1" />
                  {uploading === bureau.name ? "Uploading..." : "Upload Report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Alert className="border-accent/30 bg-accent/5">
        <Info className="w-4 h-4 text-accent" />
        <AlertDescription className="text-xs">
          <strong>Phase 2 Preview:</strong> Direct bureau API integration is planned for Phase 2. For now, upload business credit reports manually to sync scores. When bureau scores are uploaded and synced, the BUILD ladder automatically updates its bureau verification status.
        </AlertDescription>
      </Alert>
    </div>
  );
}
