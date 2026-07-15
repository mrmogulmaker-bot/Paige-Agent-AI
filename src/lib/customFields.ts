// Custom Fields (Task #71/#54) — shared types + seam functions for per-tenant, per-object custom
// field definitions and their per-record values. Every call here goes through the RPCs the
// 20260716090000_custom_field_definitions.sql migration ships (custom_field_definition_upsert /
// _archive, client_custom_fields_upsert) or a plain RLS-scoped select — never a raw insert/update
// on the tables directly, so the same validation the DB enforces for every caller (this UI, Paige,
// growth-process-submission) never drifts (§10 — one seam, multiple callers).
import { supabase } from "@/integrations/supabase/client";

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect";

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / no" },
  { value: "select", label: "Pick one" },
  { value: "multiselect", label: "Pick multiple" },
];

export interface CustomFieldOption {
  label: string;
  value: string;
}

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  objectType: "clients";
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: CustomFieldOption[] | null;
  helpText: string | null;
  required: boolean;
  position: number;
  archivedAt: string | null;
}

interface DefinitionRow {
  id: string;
  tenant_id: string;
  object_type: string;
  key: string;
  label: string;
  field_type: string;
  options: unknown;
  help_text: string | null;
  required: boolean;
  position: number;
  archived_at: string | null;
}

function fromRow(row: DefinitionRow): CustomFieldDefinition {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    objectType: "clients",
    key: row.key,
    label: row.label,
    fieldType: row.field_type as CustomFieldType,
    options: Array.isArray(row.options) ? (row.options as CustomFieldOption[]) : null,
    helpText: row.help_text,
    required: row.required,
    position: row.position,
    archivedAt: row.archived_at,
  };
}

/** Every non-archived custom field definition for this tenant's contacts, in display order. */
export async function listCustomFieldDefinitions(tenantId: string): Promise<CustomFieldDefinition[]> {
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("id, tenant_id, object_type, key, label, field_type, options, help_text, required, position, archived_at")
    .eq("tenant_id", tenantId)
    .eq("object_type", "clients")
    .is("archived_at", null)
    .order("position", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DefinitionRow[]).map(fromRow);
}

export interface SaveCustomFieldInput {
  tenantId: string;
  id?: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options?: CustomFieldOption[] | null;
  helpText?: string | null;
  required?: boolean;
  position?: number;
}

export async function saveCustomFieldDefinition(input: SaveCustomFieldInput): Promise<CustomFieldDefinition> {
  const { data, error } = await supabase.rpc("custom_field_definition_upsert", {
    p_tenant_id: input.tenantId,
    p_key: input.key,
    p_label: input.label,
    p_field_type: input.fieldType,
    p_options: input.options && input.options.length > 0 ? input.options : null,
    p_help_text: input.helpText ?? null,
    p_required: input.required ?? false,
    p_position: input.position ?? 0,
    p_id: input.id ?? null,
  });
  if (error) throw error;
  return fromRow(data as DefinitionRow);
}

export async function archiveCustomFieldDefinition(id: string): Promise<void> {
  const { error } = await supabase.rpc("custom_field_definition_archive", { p_id: id });
  if (error) throw error;
}

export type CustomFieldValueMap = Record<string, unknown>;

/** All of one contact's custom field values, keyed by definition id. */
export async function listClientCustomFieldValues(clientId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("client_custom_field_values")
    .select("field_definition_id, value")
    .eq("client_id", clientId);
  if (error) throw error;
  const out: Record<string, unknown> = {};
  for (const row of (data ?? []) as { field_definition_id: string; value: unknown }[]) {
    out[row.field_definition_id] = row.value;
  }
  return out;
}

/** Bulk-set one contact's custom field values by definition KEY (not id) — mirrors the RPC's own
 *  key-based contract so a caller never has to resolve ids itself. */
export async function setClientCustomFields(
  clientId: string,
  tenantId: string,
  valuesByKey: CustomFieldValueMap,
): Promise<void> {
  const { error } = await supabase.rpc("client_custom_fields_upsert", {
    p_client_id: clientId,
    p_tenant_id: tenantId,
    p_values: valuesByKey,
  });
  if (error) throw error;
}
