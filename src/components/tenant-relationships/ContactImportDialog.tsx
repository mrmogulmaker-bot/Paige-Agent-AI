import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildImportPreview, IMPORT_FIELDS, type ImportMapping, type ImportSource, type ImportStagedRow } from "../../../supabase/functions/_shared/contact-import-contract";

type Row = { row_number: number; state: string; staged: ImportStagedRow };
type Preview = { run_id: string; mapping: ImportMapping; source: ImportSource; unmapped_headers: string[]; rows: Row[]; preview_summary: { counts: Record<string, number>; proposedBatchSize: number } };
type Choice = "create" | "skip";
const countLabels: Record<string, string> = { total: "Incoming contacts", valid: "Valid records", probableDuplicates: "Probable duplicates", missingUsableIdentity: "Missing usable email or phone", consentRecords: "Consent records preserved", optOutRecords: "Opt-out records preserved", requiresDecision: "Records requiring a decision", invalid: "Invalid records" };
const fieldLabel = (field: string) => field.replace(/_/g, " ");
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Only exact staged values can enter a create selection. Other source fields stay
 * in provenance; this surface never guesses a lifecycle, assignee or tag delimiter. */
export function importCreatePatch(row: Row): Record<string, unknown> | null {
  if (row.state !== "pending" || row.staged.errors.length || row.staged.decisions.length || row.staged.matches.length) return null;
  const fields = row.staged.fields;
  if (!fields.email && !fields.phone) return null;
  const patch: Record<string, unknown> = {};
  for (const field of ["first_name", "last_name", "email", "phone", "notes"] as const) if (fields[field]) patch[field] = fields[field];
  if (fields.tags) {
    try {
      const tags: unknown = JSON.parse(fields.tags);
      if (!Array.isArray(tags) || tags.length > 100 || tags.some(tag => typeof tag !== "string")) return null;
      patch.tags = tags;
    } catch { return null; }
  }
  return patch;
}

export function ContactImportDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; tenantId: string; openPaige: () => void }) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    {props.open && <ContactImportReview key={props.tenantId} {...props} />}
  </Dialog>;
}

