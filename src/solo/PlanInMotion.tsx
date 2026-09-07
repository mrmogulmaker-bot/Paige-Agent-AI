import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Archive, Check, CirclePause, Flag, Info, Pencil, Play, RefreshCw, Sparkles, SquareCheck, X } from "lucide-react";
import type { BusinessMissionDetail, MissionBriefInput, MissionOutcome, MissionState } from "@/types/businessMission";
import { setPaigeBusinessPlanScope, setPaigeDiscussionScope } from "./paigeClientScope";
import { DiscussionNeededCard } from "./DiscussionNeededCard";
import { clearPaigePublicPresenceScope } from "./paigePublicPresenceScope";
import { useBusinessGamePlanMissions, type StrategicPlay } from "./data/useBusinessGamePlanMissions";

type Props = { workspaceId?: string | null; openPaige?: () => void; onNotice?: (message: string) => void };
type Form = MissionBriefInput & { revisionReason: string };
type PendingAction = "decline" | "pause" | "block" | "complete" | "archive" | null;

const emptyForm = (): Form => ({
  title: "", desiredOutcome: "", deadlineOn: null, baseline: "", strategy: "",
  constraints: [], successDefinition: "", ownerAuthority: "", assumptions: [],
  missingInformation: [], nextAction: null, revisionReason: "",
});
const lines = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
const text = (value: string | null | undefined) => value?.trim() || "";
const friendlyError = (code?: string | null) =>
  code === "MISSION_OWNER_REQUIRED" ? "Only the verified Solo owner can change strategic plays."
  : code === "ACTIVE_ACCOUNT_CHANGED" ? "Your workspace changed. Reopen this play from the active workspace."
  : code === "MISSION_REVISION_CONFLICT" ? "This play changed elsewhere. The latest version has been reloaded."
  : code === "MISSION_CLOSED" ? "This play is closed and can no longer be revised."
  : "The change could not be verified. Nothing is being shown as complete.";

function formFrom(detail: BusinessMissionDetail): Form {
  return {
    title: detail.mission.title,
    desiredOutcome: detail.brief.desired_outcome,
    deadlineOn: detail.brief.deadline_on,
    baseline: detail.brief.baseline,
    strategy: detail.brief.strategy,
    constraints: detail.brief.constraints,
    successDefinition: detail.brief.success_definition,
    ownerAuthority: detail.brief.owner_authority,
    assumptions: detail.brief.assumptions,
    missingInformation: detail.brief.missing_information,
    nextAction: detail.mission.next_action,
    revisionReason: "",
  };
}

