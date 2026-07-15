// Form mode — build a new form from a platform template, with an honest preview.
//
// Rail: name (slug auto-derives), the template chips. Canvas: a read-only render of the
// chosen template's schema — every section and field, exactly what will be created, no
// mockups. The act — gold "Create form" — lives in the Studio top bar, published up
// through onToolbar; it drives studio.ts saveForm() → growth_form_upsert (§10).
//
// Templates are the §2/§9-clean platform set from src/lib/growth-templates.ts — shared
// with the Forms library, one copy, no drift.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, FilterChip } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { GrowthFieldType, GrowthFormSchema } from "@/lib/growth";
import { FORM_TEMPLATES, formTemplateSchema, growthSeamMessage } from "@/lib/growth-templates";
import { listCustomFieldDefinitions, type CustomFieldDefinition } from "@/lib/customFields";
import { saveForm, isStudioError } from "../studio";
import { kebabSlug } from "../PublishDialog";
import { StudioRailHeading, StudioSplit } from "../StudioChrome";
import { MODE_RAIL } from "../studio-copy";
import type { ModeToolbarState } from "../studio-types";
import { LabelChip } from "./content-shared";

/** The fixed, always-available "maps to" targets — every clients.* column an operator can
 *  route a form answer into. Custom fields (tenant-authored) are appended below these,
 *  fetched per-tenant so the picker always reflects what this workspace has actually defined. */
const IDENTITY_MAP_OPTIONS: { value: string; label: string }[] = [
  { value: "clients.email", label: "Email" },
  { value: "clients.first_name", label: "First name" },
  { value: "clients.last_name", label: "Last name" },
  { value: "clients.phone", label: "Phone" },
  { value: "clients.entity_name", label: "Company / entity" },
  { value: "clients.title", label: "Title" },
];

/** A human-readable fallback for a maps_to path this picker doesn't otherwise offer (e.g. a
 *  template-seeded "businesses.legal_name") — so an existing mapping never silently vanishes
 *  from view just because the operator opened this picker (§13: truthful, never a hoped-for
 *  state). */
function formatUnlistedMapsTo(path: string): string {
  const [object, ...rest] = path.split(".");
  return `${object} · ${rest.join(".") || "—"}`;
}

/** Human words for every field type — the operator never reads a backend type string (§11). */
const FIELD_TYPE_LABEL: Record<GrowthFieldType, string> = {
  text: "Short answer",
  email: "Email",
  tel: "Phone",
  number: "Number",
  date: "Date",
  textarea: "Long answer",
  select: "Pick one",
  radio: "Pick one",
  checkbox: "Yes / no",
  ssn4: "ID digits",
  currency: "Amount",
};

export interface FormModeProps {
  tenantId: string | null;
  /** Publish this mode's Save/act buttons into the Studio top bar. */
  onToolbar: (state: ModeToolbarState) => void;
  /** The form is created — the hub jumps to the Forms library. */
  onCreated?: () => void;
  className?: string;
}

