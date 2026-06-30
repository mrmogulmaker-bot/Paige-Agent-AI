import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { LIFECYCLE_STAGES, CONTACT_SOURCES, updateContact, type ContactPatch } from "@/lib/contacts";
import { TagPicker } from "./TagPicker";

type Coach = { user_id: string; name: string };

type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  title: string | null;
  funding_goal: number | null;
  lifecycle_stage: string | null;
  source: string | null;
  tags: string[] | null;
  do_not_contact: boolean | null;
  current_notes?: string | null;
  assigned_coach_user_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
  coaches: Coach[];
  knownTags?: string[];
  onSaved: (updated: Contact) => void;
};

export function EditContactDialog({
  open, onOpenChange, contact, coaches, knownTags, onSaved,
}: Props) {
  const [form, setForm] = useState<Contact | null>(contact);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(contact); }, [contact]);

  if (!form) return null;
  const set = <K extends keyof Contact>(k: K, v: Contact[K]) =>
    setForm((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!form.first_name?.trim()) { toast.error("First name is required"); return; }
    setSaving(true);
    try {
      const patch: ContactPatch = {
        first_name: form.first_name.trim(),
        last_name: form.last_name?.trim() || "",
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        entity_name: form.entity_name?.trim() || null,
        title: form.title?.trim() || null,
        funding_goal: form.funding_goal ?? null,
        lifecycle_stage: form.lifecycle_stage || "new_lead",
        source: form.source || null,
        tags: form.tags || [],
        do_not_contact: !!form.do_not_contact,
        current_notes: form.current_notes?.trim() || null,
        assigned_coach_user_id: form.assigned_coach_user_id,
      };
      const updated = await updateContact(form.id, patch);
      toast.success("Contact saved");
      onSaved({ ...form, ...(updated as any) });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First name</Label>
              <Input value={form.first_name || ""} onChange={(e) => set("first_name", e.target.value)} />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={form.last_name || ""} onChange={(e) => set("last_name", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Business / Entity</Label>
              <Input value={form.entity_name || ""} onChange={(e) => set("entity_name", e.target.value)} />
            </div>
            <div>
              <Label>Title</Label>
              <Input value={form.title || ""} onChange={(e) => set("title", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Funding goal ($)</Label>
              <Input
                type="number"
                value={form.funding_goal ?? ""}
                onChange={(e) => set("funding_goal", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <Label>Lifecycle stage</Label>
              <Select value={form.lifecycle_stage || "new_lead"} onValueChange={(v) => set("lifecycle_stage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFECYCLE_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.source || "manual"} onValueChange={(v) => set("source", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_SOURCES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Assigned coach</Label>
            <Select
              value={form.assigned_coach_user_id || "unassigned"}
              onValueChange={(v) => set("assigned_coach_user_id", v === "unassigned" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {coaches.map((c) => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tags</Label>
            <TagPicker
              value={form.tags || []}
              onChange={(t) => set("tags", t)}
              knownTags={knownTags}
            />
          </div>

          <div>
            <Label>Internal notes</Label>
            <Textarea
              rows={3}
              value={form.current_notes || ""}
              onChange={(e) => set("current_notes", e.target.value)}
              placeholder="Visible to coaches and admins, not to the client."
            />
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <div className="font-medium text-sm">Do Not Contact</div>
              <div className="text-xs text-muted-foreground">Suppresses all outbound email + SMS.</div>
            </div>
            <Switch
              checked={!!form.do_not_contact}
              onCheckedChange={(v) => set("do_not_contact", v)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
