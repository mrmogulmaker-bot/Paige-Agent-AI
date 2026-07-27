// Comms C-1.5 — Signatures management. Extends CommunicationsAdmin (§18, no fork).
// Two scope sections: "Practice default" (user_id NULL, admin-only) and "My
// sign-off" (user_id = auth uid). tenant_id is server-derived by a BEFORE INSERT
// trigger (§9) — the client NEVER passes it. Live rendered HTML preview so a
// non-technical coach sees the sign-off, not markup (§36).
import { useCallback, useEffect, useMemo, useState } from "react";
import { PenLine, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useToast } from "@/hooks/use-toast";
import { SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { MergeVarEditor } from "./MergeVarEditor";
import { renderSignaturePreview, isUniqueViolation } from "./mergeVars";

interface SignatureRow {
  id: string;
  user_id: string | null;
  name: string;
  html: string;
  variables: Record<string, string>;
  is_default: boolean;
  updated_at: string;
}

type Draft = {
  id: string | null;
  scope: "personal" | "practice";
  name: string;
  html: string;
  variables: Record<string, string>;
  is_default: boolean;
};

const emptyDraft = (scope: Draft["scope"]): Draft => ({
  id: null, scope, name: "", html: "", variables: {}, is_default: false,
});

export function SignaturesTab() {
  const { userId, isAdmin } = useUserRoles();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("signatures")
      .select("id, user_id, name, html, variables, is_default, updated_at")
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    setRows((data as SignatureRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const practiceRows = useMemo(() => rows.filter((r) => r.user_id === null), [rows]);
  const myRows = useMemo(() => rows.filter((r) => r.user_id && r.user_id === userId), [rows]);

  const save = async () => {
    if (!draft) return;
    setError(null);
    if (!draft.name.trim() || !draft.html.trim()) {
      setError("Give it a name and a sign-off before saving.");
      return;
    }
    setSaving(true);
    try {
      const scopeUserId = draft.scope === "practice" ? null : userId;
      // At most one default per scope (partial-unique index): clear the old one first.
      if (draft.is_default) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any).from("signatures").update({ is_default: false }).eq("is_default", true);
        q = scopeUserId === null ? q.is("user_id", null) : q.eq("user_id", scopeUserId);
        if (draft.id) q = q.neq("id", draft.id);
        await q;
      }
      const payload = {
        name: draft.name.trim(), html: draft.html, variables: draft.variables,
        is_default: draft.is_default,
      };
      if (draft.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e } = await (supabase as any).from("signatures").update(payload).eq("id", draft.id);
        if (e) throw e;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e } = await (supabase as any)
          .from("signatures")
          .insert({ user_id: scopeUserId, ...payload }); // tenant_id set by trigger — never passed
        if (e) throw e;
      }
      toast({ title: draft.id ? "Sign-off updated" : "Sign-off saved" });
      setDraft(null);
      await load();
    } catch (e) {
      if (isUniqueViolation(e)) {
        setError("There's already a default sign-off in this section — turn that one off first.");
      } else {
        setError("Couldn't save that just now. Try again in a moment.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any).from("signatures").delete().eq("id", id);
    if (e) { toast({ title: "Couldn't remove that", variant: "destructive" }); return; }
    toast({ title: "Sign-off removed" });
    await load();
  };

  const Row = ({ r }: { r: SignatureRow }) => (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{r.name}</span>
          {r.is_default && <StatePill state="on">Default</StatePill>}
        </div>
        <div
          className="prose-sm max-w-prose truncate text-xs text-muted-foreground [&_*]:!m-0 [&_*]:!text-xs"
          dangerouslySetInnerHTML={{ __html: renderSignaturePreview(r.html, r.variables) }}
        />
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="icon" variant="ghost" aria-label="Edit sign-off"
          onClick={() => setDraft({
            id: r.id, scope: r.user_id === null ? "practice" : "personal",
            name: r.name, html: r.html, variables: r.variables ?? {}, is_default: r.is_default,
          })}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Remove sign-off" onClick={() => void remove(r.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const ListBody = ({ scopeRows, emptyCopy }: { scopeRows: SignatureRow[]; emptyCopy: string }) => {
    if (loading) return <div className="space-y-3 py-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
    if (scopeRows.length === 0) {
      return <EmptyState icon={PenLine} title="No sign-off yet" description={emptyCopy} />;
    }
    return <div className="divide-y divide-border">{scopeRows.map((r) => <Row key={r.id} r={r} />)}</div>;
  };

  return (
    <div className="space-y-6">
      {isAdmin && (
        <SectionCard
          title="Practice default"
          description="The sign-off that goes out under your practice's name when no personal one is set."
          actions={
            <Button variant="gold" size="sm" onClick={() => setDraft(emptyDraft("practice"))}>
              <Plus className="mr-1.5 h-4 w-4" /> New sign-off
            </Button>
          }
        >
          <ListBody
            scopeRows={practiceRows}
            emptyCopy="Add one and Paige signs every reply for you when a staff member hasn't set their own."
          />
        </SectionCard>
      )}

      <SectionCard
        title="My sign-off"
        description="Your personal sign-off — it goes out on the replies you send."
        actions={
          <Button variant="gold" size="sm" onClick={() => setDraft(emptyDraft("personal"))}>
            <Plus className="mr-1.5 h-4 w-4" /> New sign-off
          </Button>
        }
      >
        <ListBody
          scopeRows={myRows}
          emptyCopy="Add one and Paige signs every reply for you."
        />
      </SectionCard>

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) { setDraft(null); setError(null); } }}>
        <DialogContent className="max-w-2xl">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>{draft.id ? "Edit sign-off" : "New sign-off"}</DialogTitle>
                <DialogDescription>
                  {draft.scope === "practice"
                    ? "Goes out under your practice's name."
                    : "Your personal sign-off on the replies you send."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sig-name">Name</Label>
                  <Input
                    id="sig-name" value={draft.name}
                    placeholder="e.g. Warm sign-off"
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="sig-html">Sign-off</Label>
                    <Textarea
                      id="sig-html" value={draft.html} rows={7}
                      className="font-mono text-xs"
                      placeholder={"Best,<br/>{{coach_name}}<br/>{{practice_name}}"}
                      onChange={(e) => setDraft({ ...draft, html: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preview</Label>
                    <div
                      className="min-h-[160px] rounded-md border border-border bg-muted/30 p-3 text-sm [&_*]:!my-0"
                      dangerouslySetInnerHTML={{ __html: renderSignaturePreview(draft.html || "<span class='text-muted-foreground'>Your sign-off shows here</span>", draft.variables) }}
                    />
                  </div>
                </div>

                <MergeVarEditor
                  source={draft.html}
                  values={draft.variables}
                  onChange={(variables) => setDraft({ ...draft, variables })}
                />

                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="sig-default" className="text-sm">Make this the default</Label>
                    <p className="text-xs text-muted-foreground">
                      Paige reaches for this one first{draft.scope === "practice" ? " across the practice." : "."}
                    </p>
                  </div>
                  <Switch
                    id="sig-default" checked={draft.is_default}
                    onCheckedChange={(v) => setDraft({ ...draft, is_default: v })}
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</div>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => { setDraft(null); setError(null); }}>Cancel</Button>
                <Button variant="gold" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : draft.id ? "Save changes" : "Save sign-off"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
