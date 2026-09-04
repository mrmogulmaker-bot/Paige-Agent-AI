import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PipelineDelete } from "./PipelineDelete";
import type { PipelineRecord } from "./useSoloCampaigns";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const pipeline = { id: "one", shortRef: "PPL-AAAAA", name: "Same name", version: 2, stageCount: 2, dealCount: 0, updatedAt: "2026-09-01T12:00:00Z" } as PipelineRecord;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function button(name: string) { return [...host.querySelectorAll("button")].find(b => b.textContent === name)!; }
function render(run = vi.fn(async () => ({ ok: true, message: "Deleted" })), record = pipeline, allowed = true, done = vi.fn()) {
  act(() => root.render(<PipelineDelete pipeline={record} canDelete={allowed} run={run} onDeleted={done}/>));
  return { run, done };
}
it("names the exact selected duplicate and cancellation sends nothing", () => {
  const { run } = render(); act(() => button("Delete pipeline").click());
  expect(host.querySelector("dialog")?.textContent).toContain("PPL-AAAAA");
  expect(host.textContent).toContain("Currently selected pipeline");
  act(() => button("Cancel").click()); expect(run).not.toHaveBeenCalled();
});
it("refuses occupied pipelines and read-only members", () => {
  render(undefined, { ...pipeline, dealCount: 3 }); act(() => button("Delete pipeline").click());
  expect(host.querySelector("dialog")?.textContent).toContain("3 deals");
  expect(button("Delete this pipeline")).toBeUndefined();
  render(undefined, pipeline, false); expect(button("Delete pipeline").disabled).toBe(true);
});
it("does not publish a late successful deletion after unmount", async () => {
  let finish!: (value: {ok: boolean; message: string}) => void;
  const run = vi.fn(() => new Promise<{ok: boolean; message: string}>(resolve => { finish = resolve; }));
  const { done } = render(run); act(() => button("Delete pipeline").click());
  const input = host.querySelector("input")!;
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, pipeline.shortRef); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => button("Delete this pipeline").click());
  act(() => root.render(<div>Different workspace</div>));
  await act(async () => finish({ok: true, message: "Deleted"}));
  expect(done).not.toHaveBeenCalled();
});
