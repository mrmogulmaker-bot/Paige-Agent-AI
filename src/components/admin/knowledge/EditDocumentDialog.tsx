import { useEffect, useState } from "react";
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: any | null;
  docTypes: readonly string[];
  onSaved: () => void;
}

export function EditDocumentDialog({ open, onOpenChange, doc, docTypes, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("pme_framework");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [quality, setQuality] = useState([0.5]);
  const [reembed, setReembed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!doc) return;
    setTitle(doc.title || "");
    setDocType(doc.document_type || "pme_framework");
    setSummary(doc.summary || "");
    setContent(doc.content || "");
    setQuality([Number(doc.quality_score) || 0.5]);
    setReembed(false);
  }, [doc]);

  if (!doc) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const update: any = {
        title: title.trim().slice(0, 500),
        document_type: docType,
        summary: summary.trim() || null,
        content: content.trim(),
        quality_score: quality[0],
      };

      if (reembed && content.trim()) {
        const { data: embedData, error: embedErr } = await supabase.functions.invoke("embed-text", {
          body: { text: content.slice(0, 8000) },
        });
        if (embedErr) throw embedErr;
        const embedding = embedData?.embeddings?.[0];
        if (Array.isArray(embedding)) update.embedding = embedding;
      }

      const { error } = await supabase.from("rag_documents" as any).update(update).eq("id", doc.id);
      if (error) throw error;
      toast.success("Document updated");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
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
              <Label>Quality: {quality[0].toFixed(2)}</Label>
              <Slider min={0} max={1} step={0.05} value={quality} onValueChange={setQuality} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={reembed}
              onChange={(e) => setReembed(e.target.checked)}
              className="rounded border-border"
            />
            Re-generate embedding (required if content meaningfully changed)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
