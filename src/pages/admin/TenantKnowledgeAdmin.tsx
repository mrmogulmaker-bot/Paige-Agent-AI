// Tenant-private Knowledge Base admin.
// Each tenant manages their own corpus here. Docs are RLS-scoped to their
// tenant. Opt-in `share_to_network` flag routes the doc into the platform-
// owner review queue (Network Insights) for potential promotion to global canon.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Brain, Plus, Trash2, Share2, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface TenantDoc {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string[] | null;
  source: string;
  share_to_network: boolean;
  network_review_status: "none" | "pending" | "approved" | "rejected";
  chunk_count: number;
  created_at: string;
}

const REVIEW_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  none:     { label: "Private",          cls: "bg-muted text-muted-foreground", icon: Brain },
  pending:  { label: "Pending review",   cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: Clock },
  approved: { label: "In global canon",  cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
  rejected: { label: "Not promoted",     cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300", icon: XCircle },
};

export default function TenantKnowledgeAdmin() {
  const { activeTenant, activeTenantId } = useTenantContext();
  const [docs, setDocs] = useState<TenantDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_knowledge_docs" as any)
      .select("id, title, summary, category, tags, source, share_to_network, network_review_status, chunk_count, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setDocs((data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load, activeTenantId]);

  const toggleShare = async (doc: TenantDoc, next: boolean) => {
    const { error } = await supabase
      .from("tenant_knowledge_docs" as any)
      .update({
        share_to_network: next,
        network_review_status: next ? "pending" : "none",
      })
      .eq("id", doc.id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Submitted for network review" : "Removed from network queue");
    load();
  };

  const remove = async (doc: TenantDoc) => {
    if (!confirm(`Delete "${doc.title}"? This removes all chunks.`)) return;
    const { error } = await supabase.from("tenant_knowledge_docs" as any).delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Brain className="w-6 h-6" /> Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTenant
              ? `Private docs Paige uses to answer questions inside ${activeTenant.name}. Toggle "Share to Network" to contribute back to the Mogul canon.`
              : "Your private knowledge corpus."}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1.5" /> Add Document</Button>
          </DialogTrigger>
          <AddDocDialog onClose={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents ({docs.length})</CardTitle>
          <CardDescription>
            Embedded chunks: {docs.reduce((s, d) => s + (d.chunk_count ?? 0), 0)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : docs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>No documents yet. Add SOPs, scripts, lender notes, or playbooks Paige should know about.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Chunks</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => {
                  const b = REVIEW_BADGE[d.network_review_status] ?? REVIEW_BADGE.none;
                  const Icon = b.icon;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">{d.title}</div>
                        {d.summary && (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{d.summary}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {d.category ? <Badge variant="outline">{d.category}</Badge> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{d.chunk_count}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${b.cls}`}>
                          <Icon className="w-3 h-3" /> {b.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="flex items-center gap-2 justify-end">
                        <div className="flex items-center gap-1.5" title="Share to Network">
                          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <Switch
                            checked={d.share_to_network}
                            onCheckedChange={(v) => toggleShare(d, v)}
                            disabled={d.network_review_status === "approved"}
                          />
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => remove(d)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AddDocDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !content.trim()) return toast.error("Title and content required");
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("kb-ingest-doc", {
        body: {
          title: title.trim(),
          content,
          summary: summary.trim() || undefined,
          category: category.trim() || undefined,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          source: "paste",
          share_to_network: share,
        },
      });
      if (error) throw error;
      toast.success(`Indexed (${data?.chunk_count ?? 0} chunks)`);
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Add Knowledge Document</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chase Ink underwriting cheat sheet" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="lender_intel" />
          </div>
          <div>
            <Label>Tags (comma separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="chase, ink, underwriting" />
          </div>
        </div>
        <div>
          <Label>Summary (optional)</Label>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One-line summary used in search results" />
        </div>
        <div>
          <Label>Content *</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="Paste the doc body. Will be chunked + embedded automatically."
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/40">
          <div>
            <div className="font-medium text-sm">Contribute to Network</div>
            <p className="text-xs text-muted-foreground">
              Submit this doc for Mogul review. If approved it joins the global canon every tenant inherits.
            </p>
          </div>
          <Switch checked={share} onCheckedChange={setShare} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Indexing…" : "Add & Embed"}</Button>
        </div>
      </div>
    </DialogContent>
  );
}
