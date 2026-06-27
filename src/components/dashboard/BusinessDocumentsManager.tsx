import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Folder,
  File,
  Trash2,
  Download,
  Brain,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  FileText,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

interface Business {
  id: string;
  legal_name: string;
  business_type: string;
}

interface Document {
  id: string;
  file_name: string;
  file_path: string;
  folder_path: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
  business_id: string | null;
}

interface RedFlag {
  flag: string;
  severity: string;
  recommendation: string;
}

interface GreenFlag {
  flag: string;
}

interface FinancialAnalysis {
  id: string;
  document_id: string;
  doc_type_detected: string | null;
  period_start: string | null;
  period_end: string | null;
  avg_monthly_revenue: number | null;
  avg_daily_balance: number | null;
  revenue_trend: string | null;
  nsf_count: number | null;
  overdraft_count: number | null;
  largest_deposit: number | null;
  largest_deposit_description: string | null;
  largest_withdrawal: number | null;
  largest_withdrawal_description: string | null;
  lender_red_flags: RedFlag[] | null;
  full_analysis: Record<string, any> | null;
  analysis_status: string;
  error_message: string | null;
  created_at: string;
}

export function BusinessDocumentsManager() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<string>("");
  const [currentFolder, setCurrentFolder] = useState("/");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyses, setAnalyses] = useState<Record<string, FinancialAnalysis>>({});
  const [analyzingDoc, setAnalyzingDoc] = useState<string | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<FinancialAnalysis | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadBusinesses();
  }, []);

  useEffect(() => {
    if (selectedBusiness) {
      loadDocuments();
    }
  }, [selectedBusiness, currentFolder]);

  const loadBusinesses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("businesses")
        .select("id, legal_name, business_type")
        .eq("owner_user_id", user.id)
        .order("legal_name");
      if (error) throw error;
      setBusinesses(data || []);
    } catch (error) {
      console.error("Error loading businesses:", error);
    }
  };

  const loadDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", user.id)
        .eq("business_id", selectedBusiness)
        .eq("folder_path", currentFolder)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      setDocuments(data || []);

      // Load analyses for these documents
      if (data && data.length > 0) {
        const docIds = data.map((d: any) => d.id);
        const { data: analysisData } = await supabase
          .from("financial_document_analyses")
          .select("*")
          .in("document_id", docIds);

        if (analysisData) {
          const map: Record<string, FinancialAnalysis> = {};
          analysisData.forEach((a: any) => {
            map[a.document_id] = a as FinancialAnalysis;
          });
          setAnalyses(map);
        }
      }
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !selectedBusiness) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      for (const file of Array.from(files)) {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `${user.id}/${selectedBusiness}${currentFolder}${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("business-documents")
          .upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: dbError } = await supabase.from("documents").insert({
          user_id: user.id,
          business_id: selectedBusiness,
          file_name: file.name,
          file_path: filePath,
          folder_path: currentFolder,
          mime_type: file.type,
          file_size: file.size,
          bucket_name: "business-documents",
          document_type: "business",
        });
        if (dbError) throw dbError;
      }
      toast({ title: "Success", description: "Files uploaded successfully" });
      loadDocuments();
    } catch (error) {
      console.error("Error uploading files:", error);
      toast({ title: "Error", description: "Failed to upload files", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    try {
      const { error: storageError } = await supabase.storage
        .from("business-documents")
        .remove([doc.file_path]);
      if (storageError) throw storageError;
      const { error: dbError } = await supabase.from("documents").delete().eq("id", doc.id);
      if (dbError) throw dbError;
      toast({ title: "Success", description: "File deleted" });
      loadDocuments();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete file", variant: "destructive" });
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage.from("business-documents").download(doc.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: "Error", description: "Failed to download file", variant: "destructive" });
    }
  };

  const isFinancialDocument = (doc: Document) => {
    const name = doc.file_name.toLowerCase();
    const financialKeywords = ['bank', 'statement', 'p&l', 'profit', 'loss', 'tax', 'return', 'balance', 'income', 'revenue', 'financial', '1040', '1120', 'schedule'];
    return doc.mime_type === 'application/pdf' && financialKeywords.some(k => name.includes(k));
  };

  const handleAnalyze = async (doc: Document) => {
    setAnalyzingDoc(doc.id);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-financial-document', {
        body: { documentId: doc.id, businessId: selectedBusiness },
      });
      if (error) throw error;
      if (data?.error) {
        sonnerToast.error(data.error);
      } else {
        sonnerToast.success('Financial analysis complete!');
      }
      loadDocuments();
    } catch (error) {
      console.error('Analysis error:', error);
      sonnerToast.error('Analysis failed. Please try again.');
    } finally {
      setAnalyzingDoc(null);
    }
  };

  const handleGenerateSummary = async () => {
    if (!selectedAnalysis) return;
    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-lender-summary', {
        body: { analysisId: selectedAnalysis.id },
      });
      if (error) throw error;
      if (data?.error) {
        sonnerToast.error(data.error);
        return;
      }
      if (data?.html) {
        // Open printable window
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html><head><title>Lender-Ready Financial Summary</title>
            <style>
              @media print { body { margin: 0; } @page { margin: 1in; } }
              body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            </style>
            </head><body>${data.html}</body></html>
          `);
          printWindow.document.close();
          sonnerToast.success('Lender summary generated! Use Print → Save as PDF to download.');
        }
      }
    } catch (error) {
      console.error('Summary generation error:', error);
      sonnerToast.error('Failed to generate summary.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const formatCurrency = (val: number | null) =>
    val !== null ? `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

  const getTrendIcon = (trend: string | null) => {
    if (trend === 'increasing') return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (trend === 'decreasing') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Business Documents</h2>
        <p className="text-muted-foreground">Organize files by business entity</p>
      </div>

      <Card className="p-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Select Business</label>
            <Select value={selectedBusiness} onValueChange={setSelectedBusiness}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a business entity" />
              </SelectTrigger>
              <SelectContent>
                {businesses.map((biz) => (
                  <SelectItem key={biz.id} value={biz.id}>
                    {biz.legal_name} ({biz.business_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input type="file" multiple onChange={handleFileUpload}
              disabled={!selectedBusiness || uploading} className="hidden" id="file-upload" />
            <label htmlFor="file-upload">
              <Button asChild disabled={!selectedBusiness || uploading}>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? "Uploading..." : "Upload Files"}
                </span>
              </Button>
            </label>
          </div>
        </div>
      </Card>

      {selectedBusiness && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Folder className="w-4 h-4" />
              <span>{currentFolder}</span>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No documents in this folder</div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => {
                  const analysis = analyses[doc.id];
                  const canAnalyze = doc.mime_type === 'application/pdf';
                  return (
                    <div key={doc.id} className="border border-border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <File className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(doc.uploaded_at).toLocaleDateString()} • {(doc.file_size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {canAnalyze && !analysis && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-accent text-accent hover:bg-accent hover:text-accent-foreground text-xs"
                              onClick={() => handleAnalyze(doc)}
                              disabled={analyzingDoc === doc.id}
                            >
                              {analyzingDoc === doc.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Brain className="w-3 h-3 mr-1" />
                              )}
                              Analyze with Paige
                            </Button>
                          )}
                          {analysis?.analysis_status === 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => setSelectedAnalysis(
                                selectedAnalysis?.id === analysis.id ? null : analysis
                              )}
                            >
                              <DollarSign className="w-3 h-3 mr-1" />
                              {selectedAnalysis?.id === analysis.id ? 'Hide' : 'View'} Intelligence
                            </Button>
                          )}
                          {analysis?.analysis_status === 'processing' && (
                            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Analyzing...
                            </Badge>
                          )}
                          {analysis?.analysis_status === 'failed' && (
                            <Button size="sm" variant="outline" className="text-xs text-red-400"
                              onClick={() => handleAnalyze(doc)} disabled={analyzingDoc === doc.id}>
                              Retry
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleDownload(doc)}>
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(doc)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Inline Financial Intelligence Panel */}
                      {selectedAnalysis?.document_id === doc.id && selectedAnalysis.analysis_status === 'completed' && (
                        <FinancialIntelligencePanel
                          analysis={selectedAnalysis}
                          onClose={() => setSelectedAnalysis(null)}
                          onGenerateSummary={handleGenerateSummary}
                          generatingSummary={generatingSummary}
                          formatCurrency={formatCurrency}
                          getTrendIcon={getTrendIcon}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function FinancialIntelligencePanel({
  analysis,
  onClose,
  onGenerateSummary,
  generatingSummary,
  formatCurrency,
  getTrendIcon,
}: {
  analysis: FinancialAnalysis;
  onClose: () => void;
  onGenerateSummary: () => void;
  generatingSummary: boolean;
  formatCurrency: (val: number | null) => string;
  getTrendIcon: (trend: string | null) => React.ReactNode;
}) {
  const fa = analysis.full_analysis;

  return (
    <div className="mt-3 border-t border-border pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" />
          Financial Intelligence
        </h4>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onGenerateSummary}
            disabled={generatingSummary}
            className="bg-accent hover:bg-accent/90 text-accent-foreground text-xs"
          >
            {generatingSummary ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <FileText className="w-3 h-3 mr-1" />
            )}
            Generate Lender-Ready Summary
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Summary */}
      {fa?.summary && (
        <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg leading-relaxed">
          {fa.summary}
        </p>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Avg Monthly Revenue" value={formatCurrency(analysis.avg_monthly_revenue)} />
        <MetricCard label="Avg Daily Balance" value={formatCurrency(analysis.avg_daily_balance)} />
        <MetricCard
          label="Revenue Trend"
          value={
            <span className="flex items-center gap-1 capitalize">
              {getTrendIcon(analysis.revenue_trend)}
              {analysis.revenue_trend || '—'}
            </span>
          }
        />
        <MetricCard
          label="NSF / Overdrafts"
          value={
            <span className={(analysis.nsf_count || 0) + (analysis.overdraft_count || 0) > 0 ? 'text-red-400' : 'text-green-400'}>
              {analysis.nsf_count || 0} / {analysis.overdraft_count || 0}
            </span>
          }
        />
      </div>

      {/* Largest Transactions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {analysis.largest_deposit !== null && (
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Largest Deposit</p>
            <p className="text-lg font-bold text-green-400">{formatCurrency(analysis.largest_deposit)}</p>
            {analysis.largest_deposit_description && (
              <p className="text-xs text-muted-foreground mt-1">{analysis.largest_deposit_description}</p>
            )}
          </div>
        )}
        {analysis.largest_withdrawal !== null && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Largest Withdrawal</p>
            <p className="text-lg font-bold text-red-400">{formatCurrency(analysis.largest_withdrawal)}</p>
            {analysis.largest_withdrawal_description && (
              <p className="text-xs text-muted-foreground mt-1">{analysis.largest_withdrawal_description}</p>
            )}
          </div>
        )}
      </div>

      {/* Red Flags */}
      {analysis.lender_red_flags && (analysis.lender_red_flags as RedFlag[]).length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-foreground flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-red-400" />
            Lender Red Flags
          </h5>
          {(analysis.lender_red_flags as RedFlag[]).map((flag, idx) => (
            <div key={idx} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground">{flag.flag}</p>
                <Badge className={
                  flag.severity === 'high' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                  flag.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  'bg-blue-500/20 text-blue-400 border-blue-500/30'
                }>
                  {flag.severity}
                </Badge>
              </div>
              {flag.recommendation && (
                <p className="text-xs text-muted-foreground mt-1">💡 {flag.recommendation}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Green Flags */}
      {fa?.lender_green_flags && fa.lender_green_flags.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-foreground flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Strengths
          </h5>
          <div className="flex flex-wrap gap-2">
            {fa.lender_green_flags.map((flag: GreenFlag, idx: number) => (
              <Badge key={idx} className="bg-green-500/10 text-green-400 border-green-500/20">
                {flag.flag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Key Ratios */}
      {fa?.key_metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {fa.key_metrics.debt_service_coverage_ratio !== null && (
            <MetricCard label="DSCR" value={fa.key_metrics.debt_service_coverage_ratio?.toFixed(2) || '—'} />
          )}
          {fa.key_metrics.profit_margin !== null && (
            <MetricCard label="Profit Margin" value={fa.key_metrics.profit_margin ? `${fa.key_metrics.profit_margin.toFixed(1)}%` : '—'} />
          )}
          {fa.key_metrics.monthly_burn_rate !== null && (
            <MetricCard label="Monthly Burn" value={formatCurrency(fa.key_metrics.monthly_burn_rate)} />
          )}
          {fa.key_metrics.runway_months !== null && (
            <MetricCard label="Runway" value={fa.key_metrics.runway_months ? `${fa.key_metrics.runway_months} mo` : '—'} />
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm font-bold text-foreground">{value}</div>
    </div>
  );
}
