import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle2, XCircle, Clock, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FinancialDocsSectionProps {
  businessId: string;
  userId: string;
  onCompletionChange: (pct: number) => void;
}

interface DocType {
  key: string;
  label: string;
  insight: string;
}

const DOC_TYPES: DocType[] = [
  { key: "tax_returns_business", label: "Business Tax Returns (2 years)", insight: "SBA lenders require 2 years of business tax returns. Traditional banks require them for any LOC over $50,000. Missing tax returns automatically disqualify you from most term loan products." },
  { key: "tax_returns_personal", label: "Personal Tax Returns (2 years)", insight: "Required for all SBA loans and most bank term loans. Personal guarantors must provide personal tax returns even on business-only applications." },
  { key: "profit_and_loss", label: "Profit & Loss Statement (12 months)", insight: "Alternative lenders and revenue-based lenders use P&L statements as primary underwriting documents. Banks require them for any LOC application." },
  { key: "balance_sheet", label: "Balance Sheet (most recent)", insight: "Required for SBA 7(a) loans and most bank term loans over $100K. Shows your net worth and leverage ratios." },
  { key: "bank_statements", label: "Business Bank Statements (3 months)", insight: "Revenue-based lenders and MCA providers primarily underwrite from bank statements. Most require 3–6 months. Some fintech lenders only need bank statements." },
  { key: "articles_of_organization", label: "Articles of Organization / Incorporation", insight: "Required by every lender to verify entity formation. Must match your Secretary of State filing exactly." },
  { key: "operating_agreement", label: "Operating Agreement", insight: "Required for multi-member LLCs and partnerships. Some SBA lenders require it even for single-member LLCs." },
  { key: "business_licenses", label: "Business Licenses & Permits", insight: "Industry-specific lenders and SBA loans require proof of proper licensing. Missing licenses can delay funding by weeks." },
];

interface DocRecord {
  id: string;
  doc_type: string;
  status: string;
  upload_date: string | null;
  document_id: string | null;
}

export function FinancialDocsSection({ businessId, userId, onCompletionChange }: FinancialDocsSectionProps) {
  const [docs, setDocs] = useState<Record<string, DocRecord>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => { fetchDocs(); }, [businessId]);

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("business_financial_docs")
      .select("*")
      .eq("business_id", businessId);
    const map: Record<string, DocRecord> = {};
    (data || []).forEach((d: any) => { map[d.doc_type] = d; });
    setDocs(map);

    const uploaded = DOC_TYPES.filter(dt => map[dt.key]?.status === "uploaded").length;
    onCompletionChange(Math.round((uploaded / DOC_TYPES.length) * 100));
  };

  const getStatus = (key: string): "uploaded" | "outdated" | "missing" => {
    const doc = docs[key];
    if (!doc || doc.status === "missing") return "missing";
    if (doc.status === "outdated") return "outdated";
    // Check if older than 12 months
    if (doc.upload_date) {
      const uploadDate = new Date(doc.upload_date);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (uploadDate < oneYearAgo) return "outdated";
    }
    return "uploaded";
  };

  const handleUpload = async (docType: DocType) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setUploading(docType.key);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `${user.id}/${businessId}/${docType.key}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("business-documents")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        // Create document record
        const { data: docData, error: docErr } = await supabase.from("documents").insert({
          user_id: user.id,
          business_id: businessId,
          file_name: file.name,
          file_path: filePath,
          folder_path: `/${docType.key}/`,
          mime_type: file.type,
          file_size: file.size,
          bucket_name: "business-documents",
          document_type: docType.key,
        }).select("id").single();
        if (docErr) throw docErr;

        // Upsert financial doc tracking
        const existing = docs[docType.key];
        if (existing) {
          await supabase.from("business_financial_docs").update({
            status: "uploaded",
            document_id: docData.id,
            upload_date: new Date().toISOString(),
          } as any).eq("id", existing.id);
        } else {
          await supabase.from("business_financial_docs").insert({
            business_id: businessId,
            user_id: user.id,
            doc_type: docType.key,
            status: "uploaded",
            document_id: docData.id,
            upload_date: new Date().toISOString(),
          } as any);
        }

        toast.success(`${docType.label} uploaded`);
        fetchDocs();
      } catch (err: any) {
        toast.error("Upload failed", { description: err.message });
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "uploaded") return <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />;
    if (status === "outdated") return <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    return <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />;
  };

  return (
    <div className="space-y-3">
      {DOC_TYPES.map(dt => {
        const status = getStatus(dt.key);
        const doc = docs[dt.key];
        return (
          <Card key={dt.key} className={`border ${status === "uploaded" ? "border-emerald-500/20" : status === "outdated" ? "border-amber-500/20" : "border-border"}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <StatusIcon status={status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{dt.label}</p>
                      {doc?.upload_date && (
                        <p className="text-xs text-muted-foreground">
                          Uploaded {new Date(doc.upload_date).toLocaleDateString()}
                          {status === "outdated" && <span className="text-amber-500 ml-1">— Outdated (over 12 months old)</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={status === "uploaded" ? "default" : status === "outdated" ? "secondary" : "destructive"}
                        className={status === "uploaded" ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-xs" : status === "outdated" ? "bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs" : "text-xs"}>
                        {status === "uploaded" ? "Uploaded" : status === "outdated" ? "Outdated" : "Missing"}
                      </Badge>
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => handleUpload(dt)} disabled={uploading === dt.key}>
                        <Upload className="w-3 h-3 mr-1" />
                        {uploading === dt.key ? "..." : status === "uploaded" ? "Replace" : "Upload"}
                      </Button>
                    </div>
                  </div>
                  {status !== "uploaded" && (
                    <Alert className="mt-2 border-blue-500/20 bg-blue-500/5 py-2">
                      <Info className="w-3 h-3 text-blue-500" />
                      <AlertDescription className="text-xs">{dt.insight}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
