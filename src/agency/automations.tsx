// @ts-nocheck
// Agency pack — Automations screen. Faithful port of the Claude Design "CRM agency
// mode" pack Automations view (owner-locked 2026-08-17, §28/§63 — "We do not drift
// off this whatsoever"), mirroring the Solo port (src/solo/automations.tsx +
// automations-build.tsx) and the sibling agency modules (CommandCenter / TeamBlock).
//
// Source of truth: "Agency Shell.dc.html" — the `autos` view (its three sub-tabs:
// auIsLibrary Automations / auIsRuns Runs / auIsBuild Build), the agency↔book↔
// per-sub-account ScopeSeg (auShowScopes/auScopes), the per-sub-account picker
// (auShowPicker/auPicker), and the FOUR pop-outs this screen owns: the Automation
// detail modal (auDetailOpen), the Run-trace detail modal (auRunOpen), the Build
// draft modal (auDraftOpen), and the "Her read" health rail modal (auRailOpen). The
// DCLogic runtime is NOT ported — its markup, measurements, copy and interaction are
// mirrored onto React + the ./_shared primitives (Modal carries portal/focus-trap/
// Esc/reduced-motion; ScopeSeg is the ink-fill gated agency↔book↔sub toggle).
//
// PORT NOTES (§13 honesty):
//  • Every color is token-driven (var(--…)) so the screen themes light↔dark under
//    `.paige-agency[data-theme]` (§23) — the design's literal hex maps onto the
//    agency-tokens.css scale; status accents (Live/Broken/Failed, tier dots) keep
//    their semantic marks (--ok/--warn/--bad/--gold).
//  • The design's filter chips (auFilters / auRunFilters) are rendered as real,
//    working filters over the fixture rows — the design highlights them as state;
//    the Solo port filters, and filtering is the honest intent of a filter chip.
//    The 24h/7d/30d range control is a cosmetic segment (no per-range fixtures),
//    kept as a highlight-only control exactly as the design drives it.
//  • The design's health rail renders INLINE on wide viewports and collapses to a
//    "Her read →" button opening auRailOpen on narrow. This port has no width probe,
//    so the rail renders inline AND a header "Her read" button opens the same modal
//    — so the required auRailOpen pop-out exists and is reachable (the CommandCenter
//    kanban pattern). The short-height "All list" overflow modals (auAllOpen/
//    auRunsAllOpen), which only exist under a mainH<620 probe, are not ported — the
//    lists scroll instead, matching the Solo port.
//
// §51: when isAgency===false (a standalone sub-account) this screen shows ONLY the
// sub's own book — the agency↔book↔sub ScopeSeg, the per-sub-account picker, the
// book aggregate KPIs/tenant tags, and the observe-a-sub (readOnly) mode are ALL
// gated behind isAgency and are structurally absent. A standalone sub sees only its
// own rules, runs and build. When agency is acting-as a sub, scope locks to that
// sub's own view (no cross-book toggle), per the design.
import React from "react";
import { Ic, Modal, ScopeSeg } from "./_shared";
import { AUTO_TABS, AUTOMATIONS, AUTO_RUNS, AUTO_TEMPLATES, AUTO_BUILD, TEAM_SUBS, AGENCY } from "./fixtures";

const GOLD_BG = "var(--gold-bright)";
const GOLD_INK = "#241C05";

// tier → chip + dot tokens (design tierOf, token-mapped).
const tierOf = t => t === "auto"
  ? { label: "Auto", bg: "var(--ok-tint)", color: "var(--ok)", dot: "var(--ok)" }
  : t === "confirm"
    ? { label: "Confirm", bg: "var(--warn-tint)", color: "var(--warn)", dot: "var(--gold)" }
    : { label: "Off", bg: "var(--surface-sunk)", color: "var(--ink-3)", dot: "var(--ink-3)" };

// automation status → chip tokens.
const statusOf = s => s === "Live"
  ? { bg: "var(--ok-tint)", color: "var(--ok)" }
  : s === "Broken"
    ? { bg: "var(--bad-tint)", color: "var(--bad)" }
    : { bg: "var(--surface-sunk)", color: "var(--ink-2)" };

// run status → chip tokens.
const runStatusOf = s => s === "Failed"
  ? { bg: "var(--bad-tint)", color: "var(--bad)" }
  : s === "Awaiting approval"
    ? { bg: "var(--warn-tint)", color: "var(--warn)" }
    : { bg: "var(--ok-tint)", color: "var(--ok)" };

// Static draft the Build tab surfaces (design auDraft — screen-local, not a fixture).
const DRAFT = {
  name: "Dunning · two-fail retry with escalation",
  dept: "Finance", tier: "Confirm",
  trigger: "Card fails twice, then wait 24 hours",
  action: "Send the standard three-message retry, flag you in chat on a third failure",
  note: "Filed under Finance on confirm. I'll suggest promoting it after thirty clean runs."
};

