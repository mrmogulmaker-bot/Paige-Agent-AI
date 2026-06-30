import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pin, PinOff, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Note = {
  id: string;
  body: string;
  pinned: boolean;
  tags: string[];
  author_user_id: string;
  created_at: string;
  updated_at: string;
};

export function ContactNotesPanel({ contactId, tenantId }: { contactId: string; tenantId?: string | null }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("client_notes")
      .select("*")
      .eq("contact_id", contactId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    setNotes((data as Note[]) || []);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    load();
    const ch = supabase
      .channel(`client_notes:${contactId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_notes", filter: `contact_id=eq.${contactId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contactId]);

  const add = async () => {
    if (!draft.trim() || !userId) return;
    setBusy(true);
    const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);
    const { error } = await supabase.from("client_notes").insert({
      contact_id: contactId,
      tenant_id: tenantId ?? null,
      author_user_id: userId,
      body: draft.trim(),
      tags,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setDraft(""); setTagsInput("");
    toast.success("Note saved");
  };

  const togglePin = async (n: Note) => {
    const { error } = await supabase.from("client_notes").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) toast.error(error.message);
  };

  const remove = async (n: Note) => {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("client_notes").delete().eq("id", n.id);
    if (error) toast.error(error.message);
  };

  const filtered = notes.filter(n =>
    !search.trim() || n.body.toLowerCase().includes(search.toLowerCase()) ||
    n.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Card><CardContent className="p-4 space-y-4">
      <div className="space-y-2">
        <Textarea
          placeholder="Write a note about this contact… (visible to staff only)"
          value={draft} onChange={e => setDraft(e.target.value)} rows={3}
        />
        <div className="flex gap-2">
          <Input
            placeholder="Tags (comma separated)"
            value={tagsInput} onChange={e => setTagsInput(e.target.value)}
            className="h-9"
          />
          <Button onClick={add} disabled={!draft.trim() || busy}>Add note</Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t pt-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search notes & tags…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="h-8 max-w-xs"
        />
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {notes.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          {notes.length === 0 ? "No notes yet — write the first one above." : "No notes match your search."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <div key={n.id} className={`border rounded p-3 text-sm ${n.pinned ? "border-accent bg-accent/5" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => togglePin(n)}>
                    {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => remove(n)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="whitespace-pre-wrap">{n.body}</div>
              {n.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {n.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </CardContent></Card>
  );
}
