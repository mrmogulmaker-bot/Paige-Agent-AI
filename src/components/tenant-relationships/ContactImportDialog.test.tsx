import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactImportDialog, importCreatePatch } from "./ContactImportDialog";
import type { ImportStagedRow } from "../../../supabase/functions/_shared/contact-import-contract";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) } } }));
const source = { system: "csv", accountKey: "Source workspace", snapshotKey: "snapshot", observedAt: "2026-09-04T12:00:00Z" };
const staged = (fields: ImportStagedRow["fields"] = { external_id: "source-1", email: "owner@example.com", first_name: "Alex" }): ImportStagedRow => ({ rowKey: "row", sourceRecordKey: "source", rowNumber: 1, provenance: source, fields, customFields: {}, consent: { email: "denied", sms: "unknown" }, matches: [], decisions: [], errors: [], proposedPatch: {}, automaticActions: [] });
const row = () => ({ row_number: 1, state: "pending", staged: staged() });
const preview = () => ({ run_id: "run-private-id", mapping: { Email: "email", ID: "external_id" }, source, unmapped_headers: ["Custom"], rows: [row(), { row_number: 2, state: "pending", staged: { ...staged(), decisions: ["existing_record_match"], matches: ["private-client-id"] } }], preview_summary: { counts: { total: 2, valid: 2, probableDuplicates: 1, missingUsableIdentity: 0, consentRecords: 1, optOutRecords: 1, requiresDecision: 1, invalid: 0 }, proposedBatchSize: 1 } });
let root: Root;
let tenant = "tenant-a";
const openPaige = vi.fn();
async function render(open = true) { await act(async () => root.render(<ContactImportDialog open={open} tenantId={tenant} onOpenChange={vi.fn()} openPaige={openPaige} />)); }
const text = () => document.body.textContent ?? "";
const button = (name: string) => [...document.querySelectorAll("button")].find(b => b.textContent === name)!;
async function change(id: string, value: string) {
  const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
  const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function upload() {
  const input = document.getElementById("import-file") as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: [{ name: "contacts.csv", size: 50, text: async () => "ID,Email,Custom\nsource-1,owner@example.com,kept" }] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 15)); });
  await change("import-account", "Source workspace");
  await change("import-date", "2026-09-04T12:00");
  await act(async () => button("Review field mapping").click());
  await change("map-0", "external_id"); await change("map-1", "email");
}
async function stagePreview() { await upload(); await act(async () => button("Prepare import preview").click()); }
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto); tenant = "tenant-a"; openPaige.mockReset();
  mocks.invoke.mockReset().mockImplementation(async (_name, args) => ({ data: args.body.operation === "stage" ? { run_id: "run-private-id" } : args.body.operation === "preview" ? preview() : { state: "awaiting_paige_approval", contacts_written: 0, batch_id: "batch-private-id" }, error: null }));
  const host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); await render();
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
describe("Owner contact import preview", () => {
  it("copies only exact clean source values and refuses ambiguous or non-JSON tags", () => {
    expect(importCreatePatch(row())).toEqual({ email: "owner@example.com", first_name: "Alex" });
    expect(importCreatePatch({ ...row(), staged: { ...staged(), decisions: ["missing_external_id"] } })).toBeNull();
    expect(importCreatePatch({ ...row(), staged: staged({ email: "owner@example.com", tags: "vip,client" }) })).toBeNull();
    expect(importCreatePatch({ ...row(), staged: staged({ email: "owner@example.com", tags: '["vip","client"]' }) })).toEqual({ email: "owner@example.com", tags: ["vip", "client"] });
  });
  it("stages only the uploaded CSV and explicit mapping, then shows server counts and preserved source", async () => {
    await stagePreview();
    expect(mocks.invoke.mock.calls[0][1].body).toMatchObject({ operation: "stage", expected_tenant_id: "tenant-a", csv: "ID,Email,Custom\nsource-1,owner@example.com,kept", mapping: { ID: "external_id", Email: "email" }, source: { accountKey: "Source workspace" } });
    for (const label of ["Incoming contacts", "Probable duplicates", "Missing usable email or phone", "Opt-out records preserved", "Records requiring a decision", "Custom fields preserved: Custom"]) expect(text()).toContain(label);
    expect(text()).not.toContain("private-client-id"); expect(text()).not.toContain("run-private-id");
    const ambiguousCreate = document.querySelector('#choice-2 option[value="create"]') as HTMLOptionElement;
    expect(ambiguousCreate.disabled).toBe(true);
  });
  it("requires explicit choices, saves preview only, then opens PAIGE without IDs", async () => {
    await stagePreview(); expect((button("Save selected batch for PAIGE approval") as HTMLButtonElement).disabled).toBe(true);
    await change("choice-1", "create"); await change("choice-2", "skip");
    await act(async () => button("Save selected batch for PAIGE approval").click());
    const body = mocks.invoke.mock.calls.at(-1)![1].body;
    expect(body.selection).toEqual([{ row_number: 1, disposition: "create", patch: { email: "owner@example.com", first_name: "Alex" } }, { row_number: 2, disposition: "skip" }]);
    expect(text()).toContain("No contacts have been written");
    const dispatch = vi.spyOn(window, "dispatchEvent"); await act(async () => button("Review with PAIGE").click());
    expect(openPaige).toHaveBeenCalledOnce(); expect(JSON.stringify((dispatch.mock.calls.at(-1)?.[0] as CustomEvent).detail)).not.toMatch(/private-id|owner@example/);
    expect(mocks.invoke.mock.calls.some(call => call[1].body.operation === "commit")).toBe(false); dispatch.mockRestore();
  });
  it("reuses the selection nonce after an uncertain request, without duplicating approval", async () => {
    await stagePreview(); await change("choice-1", "create");
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "network" } });
    await act(async () => button("Save selected batch for PAIGE approval").click());
    const first = mocks.invoke.mock.calls.at(-1)![1].body.request_nonce;
    await act(async () => button("Save selected batch for PAIGE approval").click());
    expect(mocks.invoke.mock.calls.at(-1)![1].body.request_nonce).toBe(first);
  });
  it("drops an in-flight A stage after switching to B and never requests A preview", async () => {
    await upload(); let finish!: (value: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => button("Prepare import preview").click());
    tenant = "tenant-b"; await render();
    await act(async () => finish({ data: { run_id: "run-private-id" }, error: null }));
    expect(text()).not.toContain("contacts.csv"); expect(text()).not.toContain("Incoming contacts");
    expect(mocks.invoke.mock.calls.some(call => call[1].body.operation === "preview")).toBe(false);
  });
  it("does not turn a failed preview read into an empty or successful import", async () => {
    await upload(); mocks.invoke.mockResolvedValueOnce({ data: { run_id: "run-private-id" }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await act(async () => button("Prepare import preview").click());
    expect(document.querySelector('[role="alert"]')).toBeTruthy(); expect(text()).not.toContain("Incoming contacts"); expect(text()).not.toContain("No contacts have been written");
  });
});
