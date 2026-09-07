import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, CirclePause, ExternalLink, Hand, Mic, MicOff, Minimize2, PhoneOff, RefreshCw, ShieldCheck, Square, Volume2, X } from "lucide-react";
import { PaigeCommandMark } from "@/components/brand/PaigeCommandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAIGE_LIVE_CONVERSATION_ENABLED, type LiveConversationCard } from "@/lib/paigeLiveConversation/contract";
import { startPaigeLiveConversation, transitionPaigeLiveConversation, type PaigeLiveEntryMode } from "@/lib/paigeLiveConversation/client";
import "./paige-live-conversation.css";

export type PaigeLiveTranscriptTurn = Readonly<{ id: string; role: "user" | "assistant"; content: string }>;
type LiveSurfaceState = "checking" | "unavailable" | "permission-denied" | "listening" | "thinking" | "waiting" | "speaking" | "interrupted" | "held" | "reconnecting";

const STATE_LABEL: Record<LiveSurfaceState, string> = {
  checking: "Checking availability",
  unavailable: "Live audio unavailable",
  "permission-denied": "Microphone permission denied",
  listening: "Listening",
  thinking: "Thinking",
  waiting: "Waiting",
  speaking: "Speaking",
  interrupted: "Interrupted",
  held: "On hold",
  reconnecting: "Reconnecting",
};

function ConversationCard({ card, disabled, canConfirm, onAnswer, onApprove, onDecline }: {
  card: LiveConversationCard;
  disabled: boolean;
  canConfirm: boolean;
  onAnswer: (answer: string) => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); if (answer.trim()) onAnswer(answer.trim()); };
  return (
    <section className="plc-card" aria-labelledby={`plc-card-${card.id}`} data-card-kind={card.kind}>
      <div className="plc-card__eyebrow">
        <span>{card.kind === "evidence-result" ? "Evidence / result" : card.kind.replace("-", " ")}</span>
        <span className="plc-availability">{card.source.availability}</span>
      </div>
      <h2 id={`plc-card-${card.id}`}>{card.title}</h2>
      {card.body && <p className="plc-card__body">{card.body}</p>}
      {card.source.provenanceLabel && <p className="plc-card__source">Source: {card.source.provenanceLabel}</p>}
      {card.kind === "question" && (
        <form onSubmit={submit} className="plc-answer">
          <label className="sr-only" htmlFor={`plc-answer-${card.id}`}>Answer Paige</label>
          <input id={`plc-answer-${card.id}`} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={card.placeholder ?? "Type your answer"} disabled={disabled} />
          <Button type="submit" size="sm" disabled={disabled || !answer.trim()}>Answer</Button>
        </form>
      )}
      {card.kind === "choice" && (
        <div className="plc-choices" role="group" aria-label={card.title}>
          {card.choices.slice(0, 4).map((choice, index) => (
            <Button key={choice.id} type="button" variant="outline" disabled={disabled} onClick={() => onAnswer(choice.label)}>
              <span aria-hidden>{index + 1}</span>{choice.label}
            </Button>
          ))}
        </div>
      )}
      {card.kind === "plan" && card.statusLabel && <p className="plc-card__status">{card.statusLabel}</p>}
      {card.kind === "evidence-result" && card.resultLabel && <p className="plc-card__status">{card.resultLabel}</p>}
      {card.kind === "governed-action" && (
        <div className="plc-governed">
          <div className="plc-governed__status"><ShieldCheck aria-hidden />{card.action.authorityStatus.replace(/-/g, " ")}</div>
          {card.action.scopeSummary && <p><strong>Exact scope:</strong> {card.action.scopeSummary}</p>}
          {card.action.authorityStatus === "confirmation-required" && canConfirm && (
            <div className="plc-card__actions">
              <Button variant="gold" disabled={disabled} onClick={onApprove}><Check aria-hidden />Confirm this action</Button>
              <Button variant="ghost" disabled={disabled} onClick={onDecline}><X aria-hidden />Not now</Button>
            </div>
          )}
          {card.action.receiptRef && <p className="plc-card__source">Receipt: {card.action.receiptRef}</p>}
          {card.action.railEvidenceRef && <p className="plc-card__source">Rail evidence: {card.action.railEvidenceRef}</p>}
        </div>
      )}
      {card.kind === "recap" && (
        <ul className="plc-recap">
          {card.points.map((point) => <li key={point.id}>{point.ownerConfirmed ? <Check aria-label="Confirmed" /> : <Square aria-label="Not confirmed" />}{point.text}</li>)}
        </ul>
      )}
    </section>
  );
}

