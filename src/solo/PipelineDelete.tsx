import React, { useEffect, useRef, useState } from "react";
import type { PipelineAction, PipelineRecord } from "./useSoloCampaigns";
import "./pipeline-delete.css";

type Result = { ok: boolean; message: string; data?: Record<string, unknown> };
type Props = {
  pipeline: PipelineRecord;
  canDelete: boolean;
  run: (action: PipelineAction) => Promise<Result>;
  onDeleted: (id: string, message: string) => void;
};

// The native modal uses the browser top layer, not the shared Sales/detail host.
// The parent keys this subtree by server tenant context. A departed subtree never
// publishes an asynchronous result, even when the owner switches A -> B -> A.
export function PipelineDelete({ pipeline, canDelete, run, onDeleted }: Props) {
  const [selected, setSelected] = useState<PipelineRecord | null>(null);
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const alive = useRef(false);
  const submitting = useRef(false);
  const operationKey = useRef("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (selected) { dialog.current?.showModal(); cancel.current?.focus(); }
    else if (dialog.current?.open) { dialog.current.close(); opener.current?.focus(); }
  }, [selected]);
  const close = () => {
    if (submitting.current) return;
    setSelected(null); setReference(""); setError(""); opener.current?.focus();
  };
  useEffect(() => {
    // Browser Back dismisses without submitting. Normal route navigation is not
    // intercepted; unmount is also a safe abandonment of an unsent confirmation.
    const back = () => { if (!submitting.current) setSelected(null); };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const submit = async () => {
    if (!selected || !canDelete || selected.dealCount !== 0 || reference !== selected.shortRef || submitting.current) return;
    submitting.current = true; setPending(true); setError("");
    try {
      const result = await run({ type: "delete-empty-pipeline", pipelineId: selected.id, pipelineRef: selected.shortRef,
        expectedVersion: selected.version, expectedStageCount: selected.stageCount, idempotencyKey: operationKey.current });
      if (!alive.current) return;
      if (result.ok) { setSelected(null); onDeleted(selected.id, result.message); }
      else setError(result.message);
    } catch {
      if (alive.current) setError("The result could not be confirmed. Retry to check the same request safely, or reload the pipeline list.");
    } finally {
      submitting.current = false;
      if (alive.current) setPending(false);
    }
  };
  return <>
    <div className="pipeline-delete-entry">
      <button ref={opener} type="button" className="btn btn-s pipeline-danger" disabled={!canDelete}
        onClick={() => { setSelected({ ...pipeline }); setReference(""); setError(""); operationKey.current = crypto.randomUUID(); }}>Delete pipeline</button>
      {!canDelete && <small>Only the workspace owner can delete a pipeline.</small>}
    </div>
    <dialog ref={dialog} className="pipeline-delete-dialog" aria-labelledby="pipeline-delete-title" aria-describedby="pipeline-delete-description"
      onCancel={event => { event.preventDefault(); close(); }} onKeyDown={event => { if (event.key === "Escape") event.stopPropagation(); }}>
      {selected && <>
        <header><h2 id="pipeline-delete-title">Delete {selected.name}?</h2><button type="button" className="btn btn-s" disabled={pending} aria-label="Close deletion confirmation" onClick={close}>×</button></header>
        <p className="pipeline-delete-selected">Currently selected pipeline · <strong>{selected.shortRef}</strong></p>
        <dl><div><dt>Stages (including archived)</dt><dd>{selected.stageCount}</dd></div><div><dt>Deals</dt><dd>{selected.dealCount}</dd></div><div><dt>Last updated</dt><dd>{selected.updatedAt && !Number.isNaN(Date.parse(selected.updatedAt)) ? new Date(selected.updatedAt).toLocaleDateString() : "Not recorded"}</dd></div></dl>
        <p id="pipeline-delete-description">{selected.dealCount > 0
          ? `This pipeline has ${selected.dealCount} deal${selected.dealCount === 1 ? "" : "s"}. Deletion is blocked. Move or resolve those deals first; their history will not be deleted.`
          : "Its empty stages and configuration will be permanently removed. Catalog offers and services, clients, payments, and other pipelines are unaffected. Connected routes, automations, or retained deal history will block deletion."}</p>
        {selected.dealCount === 0 && <label>Enter {selected.shortRef} to confirm<input value={reference} disabled={pending} autoComplete="off" spellCheck={false} onChange={event => setReference(event.target.value)} /></label>}
        {error && <div><p role="alert">{error}</p><button type="button" className="btn btn-s" onClick={() => window.location.reload()}>Reload pipeline list</button></div>}
        {pending && <p role="status">Deletion is processing. A submitted request cannot be cancelled.</p>}
        <footer><button ref={cancel} type="button" className="btn btn-s" disabled={pending} onClick={close}>Cancel</button>
          {selected.dealCount === 0 && <button type="button" className="btn btn-s pipeline-delete-confirm" disabled={!canDelete || pending || reference !== selected.shortRef} onClick={submit}>{pending ? "Deleting…" : "Delete this pipeline"}</button>}</footer>
      </>}
    </dialog>
  </>;
}
