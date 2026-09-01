import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_SOURCES, LIFECYCLE_STAGES } from "@/lib/contacts";
import type { RelationshipPerson } from "./useTenantRelationshipsData";
import { upsertRelationshipContact, type ContactUpsertPatch } from "./contactUpsert";

type Coach = { user_id: string; name: string };

type FormState = {
  recordType: "person" | "business";
  firstName: string;
  lastName: string;
  entityName: string;
  title: string;
  email: string;
  phone: string;
  website: string;
  linkedinUrl: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  lifecycleStage: string;
  status: string;
  source: string;
  tags: string;
  primaryOffer: string;
  notes: string;
  assignedCoachUserId: string;
  doNotContact: boolean;
};

const EMPTY_FORM: FormState = {
  recordType: "person",
  firstName: "",
  lastName: "",
  entityName: "",
  title: "",
  email: "",
  phone: "",
  website: "",
  linkedinUrl: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  lifecycleStage: "new_lead",
  status: "active",
  source: "manual",
  tags: "",
  primaryOffer: "",
  notes: "",
  assignedCoachUserId: "unassigned",
  doNotContact: false,
};

const formFor = (contact: RelationshipPerson | null): FormState => contact ? {
  recordType: contact.recordType,
  firstName: contact.firstName,
  lastName: contact.lastName,
  entityName: contact.company ?? "",
  title: contact.title ?? "",
  email: contact.email ?? "",
  phone: contact.phone ?? "",
  website: contact.website ?? "",
  linkedinUrl: contact.linkedinUrl ?? "",
  streetAddress: contact.streetAddress ?? "",
  city: contact.city ?? "",
  state: contact.state ?? "",
  zipCode: contact.zipCode ?? "",
  lifecycleStage: contact.lifecycleStage,
  status: contact.status,
  source: contact.source ?? "manual",
  tags: contact.tags.join(", "),
  primaryOffer: contact.primaryOffer ?? "",
  notes: contact.notes ?? "",
  assignedCoachUserId: contact.assignedCoachUserId ?? "unassigned",
  doNotContact: contact.doNotContact,
} : { ...EMPTY_FORM };

const optional = (value: string) => value.trim() || null;

export function PeopleContactEditor({
  open,
  onOpenChange,
  tenantId,
  contact,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  contact: RelationshipPerson | null;
  onSaved: (contactId: string) => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>(() => formFor(contact));
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(contact);

  useEffect(() => {
    if (!open) return;
    setForm(formFor(contact));
    let current = true;
    void (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "coach");
      const ids = (roles ?? []).map(({ user_id }) => user_id);
      if (!ids.length) {
        if (current) setCoaches([]);
        return;
      }
      const { data } = await supabase.from("coach_client_profiles_safe").select("user_id, full_name").in("user_id", ids);
      if (current) setCoaches((data ?? []).map(({ user_id, full_name }) => ({ user_id, name: full_name || "Unnamed coach" })));
    })();
    return () => { current = false; };
  }, [contact, open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const save = async () => {
    const hasIdentity = Boolean(form.firstName.trim() || form.lastName.trim() || form.entityName.trim() || form.email.trim());
    if (!hasIdentity) {
      toast.error("Add at least a name, business, or email");
      return;
    }
    if (form.recordType === "business" && !form.entityName.trim()) {
      toast.error("Business name is required for a business record");
      return;
    }
    const patch: ContactUpsertPatch = {
      first_name: optional(form.firstName),
      last_name: optional(form.lastName),
      entity_name: optional(form.entityName),
      entity_type: form.recordType === "business" ? (contact?.entityType || "business") : null,
      title: optional(form.title),
      email: optional(form.email),
      phone: optional(form.phone),
      website: optional(form.website),
      linkedin_url: optional(form.linkedinUrl),
      street_address: optional(form.streetAddress),
      city: optional(form.city),
      state: optional(form.state),
      zip_code: optional(form.zipCode),
      lifecycle_stage: form.lifecycleStage,
      status: form.status,
      source: optional(form.source),
      tags: Array.from(new Set(form.tags.split(",").map((tag) => tag.trim()).filter(Boolean))),
      primary_offer: optional(form.primaryOffer),
      current_notes: optional(form.notes),
      assigned_coach_user_id: form.assignedCoachUserId === "unassigned" ? null : form.assignedCoachUserId,
      do_not_contact: form.doNotContact,
    };
    setSaving(true);
    try {
      const contactId = await upsertRelationshipContact({ tenantId, contactId: contact?.id, patch });
      await onSaved(contactId);
      toast.success(editing ? "Contact updated" : "Contact created");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Contact save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit contact" : "New contact"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Record type"><Select value={form.recordType} onValueChange={(value) => set("recordType", value as FormState["recordType"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="person">Person</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent></Select></Field>
            <Field label="First name"><Input value={form.firstName} onChange={(event) => set("firstName", event.target.value)} /></Field>
            <Field label="Last name"><Input value={form.lastName} onChange={(event) => set("lastName", event.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Business / company"><Input value={form.entityName} onChange={(event) => set("entityName", event.target.value)} /></Field>
            <Field label="Title / role"><Input value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
            <Field label="Website"><Input type="url" value={form.website} onChange={(event) => set("website", event.target.value)} /></Field>
            <Field label="LinkedIn"><Input type="url" value={form.linkedinUrl} onChange={(event) => set("linkedinUrl", event.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Street address" className="sm:col-span-2"><Input value={form.streetAddress} onChange={(event) => set("streetAddress", event.target.value)} /></Field>
            <Field label="City"><Input value={form.city} onChange={(event) => set("city", event.target.value)} /></Field>
            <Field label="State"><Input value={form.state} onChange={(event) => set("state", event.target.value)} /></Field>
            <Field label="ZIP / postal code"><Input value={form.zipCode} onChange={(event) => set("zipCode", event.target.value)} /></Field>
            <Field label="Lifecycle stage"><Select value={form.lifecycleStage} onValueChange={(value) => set("lifecycleStage", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LIFECYCLE_STAGES.map((stage) => <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Record status"><Select value={form.status} onValueChange={(value) => set("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["pending", "active", "inactive", "archived"].map((status) => <SelectItem key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Source"><Select value={form.source} onValueChange={(value) => set("source", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{!CONTACT_SOURCES.includes(form.source) && <SelectItem value={form.source}>{form.source}</SelectItem>}{CONTACT_SOURCES.map((source) => <SelectItem key={source} value={source}>{source.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Assigned coach"><Select value={form.assignedCoachUserId} onValueChange={(value) => set("assignedCoachUserId", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{coaches.map((coach) => <SelectItem key={coach.user_id} value={coach.user_id}>{coach.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Primary offer"><Input value={form.primaryOffer} onChange={(event) => set("primaryOffer", event.target.value)} /></Field>
            <Field label="Tags" className="sm:col-span-2"><Input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="Comma separated" /></Field>
            <Field label="Internal relationship notes" className="sm:col-span-2"><Textarea rows={4} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div><strong className="text-sm">Do not contact</strong><p className="text-xs text-muted-foreground">Suppresses outbound email and SMS for this record.</p></div>
            <Switch checked={form.doNotContact} onCheckedChange={(checked) => set("doNotContact", checked)} aria-label="Do not contact" />
          </div>
          <p className="text-xs text-muted-foreground">Tenant, linked account, financial, consent, activity, and system-provenance fields remain governed by their owning workflows.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <div className={className}><Label className="mb-1.5 block text-xs">{label}</Label>{children}</div>;
}
