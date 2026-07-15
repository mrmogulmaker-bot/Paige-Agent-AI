// Custom Fields tab on ContactDetail — shows + edits this contact's per-tenant custom field
// values (Task #71/#54 seam: src/lib/customFields.ts). Definitions are tenant-authored in
// /admin/settings/custom-fields (a parallel surface, not this file's job) — this panel only
// renders + edits VALUES for one contact, per-field save on change (mirrors ContactNotesPanel /
// ContactFilesPanel's tenantId prop pattern already used on this page).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SectionCard, EmptyState } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import {
  listCustomFieldDefinitions,
  listClientCustomFieldValues,
  setClientCustomFields,
  type CustomFieldDefinition,
} from "@/lib/customFields";

interface ContactCustomFieldsPanelProps {
  contactId: string;
  tenantId: string | null;
}

export function ContactCustomFieldsPanel({ contactId, tenantId }: ContactCustomFieldsPanelProps) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  // Values keyed by field_definition_id — matches listClientCustomFieldValues' own contract.
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantId) { setLoading(false); return; }
      setLoading(true);
      try {
        const [defs, vals] = await Promise.all([
          listCustomFieldDefinitions(tenantId),
          listClientCustomFieldValues(contactId),
        ]);
        if (cancelled) return;
        setDefinitions(defs);
        setValues(vals);
      } catch (e: unknown) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Couldn't load custom fields.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tenantId, contactId]);

  const save = async (definition: CustomFieldDefinition, next: unknown) => {
    if (!tenantId) return;
    setValues((prev) => ({ ...prev, [definition.id]: next }));
    setSavingId(definition.id);
    try {
      await setClientCustomFields(contactId, tenantId, { [definition.key]: next });
      toast.success(`${definition.label} saved.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : `Couldn't save ${definition.label}.`);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <SectionCard
        title="Custom fields"
        description="Loading this workspace's custom fields and this contact's saved answers…"
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </SectionCard>
    );
  }

  if (definitions.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title="No custom fields set up yet"
        description="Create fields like “T-shirt size” or “Program cohort” to track anything specific to your practice on every contact."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/settings/custom-fields">Set up custom fields</Link>
          </Button>
        }
      />
    );
  }

  return (
    <SectionCard
      title="Custom fields"
      description="Answers specific to your practice. Add or change fields any time in Settings."
    >
      <div className="space-y-4">
        {definitions.map((definition) => (
          <CustomFieldRow
            key={definition.id}
            definition={definition}
            value={values[definition.id]}
            saving={savingId === definition.id}
            onSave={(next) => void save(definition, next)}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function FieldLabel({ definition, htmlFor }: { definition: CustomFieldDefinition; htmlFor?: string }) {
  return (
    <Label htmlFor={htmlFor} className="text-sm text-foreground">
      {definition.label}
      {definition.required && <span className="ml-1.5 text-xs text-muted-foreground">· required</span>}
    </Label>
  );
}

function HelpText({ definition }: { definition: CustomFieldDefinition }) {
  if (!definition.helpText) return null;
  return <p className="text-xs text-muted-foreground">{definition.helpText}</p>;
}

function CustomFieldRow({
  definition,
  value,
  saving,
  onSave,
}: {
  definition: CustomFieldDefinition;
  value: unknown;
  saving: boolean;
  onSave: (next: unknown) => void;
}) {
  const fieldId = `custom-field-${definition.id}`;
  const stringValue = value == null ? "" : String(value);
  const [draft, setDraft] = useState(stringValue);

  // Re-seed the draft whenever the saved value changes underneath us (initial load, or a
  // successful save round-trip) — but never fight the user mid-keystroke via a value prop.
  useEffect(() => { setDraft(stringValue); }, [stringValue]);

  if (definition.fieldType === "boolean") {
    const checked = value === true || value === "true";
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
        <div className="min-w-0 space-y-0.5">
          <FieldLabel definition={definition} htmlFor={fieldId} />
          <HelpText definition={definition} />
        </div>
        <Switch id={fieldId} checked={checked} disabled={saving} onCheckedChange={(next) => onSave(next)} />
      </div>
    );
  }

  if (definition.fieldType === "select") {
    const options = definition.options ?? [];
    return (
      <div className="space-y-1.5">
        <FieldLabel definition={definition} htmlFor={fieldId} />
        <Select
          value={typeof value === "string" && value ? value : "__none"}
          onValueChange={(next) => onSave(next === "__none" ? null : next)}
          disabled={saving}
        >
          <SelectTrigger id={fieldId}><SelectValue placeholder="Not set" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Not set</SelectItem>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <HelpText definition={definition} />
      </div>
    );
  }

  if (definition.fieldType === "multiselect") {
    const options = definition.options ?? [];
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (optValue: string, checked: boolean) => {
      const next = checked ? [...selected, optValue] : selected.filter((v) => v !== optValue);
      onSave(next);
    };
    return (
      <div className="space-y-1.5">
        <FieldLabel definition={definition} />
        <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground">No options configured for this field yet.</p>
          )}
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={selected.includes(opt.value)}
                disabled={saving}
                onCheckedChange={(c) => toggle(opt.value, c === true)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <HelpText definition={definition} />
      </div>
    );
  }

  if (definition.fieldType === "date") {
    return (
      <div className="space-y-1.5">
        <FieldLabel definition={definition} htmlFor={fieldId} />
        <Input
          id={fieldId}
          type="date"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== stringValue) onSave(draft || null); }}
        />
        <HelpText definition={definition} />
      </div>
    );
  }

  if (definition.fieldType === "number") {
    return (
      <div className="space-y-1.5">
        <FieldLabel definition={definition} htmlFor={fieldId} />
        <Input
          id={fieldId}
          type="number"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft === stringValue) return;
            onSave(draft === "" ? null : Number(draft));
          }}
        />
        <HelpText definition={definition} />
      </div>
    );
  }

  // "text" (and any future scalar fallback)
  return (
    <div className="space-y-1.5">
      <FieldLabel definition={definition} htmlFor={fieldId} />
      <Input
        id={fieldId}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== stringValue) onSave(draft || null); }}
      />
      <HelpText definition={definition} />
    </div>
  );
}
