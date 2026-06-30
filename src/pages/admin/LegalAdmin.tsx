// src/pages/admin/LegalAdmin.tsx
// Admin surface for managing legal documents and publishing new versions.
// Publishing a new version flips is_current on the old row and forces
// re-consent for every user via the get_outstanding_consents() RPC.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Plus, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { LegalDocViewer } from "@/components/legal/LegalDocViewer";
import type { LegalDoc } from "@/lib/legal/useLegalDocuments";

const LegalAdmin = () => {
  const [docs, setDocs] = useState<LegalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LegalDoc | null>(null);
  const [preview, setPreview] = useState<LegalDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("legal_documents")
      .select("*")
      .order("slug")
      .order("version", { ascending: false });
    setDocs((data as LegalDoc[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const grouped = docs.reduce<Record<string, LegalDoc[]>>((acc, d) => {
    (acc[d.slug] ??= []).push(d);
    return acc;
  }, {});

  const publishNewVersion = async () => {
    if (!editing) return;
    setSaving(true);
    // Flip current off for this slug.
    const { error: e1 } = await supabase
      .from("legal_documents")
      .update({ is_current: false })
      .eq("slug", editing.slug)
      .eq("is_current", true);
    if (e1) {
      setSaving(false);
      toast({ title: "Failed to update current", description: e1.message, variant: "destructive" });
      return;
    }
    // Insert new version row.
    const nextVersion =
      Math.max(...(grouped[editing.slug] ?? []).map((d) => d.version), 0) + 1;
    const { error: e2 } = await supabase.from("legal_documents").insert({
      slug: editing.slug,
      version: nextVersion,
      title: editing.title,
      summary: editing.summary,
      body_md: editing.body_md,
      audience: editing.audience,
      required_at_signup: editing.required_at_signup,
      is_current: true,
      effective_date: new Date().toISOString(),
    });
    setSaving(false);
    if (e2) {
      toast({ title: "Failed to publish", description: e2.message, variant: "destructive" });
      return;
    }
    toast({
      title: `${editing.title} v${nextVersion} published`,
      description:
        editing.required_at_signup
          ? "All users will be prompted to re-accept on their next visit."
          : "New version is now current.",
    });
    setEditing(null);
    await load();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Legal Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage Terms, Privacy, E-Sign, AI Disclaimer, and tenant agreements. Publishing a new
          version forces re-consent across the platform.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      )}

      <div className="grid gap-4">
        {Object.entries(grouped).map(([slug, versions]) => {
          const current = versions.find((v) => v.is_current) ?? versions[0];
          return (
            <Card key={slug}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="w-4 h-4 text-accent" />
                    {current.title}
                    <Badge variant="outline" className="text-[10px]">
                      /legal/{slug}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Current v{current.version} · effective{" "}
                    {new Date(current.effective_date).toLocaleDateString()} ·{" "}
                    {current.audience} ·{" "}
                    {current.required_at_signup ? "required at signup" : "contextual"}
                  </p>
                  {current.summary && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {current.summary}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/legal/${slug}`} target="_blank" className="gap-1">
                      <ExternalLink className="w-3 h-3" /> View
                    </Link>
                  </Button>
                  <Button size="sm" onClick={() => setEditing({ ...current })} className="gap-1">
                    <Plus className="w-3 h-3" /> New version
                  </Button>
                </div>
              </CardHeader>
              {versions.length > 1 && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground mb-2">History</p>
                  <div className="flex flex-wrap gap-2">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setPreview(v)}
                        className="text-xs px-2 py-1 rounded border border-border/60 hover:border-accent/60 transition-colors"
                      >
                        v{v.version}
                        {v.is_current && (
                          <Badge variant="secondary" className="ml-1.5 text-[9px]">
                            current
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* New version dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Publish new version of {editing?.title}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Title</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Summary</Label>
                <Textarea
                  rows={2}
                  value={editing.summary ?? ""}
                  onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Body (Markdown)</Label>
                <Textarea
                  rows={20}
                  value={editing.body_md}
                  onChange={(e) => setEditing({ ...editing, body_md: e.target.value })}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded border border-border/60">
                <div>
                  <Label className="text-sm">Required at signup</Label>
                  <p className="text-xs text-muted-foreground">
                    When on, every existing user will see the re-consent modal.
                  </p>
                </div>
                <Switch
                  checked={editing.required_at_signup}
                  onCheckedChange={(v) => setEditing({ ...editing, required_at_signup: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={publishNewVersion} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Publish v
              {editing
                ? Math.max(...(grouped[editing.slug] ?? []).map((d) => d.version), 0) + 1
                : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historical preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {preview?.title} — v{preview?.version}
            </DialogTitle>
          </DialogHeader>
          {preview && <LegalDocViewer doc={preview} compact />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LegalAdmin;