export function PaigeLiveConversation({ disabled, contextEpoch, threadId, ensureThread, transcript, activeCard, workingLabel, working, confirmationFingerprints = [], onAnswer, onApprove, onDecline }: {
  disabled?: boolean;
  contextEpoch: string;
  threadId: string | null;
  ensureThread: () => Promise<string>;
  transcript: ReadonlyArray<PaigeLiveTranscriptTurn>;
  activeCard: LiveConversationCard | null;
  workingLabel?: string | null;
  working: boolean;
  confirmationFingerprints?: string[];
  onAnswer: (answer: string) => void;
  onApprove: (fingerprints: string[]) => void;
  onDecline: (fingerprints: string[]) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stageWindowRef = useRef<Window | null>(null);
  const previousEpochRef = useRef(contextEpoch);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LiveSurfaceState>("checking");
  const [muted, setMuted] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [availability, setAvailability] = useState("PROOF OWED");
  const [explanation, setExplanation] = useState("Live audio setup is being verified. Paige will not request microphone access until it is authorized.");
  const [portalDocument, setPortalDocument] = useState<Document | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const closeStage = useCallback((kind: "minimize" | "end") => {
    if (sessionId) void transitionPaigeLiveConversation(sessionId, kind).catch(() => undefined);
    const child = stageWindowRef.current;
    stageWindowRef.current = null;
    if (child && !child.closed) child.close();
    setOpen(false);
    setPortalDocument(null);
    setAnnouncement(kind === "end" ? "Live Conversation ended. The Paige chat is unchanged." : "Live Conversation minimized. Returned to the same Paige conversation.");
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, [sessionId]);

  useEffect(() => {
    if (!open) return;
    const ownerDocument = triggerRef.current?.ownerDocument ?? document;
    setPortalDocument(ownerDocument);
  }, [open]);

  useEffect(() => {
    if (!open || !portalDocument) return;
    requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
  }, [open, portalDocument]);

  useEffect(() => {
    if (!open || !working) return;
    setState("thinking");
  }, [open, working]);

  useEffect(() => {
    if (previousEpochRef.current === contextEpoch) return;
    previousEpochRef.current = contextEpoch;
    if (open) closeStage("end");
  }, [closeStage, contextEpoch, open]);

  const begin = async () => {
    if (!PAIGE_LIVE_CONVERSATION_ENABLED || disabled) return;
    setOpen(true);
    setState("checking");
    setExplanation("Paige is checking whether live audio is authorized for this workspace.");
    try {
      const resolvedThread = threadId ?? await ensureThread();
      const ownerWindow = triggerRef.current?.ownerDocument.defaultView;
      const entryMode: PaigeLiveEntryMode = ownerWindow && ownerWindow !== window ? "existing-popout" : "embedded";
      const result = await startPaigeLiveConversation({ threadId: resolvedThread, contextEpoch, entryMode });
      setSessionId(result.sessionId);
      setAvailability(result.availability);
      setExplanation(result.explanation);
      setState(result.code === "microphone_permission_denied" ? "permission-denied" : "unavailable");
      setAnnouncement(`${result.availability}. ${result.explanation}`);
    } catch (error) {
      setAvailability("UNAVAILABLE");
      setState("unavailable");
      setExplanation(error instanceof Error && error.message === "session_expired"
        ? "Your session expired. Sign in again, then return to this conversation."
        : "Paige could not verify live audio availability. Nothing was recorded or sent. Try again or continue in chat.");
    }
  };

  const retry = async () => {
    if (sessionId) await transitionPaigeLiveConversation(sessionId, "retry").catch(() => undefined);
    await begin();
  };

  const toggleHold = () => {
    const next = state === "held" ? "unavailable" : "held";
    setState(next);
    setAnnouncement(next === "held" ? "Live Conversation is on hold." : "Live Conversation resumed. Audio remains unavailable until setup is verified.");
    if (sessionId) void transitionPaigeLiveConversation(sessionId, next === "held" ? "hold" : "resume").catch(() => undefined);
  };

  const openInWindow = () => {
    const child = window.open("", "paige-live-conversation", "popup,width=960,height=760,resizable=yes");
    if (!child) { setAnnouncement("Your browser blocked the live window. Allow pop-ups and try again."); return; }
    child.document.title = "Live Conversation with Paige";
    child.document.head.replaceChildren(...Array.from(document.head.querySelectorAll('link[rel="stylesheet"],style')).map((node) => node.cloneNode(true)));
    child.document.documentElement.className = document.documentElement.className;
    for (const attribute of ["data-pg", "data-theme"]) {
      const value = document.documentElement.getAttribute(attribute);
      if (value) child.document.documentElement.setAttribute(attribute, value);
    }
    child.document.documentElement.style.colorScheme = getComputedStyle(document.documentElement).colorScheme;
    child.document.body.className = document.body.className;
    child.document.body.replaceChildren();
    child.document.body.style.margin = "0";
    child.document.body.style.height = "100vh";
    child.document.body.style.overflow = "hidden";
    stageWindowRef.current = child;
    child.addEventListener("beforeunload", () => {
      if (stageWindowRef.current !== child) return;
      stageWindowRef.current = null;
      setPortalDocument(document);
      requestAnimationFrame(() => stageRef.current?.focus());
    }, { once: true });
    setPortalDocument(child.document);
    setAnnouncement("Live Conversation moved to its companion window. Your platform page remains behind it.");
  };

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeStage("minimize"); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(stageRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    if (!focusable.length) { event.preventDefault(); stageRef.current?.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = portalDocument?.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  };

  const lastTurns = useMemo(() => transcript.filter((turn) => turn.content.trim()).slice(-8), [transcript]);
  const controlsDisabled = state === "unavailable" || state === "checking" || state === "permission-denied" || state === "reconnecting";
  const stage = open && portalDocument ? createPortal(
    <div className="plc-stage" role="dialog" aria-modal="true" aria-labelledby="plc-title" aria-describedby="plc-description" ref={stageRef} tabIndex={-1} onKeyDown={trapFocus}>
      <header className="plc-stage__header">
        <div className="plc-stage__identity"><PaigeCommandMark plated={false} label={null} className="h-8 w-8" /><div><strong id="plc-title">Live Conversation with Paige</strong><span>Same workspace · same conversation</span></div></div>
        <div className="plc-stage__header-actions">
          {portalDocument === document && <Button variant="ghost" size="sm" onClick={openInWindow}><ExternalLink aria-hidden />Open in window</Button>}
          <Button variant="ghost" size="sm" onClick={() => closeStage("minimize")}><Minimize2 aria-hidden />Minimize</Button>
          <Button variant="ghost" size="icon" aria-label="End Live Conversation" onClick={() => closeStage("end")}><X aria-hidden /></Button>
        </div>
      </header>
      <main className="plc-stage__main">
        <section className="plc-presence" aria-label={`Paige is ${STATE_LABEL[state].toLowerCase()}`} data-live-state={state}>
          <div className="plc-orb" aria-hidden><span className="plc-orb__halo" /><PaigeCommandMark plated={false} animated={!controlsDisabled} className="plc-orb__mark" /></div>
          <p className="plc-state"><span />{STATE_LABEL[state]}</p>
          <p id="plc-description" className="plc-context">Working in this exact Paige thread. Nothing here creates a second assistant or a separate memory.</p>
          <div className="plc-working" aria-live="polite"><span>Paige is working on</span><strong>{working ? (workingLabel || "your current request") : "No active work"}</strong></div>
          {(state === "unavailable" || state === "permission-denied" || state === "reconnecting") && (
            <div className="plc-notice" role="status"><strong>{availability}</strong><p>{explanation}</p><Button variant="outline" size="sm" onClick={() => void retry()}><RefreshCw aria-hidden />Retry setup check</Button></div>
          )}
        </section>
        <section className="plc-workspace" aria-label="Live conversation workspace">
          <div className="plc-transcript" aria-label="Conversation transcript" aria-live="polite">
            <div className="plc-section-title"><span>Transcript</span><small>Same Paige conversation</small></div>
            {lastTurns.length ? lastTurns.map((turn) => <div key={turn.id} className={cn("plc-turn", turn.role === "user" && "plc-turn--owner")}><span>{turn.role === "user" ? "You" : "Paige"}</span><p>{turn.content}</p></div>) : <p className="plc-empty">Your conversation will remain here. Audio has not started.</p>}
          </div>
          <div className="plc-card-layer" aria-label="Current conversation card">
            <div className="plc-section-title"><span>On screen</span><small>One current object at a time</small></div>
            {activeCard ? <ConversationCard card={activeCard} disabled={working} canConfirm={confirmationFingerprints.length > 0} onAnswer={onAnswer} onApprove={() => onApprove(confirmationFingerprints)} onDecline={() => onDecline(confirmationFingerprints)} /> : <div className="plc-empty-card"><PaigeCommandMark plated={false} label={null} className="h-7 w-7" /><p>No card is needed right now.</p><span>Paige will put a real question, choice, plan, evidence, action, or recap here when it helps the conversation.</span></div>}
          </div>
        </section>
      </main>
      <footer className="plc-controls" aria-label="Live Conversation controls">
        <Button variant="outline" disabled={controlsDisabled} aria-pressed={muted} onClick={() => setMuted((value) => !value)}>{muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}{muted ? "Unmute" : "Mute"}</Button>
        <Button variant="outline" disabled={controlsDisabled} aria-pressed={state === "held"} onClick={toggleHold}><CirclePause aria-hidden />{state === "held" ? "Resume" : "Hold"}</Button>
        <Button variant="outline" disabled={controlsDisabled} onClick={() => { setState("interrupted"); setAnnouncement("Paige stopped speaking. You can continue."); }}><Hand aria-hidden />Interrupt</Button>
        <Button variant="outline" onClick={() => closeStage("minimize")}><Minimize2 aria-hidden />Minimize</Button>
        <Button variant="destructive" onClick={() => closeStage("end")}><PhoneOff aria-hidden />End</Button>
      </footer>
      <p className="sr-only" aria-live="assertive">{announcement}</p>
    </div>, portalDocument.body) : null;

  return <><Button ref={triggerRef} type="button" variant="outline" size="sm" className="plc-trigger" disabled={disabled || !PAIGE_LIVE_CONVERSATION_ENABLED} onClick={() => void begin()} aria-haspopup="dialog" aria-expanded={open}><Volume2 aria-hidden />Talk live with Paige</Button>{stage}<span className="sr-only" aria-live="polite">{announcement}</span></>;
}
