import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CirclePause, ClipboardCheck, Pause, Play, Sparkles, Square, SquareCheck, X } from "lucide-react";
import type { ChatRailApi } from "@/components/dashboard/PaigeAIChat";
import {
  paigeIntentfulInterview,
  type InterviewFact,
  type InterviewFocusPath,
  type InterviewSession,
  type InterviewState,
} from "./data/paigeIntentfulInterview";

type Question = { fieldKey: string; label: string; prompt: string; use: string };

const PATHS: Array<{ id: InterviewFocusPath; label: string; description: string; questions: Question[] }> = [
  {
    id: "business_foundation",
    label: "Business foundation",
    description: "Name the business, its market, and who it is built to serve.",
    questions: [
      { fieldKey: "publicName", label: "Business name", prompt: "What name should Paige use for this business?", use: "Paige Brief business identity" },
      { fieldKey: "industry", label: "Industry", prompt: "What industry or category best describes the business?", use: "Paige Brief planning context" },
      { fieldKey: "idealCustomer", label: "Ideal customer", prompt: "Who is the ideal customer, in your own words?", use: "Paige Brief customer context" },
    ],
  },
  {
    id: "strategy",
    label: "Annual and quarterly strategy",
    description: "Clarify direction, near-term goals, and the definition of success.",
    questions: [
      { fieldKey: "annualDirection", label: "Annual direction", prompt: "What direction should the business move in over the next year?", use: "Paige Brief annual planning context" },
      { fieldKey: "goals90Day", label: "90-day goals", prompt: "What matters most in the next 90 days?", use: "Paige Brief near-term planning context" },
      { fieldKey: "successDefinition", label: "Success definition", prompt: "How will you know this period was successful?", use: "Paige Brief planning checks" },
    ],
  },
  {
    id: "offers_clients",
    label: "Offers and clients",
    description: "Describe what you sell and who gets the strongest result.",
    questions: [
      { fieldKey: "offers", label: "Offers", prompt: "What are the main offers you want Paige to plan around?", use: "Paige Brief offer context" },
      { fieldKey: "idealCustomer", label: "Ideal customer", prompt: "Which clients are the best fit for those offers?", use: "Paige Brief customer context" },
      { fieldKey: "constraints", label: "Constraints", prompt: "What constraints should Paige respect when planning growth?", use: "Paige Brief planning guardrails" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    description: "Capture how work is delivered and the operating preferences Paige must respect.",
    questions: [
      { fieldKey: "deliveryModel", label: "Delivery model", prompt: "How is client work delivered today?", use: "Paige Brief operating context" },
      { fieldKey: "currentPriority", label: "Current priority", prompt: "What is the most important operating priority right now?", use: "Paige Brief planning priority" },
      { fieldKey: "doNotAssume", label: "Do not assume", prompt: "What should Paige never assume without checking with you?", use: "Paige Brief truth guardrail" },
    ],
  },
];

const emptyState: InterviewState = { eligibleForFirstUse: false, session: null };

function friendlyError(message: string): string {
  if (message.includes("SENSITIVE_FACT_REJECTED")) return "Remove credentials, private-document text, or copied authentication material before continuing.";
  if (message.includes("FACT_INVALID")) return "Keep this proposed fact to 800 characters and no more than eight lines.";
  if (message.includes("OWNER_REQUIRED")) return "Only the verified owner can save business context.";
  if (message.includes("REVISION_CONFLICT")) return "This working session changed elsewhere. Reloading the latest version is required.";
  if (message.includes("ACTIVE_ACCOUNT")) return "The active workspace changed. Nothing was saved.";
  return "The working session could not be verified. Nothing is being shown as saved.";
}

export function PaigeWorkingSessionCard({
  api,
  explicitOffer,
  accountEpoch,
  onFinished,
}: {
  api: ChatRailApi;
  explicitOffer: boolean;
  accountEpoch: string | null;
  onFinished?: () => void;
}) {
  const [state, setState] = useState<InterviewState>(emptyState);
  const [path, setPath] = useState<InterviewFocusPath>("business_foundation");
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const loadGeneration = useRef(0);
  const pathRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const recapHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const resumeButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusTargetRef = useRef<"answer" | "recap" | "resume" | null>(null);
  const acceptedEpoch = useRef(accountEpoch);
  acceptedEpoch.current = accountEpoch;

  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const epoch = accountEpoch;
    try {
      const next = await paigeIntentfulInterview.get(null);
      if (!next || typeof next.eligibleForFirstUse !== "boolean") throw new Error("INTERVIEW_READ_INVALID");
      if (generation !== loadGeneration.current || acceptedEpoch.current !== epoch) return;
      setState(next);
      if (next.session) setPath(next.session.focusPath);
      setError(null);
    } catch (caught) {
      if (generation === loadGeneration.current && acceptedEpoch.current === epoch) setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally {
      if (generation === loadGeneration.current && acceptedEpoch.current === epoch) setLoaded(true);
    }
  }, [accountEpoch]);

  useEffect(() => {
    setState(emptyState);
    setLoaded(false);
    setReceipt(null);
    setSelected(new Set());
    setBusy(false);
    setError(null);
    setAnswer("");
    void refresh();
  }, [accountEpoch, refresh]);

  const session = state.session;
  const pathConfig = PATHS.find((item) => item.id === (session?.focusPath ?? path)) ?? PATHS[0];
  const recapPending = session?.stepKey === "recap_pending";
  const parsedStep = Number((session?.stepKey ?? "question_0").replace("question_", ""));
  const step = Number.isFinite(parsedStep) ? parsedStep : 0;
  const question = pathConfig.questions[Math.min(Math.max(step, 0), pathConfig.questions.length - 1)];
  const shouldOffer = !session && (explicitOffer || (state.eligibleForFirstUse && api.isFetched && api.threads.length === 0));
  useEffect(() => {
    const target = focusTargetRef.current;
    if (!target || !session) return;
    const node = target === "recap" ? recapHeadingRef.current : target === "resume" ? resumeButtonRef.current : answerRef.current;
    if (!node) return;
    focusTargetRef.current = null;
    node.focus();
  }, [api.activeThreadId, session?.revision, session?.status, session?.stepKey]);

  const begin = async (entrySource: "first_use" | "paige_brief") => {
    if (busy) return;
    setBusy(true); setError(null);
    const epoch = accountEpoch;
    try {
      const threadId = await api.ensureActiveThread("Business working interview");
      if (acceptedEpoch.current !== epoch) return;
      await paigeIntentfulInterview.start(threadId, entrySource, path);
      if (acceptedEpoch.current !== epoch) return;
      await refresh();
    } catch (caught) {
      if (acceptedEpoch.current === epoch) setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally { if (acceptedEpoch.current === epoch) setBusy(false); }
  };

  const update = async (event: "pause" | "resume" | "recap" | "skip" | "end", stepKey = session?.stepKey ?? null) => {
    if (!session || busy) return;
    setBusy(true); setError(null);
    const epoch = accountEpoch;
    try {
      const next = await paigeIntentfulInterview.update(session, event, stepKey);
      if (acceptedEpoch.current !== epoch) return;
      if (event === "pause") focusTargetRef.current = "resume";
      else if (event === "resume") focusTargetRef.current = "answer";
      else if (event === "recap") focusTargetRef.current = "recap";
      setState((current) => ({ ...current, session: next }));
      if (event === "skip" || event === "end") onFinished?.();
    } catch (caught) {
      if (acceptedEpoch.current === epoch) setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally { if (acceptedEpoch.current === epoch) setBusy(false); }
  };

  const skipOffer = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    const epoch = accountEpoch;
    try {
      const threadId = await api.ensureActiveThread("Business working interview");
      if (acceptedEpoch.current !== epoch) return;
      const started = await paigeIntentfulInterview.start(threadId, explicitOffer ? "paige_brief" : "first_use", path);
      const latest = await paigeIntentfulInterview.get(threadId);
      if (acceptedEpoch.current !== epoch) return;
      if (latest.session) await paigeIntentfulInterview.update(latest.session, "skip", null);
      else if (!started.id) throw new Error("INTERVIEW_NOT_FOUND");
      await refresh();
      onFinished?.();
    } catch (caught) {
      if (acceptedEpoch.current === epoch) setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally { if (acceptedEpoch.current === epoch) setBusy(false); }
  };

  const submitAnswer = async () => {
    if (!session || !answer.trim() || busy) return;
    setBusy(true); setError(null);
    const epoch = accountEpoch;
    try {
      const last = step >= pathConfig.questions.length - 1;
      const next = await paigeIntentfulInterview.update(
        session,
        "answer",
        last ? "recap" : `question_${step + 1}`,
        { fieldKey: question.fieldKey, value: answer.trim() },
      );
      if (acceptedEpoch.current !== epoch) return;
      focusTargetRef.current = last ? "recap" : "answer";
      setState((current) => ({ ...current, session: next }));
      setAnswer("");
      if (last) setSelected(new Set());
    } catch (caught) {
      if (acceptedEpoch.current === epoch) setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally { if (acceptedEpoch.current === epoch) setBusy(false); }
  };

  const confirm = async () => {
    if (!session || selected.size === 0 || busy) return;
    setBusy(true); setError(null);
    const epoch = accountEpoch;
    try {
      const result = await paigeIntentfulInterview.confirm(session, [...selected]);
      if (acceptedEpoch.current !== epoch) return;
      setReceipt(result.receipt);
      setState((current) => current.session ? { ...current, session: { ...current.session, status: "completed", revision: result.revision } } : current);
      onFinished?.();
    } catch (caught) {
      if (acceptedEpoch.current === epoch) setError(friendlyError(caught instanceof Error ? caught.message : ""));
    } finally { if (acceptedEpoch.current === epoch) setBusy(false); }
  };

  if (!loaded) return <div className="pws-card pws-state" role="status">Checking for an active working session…</div>;
  if (!session && !shouldOffer && !error) return null;

  if (!session && shouldOffer) {
    return (
      <section className="pws-card" aria-labelledby="pws-offer-title">
        <div className="pws-heading"><span className="pws-icon"><Sparkles aria-hidden size={17} /></span><div><small>OPTIONAL WORKING SESSION</small><h3 id="pws-offer-title">Would you like me to help build your business brief through a short working interview?</h3></div></div>
        <p>I’ll ask a few focused questions so your future plans can use owner-confirmed business context. Nothing becomes a saved fact until you select it in the recap.</p>
        <div className="pws-paths" role="radiogroup" aria-label="Interview focus">
          {PATHS.map((item, index) => <button key={item.id} ref={(node) => { pathRefs.current[index] = node; }} type="button" role="radio" aria-checked={path === item.id} tabIndex={path === item.id ? 0 : -1} className={path === item.id ? "is-selected" : ""} onClick={() => setPath(item.id)} onKeyDown={(event) => { if (!(event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End")) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? PATHS.length - 1 : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + PATHS.length) % PATHS.length; setPath(PATHS[next].id); pathRefs.current[next]?.focus(); }}><strong>{item.label}</strong><span>{item.description}</span></button>)}
        </div>
        {error && <p className="pws-error" role="alert">{error}</p>}
        <div className="pws-actions"><button type="button" className="pws-secondary" disabled={busy} onClick={() => void skipOffer()}>Skip</button><button type="button" className="pws-primary" disabled={busy} onClick={() => void begin(explicitOffer ? "paige_brief" : "first_use")}><Play aria-hidden size={14} />{busy ? "Starting…" : "Start interview"}</button></div>
      </section>
    );
  }

  if (!session) return error && explicitOffer ? <div className="pws-card pws-error" role="alert">{error}</div> : null;

  if (session.status === "skipped" || session.status === "ended") return null;

  if (session.status === "completed" || receipt) {
    if (api.activeThreadId !== session.threadId) return null;
    return <section className="pws-card pws-success"><div className="pws-heading"><SquareCheck aria-hidden size={18} /><div><small>VERIFIED</small><h3>Selected facts were saved to Paige Brief.</h3></div></div><p>The canonical Setup record was read back after the owner-authorized save. Unselected points were not saved.</p><details><summary>Receipt</summary><dl><div><dt>Saved to</dt><dd>{typeof receipt?.canonicalOwner === "string" ? receipt.canonicalOwner : "Paige Brief"}</dd></div><div><dt>Facts saved</dt><dd>{typeof receipt?.selectedCount === "number" ? receipt.selectedCount : selected.size}</dd></div><div><dt>Verified outcome</dt><dd>Canonical readback matched</dd></div><div><dt>Rail evidence</dt><dd>{receipt?.railRecorded === true ? "Recorded" : "Verification unavailable"}</dd></div><div><dt>Verified at</dt><dd>{typeof receipt?.verifiedAt === "string" ? new Date(receipt.verifiedAt).toLocaleString() : "Just now"}</dd></div></dl></details></section>;
  }

  if (session.status === "paused" || api.activeThreadId !== session.threadId) {
    return <section className="pws-card"><div className="pws-heading"><CirclePause aria-hidden size={18} /><div><small>READY TO RESUME</small><h3>Your {pathConfig.label.toLowerCase()} interview is ready to continue.</h3></div></div><p>Your place is saved as workflow state in this account. It is not business truth or Memory.</p>{error && <p className="pws-error" role="alert">{error}</p>}<div className="pws-actions"><button type="button" className="pws-secondary" disabled={busy} onClick={() => void update("end")}>End session</button><button ref={resumeButtonRef} type="button" className="pws-primary" disabled={busy} onClick={() => { focusTargetRef.current = "answer"; if (api.activeThreadId !== session.threadId) api.onSelect(session.threadId); if (session.status === "paused") void update("resume"); }}><Play aria-hidden size={14} />Resume</button></div></section>;
  }

  if (recapPending) {
    return <section className="pws-card"><div className="pws-heading"><ClipboardCheck aria-hidden size={18} /><div><small>RECAP READY</small><h3>Your answers are ready to review.</h3></div></div><p>Your last answer was preserved. Continue to the selective recap; nothing is canonical yet.</p>{error && <p className="pws-error" role="alert">{error}</p>}<div className="pws-actions"><button type="button" className="pws-secondary" disabled={busy} onClick={() => void update("end")}>Save none and end</button><button type="button" className="pws-primary" disabled={busy} onClick={() => void update("recap", "recap")}>Review recap</button></div></section>;
  }

  if (session.status === "recap") {
    const facts = session.proposedFacts.filter((fact) => fact.state === "proposed");
    return (
      <section className="pws-card" aria-labelledby="pws-recap-title">
        <div className="pws-heading"><ClipboardCheck aria-hidden size={18} /><div><small>SELECTIVE RECAP</small><h3 id="pws-recap-title" ref={recapHeadingRef} tabIndex={-1}>Choose which points may enter Paige Brief.</h3></div></div>
        <p>Each item is independent. Unchecked points stay only in this working session and do not become canonical context, Mind, or Memory.</p>
        <div className="pws-facts">
          {facts.map((fact: InterviewFact) => {
            const checked = selected.has(fact.id);
            return <label key={fact.id} className={checked ? "is-selected" : ""}><input className="sr-only" type="checkbox" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); checked ? next.delete(fact.id) : next.add(fact.id); return next; })} /><span className="pws-check">{checked ? <SquareCheck aria-hidden size={17} /> : <Square aria-hidden size={17} />}</span><span><strong>{fact.label}</strong><span>{fact.value}</span><small>Canonical owner: Paige Brief</small></span></label>;
          })}
        </div>
        {error && <p className="pws-error" role="alert">{error}</p>}
        <div className="pws-actions"><button type="button" className="pws-secondary" disabled={busy} onClick={() => void update("end")}>Save none and end</button><button type="button" className="pws-primary" disabled={busy || selected.size === 0} onClick={() => void confirm()}><Check aria-hidden size={14} />{busy ? "Verifying…" : `Save ${selected.size || ""} selected`}</button></div>
      </section>
    );
  }


  return (
    <section className="pws-card" aria-labelledby="pws-question-title">
      <div className="pws-heading"><Sparkles aria-hidden size={18} /><div><small>{pathConfig.label.toUpperCase()} · {Math.min(step + 1, pathConfig.questions.length)} OF {pathConfig.questions.length}</small><h3 id="pws-question-title">{question.prompt}</h3></div></div>
      <p>Why I’m asking: this answer can become <strong>{question.use}</strong> if you select it in the recap.</p>
      <label className="pws-answer"><span>Your answer</span><textarea ref={answerRef} value={answer} maxLength={800} onChange={(event) => setAnswer(event.target.value)} placeholder="Answer in your own words. Don’t include passwords, credentials, or private documents." /></label>
      {error && <p className="pws-error" role="alert">{error}</p>}
      <div className="pws-actions"><button type="button" className="pws-secondary" disabled={busy} onClick={() => void update("end")}><X aria-hidden size={14} />End</button><button type="button" className="pws-secondary" disabled={busy} onClick={() => void update("pause")}><Pause aria-hidden size={14} />Pause</button><button type="button" className="pws-primary" disabled={busy || !answer.trim()} onClick={() => void submitAnswer()}>{busy ? "Saving place…" : step >= pathConfig.questions.length - 1 ? "Review recap" : "Continue"}</button></div>
    </section>
  );
}