const goldBtn = (extra) => ({ display: "flex", alignItems: "center", gap: 8, padding: "10px 17px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13.5, fontWeight: 600, cursor: "pointer", border: "none", whiteSpace: "nowrap", ...extra });
const ghostBtn = (extra) => ({ padding: "10px 15px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, color: "var(--ink-2)", cursor: "pointer", ...extra });

// ── AutomationsHub (root screen) ──────────────────────────────────────────────
// Props from the AgencyApp shell: { isAgency, acting, openAsk }.
const noop = () => {};
const AutomationsHub = ({ isAgency = true, acting = null, openAsk = noop }) => {
  const [tab, setTab] = React.useState("library");            // library | runs | build
  const [scopeState, setScopeState] = React.useState("agency"); // agency | book | sub
  const [tSub, setTSub] = React.useState(0);                  // picked sub-account index (readOnly)
  const [libFilter, setLibFilter] = React.useState("All");
  const [runFilter, setRunFilter] = React.useState("All");
  const [range, setRange] = React.useState("7d");
  // pop-out state (the four the task requires)
  const [detail, setDetail] = React.useState(null); // automation index | null → auDetailOpen
  const [run, setRun] = React.useState(null);        // run index | null       → auRunOpen
  const [draftOpen, setDraftOpen] = React.useState(false); // → auDraftOpen
  const [railOpen, setRailOpen] = React.useState(false);   // → auRailOpen

  const tabDef = AUTO_TABS.find(t => t.key === tab) || AUTO_TABS[0];
  // §51: cross-book scope only exists in agency mode and never while acting-as a sub.
  const showScopes = isAgency && !acting;
  // Effective scope: locked to 'agency' unless the agency is explicitly picking one,
  // and clamped to what THIS tab allows (Build has no Book scope).
  const scopeRaw = showScopes ? scopeState : "agency";
  const scope = tabDef.scopes.indexOf(scopeRaw) < 0 ? "agency" : scopeRaw;
  const readOnly = scope === "sub";           // observing one sub-account (agency only)
  const showPicker = readOnly;                // auShowPicker
  const picked = TEAM_SUBS[tSub] || TEAM_SUBS[0];

  // tab switch (kept as a named handler so the tab strip reads cleanly).
  const goTab = k => setTab(k);

  // ── KPIs (design kpis) ──────────────────────────────────────────────────────
  const live = AUTOMATIONS.filter(a => a.status === "Live").length;
  const broken = AUTOMATIONS.filter(a => a.status === "Broken").length;
  const totalRuns = AUTOMATIONS.reduce((n, a) => n + a.runs, 0);
  const ran = AUTOMATIONS.filter(a => a.runs);
  const rate = ran.length ? Math.round(ran.reduce((n, a) => n + a.rate, 0) / ran.length) : 0;
  const kpis = scope === "book"
    ? [
        { label: "AUTOMATIONS ACROSS BOOK", value: "48", note: "in " + TEAM_SUBS.length + " sub-accounts" },
        { label: "RUNS THIS WEEK", value: "1,206", note: "every engine" },
        { label: "SUCCESS RATE", value: "93%", note: "book median", color: "var(--ok)" },
        { label: "NEED ATTENTION", value: "5", note: "broken or escalating", color: "var(--bad)" }
      ]
    : readOnly
      ? [
          { label: "THEIR AUTOMATIONS", value: "7", note: "configured by their owner" },
          { label: "RUNS THIS WEEK", value: "84", note: "in their workspace" },
          { label: "SUCCESS RATE", value: "96%", note: "last 7 days", color: "var(--ok)" },
          { label: "NEED ATTENTION", value: "1", note: "one broken condition", color: "var(--warn)" }
        ]
      : [
          { label: "ACTIVE", value: String(live), note: AUTOMATIONS.length + " configured" },
          { label: "RUNS TO DATE", value: String(totalRuns), note: "across five engines" },
          { label: "SUCCESS RATE", value: rate + "%", note: "last 7 days", color: "var(--ok)" },
          { label: "NEED ATTENTION", value: String(broken + 1), note: broken + " broken, 1 escalating", color: "var(--bad)" }
        ];

  // ── Rows (design rows — book shows a 4-row cross-tenant slice with owner tags) ─
  const baseRows = scope === "book" ? AUTOMATIONS.slice(0, 4) : AUTOMATIONS;
  const libChips = ["All", "Live", "Confirm tier", "Broken", "Paused"];
  const rowMatch = a => libFilter === "All"
    || (libFilter === "Live" && a.status === "Live")
    || (libFilter === "Confirm tier" && a.tier === "confirm")
    || (libFilter === "Broken" && a.status === "Broken")
    || (libFilter === "Paused" && a.status === "Paused");
  const rows = baseRows.map((a, i) => ({ a, idx: AUTOMATIONS.indexOf(a),
    tenant: scope === "book" ? TEAM_SUBS[i % TEAM_SUBS.length].name : null,
    tenantColor: scope === "book" ? TEAM_SUBS[i % TEAM_SUBS.length].color : null }))
    .filter(r => rowMatch(r.a));

  // ── Runs (design runs) ──────────────────────────────────────────────────────
  const runChips = ["All", "Failed", "Awaiting approval", "Auto-fired"];
  const runRows = AUTO_RUNS.map((r, i) => ({ r, idx: i,
    tenant: scope === "book" ? TEAM_SUBS[i % TEAM_SUBS.length].name : readOnly ? picked.name : null,
    tenantColor: scope === "book" ? TEAM_SUBS[i % TEAM_SUBS.length].color : readOnly ? picked.color : null }))
    .filter(x => runFilter === "All" || x.r.status === runFilter);

  // ── Health rail content (design auHealth / auRead — 3 variants) ──────────────
  const health = scope === "book"
    ? [
        { text: "Six sub-accounts run near-identical dunning rules. One template would replace all six and you'd own the wording.", cta: "Draft the template", edge: "var(--gold)" },
        { text: "Five automations across the book have not fired in 30 days. Three are waiting on triggers their owners retired.", cta: "Review the five", edge: "var(--warn)" }
      ]
    : readOnly
      ? [
          { text: picked.name + " has one automation with a broken condition. Their owner hasn't seen it — the fix is drafted in their name.", cta: "Propose the fix", edge: "var(--warn)" }
        ]
      : [
          { text: "Missed-call recovery has failed six days running. Its webhook target moved and I can repoint it in one edit.", cta: "Apply the fix", edge: "var(--bad)" },
          { text: "Quiet-account check-in has hit confirm 61 times without you changing a word. Worth promoting to auto.", cta: "Promote to auto", edge: "var(--gold)" },
          { text: "Renewal window opener has never fired since you paused it in June.", cta: "Resume or delete", edge: "var(--warn)" }
        ];
  const healthTitle = scope === "book" ? "Health across the book" : "Health signals";
  const read = scope === "book"
    ? "The book's automation health tracks with tier discipline, not volume — the four teams keeping everything on confirm have the highest success rate and the slowest response."
    : readOnly
      ? "Their rules are conservative: everything on confirm, nothing on auto. That's their owner's call, and it's why their response time sits above the book median."
      : "Two of your automations haven't fired in thirty days — one is waiting on a trigger you retired, the other has a broken condition I can fix in a single edit.";
  const ctaNote = "She'll run this the moment the automation registry ships — nothing fires from here yet.";
  const banner = "No automation registry exists yet — triggers, run history and cross-tenant roll-ups here are stand-ins, not platform records.";

  const title = tab === "library" ? "Automations" : tab === "runs" ? "Runs" : "Build";
  const subLine = tab === "library"
    ? "Every persistent rule she is running for you — one home, tune from here."
    : tab === "runs"
      ? "Every automation firing, every execution — one timeline across every engine."
      : "Tell her what you want automated. She drafts it, names it, and files it with the right autonomy tier.";
  const scopeNote = acting
    ? "This business's own rules — what fires for their clients, in their voice."
    : !isAgency
      ? "Your own rules — what fires for your clients, in your voice."
      : scope === "agency"
        ? "Your agency's own rules. Each sub-account's automations live in their workspace."
        : scope === "book"
          ? "Aggregate across the book. Observe patterns and propose templates — you can't edit their rules from here."
          : "You're observing " + picked.name + "'s automations. Changes go to their owner as a proposal.";
  const newCta = readOnly ? "Propose an automation" : "+ Build new";
  const buildContext = readOnly
    ? "Building for: " + picked.name + " · drafted in their voice"
    : acting
      ? "Building for: " + acting.name
      : !isAgency
        ? "Building for: your book"
        : "Building for: " + AGENCY.operator + " Agency";
  const starters = isAgency
    ? ["Automate my dunning sequence", "Send a welcome kit when a sub-account signs", "Flag me when a sub-account misses two calls", "Run my Monday brief every week"]
    : ["Automate my dunning sequence", "Send a welcome kit when a client signs", "Flag me when a client goes quiet for two weeks", "Run my Monday brief every week"];
  const recent = AUTOMATIONS.slice(0, 3);

  // Scope segments (design auScopes — a segment disabled if this tab can't take it).
  const scopeSegs = [["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]].map(([k, l]) => ({
    key: k, label: l, ok: tabDef.scopes.indexOf(k) >= 0,
    why: l + " · you can't voice-configure a rule for a book aggregate"
  }));

  const tabs = [["library", "Automations", () => <Ic.bolt size={15} />], ["runs", "Runs", () => <Ic.pulse size={15} />], ["build", "Build", () => <Ic.spark size={15} />]];

  const detailA = detail == null ? null : AUTOMATIONS[detail];
  const runR = run == null ? null : AUTO_RUNS[run];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      {/* sub-tab strip (mirrors the agency pack tab bar — gold underline active). */}
      <div className="row tabstrip" style={{ gap: 22, padding: "0 26px", borderBottom: "1px solid var(--line)", background: "var(--canvas)", flex: "none", overflowX: "hidden" }}>
        {tabs.map(t => {
          const on = tab === t[0];
          return (
            <button key={t[0]} onClick={() => goTab(t[0])} className="row" style={{ gap: 8, padding: "12px 2px", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: on ? 600 : 450, color: on ? "var(--ink)" : "var(--ink-3)", borderBottom: on ? "2px solid var(--gold)" : "2px solid transparent", flex: "none" }}>
              <span style={{ display: "flex", opacity: .85, color: on ? "var(--gold)" : "inherit" }}>{t[2]()}</span>{t[1]}
            </button>
          );
        })}
      </div>

      <div key={tab} className="fade-in" style={{ flex: 1, minHeight: 0, padding: "18px 26px 22px", display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        {/* Header: eyebrow + title + banner "!" + scope seg + Build CTA. */}
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flex: "none", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9 }}>
              <span className="eyebrow" style={{ fontSize: 9.5 }}>AUTOMATIONS</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>{title}</span>
              <span title={banner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--warn)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{subLine}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
            {showScopes && <ScopeSeg segs={scopeSegs} value={scope} onChange={setScopeState} />}
            <button onClick={() => setRailOpen(true)} className="row" style={{ gap: 6, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--violet-tint)", fontSize: 12, fontWeight: 600, color: "var(--violet)", whiteSpace: "nowrap", flex: "none" }}>
              <Ic.spark size={12} />Her read · {health.length}</button>
            <button onClick={() => setTab("build")} style={{ padding: "8px 14px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{newCta}</button>
          </div>
        </div>

        <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{scopeNote}</div>

        {/* Per-sub-account picker — agency-only, observe-a-sub scope (§51). */}
        {showPicker && (
          <div className="row" style={{ gap: 7, flex: "none", overflowX: "auto", paddingBottom: 2 }}>
            {TEAM_SUBS.map((s, i) => {
              const on = tSub === i;
              return (
                <button key={s.name} onClick={() => setTSub(i)} className="row" style={{ gap: 7, padding: "6px 11px", borderRadius: 20, border: "1px solid " + (on ? s.color + "66" : "var(--line)"), background: on ? s.color + "1A" : "var(--surface)", fontSize: 12, fontWeight: on ? 600 : 500, whiteSpace: "nowrap", flex: "none" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flex: "none" }} />{s.name}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Library tab ─────────────────────────────────────────────────────── */}
        {tab === "library" && (
          <>
            <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, flex: "none" }}>
              {kpis.map(k => (
                <div key={k.label} title={k.note} className="card" style={{ padding: "13px 15px", minWidth: 0 }}>
                  <div className="eyebrow trunc" style={{ fontSize: 9 }}>{k.label}</div>
                  <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.02em", marginTop: 4, color: k.color || "var(--ink)" }}>{k.value}</div>
                </div>
              ))}
            </div>

            <div className="an-2" style={{ flex: 1, minHeight: 0 }}>
              <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div className="row tabstrip" style={{ gap: 6, padding: "9px 14px", borderBottom: "1px solid var(--line-soft)", flex: "none", overflowX: "auto" }}>
                  {libChips.map(c => {
                    const on = libFilter === c;
                    return <button key={c} onClick={() => setLibFilter(c)} className="pill" style={{ height: 26, cursor: "pointer", background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-3)", border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), fontSize: 11.5, flex: "none" }}>{c}</button>;
                  })}
                </div>
                <div key={libFilter + scope} className="pane fade-in" style={{ flex: 1 }}>
                  {rows.map(({ a, idx, tenant, tenantColor }) => {
                    const ti = tierOf(a.tier); const stc = statusOf(a.status);
                    return (
                      <button key={a.name} onClick={() => setDetail(idx)} className="row" style={{ width: "100%", gap: 0, padding: "10px 14px", textAlign: "left", flexDirection: "column", alignItems: "stretch", borderTop: "1px solid var(--line-soft)", transition: ".15s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span className="row" style={{ gap: 9, minWidth: 0 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: ti.dot, flex: "none" }} />
                          <span className="trunc" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{a.name}</span>
                          <span className="pill" style={{ background: stc.bg, color: stc.color, fontSize: 10, flex: "none" }}>{a.status}</span>
                          <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none", whiteSpace: "nowrap" }}>{a.last}</span>
                        </span>
                        <span className="row" style={{ gap: 7, alignItems: "baseline", marginTop: 5, minWidth: 0 }}>
                          <span style={{ fontSize: 9.5, color: "var(--ink-3)", flex: "none" }}>WHEN</span>
                          <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", minWidth: 0 }}>{a.trigger}</span>
                        </span>
                        <span className="row" style={{ gap: 7, alignItems: "baseline", marginTop: 3, minWidth: 0 }}>
                          <span style={{ fontSize: 9.5, color: "var(--ink-3)", flex: "none" }}>THEN</span>
                          <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", minWidth: 0 }}>{a.action}</span>
                        </span>
                        <span className="row" style={{ gap: 7, marginTop: 5, overflow: "hidden" }}>
                          {tenant && <span className="row" style={{ gap: 6, fontSize: 10.5, color: "var(--ink-2)", flex: "none" }}><span style={{ width: 6, height: 6, borderRadius: 2, background: tenantColor }} />{tenant}</span>}
                          <span className="pill pill-n" style={{ fontSize: 10, flex: "none" }}>{a.dept}</span>
                          <span className="pill" style={{ background: ti.bg, color: ti.color, fontSize: 10, flex: "none" }}>{ti.label}</span>
                          <span style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{a.engine}</span>
                          <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{a.runs ? a.runs + " runs · " + a.rate + "%" : "no runs yet"}</span>
                        </span>
                      </button>
                    );
                  })}
                  {!rows.length && <div className="sub" style={{ padding: "22px 16px", fontSize: 12.4 }}>Nothing matches that filter.</div>}
                </div>
              </div>
              {/* rail: health + her read (inline; also reachable via header button). */}
              <HealthRail health={health} healthTitle={healthTitle} read={read} ctaNote={ctaNote} openAsk={openAsk} />
            </div>
          </>
        )}

        {/* ── Runs tab ────────────────────────────────────────────────────────── */}
        {tab === "runs" && (
          <div className="an-2" style={{ flex: 1, minHeight: 0 }}>
            <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div className="row" style={{ gap: 7, padding: "9px 14px", borderBottom: "1px solid var(--line-soft)", flex: "none", flexWrap: "wrap" }}>
                {runChips.map(c => {
                  const on = runFilter === c;
                  return <button key={c} onClick={() => setRunFilter(c)} className="pill" style={{ height: 26, cursor: "pointer", background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-3)", border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), fontSize: 11.5, flex: "none" }}>{c}</button>;
                })}
                <div className="seg" style={{ marginLeft: "auto" }}>
                  {["24h", "7d", "30d"].map(l => <button key={l} aria-pressed={range === l} onClick={() => setRange(l)}>{l}</button>)}
                </div>
              </div>
              <div key={runFilter + scope} className="pane fade-in" style={{ flex: 1 }}>
                {runRows.map(({ r, idx, tenant, tenantColor }) => {
                  const stc = runStatusOf(r.status);
                  return (
                    <button key={idx} onClick={() => setRun(idx)} className="row" style={{ width: "100%", flexDirection: "column", alignItems: "stretch", gap: 0, padding: "9px 14px", textAlign: "left", borderTop: "1px solid var(--line-soft)", transition: ".15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span className="row" style={{ gap: 9, minWidth: 0 }}>
                        <span className="trunc" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{r.name}</span>
                        <span className="pill" style={{ background: stc.bg, color: stc.color, fontSize: 10, flex: "none" }}>{r.status}</span>
                        <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none", whiteSpace: "nowrap" }}>{r.when}</span>
                      </span>
                      <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 4, minWidth: 0 }}>{r.event}</span>
                      <span className="row" style={{ gap: 8, marginTop: 5, overflow: "hidden" }}>
                        {tenant && <span className="row" style={{ gap: 6, fontSize: 10.5, color: "var(--ink-2)", flex: "none" }}><span style={{ width: 6, height: 6, borderRadius: 2, background: tenantColor }} />{tenant}</span>}
                        <span className="pill pill-v" style={{ fontSize: 10, flex: "none" }}>{r.engine}</span>
                        <span className="pill pill-n" style={{ fontSize: 10, flex: "none" }}>{r.dept}</span>
                        <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{r.dur}</span>
                      </span>
                    </button>
                  );
                })}
                {!runRows.length && <div className="sub" style={{ padding: "22px 16px", fontSize: 12.4 }}>No runs match that filter.</div>}
              </div>
            </div>
            {/* rail: run health (KPIs, 2-col) + her read. */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
              <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Run health</div>
                <div className="two" style={{ gap: 9, marginTop: 9 }}>
                  {kpis.map(k => (
                    <div key={k.label} style={{ minWidth: 0 }}>
                      <div className="eyebrow trunc" style={{ fontSize: 9 }}>{k.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, color: k.color || "var(--ink)" }}>{k.value}</div>
                    </div>
                  ))}
                </div>
              </div>
              <HerReadCard read={read} openAsk={openAsk} />
            </aside>
          </div>
        )}

        {/* ── Build tab ───────────────────────────────────────────────────────── */}
        {tab === "build" && (
          <div className="an-2" style={{ flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
              <div className="row" style={{ gap: 9, padding: "8px 13px", border: "1px solid var(--violet-line)", borderRadius: 11, background: "var(--violet-tint)", flex: "none", minWidth: 0 }}>
                <Ic.spark size={13} style={{ color: "var(--violet)", flex: "none" }} />
                <span className="trunc" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--violet)", minWidth: 0 }}>{buildContext}</span>
              </div>

              <div className="card" style={{ flex: "1 1 auto", minHeight: 90, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
                {AUTO_BUILD.map((m, i) => {
                  const paige = m.who === "paige";
                  return (
                    <div key={i} style={{ border: "1px solid " + (paige ? "var(--violet-line)" : "var(--line)"), borderRadius: 12, background: paige ? "var(--violet-tint)" : "var(--surface-2)", padding: "10px 13px", minWidth: 0 }}>
                      <div className="eyebrow" style={{ fontSize: 10 }}>{paige ? "Paige" : AGENCY.operatorFirst}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", marginTop: 5 }}>{m.text}</div>
                    </div>
                  );
                })}
              </div>

              {/* she-drafted card — clicking "Review draft →" opens the auDraftOpen modal. */}
              <div className="card" style={{ borderLeft: "3px solid var(--gold)", padding: "12px 14px", flex: "none", minWidth: 0 }}>
                <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                  <span className="eyebrow" style={{ fontSize: 9.5 }}>SHE DRAFTED</span>
                  <span className="pill pill-n" style={{ fontSize: 10.5 }}>{DRAFT.dept}</span>
                  <span className="pill" style={{ background: "var(--warn-tint)", color: "var(--warn)", fontSize: 10.5 }}>{DRAFT.tier}</span>
                  <button onClick={() => setDraftOpen(true)} className="row" style={{ marginLeft: "auto", gap: 4, fontSize: 11.5, fontWeight: 600, color: "var(--gold)", flex: "none" }}>Review draft <Ic.arrow size={12} /></button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 7, lineHeight: 1.3 }}>{DRAFT.name}</div>
                <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: "var(--ink-3)", flex: "none" }}>WHEN</span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, minWidth: 0 }}>{DRAFT.trigger}</span>
                </div>
                <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: "var(--ink-3)", flex: "none" }}>THEN</span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, minWidth: 0 }}>{DRAFT.action}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 9, lineHeight: 1.5 }}>{DRAFT.note}</div>
                <div className="row" style={{ gap: 9, marginTop: 9, flexWrap: "wrap" }}>
                  <button className="btn btn-s btn-g"><Ic.check size={11} />Save it</button>
                  <button className="btn btn-s">Tweak with Paige</button>
                  <button className="btn btn-s" style={{ color: "var(--ink-3)" }}>Discard</button>
                </div>
              </div>

              {/* composer */}
              <div className="card" style={{ padding: "10px 12px", flex: "none" }}>
                <div className="row" style={{ gap: 9, minWidth: 0 }}>
                  <span className="grow trunc" style={{ fontSize: 12.5, color: "var(--ink-3)", minWidth: 0 }}>Say what you want automated</span>
                  <button className="btn btn-s" title="Speak it" style={{ width: 28, height: 28, padding: 0, justifyContent: "center", flex: "none" }}><Ic.pulse size={14} /></button>
                  <button style={{ padding: "7px 14px", borderRadius: 8, background: GOLD_BG, color: GOLD_INK, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", flex: "none" }}>Send</button>
                </div>
                <div className="row" style={{ gap: 7, marginTop: 9, overflowX: "auto", paddingBottom: 2 }}>
                  {starters.map(s => <span key={s} className="pill" style={{ height: 25, cursor: "pointer", background: "var(--surface-2)", color: "var(--ink-2)", border: "1px solid var(--line)", fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", flex: "none" }}>{s}</span>)}
                </div>
              </div>
            </div>

            {/* build rail: templates + recently built */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto" }}>
              <div className="card" style={{ padding: "13px 15px", flex: "none" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Templates</div>
                <div className="sub" style={{ fontSize: 11.5, marginTop: 3 }}>Proven patterns — she fills in the specifics.</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 9 }}>
                  {AUTO_TEMPLATES.map(t => (
                    <div key={t.name} className="row" style={{ gap: 9, padding: "8px 0", borderTop: "1px solid var(--line-soft)", alignItems: "flex-start", minWidth: 0 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2, lineHeight: 1.4 }}>{t.note}</div>
                      </div>
                      <span style={{ marginLeft: "auto", color: "var(--ink-3)", fontSize: 11, flex: "none" }}>›</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: "13px 15px", flex: "none" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Recently built</div>
                <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
                  {recent.map(a => (
                    <button key={a.name} onClick={() => { setTab("library"); setDetail(AUTOMATIONS.indexOf(a)); }} className="row" style={{ gap: 9, padding: "8px 0", borderTop: "1px solid var(--line-soft)", textAlign: "left", minWidth: 0 }}>
                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <div className="trunc" style={{ fontSize: 12, fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{a.dept} · {a.last}</div>
                      </div>
                      <span style={{ color: "var(--ink-3)", fontSize: 11, flex: "none" }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>

      {/* ── auDetailOpen — Automation detail modal ─────────────────────────────── */}
      <Modal open={detailA != null} onClose={() => setDetail(null)} size={680}
        title={detailA ? detailA.name : ""} sub={detailA ? detailA.engine : ""} accent="var(--gold)"
        foot={detailA ? <>
          <button style={goldBtn()}><Ic.spark size={12} />{readOnly ? "Propose a change" : "Edit with Paige"}</button>
          {!readOnly && <button style={ghostBtn()}>{detailA.status === "Paused" ? "Resume" : "Pause"}</button>}
          <button style={ghostBtn()}>Duplicate</button>
        </> : null}>
        {detailA && (() => {
          const ti = tierOf(detailA.tier);
          const depends = ["Trust Compass · " + detailA.dept + " tier", "Sending domain · mail.cookagency.com", detailA.engine + " executor"];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="pill pill-n" style={{ fontSize: 10.5 }}>{detailA.dept}</span>
                <span className="pill" style={{ background: ti.bg, color: ti.color, fontSize: 10.5 }}>{ti.label}</span>
                <span className="pill" style={{ background: statusOf(detailA.status).bg, color: statusOf(detailA.status).color, fontSize: 10.5 }}>{detailA.status}</span>
              </div>
              <div style={{ border: "1px solid var(--line-soft)", borderRadius: 12, background: "var(--surface-2)", padding: "13px 15px" }}>
                <div className="eyebrow" style={{ fontSize: 9.5 }}>WHEN</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 5 }}>{detailA.trigger}</div>
                <div className="eyebrow" style={{ fontSize: 9.5, marginTop: 11 }}>THEN</div>
                <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 5 }}>{detailA.action}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                {[["RUNS", String(detailA.runs)], ["SUCCESS", detailA.rate + "%"], ["LAST RUN", detailA.last]].map(([k, v]) => (
                  <div key={k} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, padding: "11px 13px" }}>
                    <div className="eyebrow" style={{ fontSize: 9 }}>{k}</div>
                    <div style={{ fontSize: k === "LAST RUN" ? 13 : 18, fontWeight: k === "LAST RUN" ? 600 : 700, marginTop: k === "LAST RUN" ? 6 : 4 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="eyebrow" style={{ fontSize: 9.5 }}>WHAT IT DEPENDS ON</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 7, marginTop: 8 }}>
                  {depends.map(d => <span key={d} className="pill pill-n" style={{ fontSize: 11.5, padding: "5px 11px" }}>{d}</span>)}
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── auRunOpen — Run trace detail modal ─────────────────────────────────── */}
      <Modal open={runR != null} onClose={() => setRun(null)} size={640}
        title={runR ? runR.name : ""} sub={runR ? runR.event : ""}
        foot={runR ? <>
          <button style={goldBtn()}><Ic.spark size={12} />Fix and rerun</button>
          <button style={ghostBtn()}>Rerun</button>
        </> : null}>
        {runR && (() => {
          const failed = runR.status === "Failed";
          const trace = [
            { step: "Trigger matched", val: runR.event },
            { step: "Conditions passed", val: "Business hours · tenant scoped" },
            { step: "Action dispatched", val: runR.engine },
            { step: "Result", val: runR.status }
          ];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="pill pill-v" style={{ fontSize: 11 }}>{runR.engine}</span>
                <span className="pill pill-n" style={{ fontSize: 11 }}>{runR.dept}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{runR.when} · {runR.dur}</span>
              </div>
              {failed && (
                <div style={{ border: "1px solid var(--bad)", borderLeft: "3px solid var(--bad)", borderRadius: 11, background: "var(--bad-tint)", padding: "12px 14px" }}>
                  <div className="eyebrow" style={{ fontSize: 10, color: "var(--bad)" }}>ERROR</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 6 }}>Webhook target returned 404 after three attempts. The endpoint moved when the calendar tool was reconnected.</div>
                </div>
              )}
              <div style={{ border: "1px solid var(--line-soft)", borderRadius: 12, overflow: "hidden" }}>
                {trace.map((t, i) => (
                  <div key={t.step} className="row" style={{ gap: 10, padding: "10px 13px", borderTop: i ? "1px solid var(--line-soft)" : "0", minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, width: 132, flex: "none" }}>{t.step}</span>
                    <span className="trunc" style={{ fontSize: 12, color: "var(--ink-2)", minWidth: 0 }}>{t.val}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── auDraftOpen — Build draft modal (the "how you got here" expand) ─────── */}
      <Modal open={draftOpen} onClose={() => setDraftOpen(false)} size={620}
        title={DRAFT.name} sub={DRAFT.dept + " · " + DRAFT.tier} accent="var(--gold)"
        foot={<>
          <button onClick={() => setDraftOpen(false)} style={goldBtn()}><Ic.check size={12} />Save it</button>
          <button style={ghostBtn()}>Tweak with Paige</button>
          <button onClick={() => setDraftOpen(false)} style={ghostBtn({ color: "var(--ink-3)" })}>Discard</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ border: "1px solid var(--line-soft)", borderRadius: 12, background: "var(--surface-2)", padding: "13px 15px" }}>
            <div className="eyebrow" style={{ fontSize: 9.5 }}>WHEN</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 5 }}>{DRAFT.trigger}</div>
            <div className="eyebrow" style={{ fontSize: 9.5, marginTop: 11 }}>THEN</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 5 }}>{DRAFT.action}</div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>{DRAFT.note}</div>
          <div className="eyebrow" style={{ fontSize: 9.5, marginTop: 4 }}>HOW YOU GOT HERE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {AUTO_BUILD.map((m, i) => {
              const paige = m.who === "paige";
              return (
                <div key={i} style={{ border: "1px solid " + (paige ? "var(--violet-line)" : "var(--line)"), borderRadius: 11, background: paige ? "var(--violet-tint)" : "var(--surface-2)", padding: "10px 12px" }}>
                  <div className="eyebrow" style={{ fontSize: 9.5 }}>{paige ? "Paige" : AGENCY.operatorFirst}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)", marginTop: 4 }}>{m.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* ── auRailOpen — "Her read" health rail modal ──────────────────────────── */}
      <Modal open={railOpen} onClose={() => setRailOpen(false)} size={620} title={healthTitle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {health.map((h, i) => (
            <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + h.edge, borderRadius: 12, background: "var(--surface-2)", padding: "13px 15px" }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{h.text}</div>
              <div className="row" style={{ gap: 9, marginTop: 11, flexWrap: "wrap" }}>
                <button style={goldBtn({ padding: "9px 15px", fontSize: 12.5 })}>{h.cta}</button>
                <span style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 0 }}>{ctaNote}</span>
              </div>
            </div>
          ))}
          <HerReadCard read={read} openAsk={openAsk} />
        </div>
      </Modal>
    </div>
  );
};

// ── Rail pieces ───────────────────────────────────────────────────────────────
const HerReadCard = ({ read, openAsk }) => (
  <div className="card" style={{ borderColor: "var(--violet-line)", background: "var(--violet-tint)", padding: "12px 14px", flex: "none" }}>
    <div className="row" style={{ gap: 8 }}>
      <span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Her read</div>
    </div>
    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 7 }}>{read}</div>
    <button onClick={openAsk} className="row" style={{ gap: 5, marginTop: 9, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--violet)" }}>Explore in Ask Paige <Ic.arrow size={12} /></button>
  </div>
);

const HealthRail = ({ health, healthTitle, read, ctaNote, openAsk }) => (
  <aside style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
    <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{healthTitle}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 9 }}>
        {health.map((h, i) => (
          <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + h.edge, borderRadius: 10, background: "var(--surface-2)", padding: "9px 11px", minWidth: 0 }}>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{h.text}</div>
            <button title={ctaNote} style={{ display: "inline-flex", marginTop: 8, padding: "6px 11px", borderRadius: 8, background: "var(--gold-bright)", color: "#241C05", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}>{h.cta}</button>
          </div>
        ))}
      </div>
    </div>
    <HerReadCard read={read} openAsk={openAsk} />
  </aside>
);

export default AutomationsHub;
export { AutomationsHub };
