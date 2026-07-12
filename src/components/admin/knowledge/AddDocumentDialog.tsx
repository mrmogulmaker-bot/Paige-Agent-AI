import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTenantFeature } from "@/hooks/useTenantFeature";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  docTypes: readonly string[];
  onSaved: () => void;
}

export function AddDocumentDialog({ open, onOpenChange, docTypes, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<string>("pme_framework");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [creditScoreRange, setCreditScoreRange] = useState("");
  const [loanType, setLoanType] = useState("");
  const [stateTag, setStateTag] = useState("");
  const [entityType, setEntityType] = useState("");
  const [quality, setQuality] = useState([0.9]);
  const [saving, setSaving] = useState(false);
  // Credit-score / loan-type retrieval tags are funding-vertical only (§2/§9):
  // generic coaching tenants never see these finance metadata fields.
  const { enabled: fundingEnabled } = useTenantFeature("funding_readiness");

  const reset = () => {
    setTitle(""); setContent(""); setSummary("");
    setCreditScoreRange(""); setLoanType(""); setStateTag(""); setEntityType("");
    setQuality([0.9]); setDocType("pme_framework");
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setSaving(true);
    try {
      // 1) Embed via embed-text edge function
      const { data: embedData, error: embedErr } = await supabase.functions.invoke("embed-text", {
        body: { text: content.slice(0, 8000) },
      });
      if (embedErr) throw embedErr;
      const embedding = embedData?.embeddings?.[0];
      if (!Array.isArray(embedding)) throw new Error("Embedding service returned no vector");

      // 2) Build metadata
      const metadata: Record<string, any> = { manual_entry: true };
      if (creditScoreRange) metadata.credit_score_range = creditScoreRange;
      if (loanType) metadata.loan_type = loanType;
      if (stateTag) metadata.state = stateTag.toUpperCase().slice(0, 2);
      if (entityType) metadata.entity_type = entityType;

      // 3) Insert
      const { error: insErr } = await supabase.from("rag_documents" as any).insert({
        document_type: docType,
        title: title.trim().slice(0, 500),
        content: content.trim(),
        summary: summary.trim() || null,
        embedding: embedding as any,
        metadata,
        source: "admin_entry",
        is_published: true,
        is_anonymized: true,
        quality_score: quality[0],
      } as any);
      if (insErr) throw insErr;

      toast.success("Document added to knowledge base");
      reset();
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Knowledge Base Document</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. SBA 7(a) — $250K — 720 FICO" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Document Type *</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {docTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quality Score: {quality[0].toFixed(2)}</Label>
              <Slider min={0} max={1} step={0.05} value={quality} onValueChange={setQuality} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Summary (1-3 sentences)</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Content *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="Full document content. This is what Paige semantically searches against." />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Metadata Tags (optional — improves retrieval relevance)
            </div>
            <div className="grid grid-cols-2 gap-3">
              {fundingEnabled && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Credit Score Range</Label>
                    <Input value={creditScoreRange} onChange={(e) => setCreditScoreRange(e.target.value)} placeholder="700-749" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Loan Type</Label>
                    <Input value={loanType} onChange={(e) => setLoanType(e.target.value)} placeholder="SBA 7(a)" />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">State</Label>
                <Input value={stateTag} onChange={(e) => setStateTag(e.target.value)} placeholder="GA" maxLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Entity Type</Label>
                <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="LLC" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