export function FormMode({ tenantId, onToolbar, onCreated, className }: FormModeProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState("discovery-call");
  const [busy, setBusy] = useState(false);

  // The schema starts from the static template but is real, mutable component state — the
  // operator's "maps to" choices below edit THIS object, and it's what flows into saveForm()
  // on Create. Re-seeded from the template whenever the operator switches templates.
  const [schema, setSchema] = useState<GrowthFormSchema>(() => formTemplateSchema(template));
  useEffect(() => { setSchema(formTemplateSchema(template)); }, [template]);

  // Every ACTIVE custom field definition for this tenant, so the "maps to" picker can offer
  // `custom.<key>` targets alongside the fixed clients.* identity columns (Task: FormMode
  // maps_to picker). Tenant-scoped (§9) — refetches whenever the workspace changes.
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function loadCustomFields() {
      if (!tenantId) { setCustomFieldDefs([]); return; }
      try {
        const defs = await listCustomFieldDefinitions(tenantId);
        if (!cancelled) setCustomFieldDefs(defs);
      } catch (e) {
        if (!cancelled) console.warn("FormMode: custom field definitions not loaded for maps_to picker:", e);
      }
    }
    void loadCustomFields();
    return () => { cancelled = true; };
  }, [tenantId]);

  const selected = FORM_TEMPLATES.find((t) => t.key === template);
  const fieldCount = schema.sections.reduce((n, s) => n + s.fields.length, 0);

  /** Real, load-bearing edit — reassigns which record path a form answer writes into. */
  const setFieldMapsTo = useCallback((sectionIndex: number, fieldKey: string, mapsTo: string | undefined) => {
    setSchema((prev) => ({
      ...prev,
      sections: prev.sections.map((section, si) => {
        if (si !== sectionIndex) return section;
        return {
          ...section,
          fields: section.fields.map((f) => (f.key === fieldKey ? { ...f, maps_to: mapsTo } : f)),
        };
      }),
    }));
  }, []);

  const setNameAndSlug = (next: string) => {
    setName(next);
    if (!slugTouched) setSlug(kebabSlug(next));
  };

  const canCreate = !!tenantId && name.trim().length > 0 && slug.trim().length > 0;

  const create = useCallback(async () => {
    if (!tenantId) { toast.error("Pick a workspace first."); return; }
    if (!name.trim() || !slug.trim()) { toast.error("Give the form a name and a link."); return; }
    setBusy(true);
    try {
      const saved = await saveForm({ tenantId, slug, name, schema });
      // Provenance only (§12) — which template this started from. Never touches schema or status,
      // so a failure here doesn't block the form itself — just log it for follow-up.
      const { error: provenanceErr } = await supabase
        .from("growth_forms").update({ template_key: template }).eq("id", saved.id);
      if (provenanceErr) console.warn("form template_key provenance not recorded:", provenanceErr.message);
      toast.success("Form created — it's in your Forms library.");
      onCreated?.();
    } catch (e) {
      const cause = isStudioError(e) ? e.cause ?? e : e;
      toast.error(growthSeamMessage(cause, isStudioError(e) ? e.message : "Couldn't create that form. Try again."));
    } finally {
      setBusy(false);
    }
  }, [tenantId, name, slug, schema, template, onCreated]);

  // The act lives in the top bar — publish it up whenever its state changes.
  useEffect(() => {
    onToolbar({
      act: {
        label: busy ? "Creating…" : "Create form",
        onClick: () => void create(),
        disabled: !canCreate || busy,
        busy,
      },
    });
  }, [onToolbar, create, canCreate, busy]);

  return (
    <StudioSplit
      className={className}
      railHeader={
        <StudioRailHeading
          heading={MODE_RAIL.form.heading}
          description={MODE_RAIL.form.description}
        />
      }
      railBody={
        <>
          <div className="space-y-1.5">
            <Label htmlFor="form-name">Name</Label>
            <Input
              id="form-name"
              value={name}
              onChange={(e) => setNameAndSlug(e.target.value)}
              placeholder="Discovery Call Request"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="form-slug">Link</Label>
            <Input
              id="form-slug"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              placeholder="discovery-call"
            />
            <p className="text-xs text-muted-foreground">Letters, numbers and dashes. Derived from the name until you edit it.</p>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Start from a template
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FORM_TEMPLATES.map((t) => (
                <FilterChip key={t.key} active={template === t.key} onClick={() => setTemplate(t.key)}>
                  {t.label}
                </FilterChip>
              ))}
            </div>
            {selected && <p className="text-xs text-muted-foreground">{selected.description}</p>}
          </div>
        </>
      }
      canvas={
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <p className="text-xs text-muted-foreground">
            {fieldCount} question{fieldCount === 1 ? "" : "s"} — this is exactly what gets created when you hit Create form.
          </p>
          {schema.sections.map((section, si) => (
            <SectionCard key={si} title={section.title} description={section.description} numbered={si + 1}>
              <ul className="space-y-2">
                {section.fields.map((field) => {
                  const currentMapsTo = field.maps_to ?? "__none";
                  const knownValues = new Set<string>([
                    "__none",
                    ...IDENTITY_MAP_OPTIONS.map((o) => o.value),
                    ...customFieldDefs.map((d) => `custom.${d.key}`),
                  ]);
                  const isUnlisted = currentMapsTo !== "__none" && !knownValues.has(currentMapsTo);
                  return (
                    <li
                      key={field.key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {field.label}
                        {field.required && <span className="ml-1.5 text-xs text-muted-foreground">· required</span>}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <LabelChip>{FIELD_TYPE_LABEL[field.type]}</LabelChip>
                        <span className="text-[11px] text-muted-foreground">Maps to</span>
                        <Select
                          value={currentMapsTo}
                          onValueChange={(v) => setFieldMapsTo(si, field.key, v === "__none" ? undefined : v)}
                        >
                          <SelectTrigger className="h-8 w-[180px] text-xs">
                            <SelectValue placeholder="Don't map" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">Don't map</SelectItem>
                            {isUnlisted && (
                              <SelectGroup>
                                <SelectLabel>Current mapping</SelectLabel>
                                <SelectItem value={currentMapsTo}>{formatUnlistedMapsTo(currentMapsTo)}</SelectItem>
                              </SelectGroup>
                            )}
                            <SelectGroup>
                              <SelectLabel>Contact fields</SelectLabel>
                              {IDENTITY_MAP_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectGroup>
                            {customFieldDefs.length > 0 && (
                              <SelectGroup>
                                <SelectLabel>Custom fields</SelectLabel>
                                {customFieldDefs.map((def) => (
                                  <SelectItem key={def.id} value={`custom.${def.key}`}>{def.label}</SelectItem>
                                ))}
                              </SelectGroup>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ))}
          {schema.submit_label && (
            <p className="text-xs text-muted-foreground">
              Submit button reads: <span className="font-medium text-foreground">“{schema.submit_label}”</span>
            </p>
          )}
        </div>
      }
    />
  );
}

export default FormMode;
