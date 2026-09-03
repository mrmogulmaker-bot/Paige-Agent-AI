/* eslint-disable react-refresh/only-export-components -- Throwaway standalone mount owns its root rendering. */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Plug, X } from "lucide-react";
import "@/index.css";
import "@/components/tenant-shell/tenant-command-center-shell.css";
import "@/solo/solo-tokens.css";
import "@/solo/settings.css";
import "@/solo/settings-integrations.css";
import "./prototype.css";

type State = "attention" | "empty" | "connected" | "loading" | "refused" | "provider-error" | "unknown";
type Tab = "api" | "mcp";
type Pending = { workspace: string; epoch: number };
const API_PURPOSE = "Let Paige see the n8n workspace and its available workflows.";
const MCP_PURPOSE = "Let Paige use the n8n tools and workflows you explicitly authorize.";
const UNAVAILABLE = "OAuth setup is temporarily unavailable while the secure connection path is being completed.";
const OPTIONS: Array<[State, string]> = [["attention", "Saved / needs attention"], ["empty", "Not connected"], ["connected", "Connected fixture"], ["loading", "Loading"], ["refused", "Refused"], ["provider-error", "Provider unavailable"], ["unknown", "Unknown / unreadable"]];
function label(state: State, type: Tab) {
  if (state === "loading") return "Checking…";
  if (state === "unknown") return "Status unavailable";
  if (state === "connected") return "Connected";
  if (state === "empty") return "Not connected";
  return type === "api" ? "Needs attention" : "OAuth setup unavailable";
}
function tone(state: State) { return state === "connected" ? "ok" : ["attention", "refused", "provider-error"].includes(state) ? "warn" : "neutral"; }
function Status({ state, type }: { state: State; type: Tab }) { return <span className="ig-card-state" data-tone={tone(state)}><i aria-hidden />{label(state, type)}</span>; }