export function PlanInMotion({ workspaceId, openPaige, onNotice }: Props) {
  const brain = useBusinessGamePlanMissions(workspaceId);
  const [selected, setSelected] = useState<BusinessMissionDetail | null>(null);
  const [drawer, setDrawer] = useState<"view" | "create" | "edit" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<MissionOutcome>("achieved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  const visible = useMemo(() => brain.items.filter((item) => item.state !== "stopped"), [brain.items]);
  const archived = useMemo(() => brain.items.filter((item) => item.state === "stopped"), [brain.items]);

  useEffect(() => {
    if (!drawer) {
      opener.current?.focus();
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawer(null); setSelected(null); setPending(null); setError(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = closeButton.current?.closest<HTMLElement>('[role="dialog"]');
      const focusable = dialog ? [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])')] : [];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawer]);

  const close = () => { setDrawer(null); setSelected(null); setPending(null); setError(null); };
  const openCreate = (event: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget;
    setForm(emptyForm());
    setError(null);
    setDrawer("create");
  };
  const openPlay = async (play: StrategicPlay, event: React.MouseEvent<HTMLButtonElement>) => {
    opener.current = event.currentTarget;
    setDrawer("view");
    setSelected(null);
    setError(null);
    try { setSelected(await brain.getDetail(play.id)); }
    catch (caught) { setError(friendlyError(caught instanceof Error ? caught.message : null)); }
  };
  const planWithPaige = (play?: StrategicPlay | BusinessMissionDetail["mission"]) => {
    if (!workspaceId) return;
    clearPaigePublicPresenceScope();
    setPaigeBusinessPlanScope({
      tenantId: workspaceId,
      surface: "business_game_plan",
      businessMissionId: play?.id ?? null,
      label: play?.title ?? "Business Game Plan",
    });
    openPaige?.();
  };

  const discussWithPaige = (play: BusinessMissionDetail["mission"]) => {
    if (!workspaceId) return;
    clearPaigePublicPresenceScope();
    setPaigeDiscussionScope({ tenantId: workspaceId, surface: "business_game_plan", businessMissionId: play.id, label: play.title });
    setDrawer(null);
    setSelected(null);
    setPending(null);
    setError(null);
    requestAnimationFrame(() => openPaige?.());
  };

  const finish = async (result: Awaited<ReturnType<typeof brain.mutate>>, success: string) => {
    if (!result.ok) {
      setError(friendlyError(result.code));
      if (result.code === "MISSION_REVISION_CONFLICT") await brain.refresh();
      return false;
    }
    onNotice?.(result.railRecorded ? success : success + " The saved change is verified, but its Rail receipt is not yet confirmed.");
    if (result.missionId) {
      try { setSelected(await brain.getDetail(result.missionId)); } catch { setSelected(null); }
    }
    setPending(null);
    setReason("");
    return true;
  };

  const save = async () => {
    if (busy) return;
    if (![form.title, form.desiredOutcome, form.baseline, form.strategy, form.successDefinition, form.ownerAuthority].every((value) => text(value))) {
      setError("Complete the title, outcome, starting point, approach, success criteria, and authority notes.");
      return;
    }
    if (drawer === "edit" && !text(form.revisionReason)) {
      setError("Add a short reason for this revision.");
      return;
    }
    setBusy(true); setError(null);
    const args = {
      request_key: crypto.randomUUID(),
      title: form.title,
      desired_outcome: form.desiredOutcome,
      deadline_on: form.deadlineOn,
      baseline: form.baseline,
      strategy: form.strategy,
      constraints: form.constraints,
      success_definition: form.successDefinition,
      owner_authority: form.ownerAuthority,
      assumptions: form.assumptions,
      missing_information: form.missingInformation,
      next_action: text(form.nextAction) || null,
      ...(drawer === "edit" && selected ? {
        mission_id: selected.mission.id,
        expected_revision: selected.mission.revision,
        revision_reason: form.revisionReason,
      } : {}),
    };
    const result = await brain.mutate(drawer === "edit" ? "mission_revise" : "mission_create", args);
    const ok = await finish(result, drawer === "edit" ? "Strategic play revised and verified." : "Draft strategic play created and verified.");
    if (ok) setDrawer("view");
    setBusy(false);
  };

  const transition = async (toState: MissionState) => {
    if (!selected || busy) return;
    const isClosing = toState === "completed" || toState === "stopped";
    if (isClosing && !text(reason) && !(selected.mission.state === "completed" && toState === "stopped")) {
      setError(toState === "completed" ? "Record the truthful outcome before completing this play." : "Add a reason so the history remains useful.");
      return;
    }
    const preservingCompletion = selected.mission.state === "completed" && toState === "stopped";
    const args = {
      mission_id: selected.mission.id,
      expected_revision: selected.mission.revision,
      request_key: crypto.randomUUID(),
      to_state: toState,
      reason: text(reason) || null,
      closure_outcome: preservingCompletion ? selected.mission.closure_outcome : isClosing ? (toState === "stopped" ? "stopped" : outcome) : null,
      outcome_summary: preservingCompletion ? selected.mission.outcome_summary : isClosing ? reason.trim() : null,
      outcome_unknowns: preservingCompletion ? selected.mission.outcome_unknowns : null,
    };
    setBusy(true); setError(null);
    const result = await brain.mutate("mission_transition", args);
    await finish(result, toState === "active" ? "Strategic play is active and verified."
      : toState === "paused" ? "Strategic play paused and verified."
      : toState === "blocked" ? "Blocker recorded and verified."
      : toState === "completed" ? "Outcome recorded and completion verified."
      : "Strategic play archived with its history preserved.");
    setBusy(false);
  };

  const beginEdit = () => {
    if (!selected) return;
    setForm(formFrom(selected));
    setPending(null);
    setError(null);
    setDrawer("edit");
  };

  return (
    <>
      <section className="sd-card pim" aria-labelledby="plan-in-motion-title">
        <div className="sd-card-hd pim-head">
          <div><span className="sd-eyebrow"><Flag /> Plan in Motion</span><p>Strategic plays you can revisit, approve, pause, and verify.</p></div>
          <button className="sd-btn sd-btn-sm" onClick={openCreate}>Add play</button>
        </div>
        {brain.status === "loading" && <div className="pim-state" aria-busy="true"><RefreshCw className="pim-spin" /> Loading strategic plays.</div>}
        {brain.status === "forbidden" && <div className="pim-state"><AlertTriangle /><span><b>Owner access required.</b> This workspace does not grant you permission to change strategic plays.</span></div>}
        {brain.status === "error" && <div className="pim-state"><AlertTriangle /><span><b>Couldn't load strategic plays.</b> No plan state is being assumed.</span><button className="sd-btn sd-btn-sm" onClick={brain.refresh}>Retry</button></div>}
        {brain.status === "ready" && visible.length === 0 && (
          <div className="pim-empty"><Sparkles /><h3>No strategic plays yet</h3><p>Create a draft yourself or shape one with Paige. Nothing becomes active without the existing owner-authority rules.</p><div><button className="sd-btn sd-act sd-btn-sm" onClick={openCreate}>Create a draft</button><button className="sd-btn sd-btn-sm" onClick={() => planWithPaige()}>Plan with Paige</button></div></div>
        )}
        {brain.status === "ready" && visible.map((play) => (
          <button key={play.id} className="pim-card" onClick={(event) => void openPlay(play, event)}>
            <span className="pim-card-top"><b>{play.title}</b><span className={"pim-stage pim-stage-" + play.state}>{play.stageLabel}</span></span>
            <span className="pim-meta"><span><small>Horizon</small>{play.horizonLabel}</span><span><small>Next owner</small>{play.nextOwner}</span></span>
            <span className="pim-line"><small>Desired outcome</small>{play.desired_outcome}</span>
            <span className="pim-line"><small>Next meaningful step</small>{play.next_action || "Not set"}</span>
            {play.blocker && <span className="pim-blocker"><AlertTriangle />{play.blocker}</span>}
          </button>
        ))}
        {brain.status === "ready" && archived.length > 0 && <details className="pim-archive"><summary>Archived plays ({archived.length})</summary>{archived.map((play) => <button key={play.id} onClick={(event) => void openPlay(play, event)}><Archive /> <span>{play.title}</span><small>{play.horizonLabel}</small></button>)}</details>}
      </section>

      {drawer && (
        <div className="ov-scrim" data-kind="drawer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="ov-sheet" role="dialog" aria-modal="true" aria-label={drawer === "create" ? "Create strategic play" : selected?.mission.title || "Strategic play"}>
            <div className="ov-hd"><span className="oh-ic"><Flag /></span><div><h3>{drawer === "create" ? "Create strategic play" : selected?.mission.title || "Loading strategic play"}</h3><div className="oh-sub">Business Game Plan - canonical record</div></div><button ref={closeButton} className="oh-x" aria-label="Close" onClick={close}><X /></button></div>
            {(drawer === "create" || drawer === "edit") ? (
              <>
                <div className="ov-body">
                  <div className="ov-note"><Info /><span>This saves as a governed plan record. A successful message appears only after canonical readback; Rail confirmation is reported separately.</span></div>
                  <Field label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
                  <Field label="Desired outcome" value={form.desiredOutcome} onChange={(value) => setForm({ ...form, desiredOutcome: value })} area />
                  <Field label="Horizon date" value={form.deadlineOn || ""} onChange={(value) => setForm({ ...form, deadlineOn: value || null })} type="date" />
                  <Field label="Starting point" value={form.baseline} onChange={(value) => setForm({ ...form, baseline: value })} area />
                  <Field label="Approach" value={form.strategy} onChange={(value) => setForm({ ...form, strategy: value })} area />
                  <Field label="Success criteria" value={form.successDefinition} onChange={(value) => setForm({ ...form, successDefinition: value })} area />
                  <Field label="Next meaningful step" value={form.nextAction || ""} onChange={(value) => setForm({ ...form, nextAction: value || null })} area />
                  <Field label="Constraints (one per line)" value={form.constraints.join("\n")} onChange={(value) => setForm({ ...form, constraints: lines(value) })} area />
                  <Field label="How Paige may help - not a grant of authority" value={form.ownerAuthority} onChange={(value) => setForm({ ...form, ownerAuthority: value })} area />
                  <Field label="Assumptions (one per line)" value={form.assumptions.join("\n")} onChange={(value) => setForm({ ...form, assumptions: lines(value) })} area />
                  <Field label="Missing information (one per line)" value={form.missingInformation.join("\n")} onChange={(value) => setForm({ ...form, missingInformation: lines(value) })} area />
                  {drawer === "edit" && <Field label="Why this changed" value={form.revisionReason} onChange={(value) => setForm({ ...form, revisionReason: value })} />}
                  {error && <div className="ov-err" role="alert">{error}</div>}
                </div>
                <div className="ov-foot"><button className="sd-btn sd-btn-sm" onClick={close}>Cancel</button><button className="sd-btn sd-btn-sm sd-act" disabled={busy} onClick={() => void save()}><Check />{busy ? "Verifying." : drawer === "edit" ? "Save revision" : "Save draft"}</button></div>
              </>
            ) : !selected ? (
              <div className="ov-body">{error ? <div className="sd-errbox"><AlertTriangle /><p>{error}</p></div> : <div className="pim-state" aria-busy="true">Loading the canonical play.</div>}</div>
            ) : (
              <PlayDetail detail={selected} pending={pending} setPending={setPending} reason={reason} setReason={setReason} outcome={outcome} setOutcome={setOutcome} error={error} busy={busy} onEdit={beginEdit} onPaige={() => planWithPaige(selected.mission)} onDiscussionPaige={() => discussWithPaige(selected.mission)} onTransition={transition} />
            )}
          </section>
        </div>
      )}
    </>
  );
}

function PlayDetail({ detail, pending, setPending, reason, setReason, outcome, setOutcome, error, busy, onEdit, onPaige, onDiscussionPaige, onTransition }: {
  detail: BusinessMissionDetail; pending: PendingAction; setPending: (value: PendingAction) => void; reason: string; setReason: (value: string) => void;
  outcome: MissionOutcome; setOutcome: (value: MissionOutcome) => void; error: string | null; busy: boolean; onEdit: () => void; onPaige: () => void; onDiscussionPaige: () => void; onTransition: (state: MissionState) => void;
}) {
  const state = detail.mission.state;
  const proposed = state === "proposed";
  return <><div className="ov-body">
    <div className="pim-detail-stage">{proposed && detail.mission.request_source === "paige_chat" ? "Awaiting owner approval" : state === "stopped" ? "Archived" : state === "completed" ? "Complete" : state[0].toUpperCase() + state.slice(1)} - revision {detail.mission.revision}</div>
    <Fact label="Desired outcome" value={detail.brief.desired_outcome} /><Fact label="Horizon" value={detail.brief.deadline_on || "Open horizon"} /><Fact label="Starting point" value={detail.brief.baseline} /><Fact label="Approach" value={detail.brief.strategy} /><Fact label="Success criteria" value={detail.brief.success_definition} /><Fact label="Next meaningful step" value={detail.mission.next_action || "Not set"} /><Fact label="Next owner" value="Owner" />
    {state === "blocked" && detail.mission.state_reason && <div className="pim-blocker"><AlertTriangle />{detail.mission.state_reason}</div>}
    <DiscussionNeededCard missionId={detail.mission.id} onTalkNow={onDiscussionPaige} />
    {(state === "completed" || state === "stopped") && detail.mission.outcome_summary && <Fact label="Recorded outcome" value={detail.mission.outcome_summary} />}
    <div className="ov-note"><Info /><span>Source: canonical Business Game Plan record, revision {detail.mission.revision}. Mind and durable Memory are unavailable for this play.</span></div>
    {pending && <div className="pim-confirm">
      <Field label={pending === "complete" ? "Truthful outcome summary" : pending === "block" ? "What is blocking this play?" : "Reason"} value={reason} onChange={setReason} area />
      {pending === "complete" && <label className="ov-field"><span>Outcome</span><select className="fin" value={outcome} onChange={(event) => setOutcome(event.target.value as MissionOutcome)}><option value="achieved">Achieved</option><option value="partly_achieved">Partly achieved</option><option value="blocked">Blocked</option></select></label>}
      <div className="pim-confirm-actions"><button className="sd-btn sd-btn-sm" onClick={() => setPending(null)}>Cancel</button><button className="sd-btn sd-btn-sm sd-act" disabled={busy} onClick={() => onTransition(pending === "pause" ? "paused" : pending === "block" ? "blocked" : pending === "complete" ? "completed" : "stopped")}>{busy ? "Verifying." : "Confirm"}</button></div>
    </div>}
    {error && <div className="ov-err" role="alert">{error}</div>}
  </div>
  <div className="ov-foot">
    <button className="sd-btn sd-btn-sm" onClick={onPaige}><Sparkles /> Plan with Paige</button>
    {!["completed", "stopped"].includes(state) && <button className="sd-btn sd-btn-sm" onClick={onEdit}><Pencil /> Revise</button>}
    {proposed && <><button className="sd-btn sd-btn-sm" onClick={() => setPending("decline")}>Decline</button><button className="sd-btn sd-btn-sm sd-act" disabled={busy} onClick={() => onTransition("active")}><Play /> Approve</button></>}
    {(state === "paused" || state === "blocked") && <button className="sd-btn sd-btn-sm sd-act" disabled={busy} onClick={() => onTransition("active")}><Play /> Resume</button>}
    {state === "active" && <><button className="sd-btn sd-btn-sm" onClick={() => setPending("pause")}><CirclePause /> Pause</button><button className="sd-btn sd-btn-sm" onClick={() => setPending("block")}><AlertTriangle /> Blocked</button><button className="sd-btn sd-btn-sm" onClick={() => setPending("complete")}><SquareCheck /> Complete</button></>}
    {(state === "paused" || state === "blocked") && <button className="sd-btn sd-btn-sm" onClick={() => setPending("complete")}><SquareCheck /> Complete</button>}
    {state !== "stopped" && <button className="sd-btn sd-btn-sm" onClick={() => setPending("archive")}><Archive /> Archive</button>}
  </div></>;
}

function Field({ label, value, onChange, area = false, type = "text" }: { label: string; value: string; onChange: (value: string) => void; area?: boolean; type?: string }) {
  return <label className="ov-field"><span>{label}</span>{area ? <textarea className="fin" value={value} onChange={(event) => onChange(event.target.value)} /> : <input className="fin" type={type} value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div className="sd-fact"><span className="fl">{label}</span><span className="fv">{value}</span></div>; }
