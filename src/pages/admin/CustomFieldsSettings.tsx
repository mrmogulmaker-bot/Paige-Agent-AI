// Custom Fields settings (Task #19) — tenant-facing UI for defining custom contact
// fields (e.g. "T-shirt size", "Program cohort"). Pure presentation over the shared
// seam in src/lib/customFields.ts (listCustomFieldDefinitions / saveCustomFieldDefinition /
// archiveCustomFieldDefinition) — this file never touches Supabase directly, so the same
// validation the DB enforces for every caller (this UI, Paige, growth-process-submission)
// never drifts (§10).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell, PageHeader, SectionCard, EmptyState, DataTableShell, type Column } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  archiveCustomFieldDefinition,
  CUSTOM_FIELD_TYPES,
  listCustomFieldDefinitions,
  saveCustomFieldDefinition,
  type CustomFieldDefinition,
  type CustomFieldOption,
  type CustomFieldType,
} from "@/lib/customFields";

const TYPE_LABEL: Record<CustomFieldType, string> = Object.fromEntries(
  CUSTOM_FIELD_TYPES.map((t) => [t.value, t.label]),
) as Record<CustomFieldType, string>;

const HAS_OPTIONS = (t: CustomFieldType) => t === "select" || t === "multiselect";

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface FormState {
  id?: string;
  label: string;
  key: string;
  keyTouched: boolean;
  fieldType: CustomFieldType;
  required: boolean;
  helpText: string;
  options: CustomFieldOption[];
}

function emptyForm(): FormState {
  return {
    label: "",
    key: "",
    keyTouched: false,
    fieldType: "text",
    required: false,
    helpText: "",
    options: [],
  };
}

function formFromDefinition(def: CustomFieldDefinition): FormState {
  return {
    id: def.id,
    label: def.label,
    key: def.key,
    keyTouched: true,
    fieldType: def.fieldType,
    required: def.required,
    helpText: def.helpText ?? "",
    options: def.options ?? [],
  };
}

const COLUMNS: Column[] = [
  { key: "field", header: "Field" },
  { key: "type", header: "Type" },
  { key: "actions", header: "", className: "text-right" },
];

