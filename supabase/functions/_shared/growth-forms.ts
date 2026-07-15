// _shared/growth-forms.ts — the form-schema cleaner for growth-page-draft's questionnaire
// extension (Vibe Studio "probing" fix, growth_page_form_schema).
//
// Mirrors growth-blocks.ts's own structure (§12 — extract, never fork): imports its str/
// trimStr/slugify primitives rather than reforking them.
//
//   TS  — cleanFormSchema() below: repairs/cleans a model-proposed form_schema_json so it is
//         GUARANTEED to pass the SQL-side growth_validate_form_schema (migration
//         20260715123000_growth_page_form_schema.sql). Same TS-valid ⊆ SQL-valid invariant
//         validateBlock/growth_validate_blocks already hold for page blocks.
//   PROMPT — GROWTH_FORM_SCHEMA_SPEC below: the shape the model is held to when asked to
//         derive a real questionnaire from the operator's free-text description.
//
// Doctrine: §2 (no finance/credit in platform defaults — "ssn4"/"currency" are excluded from
// what a GENERATOR may produce; they stay operator/template-added only) · §13 (never fabricate,
// never drop a distinct question silently — repair instead) · §15 (probe → propose the real
// field schema instead of leaving the generic name/email/goal filler).
import { slugify, str, trimStr } from "./growth-blocks.ts";

export const GROWTH_FIELD_TYPES = [
  "text", "email", "tel", "number", "date", "textarea", "select", "radio", "checkbox",
] as const;
// "ssn4" and "currency" (valid in GrowthFieldType, src/lib/growth.ts) are deliberately EXCLUDED
// from what a generator may produce (§2/§15) — a Paige-generated questionnaire never invents an
// SSN-digit or currency-typed capture on its own; those stay operator/template-added only.
export type GrowthGeneratedFieldType = (typeof GROWTH_FIELD_TYPES)[number];

export interface CleanFormField {
  key: string;
  label: string;
  type: GrowthGeneratedFieldType;
  required?: boolean;
  options?: string[];
  maps_to?: string;
}

export interface CleanFormSchema {
  submit_label?: string;
  sections: { title?: string; fields: CleanFormField[] }[];
}

const MAPS_TO_ALLOW = /^(clients|businesses)\.[a-z0-9_]+$/;

/**
 * Clean + repair a model-proposed schema so it is GUARANTEED to pass the SQL-side
 * growth_validate_form_schema (TS-valid ⊆ SQL-valid — same invariant validateBlock/
 * growth_validate_blocks already hold for pages). Returns null if nothing usable survives —
 * the caller falls back to the existing hardcoded default, never a broken/empty schema.
 */
export function cleanFormSchema(raw: any): CleanFormSchema | null {
  const rawSections = Array.isArray(raw?.sections) ? raw.sections : Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const fields: CleanFormField[] = [];

  for (const section of rawSections.slice(0, 10)) {
    const rawFields = Array.isArray(section?.fields) ? section.fields : [];
    for (const f of rawFields.slice(0, 30)) {
      let key = slugify(str(f?.key) || str(f?.label), "").replace(/-/g, "_");
      if (!key) continue;
      let i = 1;
      const base = key;
      while (seen.has(key)) key = `${base}_${++i}`; // dedupe, never DROP a distinct question

      const label = trimStr(f?.label, 200) || trimStr(f?.key, 200);
      if (!label) continue;

      let type: GrowthGeneratedFieldType =
        (GROWTH_FIELD_TYPES as readonly string[]).includes(f?.type) ? f.type : "text";

      let options: string[] | undefined;
      if (type === "select" || type === "radio" || type === "checkbox") {
        options = Array.isArray(f?.options)
          ? f.options.slice(0, 40).map((o: any) => trimStr(typeof o === "string" ? o : o?.label, 120)).filter(Boolean)
          : [];
        if (!options.length) type = "text"; // repair, don't drop the question
      }

      const maps_to = trimStr(f?.maps_to, 60);
      const field: CleanFormField = { key, label, type };
      if (f?.required === true) field.required = true;
      if (options?.length) field.options = options;
      if (maps_to && MAPS_TO_ALLOW.test(maps_to)) field.maps_to = maps_to;

      seen.add(key);
      fields.push(field);
    }
  }
  if (!fields.length) return null;

  // Phase-1-style repair (mirrors index.ts's own hero/embedded_form guarantee): a lead form
  // that captures no way to follow up is a defect, never ship one silently.
  if (!fields.some((f) => f.type === "email")) {
    // A model field can already occupy the "email" key under a different type (e.g. a
    // mislabeled { key: "email", type: "text" }) — reuse the same seen-set dedupe the loop
    // above uses, or this fallback emits a duplicate key and the SQL validator rejects the
    // whole schema.
    let key = "email";
    let i = 1;
    while (seen.has(key)) key = `email_${++i}`;
    seen.add(key);
    fields.push({ key, label: "Email", type: "email", required: true, maps_to: "clients.email" });
  }

  return {
    submit_label: trimStr(raw?.submit_label, 40) || undefined,
    sections: [{ title: "", fields: fields.slice(0, 40) }],
  };
}

export const GROWTH_FORM_SCHEMA_SPEC = `form_schema_json shape:
{
  "submit_label"?: string,
  "sections": [{ "title"?: string, "fields": [
    { "key": string (lowercase_snake_case, unique), "label": string,
      "type": "text"|"email"|"tel"|"number"|"date"|"textarea"|"select"|"radio"|"checkbox",
      "required"?: boolean, "options"?: [string] (REQUIRED when type is select/radio/checkbox) }
  ]}]
}
One section is enough unless the operator described distinct steps. Never "ssn4"/"currency" —
use "text" for money/ID-like answers. Follow exactly what the operator described, in the order
given; don't add fields they didn't ask for beyond the name/email fallback noted above.`;
