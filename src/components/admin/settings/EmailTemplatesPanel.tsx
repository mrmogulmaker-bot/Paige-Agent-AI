import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Copy, FileText } from "lucide-react";
import { toast } from "sonner";

type Template = {
  template_key: string;
  subject: string;
  body_markdown: string;
  body_html: string | null;
  category: string | null;
  active: boolean;
  tenant_id: string | null;
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

export function EmailTemplatesPanel() {
  const [items, setItems] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("email_templates")
      .select("template_key, subject, body_markdown, body_html, category, active, tenant_id")
      .order("category", { ascending: true })
      .order("template_key", { ascending: true });
    if (error) return toast.error(error.message);
    setItems((data || []) as Template[]);
  };

  useEffect(() => { load(); }, []);

  const newTemplate = () => {
    setEditing({
      template_key: "",
      subject: "",
      body_markdown: "",
      body_html: null,
      category: "general",
      active: true,
      tenant_id: null,
    });
    setOpen(true);
  };

  const editTemplate = (t: Template) => { setEditing({ ...t }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    const key = editing.template_key || slugify(editing.subject);
    if (!key || !editing.subject || !editing.body_markdown) {
      return toast.error("Name (or subject) and body are required");
    }
    const payload: any = { ...editing, template_key: key, product_scope: (editing as any).product_scope ?? "general" };
    const { error } = await supabase.from("email_templates").upsert([payload], { onConflict: "template_key" });
    if (error) return toast.error(error.message);
    toast.success("Template saved");
    setOpen(false);
    setEditing(null);
    load();
  };

  const remove = async (t: Template) => {
    if (!confirm(`Delete template "${t.template_key}"?`)) return;
    const { error } = await supabase.from("email_templates").delete().eq("template_key", t.template_key);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const duplicate = (t: Template) => {
    setEditing({ ...t, template_key: `${t.template_key}_copy` });
    setOpen(true);
  };

  const filtered = items.filter(t =>
    !search ||
    t.template_key.toLowerCase().includes(search.toLowerCase()) ||
    (t.subject || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" /> Email Templates
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
        <Button size="sm" onClick={newTemplate}><Plus className="h-4 w-4 mr-1" /> New Template</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)} />
        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No templates yet. Click "New Template" to create your first reusable email.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.template_key} className="flex items-start justify-between gap-2 border border-border rounded p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.template_key}</span>
                    {t.category && <Badge variant="outline" className="text-[10px]">{t.category}</Badge>}
                    {!t.active && <Badge variant="secondary" className="text-[10px]">disabled</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground truncate mt-0.5">{t.subject}</div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => editTemplate(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => duplicate(t)}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing?.template_key ? "Edit Template" : "New Template"}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Template key</label>
                    <Input
                      placeholder="welcome_email"
                      value={editing.template_key}
                      onChange={e => setEditing({ ...editing, template_key: slugify(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Category</label>
                    <Input
                      placeholder="onboarding"
                      value={editing.category || ""}
                      onChange={e => setEditing({ ...editing, category: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Subject</label>
                  <Input
                    placeholder="Welcome, {{first_name}}!"
                    value={editing.subject}
                    onChange={e => setEditing({ ...editing, subject: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">
                    Body — supports merge fields: {"{{first_name}} {{last_name}} {{full_name}} {{entity_name}} {{coach_name}}"}
                  </label>
                  <Textarea
                    rows={10}
                    value={editing.body_markdown}
                    onChange={e => setEditing({ ...editing, body_markdown: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                  <span className="text-sm">Active (visible in template picker)</span>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save}>Save template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