export default function CustomFieldsSettings() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTenantId) return;
    setLoading(true);
    try {
      const rows = await listCustomFieldDefinitions(activeTenantId);
      setDefinitions(rows);
    } catch (err) {
      console.error("[custom-fields] failed to load definitions:", err);
      toast.error("Couldn't load your custom fields. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId]);

  useEffect(() => {
    if (activeTenantId) void load();
  }, [activeTenantId, load]);

  const openAdd = () => {
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (def: CustomFieldDefinition) => {
    setForm(formFromDefinition(def));
    setDialogOpen(true);
  };

  const onLabelChange = (label: string) => {
    setForm((f) => ({
      ...f,
      label,
      key: f.keyTouched ? f.key : slugify(label),
    }));
  };

  const onKeyChange = (key: string) => {
    setForm((f) => ({ ...f, key, keyTouched: true }));
  };

  const addOption = () => {
    setForm((f) => ({ ...f, options: [...f.options, { label: "", value: "" }] }));
  };

  const updateOption = (idx: number, patch: Partial<CustomFieldOption>) => {
    setForm((f) => ({
      ...f,
      options: f.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    }));
  };

  const removeOption = (idx: number) => {
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));
  };

  const save = async () => {
    if (!activeTenantId) return;
    const label = form.label.trim();
    const key = form.key.trim();
    if (!label) {
      toast.error("Give this field a label first.");
      return;
    }
    if (!key) {
      toast.error("Give this field a key (lowercase letters, numbers, underscores).");
      return;
    }
    let options: CustomFieldOption[] | null = null;
    if (HAS_OPTIONS(form.fieldType)) {
      const cleaned = form.options
        .map((o) => ({ label: o.label.trim(), value: o.value.trim() }))
        .filter((o) => o.label && o.value);
      if (cleaned.length === 0) {
        toast.error("Add at least one option for a pick-one or pick-multiple field.");
        return;
      }
      options = cleaned;
    }

    setSaving(true);
    try {
      await saveCustomFieldDefinition({
        tenantId: activeTenantId,
        id: form.id,
        key,
        label,
        fieldType: form.fieldType,
        options,
        helpText: form.helpText.trim() || null,
        required: form.required,
        position: definitions.find((d) => d.id === form.id)?.position ?? definitions.length,
      });
      toast.success(form.id ? "Field updated." : "Field added.");
      setDialogOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save that field. Try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    setArchivingId(id);
    try {
      await archiveCustomFieldDefinition(id);
      toast.success("Field archived.");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't archive that field. Try again.";
      toast.error(message);
    } finally {
      setArchivingId(null);
    }
  };

  const isEditing = Boolean(form.id);
  const showOptionsEditor = HAS_OPTIONS(form.fieldType);
  const isBusy = tenantLoading || loading;

  const rows = useMemo(
    () =>
      definitions.map((def) => (
        <TableRow key={def.id}>
          <TableCell>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">{def.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{def.key}</span>
            </div>
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{TYPE_LABEL[def.fieldType]}</Badge>
              {def.required && <Badge variant="secondary">Required</Badge>}
            </div>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => openEdit(def)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={archivingId === def.id}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                    Archive
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive "{def.label}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This field disappears from contact forms and detail views. Values already saved
                      on contacts are kept, and you can recreate the field later if you need it back.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void archive(def.id)}>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </TableCell>
        </TableRow>
      )),
    [definitions, archivingId],
  );

  return (
    <PageShell width="default">
      <PageHeader
        variant="plain"
        icon={ListChecks}
        eyebrow="Contacts"
        title="Custom Fields"
        description="Define your own fields for contacts — cohort, T-shirt size, whatever your practice tracks — and Paige-built forms can capture them directly."
        backHref="/admin/settings"
        actions={
          <Button onClick={openAdd} disabled={!activeTenantId}>
            <Plus className="h-4 w-4 mr-1.5" aria-hidden />
            Add field
          </Button>
        }
      />

      <SectionCard
        title="Your fields"
        description="Shown in the order contacts and forms will display them."
      >
        {isBusy ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Loading your custom fields…
          </div>
        ) : definitions.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="No custom fields yet"
            description="Add the fields your practice actually tracks — cohort, T-shirt size, referral source — and they'll be ready for contact records and forms."
            action={
              <Button onClick={openAdd}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden />
                Add your first field
              </Button>
            }
          />
        ) : (
          <DataTableShell columns={COLUMNS}>{rows}</DataTableShell>
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit field" : "Add a custom field"}</DialogTitle>
            <DialogDescription>
              This field appears on contact records and any form that captures it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cf-label">Label</Label>
              <Input
                id="cf-label"
                value={form.label}
                onChange={(e) => onLabelChange(e.target.value)}
                placeholder="Program cohort"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-key">Key</Label>
              <Input
                id="cf-key"
                value={form.key}
                onChange={(e) => onKeyChange(e.target.value)}
                placeholder="program_cohort"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Lowercase letters, numbers, and underscores only. Auto-filled from the label — override
                it if you need a specific name.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-type">Type</Label>
              <Select
                value={form.fieldType}
                onValueChange={(v) => setForm((f) => ({ ...f, fieldType: v as CustomFieldType }))}
              >
                <SelectTrigger id="cf-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {showOptionsEditor && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Label className="text-xs">Options</Label>
                {form.options.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Add at least one option for people to choose from.
                  </p>
                )}
                <div className="space-y-2">
                  {form.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={opt.label}
                        onChange={(e) => updateOption(idx, { label: e.target.value })}
                        placeholder="Label (e.g. Small)"
                        className="flex-1"
                      />
                      <Input
                        value={opt.value}
                        onChange={(e) => updateOption(idx, { value: e.target.value })}
                        placeholder="Value (e.g. small)"
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeOption(idx)}
                        aria-label="Remove option"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden />
                  Add option
                </Button>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
              <div>
                <Label htmlFor="cf-required" className="text-sm font-medium">
                  Required
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Contacts and forms must have a value before saving.
                </p>
              </div>
              <Switch
                id="cf-required"
                checked={form.required}
                onCheckedChange={(v) => setForm((f) => ({ ...f, required: v }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-help">Help text (optional)</Label>
              <Input
                id="cf-help"
                value={form.helpText}
                onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
                placeholder="Shown under the field to guide whoever fills it in."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="default" onClick={() => void save()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin motion-reduce:animate-none" aria-hidden />
                  Saving…
                </>
              ) : isEditing ? (
                "Save changes"
              ) : (
                "Add field"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
