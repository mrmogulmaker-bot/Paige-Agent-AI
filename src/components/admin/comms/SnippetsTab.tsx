// Comms C-1.5 — Snippets (saved replies) management. Extends CommunicationsAdmin
// (§18). Two scope sections: "Shared with the team" (user_id NULL, admin-authored)
// and "My snippets" (user_id = auth uid). tenant_id server-derived (§9). Trigger
// (the typed shortcut) is validated client-side and 23505 → crafted inline error.
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareText, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";
import { SectionCard, DataTableShell, EmptyState } from "@/components/ui/page";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { MergeVarEditor } from "./MergeVarEditor";
import { resolveMergeVars, isUniqueViolation } from "./mergeVars";

interface SnippetRow {
  id: string;
  user_id: string | null;
  trigger: string;
  name: string;
  body: string;
  variables: Record<string, string>;
}

type Draft = {
  id: string | null;
  scope: "personal" | "shared";
  trigger: string;
  name: string;
  body: string;
  variables: Record<string, string>;
};

const emptyDraft = (scope: Draft["scope"]): Draft => ({
  id: null, scope, trigger: "", name: "", body: "", variables: {},
});

const TRIGGER_RE = /^[;/][a-z0-9_-]{1,30}$/;
const COLS = [
  { key: "trigger", header: "Shortcut" },
  { key: "name", header: "Name" },
  { key: "preview", header: "Preview" },
  { key: "actions", header: "", className: "w-24 text-right" },
];

export function SnippetsTab() {
  const { userId, isAdmin } = useUserRoles();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SnippetRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("snippets")
      .select("id, user_id, trigger, name, body, variables")
      .order("trigger");
    setRows((data as SnippetRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sharedRows = useMemo(() => rows.filter((r) => r.user_id === null), [rows]);
  const myRows = useMemo(() => rows.filter((r) => r.user_id && r.user_id === userId), [rows]);

  const save = async () => {
    if (!draft) return;
    setError(null);
    const trigger = draft.trigger.trim().toLowerCase();
    if (!TRIGGER_RE.test(trigger)) {
      setError("Start the shortcut with ; or / — letters, numbers, - and _ only (e.g. ;intro).");
      return;
    }
    if (!draft.name.trim() || !draft.body.trim()) {
      setError("Give it a name and the reply text before saving.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        trigger, name: draft.name.trim(), body: draft.body, variables: draft.variables,
      };
      if (draft.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e } = await (supabase as any).from("snippets").update(payload).eq("id", draft.id);
        if (e) throw e;
      } else {
        const scopeUserId = draft.scope === "shared" ? null : userId; // shared: admin-only (RLS)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e } = await (supabase as any)
          .from("snippets")
          .insert({ user_id: scopeUserId, ...payload }); // tenant_id set by trigger — never passed
        if (e) throw e;
      }
      toast({ title: draft.id ? "Saved reply updated" : "Saved reply added" });
      setDraft(null);
      await load();
    } catch (e) {
      if (isUniqueViolation(e)) {
        setError(`You already have a shortcut named ${draft.trigger.trim().toLowerCase()} — pick another.`);
      } else {
        setError("Couldn't save that just now. Try again in a moment.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).from("snippets").delete().eq("id", id);
    if (e) { toast({ title: "Couldn't remove that", variant: "destructive" }); return; }
    toast({ title: "Saved reply removed" });
    await load();
  };

  const openEdit = (r: SnippetRow) => setDraft({
    id: r.id, scope: r.user_id === null ? "shared" : "personal",
    trigger: r.trigger, name: r.name, body: r.body, variables: r.variables ?? {},
  });

  const ScopeTable = ({ scopeRows, emptyCopy }: { scopeRows: SnippetRow[]; emptyCopy: string }) => (
    <DataTableShell
      columns={COLS}
      loading={loading}
      isEmpty={scopeRows.length === 0}
      empty={<EmptyState icon={MessageSquareText} title="No saved replies yet" description={emptyCopy} />}
    >
      {scopeRows.map((r) => (
        <TableRow key={r.id}>
          <TableCell><kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{r.trigger}</kbd></TableCell>
          <TableCell className="font-medium">{r.name}</TableCell>
          <TableCell className="max-w-[22rem] truncate text-muted-foreground">
            {resolveMergeVars(r.body, r.variables)}
          </TableCell>
          <TableCell className="text-right">
            <Button size="icon" variant="ghost" aria-label="Edit saved reply" onClick={() => openEdit(r)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Remove saved reply" onClick={() => void remove(r.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </DataTableShell>
  );

  return (
    <div className="space-y-6">
      {isAdmin && (
        <SectionCard
          title="Shared with the team"
          description="Saved replies everyone on the practice can drop into a message."
          actions={
            <Button variant="gold" size="sm" onClick={() => setDraft(emptyDraft("shared"))}>
              <Plus className="mr-1.5 h-4 w-4" /> New saved reply
            </Button>
          }
        >
          <ScopeTable
            scopeRows={sharedRows}
            emptyCopy="Save a reply your team types over and over — it's one keystroke from now on."
          />
        </SectionCard>
      )}

      <SectionCard
        title="My snippets"
        description="Saved replies you type once and reuse — just you."
        actions={
          <Button variant="gold" size="sm" onClick={() => setDraft(emptyDraft("personal"))}>
            <Plus className="mr-1.5 h-4 w-4" /> New saved reply
          </Button>
        }
      >
        <ScopeTable
          scopeRows={myRows}
          emptyCopy="Save your first and it's one keystroke from now on."
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) { setDraft(null); setError(null); } }}>
        <DialogContent className="max-w-xl">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit saved reply" : "New saved reply"}</DialogTitle>
                <DialogDescription>
                  Type the shortcut in any reply and Paige expands it into the full text.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sn-trigger">Shortcut</Label>
                    <Input
                      id="sn-trigger" value={draft.trigger}
                      placeholder=";intro" className="font-mono"
                      onChange={(e) => setDraft({ ...draft, trigger: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">Type it in a reply to expand.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sn-name">Name</Label>
                    <Input
                      id="sn-name" value={draft.name}
                      placeholder="e.g. Intro reply"
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sn-body">Reply text</Label>
                  <Textarea
                    id="sn-body" value={draft.body} rows={5}
                    placeholder={"Hi {{first_name}}, thanks for reaching out —"}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  />
                </div>

                <MergeVarEditor
                  source={draft.body}
                  values={draft.variables}
                  onChange={(variables) => setDraft({ ...draft, variables })}
                />

                {error && (
                  <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => { setDraft(null); setError(null); }}>Cancel</Button>
                <Button variant="gold" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : draft.id ? "Save changes" : "Save reply"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
