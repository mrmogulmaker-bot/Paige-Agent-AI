/** Internal staging contract, never a client/Spine/Mind projection. This pure module
 * performs no writes or authorization. Callers MUST resolve tenant/source authority
 * and supply only that tenant's identities. Row keys are not database idempotency. */
export const IMPORT_FIELDS = ["external_id", "first_name", "last_name", "email", "phone", "alternate_email", "alternate_phone", "tags", "program_tier", "lifecycle_stage", "campaign_membership", "owner", "notes", "email_consent", "sms_consent", "email_opt_out", "sms_opt_out", "opt_out"] as const;
export type ImportField = typeof IMPORT_FIELDS[number];
export type ImportMapping = Record<string, ImportField>;
export type ConsentState = "unknown" | "granted" | "denied";
export interface ImportSource { system: string; accountKey: string; snapshotKey: string; observedAt: string }
export interface ExistingImportIdentity {
  contactKey: string;
  email?: string;
  phone?: string;
  externalId?: string;
  sourceSystem?: string;
  sourceAccountKey?: string;
  fields?: Partial<Record<ImportField, string>>;
}
export interface ImportStagedRow {
  rowKey: string;
  sourceRecordKey: string | null;
  rowNumber: number;
  provenance: ImportSource;
  fields: Partial<Record<ImportField, string>>;
  customFields: Record<string, string>;
  consent: { email: ConsentState; sms: ConsentState };
  matches: string[];
  decisions: string[];
  errors: string[];
  proposedPatch: Partial<Record<ImportField, string>>;
  automaticActions: never[];
}
export interface ImportPreview {
  version: 1;
  source: ImportSource;
  mapping: ImportMapping;
  unmappedHeaders: string[];
  rows: ImportStagedRow[];
  counts: { total: number; valid: number; probableDuplicates: number; missingUsableIdentity: number; consentRecords: number; optOutRecords: number; requiresDecision: number; invalid: number };
  proposedBatchSize: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{7,14}$/;
const MAX_BYTES = 5_000_000;
const MAX_ROWS = 10_001; // includes the header
const MAX_COLUMNS = 200;
const MAX_CELL = 32_768;

function parseCsv(input: string): string[][] {
  if (input.length > MAX_BYTES || new TextEncoder().encode(input).length > MAX_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");
  const csv = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false, closed = false;
  const cell = () => { row.push(value); value = ""; closed = false; if (row.length > MAX_COLUMNS) throw new Error("IMPORT_TOO_MANY_COLUMNS"); };
  const record = () => { cell(); rows.push(row); row = []; if (rows.length > MAX_ROWS) throw new Error("IMPORT_TOO_MANY_ROWS"); };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === "\0") throw new Error("IMPORT_INVALID_CHARACTER");
    if (quoted) {
      if (char === '"') { if (csv[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } }
      else value += char;
    } else if (char === ',') cell();
    else if (char === '\r' || char === '\n') { record(); if (char === '\r' && csv[i + 1] === '\n') i++; }
    else if (char === '"') { if (value || closed) throw new Error("IMPORT_INVALID_QUOTE"); quoted = true; }
    else { if (closed) throw new Error("IMPORT_TRAILING_QUOTE_DATA"); value += char; }
    if (value.length > MAX_CELL) throw new Error("IMPORT_CELL_TOO_LARGE");
  }
  if (quoted) throw new Error("IMPORT_UNTERMINATED_QUOTE");
  if (value || row.length || closed) record();
  if (!rows.length) throw new Error("IMPORT_EMPTY_FILE");
  return rows;
}

const normalize = (value: string | undefined) => (value ?? "").trim().toLowerCase();
const affirmative = (value: string | undefined) => ["true", "yes", "1", "granted", "opted_out", "unsubscribed"].includes(normalize(value));
function consent(value?: string): ConsentState {
  const token = normalize(value);
  if (["denied", "false", "no", "0", "revoked", "unsubscribed", "opted_out"].includes(token)) return "denied";
  if (["granted", "true", "yes", "1"].includes(token)) return "granted";
  return "unknown";
}
function nameKey(fields: Partial<Record<ImportField, string>>): string {
  return [fields.first_name, fields.last_name].map(normalize).filter(Boolean).join(" ");
}
function tokens(fields: Partial<Record<ImportField, string>>, source: ImportSource): string[] {
  return [
    fields.external_id ? `source:${JSON.stringify([source.system, source.accountKey, fields.external_id])}` : "",
    ...[fields.email, fields.alternate_email].filter(value => value && EMAIL.test(value)).map(value => `email:${value}`),
    ...[fields.phone, fields.alternate_phone].filter(value => value && PHONE.test(value)).map(value => `phone:${value}`),
    nameKey(fields) ? `name:${nameKey(fields)}` : "",
  ].filter(Boolean);
}

export function buildImportPreview(csv: string, mapping: ImportMapping, existing: readonly ExistingImportIdentity[], source: ImportSource): ImportPreview {
  if (![source.system, source.accountKey, source.snapshotKey].every(value => typeof value === "string" && value.trim() && value.length <= 256) || !Number.isFinite(Date.parse(source.observedAt))) throw new Error("IMPORT_SOURCE_REQUIRED");
  if (existing.length > 100_000) throw new Error("IMPORT_TOO_MANY_IDENTITIES");
  const [rawHeaders, ...records] = parseCsv(csv);
  const headers = rawHeaders.map(header => header.trim());
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) throw new Error("IMPORT_AMBIGUOUS_HEADERS");
  const entries = Object.entries(mapping);
  if (entries.some(([header, field]) => !headers.includes(header) || !IMPORT_FIELDS.includes(field)) || new Set(entries.map(([, field]) => field)).size !== entries.length) throw new Error("IMPORT_INVALID_MAPPING");
  const unmappedHeaders = headers.filter(header => !Object.prototype.hasOwnProperty.call(mapping, header));
  const identityIndex = new Map<string, ExistingImportIdentity[]>();
  for (const identity of existing) {
    const fields = { ...identity.fields, email: normalize(identity.email ?? identity.fields?.email), phone: (identity.phone ?? identity.fields?.phone)?.trim(), external_id: identity.externalId };
    const identitySource = { ...source, system: identity.sourceSystem ?? "", accountKey: identity.sourceAccountKey ?? "" };
    for (const token of tokens(fields, identitySource)) { const group = identityIndex.get(token) ?? []; group.push(identity); identityIndex.set(token, group); }
  }
  const fileIndex = new Map<string, ImportStagedRow[]>();
  const rows = records.map((record, index): ImportStagedRow => {
    if (record.length !== headers.length) throw new Error("IMPORT_COLUMN_COUNT_MISMATCH");
    const fields: Partial<Record<ImportField, string>> = {};
    const customFields: Record<string, string> = Object.create(null);
    headers.forEach((header, column) => {
      if (Object.prototype.hasOwnProperty.call(mapping, header)) fields[mapping[header]] = record[column].trim();
      else customFields[header] = record[column];
    });
    const errors: string[] = [], decisions: string[] = [];
    for (const field of ["email", "alternate_email"] as const) if (fields[field]) { fields[field] = normalize(fields[field]); if (!EMAIL.test(fields[field]!)) errors.push(`invalid_${field}`); }
    for (const field of ["phone", "alternate_phone"] as const) if (fields[field] && !PHONE.test(fields[field]!)) decisions.push(`${field}_requires_e164`);
    if (![fields.email, fields.alternate_email].some(value => value && EMAIL.test(value)) && ![fields.phone, fields.alternate_phone].some(value => value && PHONE.test(value))) decisions.push("missing_usable_identity");
    if (!fields.external_id) decisions.push("missing_external_id");
    const denied = affirmative(fields.opt_out);
    const consentState = { email: denied || affirmative(fields.email_opt_out) ? "denied" as const : consent(fields.email_consent), sms: denied || affirmative(fields.sms_opt_out) ? "denied" as const : consent(fields.sms_consent) };
    for (const field of ["program_tier", "lifecycle_stage", "campaign_membership", "owner"] as const) if (fields[field]) decisions.push(`${field}_mapping_required`);
    const rowTokens = tokens(fields, source);
    const matches = [...new Map(rowTokens.flatMap(token => identityIndex.get(token) ?? []).map(identity => [identity.contactKey, identity])).values()];
    if (matches.length) decisions.push("existing_record_match");
    if (matches.length > 1) decisions.push("ambiguous_existing_match");
    if (matches.some(identity => Object.entries(fields).some(([key, value]) => identity.fields?.[key as ImportField] && value && identity.fields[key as ImportField] !== value))) decisions.push("existing_field_conflict");
    const row: ImportStagedRow = {
      rowKey: JSON.stringify([source.system, source.accountKey, source.snapshotKey, index + 1]),
      sourceRecordKey: fields.external_id ? JSON.stringify([source.system, source.accountKey, fields.external_id]) : null,
      rowNumber: index + 1, provenance: { ...source }, fields, customFields, consent: consentState,
      matches: matches.map(identity => identity.contactKey), decisions, errors,
      // A match proposes no update until a human has reviewed a server-persisted plan.
      proposedPatch: {}, automaticActions: [],
    };
    for (const token of rowTokens) {
      const previous = fileIndex.get(token) ?? [];
      if (previous.length) for (const duplicate of [previous[0], row]) if (!duplicate.decisions.includes("duplicate_in_file")) duplicate.decisions.push("duplicate_in_file");
      previous.push(row); fileIndex.set(token, previous);
    }
    return row;
  });
  const counts = {
    total: rows.length, valid: rows.filter(row => !row.errors.length).length,
    probableDuplicates: rows.filter(row => row.matches.length || row.decisions.includes("duplicate_in_file")).length,
    missingUsableIdentity: rows.filter(row => row.decisions.includes("missing_usable_identity")).length,
    consentRecords: rows.filter(row => row.consent.email !== "unknown" || row.consent.sms !== "unknown").length,
    optOutRecords: rows.filter(row => row.consent.email === "denied" || row.consent.sms === "denied").length,
    requiresDecision: rows.filter(row => row.decisions.length || row.errors.length).length,
    invalid: rows.filter(row => row.errors.length).length,
  };
  return { version: 1, source: { ...source }, mapping: { ...mapping }, unmappedHeaders, rows, counts, proposedBatchSize: Math.min(100, rows.filter(row => !row.errors.length && !row.decisions.length).length) };
}

/** Only this allowlisted aggregate may enter general PAIGE/Spine/Mind context. */
export function publicImportSummary(preview: ImportPreview) {
  return { version: preview.version, counts: { ...preview.counts }, mappedFieldCount: Object.keys(preview.mapping).length, unmappedFieldCount: preview.unmappedHeaders.length, proposedBatchSize: preview.proposedBatchSize, status: "preview" as const, writesPerformed: 0, messagesSent: 0 };
}
