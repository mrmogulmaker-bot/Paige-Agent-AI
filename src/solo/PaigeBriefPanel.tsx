import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareText, Mic, ShieldCheck, X } from "lucide-react";
import { setupSourceLabel, type SetupSourceDecision, type SoloSetupBrief, type SoloSetupTextField } from "./settings-setup-contract";

export type PaigeBriefValues = Pick<SoloSetupBrief, "brandVoice" | "operatingPreferences" | "doNotAssume">;

type PaigeBriefPanelProps = {
  draft: SoloSetupBrief;
  canEdit: boolean;
  disabled: boolean;
  sourceDecisions: Partial<Record<SoloSetupTextField, SetupSourceDecision>>;
  onApply: (values: PaigeBriefValues) => void;
  onDirtyChange: (dirty: boolean) => void;
  confirmDiscard: () => Promise<boolean>;
};

const briefFields = [
  { key: "brandVoice" as const, title: "Voice character", hint: "Tone, personality, phrases, and how people should feel." },
  { key: "operatingPreferences" as const, title: "Working and message style", hint: "Audience relationship, structure, channel differences, and how to handle uncertainty." },
  { key: "doNotAssume" as const, title: "Boundaries", hint: "Claims, tones, facts, or decisions Paige must never invent." },
];

export function PaigeBriefPanel({ draft, canEdit, disabled, sourceDecisions, onApply, onDirtyChange, confirmDiscard }: PaigeBriefPanelProps) {
  const seed = (): PaigeBriefValues => ({
    brandVoice: draft.brandVoice,
    operatingPreferences: draft.operatingPreferences,
    doNotAssume: draft.doNotAssume,
  });
  const [open, setOpen] = useState(false);
  const [guided, setGuided] = useState<PaigeBriefValues>(seed);
  const initial = useRef<PaigeBriefValues>(seed());
  const opener = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const dirty = JSON.stringify(guided) !== JSON.stringify(initial.current);

  useEffect(() => onDirtyChange(open && dirty), [dirty, onDirtyChange, open]);

  const openGuide = () => {
    const values = seed();
    initial.current = values;
    setGuided(values);
    setOpen(true);
  };

  const closeGuide = useCallback(async (force = false) => {
    if (!force && dirty && !await confirmDiscard()) return;
    setOpen(false);
    onDirtyChange(false);
    requestAnimationFrame(() => opener.current?.focus());
  }, [confirmDiscard, dirty, onDirtyChange]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLElement>("button, textarea")?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        void closeGuide();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeGuide, open]);

  return <>
    <div className="setup-paige-brief__actions">
      <button ref={opener} type="button" className="setup-button setup-button--primary" onClick={openGuide} disabled={!canEdit || disabled}><MessageSquareText aria-hidden/>Teach Paige</button>
      {!canEdit && <span>Workspace Owner or verified Admin access is required to edit this context.</span>}
    </div>
    <div className="setup-paige-brief__grid">
      {briefFields.map((field) => {
        const source = draft.provenance[field.key]?.source ?? "needs_confirmation";
        return <article key={field.key} className="setup-paige-brief__card">
          <div><h3>{field.title}</h3><span className="setup-source" data-source={source}>{setupSourceLabel(source)}</span></div>
          <span className={draft[field.key] ? "setup-read-value" : "setup-read-value setup-read-value--empty"}>{draft[field.key] || "Needs confirmation"}</span>
          <small>{field.hint}</small>
        </article>;
      })}
    </div>
    <div className="setup-boundary"><Mic aria-hidden/><div><strong>Talk with Paige is proposed</strong><span>Voice conversation, transcript extraction, and example-library indexing are not connected yet. This guided editor saves the same owner-confirmed Setup fields now without pretending those runtime paths are live.</span></div></div>
    {open && createPortal(<div className="setup-paige-drawer__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) void closeGuide(); }}>
      <div ref={dialog} className="setup-paige-drawer" role="dialog" aria-modal="true" aria-label="Teach Paige your business voice">
        <header className="setup-paige-drawer__head"><div><span>Paige brief</span><h2>Teach Paige how this business sounds and works</h2><p>Add the nuance a founder or operator knows but a blank form rarely captures.</p></div><button type="button" aria-label="Close and return to Setup" onClick={() => void closeGuide()}><X aria-hidden/></button></header>
        <button type="button" className="setup-paige-drawer__back" onClick={() => void closeGuide()}>← Back to Setup</button>
        <div className="setup-paige-drawer__notice"><Mic aria-hidden/><div><strong>Talk with Paige is proposed</strong><span>For now, use these guided fields. Nothing is sent to PAIGE, Mind, Spine, or Rail from this drawer.</span></div></div>
        <div className="setup-paige-drawer__fields">
          <GuidedField name="brandVoice" title="How should the business sound and make people feel?" hint="Describe tone, personality, signature phrases, and a sentence that sounds exactly like you." value={guided.brandVoice} source={draft.provenance.brandVoice?.source} decision={sourceDecisions.brandVoice} disabled={disabled} onChange={(value) => setGuided((current) => ({ ...current, brandVoice: value }))}/>
          <GuidedField name="operatingPreferences" title="How should Paige structure communication and work with you?" hint="Include audience relationship, message structure, channel differences, calls to action, and what Paige should do when uncertain." value={guided.operatingPreferences} source={draft.provenance.operatingPreferences?.source} decision={sourceDecisions.operatingPreferences} disabled={disabled} onChange={(value) => setGuided((current) => ({ ...current, operatingPreferences: value }))}/>
          <GuidedField name="doNotAssume" title="What must Paige never assume, claim, or sound like?" hint="Name prohibited tones, unsupported promises, sensitive topics, and decisions that always require your judgment." value={guided.doNotAssume} source={draft.provenance.doNotAssume?.source} decision={sourceDecisions.doNotAssume} disabled={disabled} onChange={(value) => setGuided((current) => ({ ...current, doNotAssume: value }))}/>
        </div>
        <div className="setup-paige-drawer__save-note"><ShieldCheck aria-hidden/><span><strong>Nothing changes until you save the Setup brief.</strong> Applying returns these fields to the main Setup draft. The durable write still happens only through Save changes.</span></div>
        <footer className="setup-paige-drawer__footer"><button type="button" className="setup-button setup-button--quiet" onClick={() => void closeGuide()}>Cancel</button><button type="button" className="setup-button setup-button--primary" disabled={disabled || !dirty} onClick={() => { onApply(guided); void closeGuide(true); }}>Apply to Setup draft</button></footer>
      </div>
    </div>, document.body)}
  </>;
}

function GuidedField({ name, title, hint, value, source, decision, disabled, onChange }: {
  name: keyof PaigeBriefValues;
  title: string;
  hint: string;
  value: string;
  source?: "owner_confirmed" | "connection_sourced" | "needs_confirmation";
  decision?: SetupSourceDecision;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const connected = source === "connection_sourced" && decision !== "override";
  return <label><span>{title}</span><small>{hint}</small><textarea name={name} value={value} disabled={disabled || connected} onChange={(event) => onChange(event.target.value)}/>{connected && <em>Connection-sourced. Return to Edit brief and explicitly choose Override before changing it.</em>}</label>;
}
