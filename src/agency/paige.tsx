// @ts-nocheck
// Agency pack — the Paige screen. Owner-locked port of the Claude Design "CRM
// agency mode" pack (§28/§63 — "We do not drift off this whatsoever"), mirroring
// src/solo/paigehub.tsx (the Solo precedent) for the Agency design.
//
// Source of truth: "Agency Shell.dc.html" — the six-tab Paige surface
// (Chat · Knowledge · Sub-Agents · Actions · Skills · Paige Team), rendered as the
// shell's `view === "paige"` body. The DCLogic runtime is NOT ported — its markup,
// measurements, copy, and interaction are mirrored onto React + the ./_shared
// primitives, and its literal light-hex is re-expressed through the token layer so
// every surface themes light↔dark (§23) under `.paige-agency`.
//
// POP-OUTS this module owns (per the brief):
//   • Chat history (histOpen)  — the ☰ overlay drawer when the pane is too narrow
//     to keep the inline history rail (design runScan/histOpen, Agency Shell:5092).
//   • Chat rail (showChatRail) — the "IN THIS CHAT / WORKING FROM / SHE PROPOSED"
//     aside, collapsed below the design's 780px breakpoint.
//   • Knowledge rail (showKnowRail) — the teach + recently-learned aside, collapsed
//     below 1080px into a compact teach row. The Knowledge tab HOSTS the PaigeBrain
//     orb (imported from ./PaigeBrain): faithful to the design, the orb renders in
//     the main graph panel and the rail carries teach/learned.
// All three are derived from a ResizeObserver on the body (the design's mainW), so
// no shell prop is required — the module manages ALL its own pop-out state + chrome.
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. `agencyView` (true
// agency, not acting into a sub) gates every cross-book affordance: the Agency/Book/
// sub-account scope badges (the scope PICKER), the resell-to-sub-accounts column,
// the fleet pointer, and the cross-book source/aggregate copy. When the module is
// presenting a single book (standalone sub-account, or the agency acting into one)
// it shows ONLY that book — no scope picker, no parent roll-up, no other-sub data.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs, useReducedMotion } from "./_shared";
import PaigeBrain from "./PaigeBrain";
import {
  AGENCY, SCOPES, CHAT_PROJECTS, CHAT_GROUPS, TRANSCRIPT, CHIPS, SOURCES, PROPOSED,
  DOMAINS, LEARNED, SUBAGENTS, AGENT_RUNS, ACTIONS, SKILLS, DEPARTMENTS, HANDOFFS
} from "./fixtures";

// Status tones, token-driven (the design hardcodes GREEN/AMBER/RED hex; we route
// them through the theme layer so they read in both light and dark).
const GOLDF = "var(--gold-bright)", OK = "var(--ok)", WARN = "var(--warn)", BAD = "var(--bad)", VIOLET = "var(--violet)";
const laneColor = t => (t === "auto" ? OK : t === "confirm" ? WARN : BAD);
const laneLabel = t => (t === "auto" ? "Auto" : t === "confirm" ? "Confirm" : "You take it");
const laneBg = t => (t === "auto" ? "var(--ok-tint)" : t === "confirm" ? "var(--warn-tint)" : "var(--bad-tint)");

// ResizeObserver on the body → mainW, the design's responsive driver. Starts at 0
// so the first paint shows every rail (the design's `w === 0` branch).
const useWidth = () => {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(es => { for (const e of es) setW(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

// Scope badge (the design's Agency / Book / sub-account chip). §51 — gated on
// `show` (agencyView) so a single-book surface never renders the cross-book picker.
const ScopeBadge = ({ scope, arrow, show }) => {
  if (!show) return null;
  const s = SCOPES[scope]; if (!s) return null;
  return <span style={{ padding: "2px 7px", borderRadius: 20, background: s.tint, color: s.color, fontSize: 9.5, fontWeight: 600, flex: "none" }}>
    {(arrow && scope === "sub" ? "→ " : "") + s.label}</span>;
};

const Eyebrow = ({ children }) => <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", color: "var(--ink-3)", flex: "none" }}>{children}</div>;
const TabHead = ({ title, sub }) => (
  <div style={{ flex: "none" }}>
    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>{title}</div>
    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 5 }}>{sub}</div>
  </div>
);
const Flag = ({ children }) => (
  <div style={{ border: "1px solid var(--gold-line)", borderRadius: 11, background: "var(--gold-tint)", padding: "10px 13px", fontSize: 12, lineHeight: 1.5, color: "var(--warn)", flex: "none" }}>{children}</div>
);

// ── Chat tab ──────────────────────────────────────────────────────────────────
const ChatTab = ({ sub, agencyView, openAsk, reduce, w, histOpen, setHistOpen }) => {
  const showHistory = w === 0 || w >= 980;
  const hideHistory = w > 0 && w < 980;
  const showRail = w === 0 || w >= 780;
  const chatSubhead = agencyView
    ? "Reading your Playbook, " + AGENCY.subCount + " sub-accounts, 6 connected systems"
    : "Reading your Playbook, your clients, 6 connected systems";
  const chatFlag = agencyView
    ? "Scope commands and per-sub-account source attribution have no confirmed backend route — the pill and source breakdown are layout only until that lands."
    : "Scope commands and source attribution have no confirmed backend route — this is layout only until that lands.";
  const sources = agencyView ? SOURCES : SOURCES.filter(s => s.name !== "Sub-accounts");

  const HistoryList = ({ overlay }) => (
    <>
      {CHAT_GROUPS.map((g, gi) => (
        <div key={gi}>
          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", color: "var(--ink-3)", padding: "0 4px 7px" }}>{g.label}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: overlay ? 3 : 1 }}>
            {g.rows.map((r, ri) => (
              <div key={ri} style={{ padding: overlay ? "8px 10px" : "8px 9px", borderRadius: overlay ? 8 : 9, cursor: "pointer", background: r.active ? "var(--surface-sunk)" : "transparent" }}>
                <div className="row" style={{ gap: 7 }}>
                  {!overlay && <span style={{ width: 6, height: 6, borderRadius: "50%", background: SCOPES[r.scope].color, flex: "none" }} />}
                  <span className="trunc" style={{ fontSize: 13, fontWeight: r.active ? 600 : 400 }}>{r.name}</span>
                </div>
                {!overlay && r.prev && <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, paddingLeft: 13 }}>{r.prev}</div>}
                {overlay && <ScopeBadge scope={r.scope} show={agencyView} />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <>
      {showHistory && (
        <div style={{ width: 236, flex: "none", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div className="row" style={{ justifyContent: "center", gap: 8, padding: "11px 12px", borderRadius: 11, background: "var(--rail)", color: "#FFFDF8", fontSize: 13.5, fontWeight: 600, cursor: "pointer", flex: "none" }}>＋ New chat</div>
          <div className="row" style={{ gap: 8, padding: "9px 12px", borderRadius: 11, border: "1px solid var(--line)", background: "var(--surface)", flex: "none", color: "var(--ink-3)" }}>
            <Ic.search size={13} /><input placeholder="Search chats" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div className="pane" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 15, paddingRight: 2 }}>
            <div>
              <div className="row" style={{ gap: 8, padding: "0 4px 7px" }}>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", color: "var(--ink-3)" }}>PROJECTS</span>
                <span style={{ marginLeft: "auto", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" }}>＋</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {CHAT_PROJECTS.map((p, i) => (
                  <div key={i} className="row" style={{ gap: 9, padding: "7px 9px", borderRadius: 8, cursor: "pointer" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flex: "none" }} />
                    <span className="trunc" style={{ fontSize: 13 }}>{p.name}</span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <HistoryList overlay={false} />
          </div>
        </div>
      )}

      {/* Main chat panel */}
      <div style={{ flex: "1 1 0", minWidth: 320, display: "flex", flexDirection: "column", minHeight: 0, border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface)", overflow: "hidden" }}>
        <div className="row" style={{ alignItems: "flex-start", gap: 12, padding: "15px 20px", borderBottom: "1px solid var(--line-soft)", flex: "none" }}>
          {hideHistory && (
            <button onClick={() => setHistOpen(true)} title="Chat history" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer", flex: "none", marginTop: 2 }}>☰</button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.01em" }}>Morning brief — Aug 15</div>
            <div className="trunc" style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{chatSubhead}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 8, flex: "none" }}>
            <span className="pill pill-ok"><span className="dot" />Draft &amp; wait</span>
            {["➤", "▤", "···"].map((g, i) => <span key={i} className="tile" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>{g}</span>)}
          </div>
        </div>

        <div className="pane" style={{ flex: 1, padding: "20px 22px", background: "var(--canvas)", display: "flex", flexDirection: "column", gap: 16 }}>
          {TRANSCRIPT.map((m, i) => {
            const anim = reduce ? "none" : "fi-agency .3s ease " + (i * 0.06).toFixed(2) + "s backwards";
            if (m.who === "agent") return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-start", animation: anim }}>
                <div className="row" style={{ alignItems: "flex-start", gap: 9, maxWidth: "86%", padding: "9px 13px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface-2)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 9, flex: "none" }}>◍</span>
                  <div style={{ minWidth: 0 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--violet)" }}>{m.agent} →</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}> {m.text}</span></div>
                </div>
              </div>
            );
            const you = m.who === "you";
            return (
              <div key={i} style={{ display: "flex", justifyContent: you ? "flex-end" : "flex-start", animation: anim }}>
                <div className="row" style={{ alignItems: "flex-start", gap: 11, maxWidth: "88%" }}>
                  {m.who === "paige" && <span style={{ width: 26, height: 26, borderRadius: 9, background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 11, flex: "none", marginTop: 3 }}>✦</span>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ padding: "14px 17px", borderRadius: 13, whiteSpace: "pre-line", fontSize: 14, lineHeight: 1.62, border: "1px solid " + (you ? "var(--rail)" : "var(--line)"), background: you ? "var(--rail)" : "var(--surface)", color: you ? "#FFFDF8" : "var(--ink)" }}>{m.text}</div>
                    {m.sources && <div className="row" style={{ gap: 7, marginTop: 9, paddingLeft: 3, fontSize: 12, color: "var(--ink-3)", cursor: "pointer" }}>▤ {m.sources} ›</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "13px 20px 15px", borderTop: "1px solid var(--line-soft)", background: "var(--surface)", flex: "none" }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {CHIPS.map((c, i) => <div key={i} style={{ padding: "7px 13px", borderRadius: 20, background: "var(--surface-sunk)", fontSize: 12.5, color: "var(--ink-2)", cursor: "pointer" }}>{c}</div>)}
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "13px 15px", marginTop: 11 }}>
            <div style={{ fontSize: 13.5, color: "var(--ink-3)" }}>Ask Paige, or tell her what to do…</div>
            <div className="row" style={{ gap: 9, marginTop: 12 }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>＋</span>
              <span className="row" style={{ gap: 6, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>✦ Focus</span>
              <span className="row" style={{ marginLeft: "auto", gap: 6, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer", flex: "none" }}>Paige 2 ⌃</span>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: GOLDF, color: "#241C05", display: "grid", placeItems: "center", fontSize: 12, cursor: "pointer", flex: "none" }}>➤</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", textAlign: "center", marginTop: 9 }}>Paige 2 · She can be wrong. Check anything that matters.</div>
        </div>
      </div>

      {/* Chat rail (showChatRail) */}
      {showRail && (
        <aside className="pane" style={{ width: 292, flex: "none", display: "flex", flexDirection: "column", gap: 9, minHeight: 0, paddingRight: 2 }}>
          <Eyebrow>IN THIS CHAT</Eyebrow>
          {[{ label: "Routing herself", icon: true }, { label: "Paige 2", dot: true }].map((r, i) => (
            <div key={i} className="row" style={{ gap: 10, padding: "11px 13px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface)", flex: "none" }}>
              {r.icon && <span style={{ width: 24, height: 24, borderRadius: 8, background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 10, flex: "none" }}>✦</span>}
              {r.dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: OK, flex: "none", margin: "0 8px" }} />}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</span>
            </div>
          ))}

          <Eyebrow>WORKING FROM</Eyebrow>
          {sources.map((s, i) => (
            <div key={i} className="row" style={{ gap: 10, padding: "11px 13px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface)", flex: "none" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flex: "none" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
              <span className="trunc" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", flex: "none", maxWidth: 128 }}>{s.meta}</span>
            </div>
          ))}

          <Eyebrow>SHE PROPOSED TODAY</Eyebrow>
          {PROPOSED.map((p, i) => (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface)", padding: "13px 14px", flex: "none" }}>
              <div className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{p.title}</div>
                <ScopeBadge scope={p.scope} arrow show={agencyView} />
              </div>
              <div className="row" style={{ gap: 10, marginTop: 10 }}>
                <div style={{ padding: "7px 15px", borderRadius: 9, background: GOLDF, color: "#241C05", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flex: "none" }}>Approve</div>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{p.conf}</span>
              </div>
            </div>
          ))}
          <div style={{ border: "1px solid var(--gold-line)", borderRadius: 11, background: "var(--gold-tint)", padding: "10px 12px", fontSize: 11.5, lineHeight: 1.45, color: "var(--warn)", flex: "none" }}>{chatFlag}</div>
        </aside>
      )}

      {/* Chat history pop-out (histOpen) — the ☰ overlay drawer */}
      {histOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setHistOpen(false); }} className={reduce ? "" : "fade-in"} style={{ position: "fixed", inset: 0, background: "rgba(23,19,49,.42)", backdropFilter: "blur(3px)", zIndex: 90, display: "flex" }}>
          <div style={{ width: 300, height: "100%", background: "var(--surface-2)", borderRight: "1px solid var(--line)", boxShadow: "var(--sh-3)", display: "flex", flexDirection: "column", padding: "18px 16px", gap: 11 }}>
            <div className="row" style={{ gap: 10, flex: "none" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Chats</div>
              <button onClick={() => setHistOpen(false)} style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", display: "flex", flex: "none" }}><Ic.x size={15} /></button>
            </div>
            <div style={{ padding: "9px 12px", borderRadius: 9, background: "var(--rail)", color: "#FFFDF8", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textAlign: "center", flex: "none" }}>+ New chat</div>
            <input placeholder="Search chats" style={{ width: "100%", padding: "8px 11px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", outline: "none", flex: "none" }} />
            <div className="pane" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13 }}><HistoryList overlay={true} /></div>
          </div>
        </div>
      )}
    </>
  );
};

// ── Knowledge tab (HOSTS the PaigeBrain orb) ────────────────────────────────────
const KnowledgeTab = ({ reduce, w }) => {
  const showRail = w === 0 || w >= 1080;
  const docCount = DOMAINS.reduce((a, d) => a + d.docs, 0);
  const teachAlts = ["Talk to her instead", "Import from Drive", "Connect a data source"];
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ flex: "none" }}>
        <div className="row" style={{ alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".16em", color: "var(--ink-3)" }}>WHAT SHE KNOWS</span>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>Knowledge</span>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>Her memory, drawn as it actually is — six domains wired together, with the cross-domain links that let her reason across everything you've taught her.</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
        <div style={{ flex: "1 1 0", minWidth: 280, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ flex: 1, minHeight: 260, position: "relative", borderRadius: 16, overflow: "hidden", background: "#0C0913" }}>
            <PaigeBrain style={{ position: "absolute", inset: 0 }} />
            <div className="row" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "flex-start", gap: 12, padding: "17px 19px", pointerEvents: "none" }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".15em", color: "rgba(255,253,248,.55)" }}>WHAT PAIGE KNOWS</div>
                <div style={{ fontSize: 19, fontWeight: 700, color: "#FFFDF8", letterSpacing: "-.01em", marginTop: 5 }}>Knowledge graph</div>
                <div className="mono" style={{ fontSize: 11, color: "rgba(255,253,248,.5)", marginTop: 5 }}>{docCount} documents · {DOMAINS.length} domains · indexed continuously</div>
              </div>
              <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 9, flex: "none" }}>
                <span className="row" style={{ gap: 7, padding: "5px 12px", borderRadius: 20, background: "rgba(47,122,87,.22)", color: "#7FD3A6", fontSize: 11.5, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7FD3A6" }} />Live · 3 sources syncing</span>
                <span style={{ fontSize: 11, color: "rgba(255,253,248,.42)" }}>{reduce ? "Hover an entity to read it" : "Drag to rotate · scroll to zoom · hover an entity"}</span>
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 7, flexWrap: "wrap", flex: "none" }}>
            {DOMAINS.map((d, i) => (
              <div key={i} className="row" style={{ gap: 7, padding: "5px 11px", borderRadius: 20, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, color: "var(--ink)", cursor: "pointer" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: d.color, flex: "none" }} />{d.name}</div>
            ))}
          </div>
        </div>

        {showRail && (
          <aside style={{ width: 322, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
            <div className="card" style={{ padding: "17px 18px", flex: "none" }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>Teach Paige something</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5 }}>Anything you drop here she reasons from immediately.</div>
              <div style={{ marginTop: 13, border: "1px dashed var(--line)", borderRadius: 12, padding: "19px 16px", textAlign: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 15, margin: "0 auto" }}>＋</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 11 }}>Drop a document, or paste a link</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 6 }}>PDFs, transcripts, contracts, spreadsheets, a URL. She reads it, files it into a domain, and cites it back.</div>
                <div className="row" style={{ justifyContent: "center", gap: 9, marginTop: 13 }}>
                  <div style={{ padding: "8px 15px", borderRadius: 9, background: "var(--rail)", color: "#FFFDF8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Choose files</div>
                  <div style={{ padding: "8px 15px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 12.5, cursor: "pointer" }}>Paste a link</div>
                </div>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 13 }}>
                {teachAlts.map((a, i) => <div key={i} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, color: "var(--ink)", cursor: "pointer" }}>{a}</div>)}
              </div>
            </div>

            <div className="card" style={{ padding: "17px 18px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <div className="row" style={{ gap: 10, flex: "none" }}>
                <div style={{ fontSize: 15.5, fontWeight: 600 }}>Recently learned</div>
                <span className="pill pill-v" style={{ marginLeft: "auto" }}>✦ Auto-filed</span>
              </div>
              <div className="pane" style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                {LEARNED.map((l, i) => (
                  <div key={i} className="row" style={{ gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line-soft)", cursor: "pointer" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOMAINS[l.domain].color, flex: "none" }} />
                    <span className="trunc" style={{ fontSize: 13, fontWeight: 500 }}>{l.title}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{DOMAINS[l.domain].name}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{l.when}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>

      {!showRail && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: 12, flex: "none" }}>
          <div className="card row" style={{ padding: "14px 15px", gap: 12 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 14, flex: "none" }}>＋</span>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>Teach Paige something</div><div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>Drop a document, or paste a link</div></div>
          </div>
          <div className="card" style={{ padding: "14px 15px", minWidth: 0 }}>
            <div className="row" style={{ gap: 9 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>Recently learned</div><span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--violet)", fontWeight: 600, flex: "none" }}>✦ Auto-filed</span></div>
            {LEARNED.slice(0, 3).map((l, i) => (
              <div key={i} className="row" style={{ gap: 9, marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: DOMAINS[l.domain].color, flex: "none" }} />
                <span className="trunc" style={{ fontSize: 12 }}>{l.title}</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{l.when}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Sub-Agents tab ──────────────────────────────────────────────────────────────
const AgentsTab = ({ agencyView }) => {
  const state = s => s === "Running" ? { bg: "var(--ok-tint)", c: OK } : s === "Queued" ? { bg: "var(--warn-tint)", c: WARN } : { bg: "var(--surface-sunk)", c: "var(--ink-3)" };
  const task = t => agencyView ? t : (t || "").replace(/across \d+ sub-accounts/gi, "across your book");
  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 13, minHeight: 0 }}>
        <TabHead title="Sub-Agents" sub="The specialists Paige dispatches inside a task. She picks; you watch the work in chat." />
        <Flag>The specialist registry has no confirmed schema — utilization, current task and success rate are layout stand-ins.</Flag>
        <div className="pane" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(268px,100%),1fr))", gap: 11, alignContent: "start", paddingRight: 4 }}>
          {SUBAGENTS.map((a, i) => {
            const st = state(a.state);
            return (
              <div key={i} className="card" style={{ padding: "14px 15px", display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700, flex: "none" }}>{a.name.slice(0, 2).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}><div className="trunc" style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</div><div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{a.role}</div></div>
                  <span style={{ marginLeft: "auto", padding: "3px 9px", borderRadius: 20, background: st.bg, color: st.c, fontSize: 10.5, fontWeight: 600, flex: "none" }}>{a.state}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.45 }}>{task(a.task) || "Nothing on her plate right now"}</div>
                <div className="row" style={{ gap: 10, marginTop: "auto", paddingTop: 9, borderTop: "1px solid var(--line-soft)" }}>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{a.rate} clean</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{a.tier}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside style={{ width: 300, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <div className="card" style={{ padding: "15px 16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Recent runs</div>
          <div className="pane" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 11 }}>
            {AGENT_RUNS.map((r, i) => (
              <div key={i} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span style={{ color: r.ok ? OK : WARN, fontSize: 11, flex: "none", marginTop: 2 }}>{r.ok ? "✓" : "!"}</span>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.agent}</div><div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.4 }}>{r.what}</div></div>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{r.when}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: "15px 16px", flex: "none" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Forge a specialist</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 7 }}>When a need keeps coming back, Paige stands up a new specialist for it and adds her to the roster.</div>
        </div>
      </aside>
    </>
  );
};

// ── Actions tab ─────────────────────────────────────────────────────────────────
const ActionsTab = ({ agencyView }) => {
  const [filter, setFilter] = React.useState("All");
  const statuses = ["All", "Awaiting your approval", "Executed", "Briefed — you take it"];
  const rows = ACTIONS.filter(a => filter === "All" || a.status === filter);
  const statusPill = s => s === "Executed" ? { bg: "var(--ok-tint)", c: OK } : s.indexOf("Briefed") === 0 ? { bg: "var(--bad-tint)", c: BAD } : { bg: "var(--warn-tint)", c: WARN };
  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <TabHead title="Actions" sub="Everything she proposed, drafted, ran or was told to leave alone." />
        <Flag>Action scope is not a confirmed field in the codebase — the Agency / Book / sub-account badges are layout only.</Flag>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
          {statuses.map(f => {
            const on = filter === f;
            const n = f === "All" ? ACTIONS.length : ACTIONS.filter(a => a.status === f).length;
            return <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500, border: "1px solid " + (on ? "var(--gold-line)" : "var(--line)"), background: on ? "var(--gold-tint)" : "var(--surface)", color: on ? "var(--warn)" : "var(--ink-2)" }}>{f} ({n})</button>;
          })}
        </div>
        <div className="pane card" style={{ flex: 1, minHeight: 0 }}>
          {rows.map((a, i) => {
            const sp = statusPill(a.status);
            return (
              <div key={i} className="row" style={{ gap: 12, padding: "13px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "0", cursor: "pointer" }}>
                <ScopeBadge scope={a.scope} arrow show={agencyView} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trunc" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{a.dept} · {a.conf} confident · {a.age}</div>
                </div>
                <span style={{ fontSize: 11.5, color: laneColor(a.tier), fontWeight: 600, flex: "none", width: 78, textAlign: "right" }}>{laneLabel(a.tier)}</span>
                <span style={{ padding: "4px 10px", borderRadius: 20, background: sp.bg, color: sp.c, fontSize: 11, fontWeight: 500, flex: "none" }}>{a.status}</span>
              </div>
            );
          })}
          {!rows.length && <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Nothing in this state.</div>}
        </div>
      </div>

      <aside style={{ width: 288, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <div className="card" style={{ padding: "15px 16px", flex: "none" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>This week</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {[["Approved by you", "19"], ["Auto-executed", "134"], ["Dismissed", "6"], ["Value carried", "$21,400"]].map(([k, v], i) => (
              <div key={i} className="row" style={{ alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{k}</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, flex: "none" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: "15px 16px", flex: "none" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Lanes, not permissions</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 7 }}>Green ran on its own. Amber waited for you. Red she only briefed — that one stays yours.</div>
        </div>
      </aside>
    </>
  );
};

// ── Skills tab ──────────────────────────────────────────────────────────────────
const SkillsTab = ({ agencyView }) => {
  const [filter, setFilter] = React.useState("All");
  const srcs = ["All", "Platform baseline", "Your library", "Marketplace"];
  const rows = SKILLS.filter(s => filter === "All" || s.src === filter);
  const resold = SKILLS.filter(s => s.resell !== "Not resold").length;
  const suggest = agencyView
    ? [{ name: "Seasonal Dip Defender", why: "Four sub-accounts dipped the same two weeks last year." }, { name: "Local Reviews Engine", why: "Six run service businesses with no review flow." }]
    : [{ name: "Seasonal Dip Defender", why: "Your traffic dipped the same two weeks last year." }, { name: "Local Reviews Engine", why: "No review-request flow is running yet." }];
  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <TabHead title="Skills" sub={agencyView ? "What she knows how to do here, and which of it your sub-accounts can install." : "What she knows how to do for you here."} />
        <Flag>The skills library has no confirmed registry — source, resell state and library-health figures here are layout stand-ins.</Flag>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
          {srcs.map(f => {
            const on = filter === f;
            const n = f === "All" ? SKILLS.length : SKILLS.filter(s => s.src === f).length;
            return <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500, border: "1px solid " + (on ? "var(--gold-line)" : "var(--line)"), background: on ? "var(--gold-tint)" : "var(--surface)", color: on ? "var(--warn)" : "var(--ink-2)" }}>{f} ({n})</button>;
          })}
        </div>
        <div className="pane" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(268px,100%),1fr))", gap: 11, alignContent: "start", paddingRight: 4 }}>
          {rows.map((s, i) => (
            <div key={i} className="card" style={{ padding: "14px 15px", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}>
              <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                <span style={{ marginLeft: "auto", fontSize: 11, color: laneColor(s.tier), fontWeight: 600, flex: "none" }}>{s.tier === "auto" ? "Auto" : "Confirm"}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{s.desc}</div>
              <div className="row" style={{ gap: 9, marginTop: "auto", paddingTop: 9, borderTop: "1px solid var(--line-soft)" }}>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.src} · {s.dept}</span>
                {agencyView && <span style={{ marginLeft: "auto", fontSize: 11, color: s.resell === "Not resold" ? "var(--ink-3)" : OK, fontWeight: 600, flex: "none" }}>{s.resell}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside style={{ width: 288, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <div className="card" style={{ padding: "15px 16px", flex: "none" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Library health</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {[["Active here", String(SKILLS.length)], ...(agencyView ? [["Resold to sub-accounts", String(resold)]] : []), ["Paige suggests adding", "2"]].map(([k, v], i) => (
              <div key={i} className="row" style={{ alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{k}</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 16, fontWeight: 700, flex: "none" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: "15px 16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>She suggests</div>
          <div className="pane" style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 11 }}>
            {suggest.map((s, i) => (
              <div key={i} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "12px 13px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.45 }}>{s.why}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};

// ── Paige Team tab ──────────────────────────────────────────────────────────────
const TeamTab = ({ agencyView }) => (
  <>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <TabHead title="Paige Team" sub={agencyView ? "Ten departments running your agency. Each one has a lane you set." : "Ten departments running your business. Each one has a lane you set."} />
      <div className="pane" style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(232px,100%),1fr))", gap: 11, alignContent: "start", paddingRight: 4 }}>
        {DEPARTMENTS.map((d, i) => (
          <div key={i} className="card" style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div className="row" style={{ alignItems: "baseline", gap: 9 }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{d.name}</div>
              <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 20, background: laneBg(d.tier), color: laneColor(d.tier), fontSize: 10, fontWeight: 600, flex: "none" }}>{laneLabel(d.tier)}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{d.agent}</div>
            <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.45 }}>{d.focus}</div>
            <div style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--line-soft)", fontSize: 11, color: "var(--ink-3)" }}>{d.acts} actions this week</div>
          </div>
        ))}
      </div>
      {agencyView && <div style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{AGENCY.subCount} sub-accounts run their own Paige teams from their own Playbook. Fleet view is not built yet.</div>}
    </div>

    <aside style={{ width: 288, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div className="card" style={{ padding: "15px 16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Between departments</div>
        <div className="pane" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {HANDOFFS.map((h, i) => (
            <div key={i}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--violet)" }}>{h.from} → {h.to}</div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.45 }}>{h.what}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  </>
);

// ── PaigeHub (root) ─────────────────────────────────────────────────────────────
// The shell hosts this as the `paige` screen body and passes { isAgency, acting,
// openAsk }. `agencyView` = true agency aggregate (not acting into a sub); it gates
// every §51 cross-book affordance. All pop-out state (histOpen) + the responsive
// rail breakpoints (showChatRail / showKnowRail derived from the body width) are
// owned here — the module needs no extra prop from the shell.
const PaigeHub = ({ isAgency = true, acting = null, openAsk = () => {} }) => {
  const [tab, setTab] = useSubtabRoute("agency", "paige", "chat");
  const [histOpen, setHistOpen] = React.useState(false);
  const [bodyRef, w] = useWidth();
  const reduce = useReducedMotion();
  const agencyView = !!isAgency && !acting;

  const tabs = [
    ["chat", "Chat", () => <Ic.spark size={15} />],
    ["knowledge", "Knowledge", () => <Ic.doc size={15} />],
    ["agents", "Sub-Agents", () => <Ic.users size={15} />],
    ["actions", "Actions", () => <Ic.check size={15} />],
    ["skills", "Skills", () => <Ic.bolt size={15} />],
    ["pteam", "Paige Team", () => <Ic.grid size={15} />]
  ];

  React.useEffect(() => { if (tab !== "chat" && histOpen) setHistOpen(false); }, [tab, histOpen]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <SubTabs tabs={tabs} cur={tab} set={setTab} />
      <div ref={bodyRef} key={tab} className="fade-in" style={{ flex: 1, minHeight: 0, display: "flex", gap: 18, padding: "22px 26px 24px", overflow: "hidden" }}>
        {tab === "chat" && <ChatTab sub={!agencyView} agencyView={agencyView} openAsk={openAsk} reduce={reduce} w={w} histOpen={histOpen} setHistOpen={setHistOpen} />}
        {tab === "knowledge" && <KnowledgeTab reduce={reduce} w={w} />}
        {tab === "agents" && <AgentsTab agencyView={agencyView} />}
        {tab === "actions" && <ActionsTab agencyView={agencyView} />}
        {tab === "skills" && <SkillsTab agencyView={agencyView} />}
        {tab === "pteam" && <TeamTab agencyView={agencyView} />}
      </div>
    </div>
  );
};

export default PaigeHub;