function ContactImportReview({ tenantId, onOpenChange, openPaige }: { tenantId: string; onOpenChange: (open: boolean) => void; openPaige: () => void }) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [system, setSystem] = useState("csv");
  const [accountKey, setAccountKey] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [snapshotKey, setSnapshotKey] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [offset, setOffset] = useState(0);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const epoch = useRef(0);
  const nonce = useRef<string | null>(null);
  useEffect(() => () => { epoch.current += 1; }, []);
  const request = async (body: Record<string, unknown>) => {
    const { data, error: invokeError } = await supabase.functions.invoke("solo-contact-import", { body: { ...body, expected_tenant_id: tenantId } });
    if (invokeError || record(data).error) throw new Error("The import request could not finish. Check your workspace access and try again. Your contacts have not been changed by this preview.");
    return record(data);
  };
  const perform = async (operation: () => Promise<void>) => {
    const token = ++epoch.current;
    setBusy(true); setError(null);
    try { await operation(); } catch (e) { if (token === epoch.current) setError(e instanceof Error ? e.message : "The import could not finish."); }
    finally { if (token === epoch.current) setBusy(false); }
  };
  const readFile = (file?: File) => {
    if (!file) return;
    setCsv(""); setFileName(""); setHeaders([]); setMapping({}); setPreview(null); setChoices({}); setSelected(false); nonce.current = null;
    void perform(async () => {
      const token = epoch.current;
      if (file.size > 5_000_000) throw new Error("Choose a CSV file smaller than 5 MB.");
      const content = await file.text();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
      if (token !== epoch.current) return;
      setCsv(content); setFileName(file.name);
      setSnapshotKey(Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join(""));
      setHeaders([]); setMapping({}); setPreview(null); setChoices({}); setSelected(false); nonce.current = null;
    });
  };
  const source = (): ImportSource => ({ system, accountKey: accountKey.trim(), snapshotKey, observedAt: new Date(observedAt).toISOString() });
  const inspectHeaders = () => {
    try {
      // Only parse actual file headers here. All record/duplicate counts shown below
      // come from the authorized server preview with its existing tenant identities.
      const parsed = buildImportPreview(csv, {}, [], source());
      setHeaders(parsed.unmappedHeaders); setError(null);
    } catch { setError("Check the CSV format and source details. Every column needs a unique, non-empty header."); }
  };
  const loadPreview = async (runId: string, nextOffset: number, token: number) => {
    const data = await request({ operation: "preview", run_id: runId, offset: nextOffset });
    if (token !== epoch.current) return;
    if (typeof data.run_id !== "string" || !Array.isArray(data.rows) || !record(data.preview_summary).counts) throw new Error("The server did not return a usable import preview.");
    setPreview(data as unknown as Preview); setOffset(nextOffset); setChoices({}); nonce.current = null;
  };
  const stage = () => void perform(async () => {
    const token = epoch.current;
    const data = await request({ operation: "stage", csv, mapping, source: source() });
    if (token !== epoch.current) return;
    if (typeof data.run_id !== "string") throw new Error("The file was not staged. Please try again.");
    await loadPreview(data.run_id, 0, token);
  });
  const selectBatch = () => void perform(async () => {
    if (!preview) return;
    const token = epoch.current;
    const selection = preview.rows.filter(row => choices[row.row_number]).map(row => {
      const disposition = choices[row.row_number];
      const patch = disposition === "create" ? importCreatePatch(row) : null;
      if (disposition === "create" && !patch) throw new Error("A selected record needs review. Remove it from this batch.");
      return { row_number: row.row_number, disposition, ...(patch ? { patch } : {}) };
    });
    nonce.current ??= crypto.randomUUID();
    const data = await request({ operation: "select", run_id: preview.run_id, selection, request_nonce: nonce.current });
    if (token !== epoch.current) return;
    if (data.state !== "awaiting_paige_approval" || data.contacts_written !== 0) throw new Error("The batch selection could not be verified. Refresh its status with PAIGE before continuing.");
    setSelected(true);
  });
  const selectionCount = Object.keys(choices).length;
  const canMap = Boolean(csv && accountKey.trim() && observedAt && snapshotKey);
  return <DialogContent className="max-w-3xl" aria-describedby="contact-import-description">
    <DialogHeader><DialogTitle>Import contacts</DialogTitle><DialogDescription id="contact-import-description">Review the source and select a batch. PAIGE requests approval before writing contacts.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy && <p role="status" className="text-sm">Preparing your import…</p>}
    {selected ? <div className="space-y-3" role="status">
      <p>Your batch of {selectionCount} records is saved for review. No contacts have been written.</p>
      <p>Ask PAIGE to review your selected contact import batch and request approval.</p>
      <Button onClick={() => { onOpenChange(false); openPaige(); window.dispatchEvent(new CustomEvent("paige:open", { detail: { prompt: "Review my selected contact import batch. Explain the actual counts and unresolved decisions, then request approval before importing it." } })); }}>Review with PAIGE</Button>
    </div> : !preview ? <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="import-file">CSV export</Label><Input id="import-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => readFile(e.target.files?.[0])} /></div>
        <div><Label htmlFor="import-source">Source system</Label><Input id="import-source" value={system} disabled={busy || headers.length > 0} onChange={e => setSystem(e.target.value)} placeholder="GoHighLevel" /></div>
        <div><Label htmlFor="import-account">Source workspace or account label</Label><Input id="import-account" value={accountKey} disabled={busy || headers.length > 0} onChange={e => setAccountKey(e.target.value)} /></div>
        <div><Label htmlFor="import-date">Export date and time</Label><Input id="import-date" type="datetime-local" value={observedAt} disabled={busy || headers.length > 0} onChange={e => setObservedAt(e.target.value)} /></div>
      </div>
      {fileName && <p className="text-sm break-words">Selected file: {fileName}</p>}
      {!headers.length ? <Button disabled={!canMap || busy} onClick={inspectHeaders}>Review field mapping</Button> : <>
        <h3 className="font-medium">Field mapping</h3><p className="text-sm">Map each source column or preserve it as a custom field. No fields are discarded.</p>
        <div className="grid gap-3 sm:grid-cols-2">{headers.map(header => <div key={header} className="min-w-0"><Label className="break-words" htmlFor={`map-${headers.indexOf(header)}`}>{header}</Label>
          <select id={`map-${headers.indexOf(header)}`} className="w-full rounded-md border bg-background p-2 text-sm" disabled={busy} value={mapping[header] ?? ""} onChange={e => { const next = { ...mapping }; if (e.target.value) next[header] = e.target.value as typeof IMPORT_FIELDS[number]; else delete next[header]; setMapping(next); }}>
            <option value="">Preserve as custom field</option>{IMPORT_FIELDS.map(field => <option key={field} value={field} disabled={Object.entries(mapping).some(([other, value]) => other !== header && value === field)}>{fieldLabel(field)}</option>)}
          </select></div>)}</div>
        <Button disabled={busy || !Object.keys(mapping).length} onClick={stage}>Prepare import preview</Button>
      </>}
    </div> : <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{Object.entries(countLabels).map(([key, label]) => <div key={key}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{preview.preview_summary.counts[key] ?? "Unavailable"}</dd></div>)}</dl>
      <p className="text-sm">Proposed batch: {preview.preview_summary.proposedBatchSize} records · Selected: {selectionCount} / 100</p>
      <p className="text-sm break-words">Source: {preview.source.system} · {preview.source.accountKey} · Exported {new Date(preview.source.observedAt).toLocaleString()}</p>
      <details><summary>Field mappings and custom fields</summary><ul className="text-sm space-y-1">{Object.entries(preview.mapping).map(([header, field]) => <li key={header} className="break-words">{header} → {fieldLabel(field)}</li>)}</ul><p className="text-sm break-words">Custom fields preserved: {preview.unmapped_headers.length ? preview.unmapped_headers.join(", ") : "None"}</p></details>
      <p className="text-sm">Choose each record explicitly. Records needing decisions can be left for later or skipped. Existing contacts are never overwritten here. Duplicate merging and custom lifecycle or owner mappings still need separate review. Imported contacts do not start campaigns or messages.</p>
      <div className="space-y-3">{preview.rows.map(row => {
        const patch = importCreatePatch(row);
        const issues = [...row.staged.errors, ...row.staged.decisions];
        if (!patch && !issues.length && row.state === "pending") issues.push("mapping_requires_review");
        return <section key={row.row_number} className="rounded-md border p-3 space-y-2" aria-label={`Import row ${row.row_number}`}>
          <strong className="text-sm break-words">Row {row.row_number} · {[row.staged.fields.first_name, row.staged.fields.last_name].filter(Boolean).join(" ") || "Name not provided"}</strong>
          <p className="text-sm break-words">{row.staged.fields.email || "No email"} · {row.staged.fields.phone || "No phone"}</p>
          <p className="text-sm">Email consent: {row.staged.consent.email} · SMS consent: {row.staged.consent.sms} · Possible matches: {row.staged.matches.length}</p>
          {issues.length > 0 && <p className="text-sm">Needs review: {issues.map(fieldLabel).join(", ")}</p>}
          <details><summary className="text-sm">Review source values</summary><dl className="text-sm">{Object.entries(row.staged.fields).map(([field, value]) => <div className="break-words" key={field}><dt className="font-medium">{fieldLabel(field)}</dt><dd>{value}</dd></div>)}</dl></details>
          <Label htmlFor={`choice-${row.row_number}`}>Decision for row {row.row_number}</Label>
          <select id={`choice-${row.row_number}`} className="w-full rounded-md border bg-background p-2 text-sm" disabled={busy || row.state !== "pending"} value={choices[row.row_number] ?? ""} onChange={e => { const next = { ...choices }; if (e.target.value) next[row.row_number] = e.target.value as Choice; else delete next[row.row_number]; setChoices(next); nonce.current = null; }}>
            <option value="">Leave for later</option><option value="create" disabled={!patch}>Create contact from reviewed values</option><option value="skip">Skip this source record</option>
          </select>
        </section>;
      })}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || offset === 0 || selectionCount > 0} onClick={() => void perform(() => loadPreview(preview.run_id, offset - 100, epoch.current))}>Previous records</Button><Button variant="outline" disabled={busy || offset + preview.rows.length >= preview.preview_summary.counts.total || selectionCount > 0} onClick={() => void perform(() => loadPreview(preview.run_id, offset + 100, epoch.current))}>Next records</Button></div>
      <Button disabled={busy || selectionCount < 1 || selectionCount > 100} onClick={selectBatch}>Save selected batch for PAIGE approval</Button>
    </div>}
  </DialogContent>;
}
