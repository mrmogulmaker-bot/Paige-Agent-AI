// Form mode — build a new form from a platform template, with an honest preview.
//
// Rail: name (slug auto-derives), the template chips. Canvas: a read-only render of the
// chosen template's schema — every section and field, exactly what will be created, no
// mockups. The act — gold "Create form" — lives in the Studio top bar, published up
// through onToolbar; it drives studio.ts saveForm() → growth_form_upsert (§10).
//
// Templates are the §2/§9-clean platform set from src/lib/growth-templates.ts — shared
// with the Forms library, one copy, no drift.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, FilterChip } from "@/components/ui/page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { GrowthFieldType } from "@/lib/growth";
import { FORM_TEMPLATES, formTemplateSchema, growthSeamMessage } from "@/lib/growth-templates";
import { saveForm, isStudioError } from "../studio";
import { kebabSlug } from "../PublishDialog";
import { StudioRailHeading, StudioSplit } from "../StudioChrome";
import { MODE_RAIL } from "../studio-copy";
import type { ModeToolbarState } from "../studio-types";
import { LabelChip } from "./content-shared";

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

  const schema = useMemo(() => formTemplateSchema(template), [template]);
  const selected = FORM_TEMPLATES.find((t) => t.key === template);
  const fieldCount = schema.sections.reduce((n, s) => n + s.fields.length, 0);

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
                {section.fields.map((field) => (
                  <li
                    key={field.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {field.label}
                      {field.required && <span className="ml-1.5 text-xs text-muted-foreground">· required</span>}
                    </span>
                    <LabelChip>{FIELD_TYPE_LABEL[field.type]}</LabelChip>
                  </li>
                ))}
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