function App() {
  const params = new URLSearchParams(window.location.search);
  const [theme, setTheme] = useState(params.get("theme") === "light" ? "light" : "dark");
  const [reduce, setReduce] = useState(false);
  const [workspace, setWorkspace] = useState("Example workspace A");
  const [role, setRole] = useState("owner");
  const [api, setApi] = useState<State>("attention");
  const [mcp, setMcp] = useState<State>("refused");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("api");
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState("");
  const [key, setKey] = useState("");
  const [validation, setValidation] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const staleResponse = useRef<Pending | null>(null);
  const epoch = useRef(0);
  const [confirm, setConfirm] = useState<"api" | "mcp" | null>(null);
  const [guard, setGuard] = useState<"close" | Tab | null>(null);
  const [access, setAccess] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewNote, setReviewNote] = useState("Baseline: saved API needs attention; saved bearer MCP was rejected. OAuth remains blocked.");
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState("");
  const tile = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const discard = useRef<HTMLButtonElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const dirty = address.length > 0 || key.length > 0;

  useEffect(() => { document.documentElement.setAttribute("data-pg", theme); document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  useEffect(() => { document.documentElement.dataset.reviewReduced = String(reduce); }, [reduce]);
  useEffect(() => { if (open) close.current?.focus(); else tile.current?.focus(); }, [open]);
  useEffect(() => { if (guard) discard.current?.focus(); }, [guard]);
  useEffect(() => { if (confirm) panel.current?.querySelector<HTMLButtonElement>('[role="alertdialog"] button')?.focus(); }, [confirm]);
  useEffect(() => { if (editing && !guard) addressInput.current?.focus(); }, [editing, guard]);
  const resetDraft = () => { setAddress(""); setKey(""); setValidation(""); setEditing(false); setGuard(null); setConfirm(null); };
  const leave = (target: "close" | Tab) => {
    if (target === tab) return;
    if (dirty) { setGuard(target); return; }
    setGuard(null); setConfirm(null);
    if (target === "close") setOpen(false); else setTab(target);
  };
  const changeWorkspace = () => {
    staleResponse.current = pending;
    ++epoch.current; setPending(null); resetDraft(); setOpen(false); setAccess(false); setNotice("");
    setWorkspace(workspace === "Example workspace A" ? "Example workspace B" : "Example workspace A");
    setApi("empty"); setMcp("empty");
    setReviewNote("Workspace switched. Drafts and pending work were cleared; old completion cannot apply here.");
  };
  const deliver = (request: Pending | null, success: boolean) => {
    if (!request || request.workspace !== workspace || request.epoch !== epoch.current) { setReviewNote("Old response ignored: workspace or request epoch changed."); return; }
    ++epoch.current; setPending(null); setApi(success ? "connected" : "refused");
    setNotice(success ? "API connection checked. No workflows were found." : "The API health check was refused. Review the connection and try again.");
    setReviewNote("Simulated API response delivered. Paige tools state did not change.");
  };
  const keydown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); if (guard) { setGuard(null); addressInput.current?.focus(); } else if (confirm) setConfirm(null); else leave("close"); return; }
    if (event.key !== "Tab") return;
    const focusRoot = panel.current?.querySelector<HTMLElement>('[role="alertdialog"]') ?? panel.current;
    const all = Array.from(focusRoot?.querySelectorAll<HTMLElement>('button,input,select,textarea,[tabindex="0"]') ?? []).filter(el => !el.hasAttribute("disabled") && el.offsetParent !== null);
    if (!all.length) return;
    if (!focusRoot?.contains(document.activeElement)) { event.preventDefault(); all[0].focus(); }
    else if (event.shiftKey && document.activeElement === all[0]) { event.preventDefault(); all.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === all.at(-1)) { event.preventDefault(); all[0].focus(); }
  };
  const tabKeys = (event: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: Tab = event.key === "Home" ? "api" : event.key === "End" ? "mcp" : tab === "api" ? "mcp" : "api";
    leave(next);
    if (!dirty) requestAnimationFrame(() => document.getElementById(`nd-tab-${next}`)?.focus());
  };
  const summary = <div className="nd-summary" aria-label="Independent n8n connection states"><div><span>API connection</span><Status state={api} type="api" /></div><div><span>Paige tools (MCP)</span><Status state={mcp} type="mcp" /></div></div>;

  return <>
    <div data-tenant-shell data-nav="expanded" data-paige="closed">
      <nav className="tcs-nav" aria-label="Tenant workspace"><div className="tcs-nav-links" /></nav>
      <section className="tcs-canvas">
        <header className="tcs-command-row"><div className="tcs-context"><span>{workspace}</span></div></header>
        <main id="tenant-shell-main" className="tcs-main"><div className="paige-solo" data-theme={theme} style={{ height: "100%", minHeight: 0 }}><div style={{ display: "flex", height: "100%", overflow: "hidden" }}><main data-solo-screen-host style={{ flex: 1, overflow: "auto", minHeight: 0, minWidth: 0 }}>
          <div className="solo-settings"><header className="ss-page-head"><div><span>Solo settings</span><h1>Integrations</h1><p>External tools, bridges, and safe configuration handoffs.</p></div><span className="ss-truth" data-truth="PARTIAL">PARTIAL</span></header>
            <div className="ss-content" data-settings-tab="integrations"><div className="ss-integrations"><div className="ss-subtabs"><span className="ss-subtab" aria-current="page"><Plug size={14} />Integrations</span></div>
              <ul className="ig-grid"><li><button ref={tile} type="button" className="ig-card" data-provider="n8n" aria-haspopup="dialog" onClick={() => { setOpen(true); setTab("api"); setNotice(""); }}><span className="ss-provider-mark" data-provider-mark="n8n" aria-hidden>n8n</span><span className="ig-card-title"><strong>n8n</strong><small>Automation</small></span><span className="nd-tile-state"><span>API connection</span><Status state={api} type="api" /></span><span className="nd-tile-state"><span>Paige tools (MCP)</span><Status state={mcp} type="mcp" /></span></button></li></ul>
            </div></div>
          </div>
        </main></div></div></main>
      </section>
    </div>

    {open && <div className="ig-layer" onMouseDown={event => { if (event.target === event.currentTarget) leave("close"); }}>
      <aside className="ig-panel nd-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="nd-title" onKeyDown={keydown}>
        <header><span className="ss-provider-mark" data-provider-mark="n8n" aria-hidden>n8n</span><div><h2 id="nd-title">n8n</h2><span>API visibility and Paige tools</span></div><button ref={close} className="ig-close" aria-label="Close n8n" onClick={() => leave("close")}><X size={16} /></button></header>
        <div className="nd-overview">{summary}<div className="ss-segment nd-tabs" role="tablist" aria-label="n8n connections" onKeyDown={tabKeys}>{(["api", "mcp"] as Tab[]).map(value => <button id={`nd-tab-${value}`} key={value} role="tab" aria-selected={tab === value} aria-controls={`nd-panel-${value}`} tabIndex={tab === value ? 0 : -1} onClick={() => leave(value)}>{value === "api" ? "API connection" : "Paige tools (MCP)"}</button>)}</div></div>
        <div className="ig-panel-body">
          {guard && <div className="ig-confirm-close" role="alertdialog" aria-label="Discard unsaved API details"><p>You have unsaved API details. Discard them {guard === "close" ? "and close" : "and change tabs"}?</p><div className="ig-actions"><button ref={discard} className="ig-btn" data-danger onClick={() => { const target = guard; resetDraft(); if (target === "close") setOpen(false); else setTab(target); }}>Discard changes</button><button className="ig-btn" onClick={() => setGuard(null)}>Keep editing</button></div></div>}
          {tab === "api" ? <section id="nd-panel-api" role="tabpanel" aria-labelledby="nd-tab-api"><p className="ig-lede">{API_PURPOSE}</p>
            {api === "loading" ? <p className="ig-state" role="status">Checking the API connection…</p> : api === "unknown" ? <><p className="ig-error" role="alert">The API connection could not be read. Its status and workflow count are unavailable.</p><button className="ig-btn" onClick={() => { setApi("loading"); setReviewNote("API read retry: select a response fixture to finish."); }}>Try again</button></> : <>
              {!editing && <><dl className="ig-facts"><div><dt>API connection</dt><dd>{label(api, "api")}</dd></div><div><dt>Workflow visibility</dt><dd>{api === "connected" ? "0 workflows seen" : api === "empty" ? "Not connected" : "Unavailable until the API health check succeeds"}</dd></div><div><dt>Last check</dt><dd>{api === "connected" ? "3 September, 12:00" : api === "empty" ? "No check yet" : "3 September, 11:55 — unsuccessful"}</dd></div>{api !== "empty" && <><div><dt>Instance address</dt><dd className="ig-mono">https://example.invalid</dd></div><div><dt>API key</dt><dd>Stored</dd></div></>}</dl>
              {api === "attention" && <p className="ig-note">The API connection is saved, but the last health check failed. This does not describe Paige tools access.</p>}
              {api === "provider-error" && <p className="ig-error" role="alert">The provider could not be reached. Your saved API connection is still here.</p>}
              {api === "refused" && <p className="ig-error" role="alert">The API health check was refused. Check the API connection details and try again.</p>}
              {api === "connected" && <p className="ig-note">The API is connected and returned zero workflows. This is a valid empty result.</p>}</>}
              {pending ? <><p className="ig-state" role="status">Checking the saved API connection…</p><button className="ig-btn" onClick={() => { staleResponse.current = pending; ++epoch.current; setPending(null); setNotice("The check was cancelled. The previous saved state is preserved."); }}>Cancel check</button></> : editing ? <form className="ig-form" onSubmit={event => { event.preventDefault(); let valid = false; try { const url = new URL(address); valid = url.protocol === "https:" && !url.username && !url.password; } catch { valid = false; } if (!valid || !key) { setValidation("Use an HTTPS instance address and enter an API key."); return; } const next = { workspace, epoch: ++epoch.current }; setPending(next); staleResponse.current = next; setAddress(""); setKey(""); setEditing(false); setValidation(""); setNotice(""); setReviewNote("Local save is pending. Finish it using the separate review controls; no request left this browser."); }}>
                <label className="ig-field"><span>Instance address</span><input ref={addressInput} type="url" autoComplete="off" value={address} onChange={event => setAddress(event.target.value)} placeholder="https://your-instance.example" /></label><label className="ig-field"><span>API key</span><input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /><small>Used for API visibility. It does not authorize Paige tools.</small></label>{validation && <p className="ig-error" role="alert">{validation}</p>}<div className="ig-actions"><button className="ig-btn" data-primary type="submit">Save API connection</button><button className="ig-btn" type="button" onClick={() => { resetDraft(); setNotice("API edit cancelled. The saved connection was not changed."); }}>Cancel</button></div>
              </form> : role === "owner" && <div className="ig-actions"><button className="ig-btn" data-primary onClick={() => setEditing(true)}>{api === "empty" ? "Connect API" : api === "connected" ? "Edit API connection" : "Reconnect API"}</button>{api !== "empty" && <button className="ig-btn" onClick={() => setConfirm("api")}>Disconnect API</button>}</div>}
            </>}
            {["attention", "refused", "provider-error"].includes(api) && !editing && !pending && <div className="ig-actions"><button className="ig-btn" onClick={() => { setApi("loading"); setNotice(""); setReviewNote("API status refresh only: select an API response fixture to finish. No provider probe or authorization occurs."); }}>Refresh status</button></div>}
            {role !== "owner" && <p className="ig-note">You can view this connection. Changes require workspace permission.</p>}{notice && <p className="ig-note" role="status">{notice}</p>}
          </section> : <section id="nd-panel-mcp" role="tabpanel" aria-labelledby="nd-tab-mcp"><p className="ig-lede">{MCP_PURPOSE}</p>
            {mcp === "loading" ? <p className="ig-state" role="status">Checking Paige tools access…</p> : mcp === "unknown" ? <><p className="ig-error" role="alert">Paige tools access could not be read. Connection and approved-tool counts are unavailable.</p><button className="ig-btn" onClick={() => { setMcp("loading"); setReviewNote("MCP read retry: choose a response fixture to finish."); }}>Try again</button></> : <>
              <dl className="ig-facts"><div><dt>Paige tools</dt><dd>{label(mcp, "mcp")}</dd></div><div><dt>Connection method</dt><dd>{mcp === "connected" ? "OAuth" : mcp === "empty" ? "Not configured" : "Saved bearer configuration — not OAuth"}</dd></div><div><dt>Approved tools</dt><dd>{mcp === "connected" ? "1 approved tool" : mcp === "empty" ? "None approved" : "Unavailable"}</dd></div>{mcp === "connected" && <div><dt>Tools found</dt><dd>2 at the last check</dd></div>}</dl>
              {mcp === "refused" && <p className="ig-error" role="alert">The saved MCP configuration was rejected. It does not give Paige working tools access.</p>}{mcp === "provider-error" && <p className="ig-error" role="alert">The MCP provider could not be reached. Tools availability is unverified.</p>}
              <p className="ig-note">{UNAVAILABLE}</p>
              {mcp === "connected" ? <><div className="ig-actions"><button className="ig-btn" onClick={() => setAccess(!access)} aria-expanded={access}>Manage access</button>{role === "owner" && <button className="ig-btn" onClick={() => setConfirm("mcp")}>Disconnect Paige tools</button>}</div>{access && <div className="ig-facts nd-access"><p>1 approved read-only tool</p><p>Approved workflow count: unavailable</p><p>Workflow discovery</p><p>Approval details are read-only here. No workflow will run.</p></div>}</> : mcp !== "empty" && role === "owner" && <div className="ig-actions"><button className="ig-btn" onClick={() => setConfirm("mcp")}>Remove saved MCP connection</button></div>}
            </>}
            {["attention", "refused", "provider-error"].includes(mcp) && <div className="ig-actions"><button className="ig-btn" onClick={() => { setMcp("loading"); setReviewNote("MCP status refresh only: select an MCP response fixture to finish. No provider probe or authorization occurs."); }}>Refresh status</button></div>}
            {role !== "owner" && <p className="ig-note">You can view tools access. Changes require workspace permission.</p>}
          </section>}
          {confirm && <div className="ig-confirm-close" role="alertdialog" aria-label={`Confirm ${confirm === "api" ? "API disconnect" : "MCP removal"}`}><p>{confirm === "api" ? "Disconnect the API connection? Paige tools access will stay unchanged." : "Remove this saved MCP connection? The API connection will stay unchanged."}</p><div className="ig-actions"><button className="ig-btn" data-danger onClick={() => { if (confirm === "api") { setApi("empty"); setNotice("API connection disconnected."); } else { setMcp("empty"); setAccess(false); } setConfirm(null); }}>Confirm {confirm === "api" ? "disconnect" : "removal"}</button><button className="ig-btn" onClick={() => setConfirm(null)}>Keep connection</button></div></div>}
        </div>
        <footer><span>API visibility and Paige tools authorization are separate.</span></footer>
      </aside>
    </div>}

    <details className="nd-review"><summary>Prototype review · local fixtures</summary><div className="nd-review-body"><p>Throwaway design review. All states, dates, counts and actions below are synthetic. Nothing is sent or stored externally.</p>
      <label>API fixture<select value={api} onChange={event => { ++epoch.current; setApi(event.target.value as State); setPending(null); resetDraft(); setNotice(""); }}>{OPTIONS.map(([value, text]) => <option value={value} key={value}>{value === "connected" ? "Verified API check (fixture)" : text}</option>)}</select></label>
      {api === "connected" && <p className="nd-review-warning">Verified API check fixture only. A stored connected flag or old timestamp does not prove a successful current check.</p>}
      <label>MCP fixture<select value={mcp} onChange={event => { setMcp(event.target.value as State); setAccess(false); setConfirm(null); }}>{OPTIONS.map(([value, text]) => <option value={value} key={value}>{value === "connected" ? "Future OAuth fixture — not released" : text}</option>)}</select></label>
      {mcp === "connected" && <p className="nd-review-warning">Future source-shaped OAuth fixture. This is not released or verified OAuth functionality.</p>}
      <label>Role<select value={role} onChange={event => { resetDraft(); ++epoch.current; setPending(null); setRole(event.target.value); }}><option value="owner">Owner</option><option value="viewer">Viewer</option></select></label>
      <label>Theme<select value={theme} onChange={event => setTheme(event.target.value)}><option value="dark">Dark</option><option value="light">Light</option></select></label><label className="nd-check"><input type="checkbox" checked={reduce} onChange={event => setReduce(event.target.checked)} />Reduced motion</label>
      <div className="nd-review-actions"><button onClick={changeWorkspace}>Switch workspace</button><button disabled={!pending} onClick={() => deliver(pending, true)}>Finish API success</button><button disabled={!pending} onClick={() => deliver(pending, false)}>Finish API refusal</button><button onClick={() => deliver(staleResponse.current, true)}>Deliver old response</button></div>
      <p role="status">{reviewNote}</p><p>Drawer 200ms entry, immediate tabs, no browser vibration. Escape and backdrop guard dirty drafts; Tab stays in drawer; arrow keys change tabs. Target viewports: 1536×770, 1366×768, 1024×768, 900×1000.</p>
      <label>Review notes<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Flow changes or approval notes" /></label><div className="nd-review-actions">{["Approve", "Revise", "Reject"].map(item => <button key={item} onClick={() => setDecision(item)}>{item}</button>)}</div><p role="status">{decision ? `${decision} — recorded locally for this review only.` : "No review decision recorded."}</p>
    </div></details>
  </>;
}
if (!import.meta.env.DEV) throw new Error("Prototype host is development-only");
createRoot(document.getElementById("root")!).render(<App />);
